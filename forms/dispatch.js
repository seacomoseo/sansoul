import { resolveAuthority } from './providers/index.js'
import { renderConfirmation, renderOwner } from './render.js'
import {
  claimJob, dueJobs, loadSubmission, markFilesPurged, markHeld, markRetry,
  markSending, markSent, pruneRate, recoverExpiredLeases
} from './store.js'

const SEND_TIMEOUT_MS = 25000

function sameAuthority (stored, current) {
  return ['provider', 'ref', 'account', 'fingerprint'].every(key => stored[key] === current[key])
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

async function deliver ({ env, db, kv, providers, now, job, token }) {
  const authority = JSON.parse(job.authority)
  const provider = providers[authority.provider]
  if (!provider) return markHeld(db, job.id, token, now(), 'provider_unknown')
  let current
  try {
    current = authority.provider === 'hold' ? authority : await resolveAuthority(env, { account: authority.ref || '' }, providers)
  } catch {
    return markHeld(db, job.id, token, now(), 'authority_unavailable')
  }
  if (!sameAuthority(authority, current)) return markHeld(db, job.id, token, now(), 'authority_drift')

  const submission = await loadSubmission(db, job.submission_id)
  const isOwner = job.channel === 'owner'
  const attachments = isOwner ? await loadAttachments(kv, submission) : []
  if (!attachments) return markHeld(db, job.id, token, now(), 'files_missing')
  const body = isOwner ? renderOwner({ submission, authority }) : renderConfirmation({ submission, authority })
  const message = {
    ...body,
    fromName: authority.senderName,
    messageId: job.id.replace(':', '.'),
    attachments,
    ...(isOwner
      ? { [authority.to.length > 1 ? 'bcc' : 'to']: authority.to, replyTo: authority.replyTo || undefined }
      : { to: [authority.replyTo], replyTo: authority.to[0] })
  }

  let sendingMarked = false
  try {
    const result = await provider.send({
      env,
      authority,
      message,
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      beforeSend: async () => {
        if (!await markSending(db, job.id, token, now())) throw Object.assign(new Error('lease_lost'), { kind: 'lost' })
        sendingMarked = true
      }
    })
    if (!await markSent(db, job.id, token, now(), result.ref)) console.error('forms_lease_lost_after_send', job.id)
    if (isOwner) await purgeFiles(db, kv, submission, now)
    return true
  } catch (error) {
    if (error.kind === 'lost') return false
    const code = String(error.code || error.message || 'delivery_error').slice(0, 120)
    if (error.kind === 'retry') return markRetry(db, job.id, token, now(), code, job.attempts)
    // Configuration problems before the provider call are fixable: hold them.
    if (error.kind === 'fatal' && !sendingMarked) return markHeld(db, job.id, token, now(), code)
    // Unknown errors after the fence, and ambiguous answers, may have sent mail.
    if (error.kind === 'hold' || error.kind === 'ambiguous' || sendingMarked) return markHeld(db, job.id, token, now(), code)
    return markRetry(db, job.id, token, now(), code, job.attempts)
  }
}

// Bounded work per invocation keeps Workers Free CPU predictable; callers
// (waitUntil after intake, admin drain, optional cron) repeat as needed.
export async function dispatch ({ env, db, kv, providers, now = Date.now, submissionId, limit = 2 }) {
  await recoverExpiredLeases(db, now())
  const ids = await dueJobs(db, now(), { submissionId, limit })
  let processed = 0
  for (const id of ids) {
    const token = crypto.randomUUID()
    const job = await claimJob(db, id, token, now())
    if (!job) continue
    processed++
    await deliver({ env, db, kv, providers, now, job, token })
  }
  if (!submissionId && Math.random() < 0.1) await pruneRate(db, now())
  return { processed, hasMore: !submissionId && ids.length === limit }
}
