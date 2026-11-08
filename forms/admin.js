// Admin API of the forms module: the project panel (people, GitHub session of
// the CMS) and automations (Bearer FORMS_ADMIN_TOKEN) use the same routes.
import { dispatch, purgeFiles } from './dispatch.js'
import { FormsError, jsonResponse, sha256Hex, timingSafeEqual } from './http.js'
import { loadSubmission, requireDatabase, resolveHeld } from './store.js'

const DAY_MS = 24 * 3600 * 1000
const PAGE_SIZE = 50
// A positive GitHub check is reused for a few minutes per isolate (one
// subrequest instead of one per panel call); denials are not cached.
const GITHUB_TTL_MS = 5 * 60 * 1000
const githubCache = new Map()

// Jobs that need a person: failures (except discards) and holds that are not
// the expected ones (review queue, delivery disabled on previews).
const ATTENTION = `(j.state = 'failed' AND IFNULL(j.last_error, '') <> 'discarded')
  OR (j.state = 'held' AND IFNULL(j.last_error, '') NOT IN ('review', 'delivery_disabled'))`
const VIEWS = {
  all: '1 = 1',
  attention: `EXISTS (SELECT 1 FROM forms_jobs j WHERE j.submission_id = s.id AND (${ATTENTION}))`,
  review: "EXISTS (SELECT 1 FROM forms_jobs j WHERE j.submission_id = s.id AND j.state = 'held' AND j.last_error = 'review')"
}

export function adminRepo (env, manifest) {
  const repo = env.FORMS_ADMIN_REPO || manifest.repo || ''
  return /^[\w.-]+\/[\w.-]+$/.test(repo) ? repo : ''
}

// Returns 'token' (automation) or 'github' (a person with push access to the
// site repository, the same permission the CMS needs to publish).
export async function authorize (request, env, { manifest, fetch, now }) {
  const header = request.headers.get('authorization') || ''
  const [, scheme, credential] = header.match(/^(Bearer|GitHub)\s+(\S{20,400})$/i) || []
  if (!scheme) throw new FormsError('unauthorized', 401)
  if (scheme.toLowerCase() === 'bearer') {
    const token = env.FORMS_ADMIN_TOKEN
    if (typeof token === 'string' && token.length >= 32 && timingSafeEqual(credential, token)) return 'token'
    throw new FormsError('unauthorized', 401)
  }
  const repo = adminRepo(env, manifest)
  if (!repo) throw new FormsError('admin_repo_unset', 503)
  const key = await sha256Hex(`${repo}\n${credential}`)
  const cached = githubCache.get(key)
  if (cached && cached > now()) return 'github'
  let response
  try {
    response = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { authorization: `Bearer ${credential}`, accept: 'application/vnd.github+json', 'user-agent': 'sansoul-forms', 'x-github-api-version': '2022-11-28' },
      signal: AbortSignal.timeout(8000)
    })
  } catch {
    throw new FormsError('github_unavailable', 503)
  }
  // GitHub down or rate limited is not a verdict on the person.
  if (response.status >= 500 || response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) throw new FormsError('github_unavailable', 503)
  const data = response.ok ? await response.json().catch(() => null) : null
  const permissions = data?.permissions || {}
  if (!(permissions.push || permissions.maintain || permissions.admin)) throw new FormsError('unauthorized', 401)
  if (githubCache.size > 200) githubCache.clear()
  githubCache.set(key, now() + GITHUB_TTL_MS)
  return 'github'
}

const parse = (text, fallback) => {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

// Short one-line preview of a submission for the list.
function preview (fields) {
  return fields.filter(([name, value]) => !name.startsWith('_') && typeof value === 'string' && value.trim())
    .slice(0, 3).map(([, value]) => value.replace(/\s+/g, ' ').slice(0, 60)).join(' · ')
}

const publicJob = job => ({
  channel: job.channel,
  state: job.state,
  reason: job.last_error || null,
  attempts: job.attempts,
  updatedAt: job.updated_at
})

async function summary (db, env, now) {
  const time = now()
  const submissions = await db.prepare('SELECT COUNT(*) AS total, MIN(created_at) AS oldest FROM forms_submissions').first()
  const counts = await db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM forms_submissions s WHERE ${VIEWS.attention}) AS attention,
       (SELECT COUNT(*) FROM forms_submissions s WHERE ${VIEWS.review}) AS review,
       (SELECT COUNT(*) FROM forms_jobs WHERE state IN ('pending', 'leased')) AS queued`
  ).first()
  const sent = (await db.prepare(
    `SELECT json_extract(authority, '$.account') AS account, COUNT(*) AS sent FROM forms_jobs
     WHERE state = 'sent' AND updated_at >= ? GROUP BY account`
  ).bind(time - DAY_MS).all()).results
  const drive = await db.prepare(
    'SELECT COUNT(*) AS files, SUM(CASE WHEN verified_at IS NULL THEN 1 ELSE 0 END) AS pending FROM forms_drive_files'
  ).first()
  return {
    provider: env.FORMS_PROVIDER || null,
    submissions: submissions.total,
    oldest: submissions.oldest,
    attention: counts.attention,
    review: counts.review,
    queued: counts.queued,
    sent24h: sent.map(row => ({ account: row.account || null, sent: row.sent })),
    drive: { files: drive.files || 0, pending: drive.pending || 0 },
    retentionDays: retentionDays(env)
  }
}

async function list (db, url) {
  const view = VIEWS[url.searchParams.get('view')] ? url.searchParams.get('view') : 'all'
  const [beforeTime, beforeId] = (url.searchParams.get('before') || '').split('|')
  const cursor = Number.isSafeInteger(Number(beforeTime)) && Number(beforeTime) > 0 && beforeId ? [Number(beforeTime), beforeId] : null
  const rows = (await db.prepare(
    `SELECT s.id, s.form_key, s.page, s.status, s.fields, s.files, s.created_at FROM forms_submissions s
     WHERE (${VIEWS[view]}) ${cursor ? 'AND (s.created_at < ?1 OR (s.created_at = ?1 AND s.id < ?2))' : ''}
     ORDER BY s.created_at DESC, s.id DESC LIMIT ${PAGE_SIZE + 1}`
  ).bind(...(cursor || [])).all()).results
  const page = rows.slice(0, PAGE_SIZE)
  const jobs = page.length
    ? (await db.prepare('SELECT submission_id, channel, state, last_error, attempts, updated_at FROM forms_jobs WHERE submission_id IN (SELECT value FROM json_each(?)) ORDER BY channel DESC')
        .bind(JSON.stringify(page.map(row => row.id))).all()).results
    : []
  const last = page[page.length - 1]
  return {
    view,
    items: page.map(row => ({
      id: row.id,
      form: row.form_key,
      page: row.page,
      status: row.status,
      createdAt: row.created_at,
      preview: preview(parse(row.fields, [])),
      files: parse(row.files, []).length,
      jobs: jobs.filter(job => job.submission_id === row.id).map(publicJob)
    })),
    next: rows.length > PAGE_SIZE ? `${last.created_at}|${last.id}` : null
  }
}

async function detail (db, id) {
  const submission = await loadSubmission(db, id)
  if (!submission) throw new FormsError('not_found', 404)
  const reasons = (await db.prepare('SELECT reasons FROM forms_submissions WHERE id = ?').bind(id).first())?.reasons
  const drive = new Map((await db.prepare('SELECT idx, link, verified_at FROM forms_drive_files WHERE submission_id = ?').bind(id).all()).results.map(row => [row.idx, row]))
  const jobs = (await db.prepare(
    `SELECT channel, state, last_error, attempts, updated_at, provider_ref,
       json_extract(authority, '$.provider') AS provider, json_extract(authority, '$.account') AS account,
       json_extract(authority, '$.to') AS recipients, json_extract(authority, '$.files.mode') AS files_mode
     FROM forms_jobs WHERE submission_id = ? ORDER BY channel DESC`
  ).bind(id).all()).results
  return {
    id: submission.id,
    form: submission.form_key,
    page: submission.page,
    status: submission.status,
    reasons: parse(reasons, []),
    createdAt: submission.created_at,
    fields: submission.fields,
    files: submission.files.map(file => ({
      index: file.index,
      field: file.field,
      name: file.name,
      type: file.type,
      size: file.size,
      stored: !submission.files_purged_at,
      drive: drive.has(file.index) ? { link: drive.get(file.index).link || null, verified: Boolean(drive.get(file.index).verified_at) } : null
    })),
    jobs: jobs.map(job => ({
      ...publicJob(job),
      provider: job.provider,
      account: job.account || null,
      recipients: job.channel === 'owner' ? parse(job.recipients, []) : [],
      filesMode: job.files_mode || null,
      ref: job.provider_ref || null
    }))
  }
}

async function download (db, kv, id, index) {
  const submission = await loadSubmission(db, id)
  const file = submission?.files.find(item => item.index === index)
  if (!file) throw new FormsError('not_found', 404)
  if (submission.files_purged_at || !kv) throw new FormsError('file_purged', 410)
  const stream = await kv.get(file.key, 'stream')
  if (!stream) throw new FormsError('file_purged', 410)
  // Never rendered by the browser: always a download, sandboxed.
  return new Response(stream, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'content-length': String(file.size),
      'cache-control': 'private, no-store',
      'content-security-policy': "default-src 'none'; sandbox",
      'x-content-type-options': 'nosniff'
    }
  })
}

export function retentionDays (env) {
  const days = Number(env.FORMS_RETENTION_DAYS)
  return Number.isInteger(days) && days > 0 ? days : null
}

// Deleting is final: KV bytes, Drive references, jobs and the submission.
// Files already copied to Drive stay in the sender's Drive.
export async function deleteSubmission (db, kv, id, now) {
  const submission = await loadSubmission(db, id)
  if (!submission) return false
  const busy = await db.prepare("SELECT 1 FROM forms_jobs WHERE submission_id = ? AND state IN ('pending', 'leased')").bind(id).first()
  if (busy) throw new FormsError('submission_busy', 409)
  await purgeFiles(db, kv, submission, now)
  await db.batch([
    db.prepare('DELETE FROM forms_drive_files WHERE submission_id = ?').bind(id),
    db.prepare('DELETE FROM forms_jobs WHERE submission_id = ?').bind(id),
    db.prepare('DELETE FROM forms_submissions WHERE id = ?').bind(id)
  ])
  return true
}

// Retention (FORMS_RETENTION_DAYS): only submissions whose jobs are all
// closed are deleted: sent, or failed on purpose (discarded). Held and failed
// ones wait for a person.
export async function pruneSubmissions (db, kv, env, now, limit = 20) {
  const days = retentionDays(env)
  if (!days) return 0
  const ids = (await db.prepare(
    `SELECT id FROM forms_submissions s WHERE created_at < ?
     AND NOT EXISTS (SELECT 1 FROM forms_jobs j WHERE j.submission_id = s.id AND (j.state IN ('pending', 'leased', 'held') OR ${ATTENTION}))
     ORDER BY created_at LIMIT ?`
  ).bind(now() - days * DAY_MS, limit).all()).results.map(row => row.id)
  let deleted = 0
  for (const id of ids) {
    // A job queued since the SELECT (409) must not abort the whole drain.
    try {
      if (await deleteSubmission(db, kv, id, now)) deleted++
    } catch (error) {
      if (!(error instanceof FormsError)) throw error
    }
  }
  return deleted
}

export async function admin ({ request, env, ctx, path, manifest, providers, fetch, now }) {
  const actor = await authorize(request, env, { manifest, fetch, now })
  const db = requireDatabase(env)
  const kv = env.FORMS_FILES
  const method = request.method
  // The automation token drains and decides; reading or deleting data needs a person.
  if (actor === 'token' && !(method === 'POST' && (path === 'dispatch' || path === 'retention' || path.startsWith('jobs/')))) throw new FormsError('forbidden', 403)
  const url = new URL(request.url)
  const submission = path.match(/^submissions\/([A-Za-z0-9-]{16,64})(?:\/(delete|files\/(\d{1,2})))?$/)

  if (method === 'GET') {
    if (path === 'summary') return jsonResponse({ ...(await summary(db, env, now)), actor })
    if (path === 'submissions') return jsonResponse(await list(db, url))
    if (submission && !submission[2]) return jsonResponse(await detail(db, submission[1]))
    if (submission?.[3] !== undefined) return download(db, kv, submission[1], Number(submission[3]))
    throw new FormsError('not_found', 404)
  }
  if (method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, { allow: 'GET, POST' })

  if (path === 'dispatch') {
    const result = await dispatch({ env, db, kv, providers, now, limit: 3 })
    const pruned = await pruneSubmissions(db, kv, env, now, 5)
    const counts = await db.prepare(`SELECT COUNT(*) AS attention FROM forms_submissions s WHERE ${VIEWS.attention}`).first()
    return jsonResponse({ ...result, pruned, attention: counts.attention })
  }
  if (path === 'retention') return jsonResponse({ deleted: await pruneSubmissions(db, kv, env, now), retentionDays: retentionDays(env) })
  if (submission?.[2] === 'delete') {
    if (!await deleteSubmission(db, kv, submission[1], now)) throw new FormsError('not_found', 404)
    return jsonResponse({ ok: true })
  }
  const job = path.match(/^jobs\/([A-Za-z0-9-]{16,64}:(?:owner|confirmation))\/(release|discard)$/)
  if (job) {
    if (!await resolveHeld(db, job[1], job[2], now())) throw new FormsError('job_not_held', 409)
    const submissionId = job[1].split(':')[0]
    if (job[2] === 'discard' && job[1].endsWith(':owner')) await purgeFiles(db, kv, await loadSubmission(db, submissionId), now)
    if (job[2] === 'release') {
      // Send right away; the scheduled drain picks up whatever does not finish.
      const work = dispatch({ env, db, kv, providers, now, submissionId, limit: 2, driveTimeoutMs: 25000 })
        .catch(error => console.error('forms_dispatch_error', error?.name, String(error?.message).slice(0, 200)))
      if (ctx?.waitUntil) ctx.waitUntil(work)
      else await work
    }
    return jsonResponse({ ok: true })
  }
  throw new FormsError('not_found', 404)
}
