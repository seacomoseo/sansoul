import { UNCONFIGURED } from './delivery.js'
import { renderConfirmation, renderOwner } from './render.js'
import { brevoAcceptsFiles } from '../mail/providers/http.js'
import {
  claimJob, driveFiles, dueJobs, loadSubmission, markDeferred, markFailed, markFilesPurged, markHeld,
  markRetry, markSending, markSent, pruneRate, recoverExpiredLeases, sweepOrphanUploads
} from './store.js'

const SEND_TIMEOUT_MS = 25000
// With a deadline (waitUntil stops 30 s after the response), a send that could
// be cut off midway (lease_expired_ambiguous) is left for the next drain.
const SEND_MIN_MS = 8000
export const WAIT_UNTIL_MS = 28000
const DEADLINE_MARGIN_MS = 2000
// Up to 25 MB stream from KV to Drive; the 90 s lease covers it.
const DRIVE_TIMEOUT_MS = 60000
// KV is eventually consistent across locations: a just-written file may not
// be visible yet to the dispatcher. Missing files of young submissions retry.
const FILES_SETTLE_MS = 5 * 60 * 1000

function sameAuthority (stored, current) {
  return ['provider', 'ref', 'account', 'fingerprint'].every(key => stored[key] === current[key])
}

// The stored account (and the Drive account, when files go to another Gmail)
// must still be the same authority: a changed account never takes over history.
async function checkAuthority (env, mailer, authority) {
  if (authority.provider === 'hold') return null
  let current
  try {
    current = await mailer.authority(env, authority.ref || '')
  } catch {
    return 'authority_unavailable'
  }
  if (!sameAuthority(authority, current)) return 'authority_drift'
  const drive = authority.files?.drive
  if (drive) {
    const now = await mailer.authority(env, drive.ref).catch(() => null)
    if (!now) return 'authority_unavailable'
    if (!sameAuthority(drive, now)) return 'authority_drift'
  }
  return null
}

async function loadAttachments (kv, submission) {
  if (!submission.files.length) return []
  if (submission.files_purged_at || !kv) return null
  const attachments = []
  for (const file of submission.files) {
    const bytes = await kv.get(file.key, 'arrayBuffer')
    if (!bytes || bytes.byteLength !== file.size) return null
    attachments.push({ ...file, bytes: new Uint8Array(bytes) })
  }
  return attachments
}

export async function purgeFiles (db, kv, submission, now) {
  if (!submission.files.length || submission.files_purged_at || !kv) return
  for (const file of submission.files) await kv.delete(file.key)
  await markFilesPurged(db, submission.id, now())
}

async function deliver ({ env, db, kv, providers, now, job, token, driveTimeoutMs, deadline }) {
  const authority = JSON.parse(job.authority)
  if (authority.provider === 'pending') return markHeld(db, job.id, token, now(), UNCONFIGURED)
  if (!providers.providers[authority.provider]) return markHeld(db, job.id, token, now(), 'provider_unknown')
  const drift = await checkAuthority(env, providers, authority)
  if (drift) return markHeld(db, job.id, token, now(), drift)

  const submission = await loadSubmission(db, job.submission_id)
  if (!submission) return markFailed(db, job.id, token, now(), 'submission_missing')
  const isOwner = job.channel === 'owner'
  const resend = authority.files?.mode === 'resend'
  const toDrive = isOwner && authority.files?.mode === 'drive' && submission.files.length > 0
  // `panel`: too large to attach without Drive; the files stay in KV (TTL) and
  // the notice links to the panel.
  const inPanel = isOwner && !resend && submission.files.length > 0 && (authority.files?.mode === 'panel' ||
    (!toDrive && authority.provider === 'brevo' && !brevoAcceptsFiles(submission.files)))
  const young = now() - submission.created_at < FILES_SETTLE_MS
  const attachments = isOwner && !resend && !toDrive && !inPanel ? await loadAttachments(kv, submission) : []
  if (!attachments) return young ? markRetry(db, job.id, token, now(), 'files_missing', job.attempts) : markHeld(db, job.id, token, now(), 'files_missing')
  let sendingMarked = false
  try {
    // Drive writes target reserved IDs, so this step is safe to repeat.
    const driveAuthority = authority.files?.drive ? { ...authority.files.drive, files: authority.files } : authority
    let links = toDrive
      ? await (authority.provider === 'hold' ? providers.providers.hold : providers.gmail).storeFiles({ env, db, kv, authority: driveAuthority, submission, signal: AbortSignal.timeout(driveTimeoutMs || DRIVE_TIMEOUT_MS), now })
      : null
    if (resend && submission.files.length) {
      const stored = await driveFiles(db, submission.id)
      links = new Map(submission.files.flatMap(file => {
        const drive = stored.get(file.index)
        const link = drive?.verified_at && drive.link
        return link || !submission.files_purged_at ? [[file.index, link || `https://${authority.site}/admin/forms/`]] : []
      }))
    }
    const sendTimeout = deadline ? Math.min(SEND_TIMEOUT_MS, deadline - now() - DEADLINE_MARGIN_MS) : SEND_TIMEOUT_MS
    if (sendTimeout < SEND_MIN_MS) return markDeferred(db, job.id, token, now())
    const missingFiles = resend && submission.files.length > (links?.size || 0)
    const body = isOwner ? renderOwner({ submission, authority, links, panel: inPanel, missingFiles }) : renderConfirmation({ submission, authority })
    const message = {
      ...body,
      fromName: authority.senderName,
      messageId: job.id.replaceAll(':', '.'),
      attachments,
      ...(isOwner
        ? { [authority.to.length > 1 ? 'bcc' : 'to']: authority.to, replyTo: authority.replyTo || undefined }
        : { to: [authority.replyTo], replyTo: authority.to[0] })
    }
    const result = await providers.send({
      env,
      authority,
      message,
      signal: AbortSignal.timeout(sendTimeout),
      beforeSend: async () => {
        if (!await markSending(db, job.id, token, now())) throw Object.assign(new Error('lease_lost'), { kind: 'lost' })
        sendingMarked = true
      }
    })
    if (!await markSent(db, job.id, token, now(), result.ref)) console.error('forms_lease_lost_after_send', job.id)
    if (isOwner && !resend && !inPanel) await purgeFiles(db, kv, submission, now)
    return true
  } catch (error) {
    if (error.kind === 'lost') return false
    const code = String(error.code || error.message || 'delivery_error').slice(0, 120)
    if (error.kind === 'retry' || (code === 'files_missing' && young && !sendingMarked)) return markRetry(db, job.id, token, now(), code, job.attempts)
    // Configuration problems before the provider call are fixable: hold them.
    if (error.kind === 'fatal' && !sendingMarked) return markHeld(db, job.id, token, now(), code)
    // Unknown errors after the fence, and ambiguous answers, may have sent mail.
    if (error.kind === 'hold' || error.kind === 'ambiguous' || sendingMarked) return markHeld(db, job.id, token, now(), code)
    return markRetry(db, job.id, token, now(), code, job.attempts)
  }
}

// Bounded work per invocation keeps Workers Free CPU predictable; callers
// (waitUntil after intake, admin drain, optional cron) repeat as needed.
export async function dispatch ({ env, db, kv, providers, now = Date.now, submissionId, limit = 2, driveTimeoutMs, deadline }) {
  await recoverExpiredLeases(db, now())
  const ids = await dueJobs(db, now(), { submissionId, limit })
  let processed = 0
  for (const id of ids) {
    const token = crypto.randomUUID()
    const job = await claimJob(db, id, token, now())
    if (!job) continue
    processed++
    await deliver({ env, db, kv, providers, now, job, token, driveTimeoutMs, deadline })
    // A Drive job can use ~40 of the 50 subrequests of a Free invocation.
    if (job.channel === 'owner' && JSON.parse(job.authority).files?.mode === 'drive') return { processed, hasMore: true }
  }
  if (!submissionId && Math.random() < 0.1) {
    await pruneRate(db, now())
    await sweepOrphanUploads(db, kv, now())
  }
  return { processed, hasMore: !submissionId && ids.length === limit }
}
