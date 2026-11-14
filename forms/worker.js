/* global FixedLengthStream */
import { admin, pruneSubmissions } from './admin.js'
import { WAIT_UNTIL_MS, dispatch } from './dispatch.js'
import { FormsError, errorResponse, isSameOrigin, jsonResponse, sha256Hex } from './http.js'
import { LIMITS, driveEnabled, fileLimits, parseSubmission, parseUpload, readSubmission } from './intake.js'
import { validateManifest } from './manifest.js'
import { clientIp } from '../edge/proxy.js'
import { createProviders, resolveAuthority } from './providers/index.js'
import {
  findSubmission, hitRate, insertSubmission, loadSubmission, requireDatabase, stageUpload, stagedUploads, sweepOrphanUploads, uploadKey
} from './store.js'

// Uploads: per IP and window, plus a site-wide daily cap that keeps KV Free
// (1,000 writes a day per account) from being exhausted by one site.
export const RATE = Object.freeze({ windowMs: 10 * 60 * 1000, limit: 6, uploads: 30, uploadsPerDay: 300 })
// Confirmations go to a visitor-typed address: one per recipient and day, and
// a site-wide daily cap, so the form cannot be used to mail third parties.
export const CONFIRM_RATE = Object.freeze({ windowMs: 24 * 3600 * 1000, perRecipient: 1, perSite: 100 })
// Safety net only: held/review attachments must be resolved within this time.
export const FILE_TTL_SECONDS = 90 * 24 * 3600
const ipBucket = async (request, env, manifest, now, prefix = '') => {
  const ip = await clientIp(request, env, now())
  return ip ? prefix + (await sha256Hex(`${manifest.site}\n${ip}`)).slice(0, 32) : null
}
const receipt = row => jsonResponse({ result: 'success', persisted: true, submissionId: row.id, status: row.status })

// POST /api/forms/upload: one raw file, streamed to KV and staged in D1 until
// the submission that references it commits.
async function upload ({ request, env, ctx, manifest, now }) {
  if (request.method !== 'POST') return jsonResponse({ result: 'error', error: 'method_not_allowed' }, 405, { allow: 'POST' })
  if (!isSameOrigin(request, manifest.origins)) throw new FormsError('origin_forbidden', 403)
  const db = requireDatabase(env)
  const kv = env.FORMS_FILES
  if (!kv || typeof kv.put !== 'function') throw new FormsError('files_unavailable', 503)
  const file = parseUpload(request, manifest, env)
  // A committed submission never changes its files.
  if (await findSubmission(db, file.submissionId)) throw new FormsError('submission_committed', 409)
  const staged = await stagedUploads(db, file.submissionId, now())
  const total = staged.reduce((sum, row) => sum + (row.idx === file.index ? 0 : row.size), file.size)
  if (staged.filter(row => row.idx !== file.index).length >= LIMITS.files || total > fileLimits(env).total) throw new FormsError('files_too_large', 413)
  const bucket = await ipBucket(request, env, manifest, now, 'u:')
  if (bucket && await hitRate(db, bucket, now(), RATE.windowMs) > RATE.uploads) throw new FormsError('rate_limited', 429)
  if (await hitRate(db, `u:site:${manifest.site}`, now(), 24 * 3600 * 1000) > RATE.uploadsPerDay) throw new FormsError('rate_limited', 429)
  const key = uploadKey(file.submissionId, file.index)
  try {
    // FixedLengthStream rejects a body that differs from Content-Length.
    const body = typeof FixedLengthStream === 'function' ? request.body.pipeThrough(new FixedLengthStream(file.size)) : request.body
    await kv.put(key, body, { expirationTtl: FILE_TTL_SECONDS })
  } catch {
    await kv.delete(key).catch(() => {})
    throw new FormsError('files_unavailable', 503)
  }
  const { staged: written, replaced } = await stageUpload(db, file, key, now())
  if (!written) {
    await kv.delete(key).catch(() => {})
    throw new FormsError('submission_committed', 409)
  }
  if (replaced) await kv.delete(replaced).catch(() => {})
  // Abandoned uploads are swept here too: cron is optional.
  const sweep = sweepOrphanUploads(db, kv, now(), 5).catch(() => {})
  if (ctx?.waitUntil) ctx.waitUntil(sweep)
  else await sweep
  return jsonResponse({ result: 'success', index: file.index })
}

async function submit ({ request, env, ctx, manifest, providers, now }) {
  if (request.method !== 'POST') return jsonResponse({ result: 'error', error: 'method_not_allowed' }, 405, { allow: 'POST' })
  // A same-origin POST always carries Origin; it limits drive-by cross-site use
  // but is not visitor authentication (antispam, limits and review still apply).
  if (!isSameOrigin(request, manifest.origins)) throw new FormsError('origin_forbidden', 403)
  const db = requireDatabase(env)
  // A retry after commit resolves its file references from the stored
  // submission, so it gets the same digest (and receipt) as the original.
  const uploads = async id => {
    const committed = await loadSubmission(db, id)
    if (!committed) return stagedUploads(db, id, now())
    return committed.files.map(file => ({ ...file, idx: file.index, form_key: committed.form_key, kv_key: file.key }))
  }
  const parsed = await parseSubmission(await readSubmission(request), manifest, { env, uploads })

  // Idempotency first: a retry of a stored submission is never rate limited.
  const existing = await findSubmission(db, parsed.submissionId)
  if (existing) {
    if (existing.digest !== parsed.digest) throw new FormsError('submission_conflict', 409)
    return receipt(existing)
  }
  const bucket = await ipBucket(request, env, manifest, now)
  if (bucket && await hitRate(db, bucket, now(), RATE.windowMs) > RATE.limit) throw new FormsError('rate_limited', 429)

  const authority = await resolveAuthority(env, parsed.spec, providers)
  const kv = env.FORMS_FILES
  const files = parsed.files
  const content = {
    site: env.FORMS_SITE || manifest.site,
    senderName: env.FORMS_SENDER_NAME || manifest.site,
    subject: parsed.spec.subject,
    pageTitle: parsed.spec.title || '',
    to: parsed.spec.to,
    replyTo: parsed.email
  }
  // Small totals ride inside the email; larger ones go to the sender's Drive.
  const filesBytes = files.reduce((total, file) => total + file.size, 0)
  const storage = files.length && {
    files: {
      mode: driveEnabled(env) && filesBytes > LIMITS.inlineBytes ? 'drive' : 'inline',
      root: env.FORMS_DRIVE_FOLDER || '',
      project: manifest.project || manifest.site,
      label: parsed.spec.id
    }
  }
  const held = parsed.status === 'review' ? 'review' : authority.provider === 'hold' ? 'delivery_disabled' : null
  const jobs = [{ channel: 'owner', state: held ? 'held' : 'pending', reason: held, authority: { ...authority, ...content, ...storage } }]
  if (parsed.status === 'accepted' && parsed.spec.confirm && parsed.email && await confirmationAllowed(db, manifest, parsed.email, now())) {
    jobs.push({ channel: 'confirmation', state: held ? 'held' : 'pending', reason: held, authority: { ...authority, ...content, confirm: parsed.spec.confirm } })
  }

  const stagedKeys = (await db.prepare('SELECT kv_key FROM forms_uploads WHERE submission_id = ?').bind(parsed.submissionId).all()).results.map(row => row.kv_key)
  try {
    await insertSubmission(db, { parsed, files, jobs, now: now() })
  } catch (error) {
    // A concurrent request with the same ID may have committed first.
    // Staged uploads stay for a retry (or the orphan sweep).
    const winner = await findSubmission(db, parsed.submissionId).catch(() => null)
    if (!winner) throw error
    if (winner.digest !== parsed.digest) throw new FormsError('submission_conflict', 409)
    return receipt(winner)
  }

  // Staged uploads the submission does not reference (removed by the visitor).
  const referenced = new Set(files.map(file => file.key))
  const unused = stagedKeys.filter(key => !referenced.has(key))
  const work = Promise.all([
    ...unused.map(key => kv?.delete(key).catch(() => {})),
    // waitUntil stops 30 s after the response: Drive gets 25 s here; a send
    // that would not fit in what is left, and anything unfinished, goes to the
    // admin dispatch or the optional cron.
    held || dispatch({ env, db, kv, providers, now, submissionId: parsed.submissionId, limit: 2, driveTimeoutMs: 25000, deadline: now() + WAIT_UNTIL_MS })
      .catch(error => console.error('forms_dispatch_error', error?.name, String(error?.message).slice(0, 200)))
  ])
  if (ctx?.waitUntil) ctx.waitUntil(work)
  else await work
  return receipt({ id: parsed.submissionId, status: parsed.status })
}

async function confirmationAllowed (db, manifest, email, time) {
  const recipient = (await sha256Hex(`${manifest.site}\n${email.toLowerCase()}`)).slice(0, 32)
  if (await hitRate(db, `c:${recipient}`, time, CONFIRM_RATE.windowMs) > CONFIRM_RATE.perRecipient) return false
  return await hitRate(db, `c:site:${manifest.site}`, time, CONFIRM_RATE.windowMs) <= CONFIRM_RATE.perSite
}

// Returns { fetch, scheduled }. `fetch` answers only /api/forms/*; compose it in
// the project Worker before commerce/ASSETS. Options exist for tests.
export function createFormsWorker (manifest, { fetch, now = Date.now } = {}) {
  validateManifest(manifest)
  const send = fetch || ((...args) => globalThis.fetch(...args))
  const providers = createProviders({ fetch: send })
  return {
    async fetch (request, env, ctx) {
      const path = new URL(request.url).pathname.replace(/\/$/, '')
      try {
        if (path === '/api/forms/submit') return await submit({ request, env, ctx, manifest, providers, now })
        if (path === '/api/forms/upload') return await upload({ request, env, ctx, manifest, now })
        if (path.startsWith('/api/forms/admin/')) return await admin({ request, env, ctx, path: path.slice('/api/forms/admin/'.length), manifest, providers, fetch: send, now })
        return jsonResponse({ result: 'error', error: 'not_found' }, 404)
      } catch (error) {
        return errorResponse(error)
      }
    },
    async scheduled (_event, env, ctx) {
      const db = requireDatabase(env)
      ctx.waitUntil(dispatch({ env, db, kv: env.FORMS_FILES, providers, now, limit: 5 })
        .then(() => pruneSubmissions(db, env.FORMS_FILES, env, now, 5)))
    }
  }
}
