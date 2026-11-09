// Admin API of the forms module: the project panel (people, GitHub session of
// the CMS) and automations (Bearer FORMS_ADMIN_TOKEN) use the same routes.
import { WAIT_UNTIL_MS, dispatch, purgeFiles } from './dispatch.js'
import { FormsError, jsonResponse, jsonTextResponse, sha256Hex, timingSafeEqual } from './http.js'
import { safeFileName } from './intake.js'
import { loadSubmission, requireDatabase, resolveHeld } from './store.js'

const DAY_MS = 24 * 3600 * 1000
const PAGE_SIZE = 50
const PAGE_MAX = 100
const CELL_MAX = 300
const DELETE_MAX = 50
// KV deletes per batch call (KV Free: 1,000 deletes a day per account); bytes
// beyond it expire with their 90-day TTL.
const KV_DELETE_MAX = 100
// A positive GitHub check is reused for a few minutes per isolate (one
// subrequest instead of one per panel call): a revoked permission keeps
// working here until it expires. Denials are kept for a minute, so a junk
// token costs one GitHub call per isolate and minute at most.
const GITHUB_TTL_MS = 5 * 60 * 1000
const GITHUB_DENY_MS = 60 * 1000
const githubCache = new Map()
// Token formats GitHub issues (OAuth, PAT, app); anything else is refused
// without asking GitHub.
const GITHUB_TOKEN = /^(gh[opsu]_[A-Za-z0-9]{30,250}|github_pat_\w{40,250}|[0-9a-f]{40})$/

// Jobs that need a person: failures (except discards) and holds that are not
// the expected ones (review queue, delivery disabled on previews).
const ATTENTION = `(j.state = 'failed' AND IFNULL(j.last_error, '') <> 'discarded')
  OR (j.state = 'held' AND IFNULL(j.last_error, '') NOT IN ('review', 'delivery_disabled'))`
const REVIEW = "j.state = 'held' AND j.last_error = 'review'"
// Views select submissions through their jobs (index on state).
const VIEWS = {
  all: '1 = 1',
  attention: `s.id IN (SELECT j.submission_id FROM forms_jobs j WHERE j.state IN ('failed', 'held') AND (${ATTENTION}))`,
  review: `s.id IN (SELECT j.submission_id FROM forms_jobs j WHERE ${REVIEW})`
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
  if (!GITHUB_TOKEN.test(credential)) throw new FormsError('unauthorized', 401)
  const key = await sha256Hex(`${repo}\n${credential}`)
  const cached = githubCache.get(key)
  if (cached && cached.until > now()) {
    if (cached.ok) return 'github'
    throw new FormsError('unauthorized', 401)
  }
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
  // permissions are the person's; OAuth and classic tokens also list their own
  // scopes: a token without repo access (another app's) is not enough.
  const scopes = response.headers.get('x-oauth-scopes')
  const scoped = scopes === null || /(^|[\s,])(public_)?repo([\s,]|$)/.test(scopes)
  const ok = scoped && Boolean(permissions.push || permissions.maintain || permissions.admin)
  if (githubCache.size >= 200) for (const old of [...githubCache.keys()].slice(0, 50)) githubCache.delete(old)
  githubCache.set(key, { ok, until: now() + (ok ? GITHUB_TTL_MS : GITHUB_DENY_MS) })
  if (!ok) throw new FormsError('unauthorized', 401)
  return 'github'
}

const parse = (text, fallback) => {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

const publicJob = job => ({
  channel: job.channel,
  state: job.state,
  reason: job.last_error || null,
  attempts: job.attempts,
  updatedAt: job.updated_at
})

// Counted from the jobs side: the state index reads only the jobs counted.
const attentionCount = db => db.prepare(`SELECT COUNT(DISTINCT j.submission_id) AS n FROM forms_jobs j WHERE j.state IN ('failed', 'held') AND (${ATTENTION})`)
const reviewCount = db => db.prepare(`SELECT COUNT(DISTINCT j.submission_id) AS n FROM forms_jobs j WHERE ${REVIEW}`)

// One D1 per project (README): the first site to use it is recorded; another
// site's Worker bound to the same database is reported, not mixed in.
async function siteCheck (db, site) {
  if (!site) return null
  try {
    const [, row] = await db.batch([
      db.prepare("INSERT INTO forms_meta (key, value) VALUES ('site', ?) ON CONFLICT DO NOTHING").bind(site),
      db.prepare("SELECT value FROM forms_meta WHERE key = 'site'")
    ])
    const stored = row.results[0]?.value
    return stored && stored !== site ? stored : null
  } catch {
    return null // migration 0003 not applied yet
  }
}

async function summary (db, env, manifest, now) {
  const time = now()
  const [submissions, attention, review, queued, sent, drive] = (await db.batch([
    db.prepare('SELECT COUNT(*) AS total, MIN(created_at) AS oldest FROM forms_submissions'),
    attentionCount(db),
    reviewCount(db),
    db.prepare("SELECT COUNT(*) AS n FROM forms_jobs WHERE state IN ('pending', 'leased')"),
    db.prepare(
      `SELECT json_extract(authority, '$.account') AS account, COUNT(*) AS sent FROM forms_jobs
       WHERE state = 'sent' AND updated_at >= ? GROUP BY account`
    ).bind(time - DAY_MS),
    db.prepare('SELECT COUNT(*) AS files, SUM(CASE WHEN verified_at IS NULL THEN 1 ELSE 0 END) AS pending FROM forms_drive_files')
  ])).map(result => result.results)
  return {
    provider: env.FORMS_PROVIDER || null,
    submissions: submissions[0].total,
    oldest: submissions[0].oldest,
    attention: attention[0].n,
    review: review[0].n,
    queued: queued[0].n,
    sent24h: sent.map(row => ({ account: row.account || null, sent: row.sent })),
    drive: { files: drive[0].files || 0, pending: drive[0].pending || 0 },
    retentionDays: retentionDays(env),
    siteMismatch: await siteCheck(db, manifest.site)
  }
}

// Display state of a submission: its owner job (else the only one), with the
// review queue and discards told apart.
const STATE_SQL = `(SELECT CASE WHEN j.state = 'held' AND j.last_error = 'review' THEN 'review'
  WHEN j.state = 'failed' AND j.last_error = 'discarded' THEN 'discarded' ELSE j.state END
  FROM forms_jobs j WHERE j.submission_id = s.id ORDER BY j.channel DESC LIMIT 1)`
// Value of one field (repeated fields joined, as in the panel).
const FIELD_SQL = "(SELECT group_concat(json_extract(f.value, '$[1]'), ', ') FROM json_each(s.fields) f WHERE json_extract(f.value, '$[0]') = ?)"
const OPS = {
  text: ['contains', 'not_contains', 'is', 'is_not', 'empty', 'not_empty'],
  enum: ['is', 'is_not'],
  count: ['empty', 'not_empty'],
  date: ['after', 'before']
}

// Table columns: fixed ones and form fields ("f:<name>"). Field names travel
// as bound parameters; nothing from the query string is spliced into SQL.
function column (id) {
  if (typeof id !== 'string') return null
  if (id === 'created') return { sql: 's.created_at', params: [], type: 'date' }
  if (id === 'form') return { sql: 's.form_key', params: [], type: 'enum' }
  if (id === 'state') return { sql: STATE_SQL, params: [], type: 'enum' }
  if (id === 'files') return { sql: 'json_array_length(s.files)', params: [], type: 'count' }
  if (id.startsWith('f:') && id.length > 2 && id.length <= 202) return { sql: FIELD_SQL, params: [id.slice(2)], type: 'text' }
  return null
}

const likeArg = value => `%${value.replace(/[\\%_]/g, match => `\\${match}`)}%`

function condition ([id, op, value]) {
  const col = column(id)
  if (!col || !OPS[col.type].includes(op)) throw new FormsError('invalid_filter')
  const text = typeof value === 'string' ? value.slice(0, 200) : ''
  const expr = `IFNULL(${col.sql}, '')`
  if (col.type === 'date') {
    if (!/^\d{1,15}$/.test(text)) throw new FormsError('invalid_filter')
    return { sql: `${col.sql} ${op === 'after' ? '>=' : '<'} ?`, params: [...col.params, Number(text)] }
  }
  if (col.type === 'count') return { sql: `${col.sql} ${op === 'empty' ? '=' : '>'} 0`, params: col.params }
  if (op === 'empty' || op === 'not_empty') return { sql: `${expr} ${op === 'empty' ? '=' : '<>'} ''`, params: col.params }
  if (op === 'contains' || op === 'not_contains') return { sql: `${expr} ${op === 'contains' ? '' : 'NOT '}LIKE ? ESCAPE '\\'`, params: [...col.params, likeArg(text)] }
  return { sql: `${expr} ${op === 'is' ? '=' : '<>'} ? COLLATE NOCASE`, params: [...col.params, text] }
}

function parseJson (text, fallback) {
  try {
    return text ? JSON.parse(text) : fallback
  } catch {
    throw new FormsError('invalid_filter')
  }
}

// Filters, sort and groups run in D1 over every matching submission, so pages
// and counts are exact; the Worker only parses the page it returns.
function listQuery (url) {
  const params = url.searchParams
  const view = VIEWS[params.get('view')] ? params.get('view') : 'all'
  const where = [{ sql: VIEWS[view], params: [] }]
  const form = (params.get('form') || '').slice(0, 300) || null
  if (form) where.push({ sql: 's.form_key = ?', params: [form] })
  const search = (params.get('q') || '').trim().slice(0, 200)
  if (search) where.push({ sql: "EXISTS (SELECT 1 FROM json_each(s.fields) f WHERE json_extract(f.value, '$[1]') LIKE ? ESCAPE '\\')", params: [likeArg(search)] })
  const filters = parseJson(params.get('filter'), [])
  if (!Array.isArray(filters) || filters.length > 10) throw new FormsError('invalid_filter')
  for (const filter of filters) where.push(condition(Array.isArray(filter) ? filter : []))

  // "<column>:<asc|desc>"; field names may contain ':' themselves.
  const rawSort = params.get('sort') || 'created:desc'
  const [, sortId, sortDir] = rawSort.match(/^(.+):(asc|desc)$/) || [null, rawSort, 'desc']
  const sort = column(sortId)
  if (!sort) throw new FormsError('invalid_sort')
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC'
  const groupCol = params.get('group') ? column(params.get('group')) : null
  if (params.get('group') && !groupCol) throw new FormsError('invalid_group')
  let group = null
  if (groupCol) {
    // Dates group by local day (tz: minutes east of UTC, from the browser).
    const tz = Math.max(-900, Math.min(900, Math.trunc(Number(params.get('tz')) || 0)))
    group = groupCol.type === 'date'
      ? { sql: "date(s.created_at / 1000 + ?, 'unixepoch')", params: [tz * 60], order: 'g DESC' }
      : groupCol.type === 'text'
        ? { sql: `substr(IFNULL(${groupCol.sql}, ''), 1, 100)`, params: groupCol.params, order: "g = '', g COLLATE NOCASE, g" }
        : { sql: `IFNULL(${groupCol.sql}, '')`, params: groupCol.params, order: "g = '', g" }
  }
  return {
    view,
    form,
    where: { sql: where.map(part => `(${part.sql})`).join(' AND '), params: where.flatMap(part => part.params) },
    sort: { ...sort, dir, isDefault: sortId === 'created' && dir === 'DESC' },
    group
  }
}

// Previews and cells are cut in SQL: a page never parses whole submissions in
// the Worker (values can reach 20,000 characters each).
const PREVIEW_SQL = `(SELECT group_concat(v, ' · ') FROM (
  SELECT trim(substr(replace(replace(replace(json_extract(f.value, '$[1]'), char(10), ' '), char(13), ' '), char(9), ' '), 1, 60)) AS v
  FROM json_each(s.fields) f
  WHERE substr(json_extract(f.value, '$[0]'), 1, 1) <> '_' AND trim(IFNULL(json_extract(f.value, '$[1]'), '')) <> ''
  ORDER BY f.key LIMIT 3))`
const CELLS_SQL = `(SELECT json_group_array(json_array(json_extract(f.value, '$[0]'), substr(IFNULL(json_extract(f.value, '$[1]'), ''), 1, ${CELL_MAX})))
  FROM json_each(s.fields) f)`

async function list (db, url) {
  const query = listQuery(url)
  const params = url.searchParams
  const full = params.get('full') === '1'
  const size = Math.max(1, Math.min(PAGE_MAX, Math.trunc(Number(params.get('limit'))) || PAGE_SIZE))
  // Default order pages by keyset ("<time>|<id>", stable while new submissions
  // arrive); any other order or grouping by offset ("+<n>").
  const before = params.get('before') || ''
  const keyset = query.sort.isDefault && !query.group
  const offset = !keyset && /^\+\d{1,7}$/.test(before) ? Number(before.slice(1)) : 0
  const [beforeTime, beforeId] = keyset ? before.split('|') : []
  const cursor = Number.isSafeInteger(Number(beforeTime)) && Number(beforeTime) > 0 && beforeId ? [Number(beforeTime), beforeId] : null
  const first = !cursor && !offset

  const where = cursor
    ? { sql: `${query.where.sql} AND s.created_at <= ? AND (s.created_at < ? OR s.id < ?)`, params: [...query.where.params, cursor[0], cursor[0], cursor[1]] }
    : query.where
  const withFields = Boolean(query.form) || full
  const groupSelect = query.group ? `, ${query.group.sql} AS g` : ''
  const sortExpr = query.sort.type === 'text' ? `${query.sort.sql} COLLATE NOCASE` : query.sort.sql
  const order = [query.group?.order, `${sortExpr} ${query.sort.dir}`, 's.created_at DESC', 's.id DESC'].filter(Boolean).join(', ')
  const statements = [
    db.prepare(
      `SELECT s.id, s.form_key, s.page, s.status, s.created_at, json_array_length(s.files) AS files, ${STATE_SQL} AS state, ${PREVIEW_SQL} AS preview
       ${withFields ? `, ${full ? 's.fields' : CELLS_SQL} AS cells` : ''}${groupSelect}
       FROM forms_submissions s WHERE ${where.sql} ORDER BY ${order} LIMIT ${size + 1} OFFSET ${offset}`
    ).bind(...(query.group?.params || []), ...where.params, ...query.sort.params)
  ]
  // Counts, groups and the columns of a form come with the first page only.
  if (first) {
    statements.push(db.prepare(`SELECT COUNT(*) AS n FROM forms_submissions s WHERE ${where.sql}`).bind(...where.params))
    if (query.group) {
      statements.push(db.prepare(`SELECT g, COUNT(*) AS n FROM (SELECT ${query.group.sql} AS g FROM forms_submissions s WHERE ${where.sql}) GROUP BY g ORDER BY ${query.group.order} LIMIT 200`)
        .bind(...query.group.params, ...where.params))
    }
    if (query.form) {
      statements.push(db.prepare(
        `SELECT json_extract(f.value, '$[0]') AS name, MAX(s.created_at) AS last, MIN(f.key) AS pos
         FROM forms_submissions s, json_each(s.fields) f WHERE s.form_key = ? GROUP BY name ORDER BY last DESC, pos LIMIT 100`
      ).bind(query.form))
    }
  }
  const results = (await db.batch(statements)).map(result => result.results)
  const rows = results[0]
  const total = first ? results[1][0].n : null
  const groups = first && query.group ? results[2] : null
  const columns = first && query.form ? results[query.group ? 3 : 2] : null
  const page = rows.slice(0, size)
  const jobs = page.length
    ? (await db.prepare('SELECT submission_id, channel, state, last_error, attempts, updated_at FROM forms_jobs WHERE submission_id IN (SELECT value FROM json_each(?)) ORDER BY channel DESC')
        .bind(JSON.stringify(page.map(row => row.id))).all()).results
    : []
  const last = page[page.length - 1]
  // Field values travel as the JSON D1 produced, spliced in unparsed.
  const items = page.map(row => {
    const item = JSON.stringify({
      id: row.id,
      form: row.form_key,
      page: row.page,
      status: row.status,
      state: row.state || null,
      createdAt: row.created_at,
      preview: row.preview || '',
      ...(query.group ? { group: row.g ?? '' } : {}),
      files: row.files || 0,
      jobs: jobs.filter(job => job.submission_id === row.id).map(publicJob)
    })
    return withFields ? `${item.slice(0, -1)},"fields":${row.cells || '[]'}}` : item
  })
  const meta = JSON.stringify({
    view: query.view,
    items: null,
    next: rows.length > size ? (keyset ? `${last.created_at}|${last.id}` : `+${offset + size}`) : null,
    ...(first ? { total } : {}),
    ...(groups ? { groups: groups.map(row => ({ key: row.g ?? '', count: row.n })) } : {}),
    ...(columns ? { columns: columns.map(row => String(row.name)) } : {})
  })
  return meta.replace('"items":null', `"items":[${items.join(',')}]`)
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
      name: safeFileName(file.name),
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

// RFC 6266/5987: an ASCII fallback plus the exact UTF-8 name ('()* encoded too).
function contentDisposition (name) {
  const clean = safeFileName(name)
  const ascii = clean.replace(/[^\x20-\x7e]|["%;\\]/g, '_')
  const exact = encodeURIComponent(clean).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${exact}`
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
      'content-disposition': contentDisposition(file.name),
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

// Deleting is final: jobs, Drive references and the submission go in one
// transaction, and only for submissions without a job queued or being sent
// (checked inside it, so a release at the same moment cannot slip through).
// KV bytes go afterwards; if that fails, their 90-day TTL removes them.
// Files already copied to Drive stay in the sender's Drive.
export async function deleteSubmissions (db, kv, ids) {
  const list = JSON.stringify(ids)
  const inList = 'SELECT value FROM json_each(?1)'
  const [, , removed, remaining] = await db.batch([
    db.prepare(`DELETE FROM forms_jobs WHERE submission_id IN (${inList})
      AND submission_id NOT IN (SELECT submission_id FROM forms_jobs WHERE state IN ('pending', 'leased') AND submission_id IN (${inList}))`).bind(list),
    db.prepare(`DELETE FROM forms_drive_files WHERE submission_id IN (${inList})
      AND NOT EXISTS (SELECT 1 FROM forms_jobs j WHERE j.submission_id = forms_drive_files.submission_id)`).bind(list),
    db.prepare(`DELETE FROM forms_submissions WHERE id IN (${inList})
      AND NOT EXISTS (SELECT 1 FROM forms_jobs j WHERE j.submission_id = forms_submissions.id) RETURNING id, files, files_purged_at`).bind(list),
    db.prepare(`SELECT id FROM forms_submissions WHERE id IN (${inList})`).bind(list)
  ])
  const keys = removed.results.filter(row => !row.files_purged_at).flatMap(row => parse(row.files, []).map(file => file.key))
  if (kv) await Promise.all(keys.slice(0, KV_DELETE_MAX).map(key => kv.delete(key).catch(() => {})))
  const deleted = removed.results.map(row => row.id)
  const busy = remaining.results.map(row => row.id)
  return { deleted, busy, missing: ids.filter(id => !deleted.includes(id) && !busy.includes(id)) }
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
  // A job queued since the SELECT keeps its submission (busy), nothing else.
  return ids.length ? (await deleteSubmissions(db, kv, ids)).deleted.length : 0
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
    if (path === 'summary') return jsonResponse({ ...(await summary(db, env, manifest, now)), actor })
    if (path === 'submissions') return jsonTextResponse(await list(db, url))
    if (path === 'forms') {
      const forms = (await db.prepare('SELECT form_key, page, COUNT(*) AS total, MAX(created_at) AS last FROM forms_submissions GROUP BY form_key, page ORDER BY last DESC LIMIT 100').all()).results
      return jsonResponse({ forms: forms.map(row => ({ form: row.form_key, page: row.page, total: row.total, last: row.last })) })
    }
    if (submission && !submission[2]) return jsonResponse(await detail(db, submission[1]))
    if (submission?.[3] !== undefined) return download(db, kv, submission[1], Number(submission[3]))
    throw new FormsError('not_found', 404)
  }
  if (method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, { allow: 'GET, POST' })

  if (path === 'dispatch') {
    const result = await dispatch({ env, db, kv, providers, now, limit: 3 })
    const pruned = await pruneSubmissions(db, kv, env, now, 5)
    const counts = await attentionCount(db).first()
    return jsonResponse({ ...result, pruned, attention: counts.n })
  }
  if (path === 'retention') return jsonResponse({ deleted: await pruneSubmissions(db, kv, env, now), retentionDays: retentionDays(env) })
  if (submission?.[2] === 'delete') {
    const result = await deleteSubmissions(db, kv, [submission[1]])
    if (result.busy.length) throw new FormsError('submission_busy', 409)
    if (!result.deleted.length) throw new FormsError('not_found', 404)
    return jsonResponse({ ok: true })
  }
  // Several at once: { ids: [...] }, up to DELETE_MAX, result per id.
  if (path === 'submissions/delete') {
    if (Number(request.headers.get('content-length') || 0) > 8192) throw new FormsError('payload_too_large', 413)
    const body = await request.json().catch(() => null)
    const ids = Array.isArray(body?.ids) ? [...new Set(body.ids)] : null
    if (!ids?.length || ids.length > DELETE_MAX || !ids.every(id => typeof id === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(id))) throw new FormsError('invalid_ids')
    return jsonResponse(await deleteSubmissions(db, kv, ids))
  }
  const job = path.match(/^jobs\/([A-Za-z0-9-]{16,64}:(?:owner|confirmation))\/(release|discard)$/)
  if (job) {
    if (!await resolveHeld(db, job[1], job[2], now())) throw new FormsError('job_not_held', 409)
    const submissionId = job[1].split(':')[0]
    if (job[2] === 'discard' && job[1].endsWith(':owner')) await purgeFiles(db, kv, await loadSubmission(db, submissionId), now)
    if (job[2] === 'release') {
      // Send right away; the scheduled drain picks up whatever does not finish.
      const work = dispatch({ env, db, kv, providers, now, submissionId, limit: 2, driveTimeoutMs: 25000, deadline: now() + WAIT_UNTIL_MS })
        .catch(error => console.error('forms_dispatch_error', error?.name, String(error?.message).slice(0, 200)))
      if (ctx?.waitUntil) ctx.waitUntil(work)
      else await work
    }
    return jsonResponse({ ok: true })
  }
  throw new FormsError('not_found', 404)
}
