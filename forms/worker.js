import { dispatch, purgeFiles } from './dispatch.js'
import { FormsError, errorResponse, isSameOrigin, jsonResponse, sha256Hex, timingSafeEqual } from './http.js'
import { parseSubmission, readSubmission } from './intake.js'
import { validateManifest } from './manifest.js'
import { createProviders, resolveAuthority } from './providers/index.js'
import { fileKey, findSubmission, hitRate, insertSubmission, loadSubmission, requireDatabase, resolveHeld } from './store.js'

export const RATE = Object.freeze({ windowMs: 10 * 60 * 1000, limit: 6 })
// Confirmations go to a visitor-typed address: one per recipient and day, and
// a site-wide daily cap, so the form cannot be used to mail third parties.
export const CONFIRM_RATE = Object.freeze({ windowMs: 24 * 3600 * 1000, perRecipient: 1, perSite: 100 })
// Safety net only: held/review attachments must be resolved within this time.
export const FILE_TTL_SECONDS = 90 * 24 * 3600
const receipt = row => jsonResponse({ result: 'success', persisted: true, submissionId: row.id, status: row.status })

async function submit ({ request, env, ctx, manifest, providers, now }) {
  if (request.method !== 'POST') return jsonResponse({ result: 'error', error: 'method_not_allowed' }, 405, { allow: 'POST' })
  // A same-origin POST always carries Origin; it limits drive-by cross-site use
  // but is not visitor authentication (antispam, limits and review still apply).
  if (!isSameOrigin(request)) throw new FormsError('origin_forbidden', 403)
  const db = requireDatabase(env)
  const parsed = await parseSubmission(await readSubmission(request), manifest)

  // Idempotency first: a retry of a stored submission is never rate limited.
  const existing = await findSubmission(db, parsed.submissionId)
  if (existing) {
    if (existing.digest !== parsed.digest) throw new FormsError('submission_conflict', 409)
    return receipt(existing)
  }
  const ip = request.headers.get('cf-connecting-ip')
  if (ip) {
    const bucket = (await sha256Hex(`${manifest.site}\n${ip}`)).slice(0, 32)
    if (await hitRate(db, bucket, now(), RATE.windowMs) > RATE.limit) throw new FormsError('rate_limited', 429)
  }

  const authority = await resolveAuthority(env, parsed.spec, providers)
  const kv = env.FORMS_FILES
  if (parsed.files.length && (!kv || typeof kv.put !== 'function')) throw new FormsError('files_unavailable', 503)
  const files = parsed.files.map(({ bytes, ...file }, index) => ({ ...file, key: fileKey(parsed.submissionId, parsed.digest, index) }))
  try {
    for (const [index, file] of parsed.files.entries()) await kv.put(files[index].key, file.bytes, { expirationTtl: FILE_TTL_SECONDS })
  } catch {
    for (const file of files) await kv.delete(file.key).catch(() => {})
    throw new FormsError('files_unavailable', 503)
  }

  const content = {
    site: env.FORMS_SITE || manifest.site,
    senderName: env.FORMS_SENDER_NAME || manifest.site,
    subject: parsed.spec.subject,
    to: parsed.spec.to,
    replyTo: parsed.email
  }
  const held = parsed.status === 'review' ? 'review' : authority.provider === 'hold' ? 'delivery_disabled' : null
  const jobs = [{ channel: 'owner', state: held ? 'held' : 'pending', reason: held, authority: { ...authority, ...content } }]
  if (parsed.status === 'accepted' && parsed.spec.confirm && parsed.email && await confirmationAllowed(db, manifest, parsed.email, now())) {
    jobs.push({ channel: 'confirmation', state: held ? 'held' : 'pending', reason: held, authority: { ...authority, ...content, confirm: parsed.spec.confirm } })
  }

  try {
    await insertSubmission(db, { parsed, files, jobs, now: now() })
  } catch (error) {
    // A concurrent request with the same ID may have committed first.
    const winner = await findSubmission(db, parsed.submissionId).catch(() => null)
    if (!winner) {
      for (const file of files) await kv?.delete(file.key).catch(() => {})
      throw error
    }
    if (winner.digest !== parsed.digest) throw new FormsError('submission_conflict', 409)
    return receipt(winner)
  }

  if (!held) {
    const work = dispatch({ env, db, kv, providers, now, submissionId: parsed.submissionId, limit: 2 })
      .catch(error => console.error('forms_dispatch_error', error?.name, String(error?.message).slice(0, 200)))
    if (ctx?.waitUntil) ctx.waitUntil(work)
    else await work
  }
  return receipt({ id: parsed.submissionId, status: parsed.status })
}

async function confirmationAllowed (db, manifest, email, time) {
  const recipient = (await sha256Hex(`${manifest.site}\n${email.toLowerCase()}`)).slice(0, 32)
  if (await hitRate(db, `c:${recipient}`, time, CONFIRM_RATE.windowMs) > CONFIRM_RATE.perRecipient) return false
  return await hitRate(db, `c:site:${manifest.site}`, time, CONFIRM_RATE.windowMs) <= CONFIRM_RATE.perSite
}

function authorized (request, env) {
  const token = env.FORMS_ADMIN_TOKEN
  const supplied = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  return typeof token === 'string' && token.length >= 32 && timingSafeEqual(supplied, token)
}

async function admin ({ request, env, path, providers, now }) {
  if (!authorized(request, env)) throw new FormsError('unauthorized', 401)
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, { allow: 'POST' })
  const db = requireDatabase(env)
  if (path === 'dispatch') {
    return jsonResponse(await dispatch({ env, db, kv: env.FORMS_FILES, providers, now, limit: 3 }))
  }
  const job = path.match(/^jobs\/([A-Za-z0-9-]{16,64}:(?:owner|confirmation))\/(release|discard)$/)
  if (job) {
    if (!await resolveHeld(db, job[1], job[2], now())) throw new FormsError('job_not_held', 409)
    if (job[2] === 'discard' && job[1].endsWith(':owner')) {
      await purgeFiles(db, env.FORMS_FILES, await loadSubmission(db, job[1].split(':')[0]), now)
    }
    return jsonResponse({ ok: true })
  }
  throw new FormsError('not_found', 404)
}

// Returns { fetch, scheduled }. `fetch` answers only /api/forms/*; compose it in
// the project Worker before commerce/ASSETS. Options exist for tests.
export function createFormsWorker (manifest, { fetch, now = Date.now } = {}) {
  validateManifest(manifest)
  const providers = createProviders({ fetch: fetch || ((...args) => globalThis.fetch(...args)) })
  return {
    async fetch (request, env, ctx) {
      const path = new URL(request.url).pathname.replace(/\/$/, '')
      try {
        if (path === '/api/forms/submit') return await submit({ request, env, ctx, manifest, providers, now })
        if (path.startsWith('/api/forms/admin/')) return await admin({ request, env, path: path.slice('/api/forms/admin/'.length), providers, now })
        return jsonResponse({ result: 'error', error: 'not_found' }, 404)
      } catch (error) {
        return errorResponse(error)
      }
    },
    async scheduled (_event, env, ctx) {
      const db = requireDatabase(env)
      ctx.waitUntil(dispatch({ env, db, kv: env.FORMS_FILES, providers, now, limit: 5 }))
    }
  }
}
