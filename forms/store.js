import { FormsError } from './http.js'

export const LEASE_MS = 90000
export const MAX_ATTEMPTS = 6
const BACKOFF_MS = [60000, 300000, 1800000, 7200000, 21600000]

export function requireDatabase (env) {
  const db = env?.FORMS_DB
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') throw new FormsError('forms_unavailable', 503)
  return db
}

// Every upload gets its own key: a failed or repeated upload never touches the
// bytes another row (or a committed submission) references.
export const uploadKey = (submissionId, index) => `forms/${submissionId}/${index}-${crypto.randomUUID()}`
// Staged uploads older than this are ignored at submit and swept after twice
// as long, so a submit never races the sweep for the same bytes.
export const UPLOAD_STAGE_MS = 12 * 3600 * 1000

// Returns { staged, replaced }: `staged` is false when the submission was
// committed meanwhile (nothing written); `replaced` is the KV key to delete.
export async function stageUpload (db, upload, kvKey, now) {
  const previous = await db.prepare('SELECT kv_key FROM forms_uploads WHERE submission_id = ? AND idx = ?').bind(upload.submissionId, upload.index).first()
  const result = await db.prepare(
    `INSERT INTO forms_uploads (submission_id, idx, form_key, field, name, type, size, sha256, kv_key, created_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10
     WHERE NOT EXISTS (SELECT 1 FROM forms_submissions WHERE id = ?1)
     ON CONFLICT (submission_id, idx) DO UPDATE SET form_key = excluded.form_key, field = excluded.field,
       name = excluded.name, type = excluded.type, size = excluded.size, sha256 = excluded.sha256,
       kv_key = excluded.kv_key, created_at = excluded.created_at`
  ).bind(upload.submissionId, upload.index, upload.key, upload.field, upload.name, upload.type, upload.size, upload.sha256, kvKey, now).run()
  return { staged: result.meta.changes === 1, replaced: previous?.kv_key || null }
}

export async function stagedUploads (db, submissionId, now) {
  return (await db.prepare('SELECT idx, form_key, field, name, type, size, sha256, kv_key FROM forms_uploads WHERE submission_id = ? AND created_at >= ?').bind(submissionId, now - UPLOAD_STAGE_MS).all()).results
}

// Rows are removed first; bytes go only for submissions that never committed
// (a committed submission references other keys, see uploadKey).
export async function sweepOrphanUploads (db, kv, now, limit = 10) {
  const rows = (await db.prepare(
    `SELECT u.submission_id, u.idx, u.kv_key FROM forms_uploads u
     WHERE u.created_at < ? AND NOT EXISTS (SELECT 1 FROM forms_submissions s WHERE s.id = u.submission_id) LIMIT ?`
  ).bind(now - 2 * UPLOAD_STAGE_MS, limit).all()).results
  for (const row of rows) {
    const deleted = await db.prepare('DELETE FROM forms_uploads WHERE submission_id = ? AND idx = ? AND kv_key = ?').bind(row.submission_id, row.idx, row.kv_key).run()
    if (deleted.meta.changes === 1) await kv?.delete(row.kv_key)
  }
  return rows.length
}

export async function findSubmission (db, id) {
  return db.prepare('SELECT id, digest, status FROM forms_submissions WHERE id = ?').bind(id).first()
}

// One counter row per bucket and window; a single statement keeps it atomic.
export async function hitRate (db, bucket, now, windowMs) {
  const row = await db.prepare(
    `INSERT INTO forms_rate (bucket, hits, window_start) VALUES (?1, 1, ?2)
     ON CONFLICT (bucket) DO UPDATE SET
       hits = CASE WHEN window_start <= ?3 THEN 1 ELSE hits + 1 END,
       window_start = CASE WHEN window_start <= ?3 THEN ?2 ELSE window_start END
     RETURNING hits`
  ).bind(bucket, now, now - windowMs).first()
  return row.hits
}

// The submission and its delivery jobs commit atomically, or nothing does.
// Staged uploads become part of the submission in the same batch.
export async function insertSubmission (db, { parsed, files, jobs, now }) {
  const statements = [
    db.prepare(
      `INSERT INTO forms_submissions (id, form_key, page, digest, status, reasons, fields, files, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(parsed.submissionId, parsed.key, parsed.page, parsed.digest, parsed.status, JSON.stringify(parsed.reasons), JSON.stringify(parsed.fields), JSON.stringify(files), now),
    ...jobs.map(job => db.prepare(
      `INSERT INTO forms_jobs (id, submission_id, channel, state, authority, next_attempt_at, last_error, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(`${parsed.submissionId}:${job.channel}`, parsed.submissionId, job.channel, job.state, JSON.stringify(job.authority), now, job.reason || null, now)),
    db.prepare('DELETE FROM forms_uploads WHERE submission_id = ?').bind(parsed.submissionId)
  ]
  await db.batch(statements)
}

export async function loadSubmission (db, id) {
  const row = await db.prepare('SELECT id, form_key, page, status, fields, files, files_purged_at, created_at FROM forms_submissions WHERE id = ?').bind(id).first()
  return row && { ...row, fields: JSON.parse(row.fields), files: JSON.parse(row.files) }
}

// Expired leases go back to pending only when the provider was never called;
// otherwise the send may have happened and the job is held for review.
export async function recoverExpiredLeases (db, now) {
  // A job that keeps dying before the provider call (CPU/memory) stops after
  // MAX_ATTEMPTS instead of being reclaimed first on every pass.
  await db.prepare(
    `UPDATE forms_jobs SET
       state = CASE WHEN sending_at IS NOT NULL OR attempts >= ?2 THEN 'held' ELSE 'pending' END,
       last_error = CASE WHEN sending_at IS NOT NULL THEN 'lease_expired_ambiguous'
         WHEN attempts >= ?2 THEN 'lease_expired_repeatedly' ELSE 'lease_expired' END,
       next_attempt_at = ?1 + ?3,
       lease_token = NULL, lease_until = NULL, updated_at = ?1
     WHERE id IN (SELECT id FROM forms_jobs WHERE state = 'leased' AND lease_until < ?1 LIMIT 10)`
  ).bind(now, MAX_ATTEMPTS, BACKOFF_MS[0]).run()
}

export async function dueJobs (db, now, { submissionId, limit }) {
  const query = submissionId
    ? db.prepare("SELECT id FROM forms_jobs WHERE submission_id = ? AND state = 'pending' AND next_attempt_at <= ? ORDER BY channel DESC LIMIT ?").bind(submissionId, now, limit)
    : db.prepare("SELECT id FROM forms_jobs WHERE state = 'pending' AND next_attempt_at <= ? ORDER BY next_attempt_at, id LIMIT ?").bind(now, limit)
  return (await query.all()).results.map(row => row.id)
}

export async function claimJob (db, id, token, now) {
  const result = await db.prepare(
    `UPDATE forms_jobs SET state = 'leased', lease_token = ?, lease_until = ?, attempts = attempts + 1, updated_at = ?
     WHERE id = ? AND state = 'pending' AND next_attempt_at <= ?`
  ).bind(token, now + LEASE_MS, now, id, now).run()
  if (result.meta.changes !== 1) return null
  return db.prepare('SELECT id, submission_id, channel, authority, attempts FROM forms_jobs WHERE id = ?').bind(id).first()
}

// Every transition after the claim is fenced by the lease token.
async function fenced (db, sql, binds, id, token) {
  const result = await db.prepare(`${sql} WHERE id = ? AND state = 'leased' AND lease_token = ?`).bind(...binds, id, token).run()
  return result.meta.changes === 1
}

export function markSending (db, id, token, now) {
  return fenced(db, 'UPDATE forms_jobs SET sending_at = ?, lease_until = ?, updated_at = ?', [now, now + LEASE_MS, now], id, token)
}

export function markSent (db, id, token, now, ref) {
  return fenced(db, "UPDATE forms_jobs SET state = 'sent', provider_ref = ?, lease_token = NULL, lease_until = NULL, last_error = NULL, updated_at = ?", [ref, now], id, token)
}

export function markHeld (db, id, token, now, code) {
  return fenced(db, "UPDATE forms_jobs SET state = 'held', last_error = ?, lease_token = NULL, lease_until = NULL, updated_at = ?", [code, now], id, token)
}

export function markRetry (db, id, token, now, code, attempts) {
  if (attempts >= MAX_ATTEMPTS) {
    return fenced(db, "UPDATE forms_jobs SET state = 'failed', last_error = ?, lease_token = NULL, lease_until = NULL, sending_at = NULL, updated_at = ?", [code, now], id, token)
  }
  const next = now + BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)]
  return fenced(db, "UPDATE forms_jobs SET state = 'pending', next_attempt_at = ?, last_error = ?, lease_token = NULL, lease_until = NULL, sending_at = NULL, updated_at = ?", [next, code, now], id, token)
}

// Not enough time left in this invocation to send safely: back to the queue
// for the next drain, without spending an attempt.
export function markDeferred (db, id, token, now) {
  return fenced(db, "UPDATE forms_jobs SET state = 'pending', next_attempt_at = ?, attempts = MAX(attempts - 1, 0), last_error = 'deferred', lease_token = NULL, lease_until = NULL, updated_at = ?", [now, now], id, token)
}

export function markFailed (db, id, token, now, code) {
  return fenced(db, "UPDATE forms_jobs SET state = 'failed', last_error = ?, lease_token = NULL, lease_until = NULL, updated_at = ?", [code, now], id, token)
}

export async function markFilesPurged (db, id, now) {
  await db.prepare('UPDATE forms_submissions SET files_purged_at = ? WHERE id = ? AND files_purged_at IS NULL').bind(now, id).run()
}

export async function pruneRate (db, now) {
  await db.prepare('DELETE FROM forms_rate WHERE window_start < ?').bind(now - 86400000).run()
}

// Human decision from the admin API: a held or failed job is sent again
// (pending, fresh attempt budget) or closed. Leased and sent jobs never reopen,
// and neither do discarded ones (their files may already be gone).
export async function resolveHeld (db, id, action, now) {
  const result = action === 'release'
    ? await db.prepare("UPDATE forms_jobs SET state = 'pending', attempts = 0, next_attempt_at = ?, sending_at = NULL, last_error = 'released', updated_at = ? WHERE id = ? AND state IN ('held', 'failed') AND IFNULL(last_error, '') <> 'discarded'").bind(now, now, id).run()
    : await db.prepare("UPDATE forms_jobs SET state = 'failed', last_error = 'discarded', updated_at = ? WHERE id = ? AND state IN ('held', 'failed')").bind(now, id).run()
  return result.meta.changes === 1
}

// Drive: IDs are reserved before any upload so every retry targets one file.
export async function driveFiles (db, submissionId) {
  const rows = (await db.prepare('SELECT idx, drive_id, folder_id, link, verified_at FROM forms_drive_files WHERE submission_id = ?').bind(submissionId).all()).results
  return new Map(rows.map(row => [row.idx, row]))
}

export async function reserveDriveFiles (db, submissionId, entries) {
  await db.batch(entries.map(([idx, driveId]) => db.prepare(
    'INSERT INTO forms_drive_files (submission_id, idx, drive_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING'
  ).bind(submissionId, idx, driveId)))
}

export async function markDriveFile (db, submissionId, idx, { folderId, link, verifiedAt = null }) {
  await db.prepare('UPDATE forms_drive_files SET folder_id = ?, link = ?, verified_at = ? WHERE submission_id = ? AND idx = ?')
    .bind(folderId, link, verifiedAt, submissionId, idx).run()
}

export async function cachedFolder (db, account, path) {
  return (await db.prepare('SELECT folder_id FROM forms_drive_folders WHERE account = ? AND path = ?').bind(account, path).first())?.folder_id || null
}

export async function cacheFolder (db, account, path, folderId) {
  await db.prepare('INSERT INTO forms_drive_folders (account, path, folder_id) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET folder_id = excluded.folder_id')
    .bind(account, path, folderId).run()
}

export async function forgetFolders (db, account) {
  await db.prepare('DELETE FROM forms_drive_folders WHERE account = ?').bind(account).run()
}
