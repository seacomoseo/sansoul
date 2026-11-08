/* global FixedLengthStream */
import { cacheFolder, cachedFolder, driveFiles, forgetFolders, markDriveFile, reserveDriveFiles } from '../store.js'
import { DeliveryError } from './errors.js'

const API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const FOLDER = 'application/vnd.google-apps.folder'
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const DRIVE_BASE = 'Forms'
const META = 'id,size,sha256Checksum,parents,trashed,webViewLink'

// Same name rule as the GAS bridge, so both backends file uploads alike.
export function driveFileName (submissionId, file) {
  const field = String(file.field || 'file').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40)
  return `${submissionId}-${field}-${file.index + 1}-${file.sha256.slice(0, 16)}-${String(file.name).replace(/[\\/]/g, '-').slice(-120)}`
}

const quote = value => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

// Google answers: network errors and 5xx/429 are safe to retry because every
// write targets a reserved ID; quota and permission problems wait for a human.
async function call (fetch, url, init, code) {
  let response
  try {
    response = await fetch(url, { redirect: 'manual', ...init })
  } catch {
    throw new DeliveryError(`${code}_unreachable`, 'retry')
  }
  if (response.ok) return response.status === 204 ? {} : response.json()
  const data = await response.json().catch(() => ({}))
  const reason = data?.error?.errors?.[0]?.reason || data?.error?.status || ''
  if (response.status === 409) return { conflict: true }
  if (response.status === 404) return { missing: true }
  if (response.status === 401) throw Object.assign(new DeliveryError('drive_unauthorized', 'retry'), { unauthorized: true })
  if (response.status === 429 || response.status >= 500 || /rateLimitExceeded|userRateLimitExceeded|backendError/.test(reason)) {
    throw new DeliveryError(`${code}_retry_${response.status}`, 'retry')
  }
  if (/storageQuotaExceeded|quotaExceeded/.test(reason)) throw new DeliveryError('drive_storage_full', 'fatal')
  throw new DeliveryError(`${code}_rejected_${response.status}`, 'fatal')
}

export function createDrive ({ fetch }) {
  // Finds or creates one folder level. drive.file only lists folders this
  // OAuth client created, so every project Worker with the same credential
  // shares the same Forms tree; IDs are cached per account in D1.
  async function folder ({ db, token, account, parent, name, path, signal }) {
    const cached = await cachedFolder(db, account, path)
    if (cached) return cached
    const headers = { authorization: `Bearer ${token}` }
    const q = `name = ${quote(name)} and ${quote(parent)} in parents and mimeType = ${quote(FOLDER)} and trashed = false`
    const found = await call(fetch, `${API}?${new URLSearchParams({ q, fields: 'files(id)', orderBy: 'createdTime', pageSize: '1', spaces: 'drive' })}`, { headers, signal }, 'drive_folder')
    let id = found.files?.[0]?.id
    if (!id) {
      const created = await call(fetch, `${API}?fields=id`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }),
        signal
      }, 'drive_folder')
      if (!created.id) throw new DeliveryError('drive_folder_failed', 'retry')
      id = created.id
    }
    await cacheFolder(db, account, path, id)
    return id
  }

  async function destination ({ db, token, authority, signal }) {
    const { root, project, label } = authority.files
    const account = authority.account
    let parent = root || await folder({ db, token, account, parent: 'root', name: DRIVE_BASE, path: DRIVE_BASE, signal })
    const base = root ? `id:${root}` : DRIVE_BASE
    parent = await folder({ db, token, account, parent, name: project, path: `${base}/${project}`, signal })
    return folder({ db, token, account, parent, name: label, path: `${base}/${project}/${label}`, signal })
  }

  function verified (meta, file, folderId) {
    if (!meta || meta.trashed) return false
    if (Number(meta.size) !== file.size || !(meta.parents || []).includes(folderId)) return false
    // Absent while Drive still processes the upload: check again later.
    if (!meta.sha256Checksum) throw new DeliveryError('drive_checksum_pending', 'retry')
    if (meta.sha256Checksum.toLowerCase() !== file.sha256) throw new DeliveryError('drive_checksum_mismatch', 'fatal')
    return true
  }

  // Uploads every attachment of the submission and returns Map(idx → link).
  // Re-entrant: verified files are skipped and unfinished ones reuse their ID.
  async function store ({ db, kv, token, authority, submission, signal, now = Date.now }) {
    const files = submission.files
    let state = await driveFiles(db, submission.id)
    const headers = { authorization: `Bearer ${token}` }
    const missing = files.filter(file => !state.has(file.index))
    if (missing.length) {
      const generated = await call(fetch, `${API}/generateIds?${new URLSearchParams({ count: String(missing.length), space: 'drive', type: 'files' })}`, { headers, signal }, 'drive_ids')
      if (!Array.isArray(generated.ids) || generated.ids.length < missing.length) throw new DeliveryError('drive_ids_failed', 'retry')
      await reserveDriveFiles(db, submission.id, missing.map((file, position) => [file.index, generated.ids[position]]))
      state = await driveFiles(db, submission.id)
    }
    const links = new Map()
    let folderId = null
    for (const file of files) {
      const row = state.get(file.index)
      if (row.verified_at) {
        links.set(file.index, row.link)
        continue
      }
      folderId ||= await destination({ db, token, authority, signal })
      const current = await call(fetch, `${API}/${row.drive_id}?fields=${META}`, { headers, signal }, 'drive_get')
      let meta = current.missing ? null : current
      if (!meta) {
        const created = await call(fetch, `${API}?fields=id`, {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({ id: row.drive_id, name: driveFileName(submission.id, file), mimeType: file.type, parents: [folderId] }),
          signal
        }, 'drive_create')
        // An ID reserved for us that Drive says is taken: never write elsewhere.
        if (created.conflict) throw new DeliveryError('drive_id_conflict', 'fatal')
        // The parent vanished (folder deleted by hand): resolve the tree again.
        if (created.missing) {
          await forgetFolders(db, authority.account)
          throw new DeliveryError('drive_folder_missing', 'retry')
        }
      }
      if (!meta || !verified(meta, file, folderId)) {
        const stream = await kv?.get(file.key, 'stream')
        if (!stream) throw new DeliveryError('files_missing', 'fatal')
        // FixedLengthStream gives Drive a Content-Length without buffering.
        const body = typeof FixedLengthStream === 'function' ? stream.pipeThrough(new FixedLengthStream(file.size)) : stream
        meta = await call(fetch, `${UPLOAD}/${row.drive_id}?uploadType=media&fields=${META}`, {
          method: 'PATCH',
          headers: { ...headers, 'content-type': file.type, 'content-length': String(file.size) },
          body,
          ...(typeof FixedLengthStream === 'function' ? {} : { duplex: 'half' }),
          signal
        }, 'drive_upload')
        if (meta.missing) throw new DeliveryError('drive_upload_missing', 'retry')
        if (!verified(meta, file, folderId)) throw new DeliveryError('drive_verify_failed', 'retry')
      }
      const link = meta.webViewLink || `https://drive.google.com/file/d/${row.drive_id}/view`
      await markDriveFile(db, submission.id, file.index, { folderId, link, verifiedAt: now() })
      links.set(file.index, link)
    }
    return links
  }

  return { store }
}
