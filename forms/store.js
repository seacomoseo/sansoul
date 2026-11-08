import { FormsError } from './http.js'

export const LEASE_MS = 90000
export const MAX_ATTEMPTS = 6
const BACKOFF_MS = [60000, 300000, 1800000, 7200000, 21600000]

export function requireDatabase (env) {
  const db = env?.FORMS_DB
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') throw new FormsError('forms_unavailable', 503)
  return db
}

// The digest keeps a conflicting retry of the same ID from overwriting the files
// of the submission that was actually committed.
export const fileKey = (submissionId, digest, index) => `forms/${submissionId}/${digest.slice(0, 16)}/${index}`

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
export async function insertSubmission (db, { parsed, files, jobs, now }) {
  const statements = [
    db.prepare(
      `INSERT INTO forms_submissions (id, form_key, page, digest, status, reasons, fields, files, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(parsed.submissionId, parsed.key, parsed.page, parsed.digest, parsed.status, JSON.stringify(parsed.reasons), JSON.stringify(parsed.fields), JSON.stringify(files), now),
    ...jobs.map(job => db.prepare(
      `INSERT INTO forms_jobs (id, submission_id, channel, state, authority, next_attempt_at, last_error, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(`${parsed.submissionId}:${job.channel}`, parsed.submissionId, job.channel, job.state, JSON.stringify(job.authority), now, job.reason || null, now))
  ]
  await db.batch(statements)
}

export async function loadSubmission (db, id) {
  const row = await db.prepare('SELECT id, page, status, fields, files, files_purged_at FROM forms_submissions WHERE id = ?').bind(id).first()
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
// (pending, fresh attempt budget) or closed. Leased and sent jobs never reopen.
export async function resolveHeld (db, id, action, now) {
  const result = action === 'release'
    ? await db.prepare("UPDATE forms_jobs SET state = 'pending', attempts = 0, next_attempt_at = ?, sending_at = NULL, last_error = 'released', updated_at = ? WHERE id = ? AND state IN ('held', 'failed')").bind(now, now, id).run()
    : await db.prepare("UPDATE forms_jobs SET state = 'failed', last_error = 'discarded', updated_at = ? WHERE id = ? AND state IN ('held', 'failed')").bind(now, id).run()
  return result.meta.changes === 1
}
