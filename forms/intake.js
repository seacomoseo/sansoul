import { spamReasons } from './antispam.js'
import { FormsError, sha256Hex } from './http.js'
import { findSpec, formKey } from './manifest.js'
import { validAddress } from './mime.js'

export const LIMITS = Object.freeze({
  // The submit body is text only: files arrive before it, one raw upload each.
  bodyBytes: 256 * 1024,
  fields: 120,
  nameBytes: 200,
  valueChars: 20000,
  textBytes: 96 * 1024,
  files: 10,
  // Inline attachments travel base64-encoded inside the owner email (~2-7 ms
  // CPU per MB in workerd): with Drive, totals above 1 MB go there. Without
  // Drive, 2 MB is the total per submission.
  inlineBytes: 1024 * 1024,
  noDriveBytes: 2 * 1024 * 1024,
  // With Drive the bytes stream KV → Drive without base64 or parsing. One KV
  // value holds up to 25 MiB.
  driveFileBytes: 20 * 1024 * 1024,
  driveFilesBytes: 25 * 1024 * 1024,
  fileNameChars: 200
})
export const RESERVED = Object.freeze(['_form', '_page', '_submission_id', '_gotcha'])
const SUBMISSION_ID = /^[A-Za-z0-9-]{16,64}$/
const FORM_TYPES = /^(multipart\/form-data|application\/x-www-form-urlencoded)(\s*;|$)/i
const UPLOAD_REF = /^(0|[1-9]\d?)$/
const SHA256 = /^[0-9a-f]{64}$/

// Drive is on unless FORMS_DRIVE = "false" (the browser limits in
// layouts/partials/blocks/form.html assume the Drive limits below).
export const driveEnabled = env => env?.FORMS_DRIVE !== 'false'
export const fileLimits = (env, limits = LIMITS) => driveEnabled(env)
  ? { file: limits.driveFileBytes, total: limits.driveFilesBytes }
  : { file: limits.noDriveBytes, total: limits.noDriveBytes }

export function acceptsFile (accept, file) {
  if (!accept) return true
  const name = file.name.toLowerCase()
  const type = (file.type || '').toLowerCase()
  return accept.toLowerCase().split(',').map(item => item.trim()).filter(Boolean).some(rule => {
    if (rule.startsWith('.')) return name.endsWith(rule)
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1))
    return type === rule
  })
}

// Read the browser body once: ordered entries and repeated and empty values
// keep their exact shape. Files are not parsed here: see parseUpload.
export async function readSubmission (request, limits = LIMITS) {
  if (!FORM_TYPES.test(request.headers.get('content-type') || '')) throw new FormsError('content_type_required', 415)
  const length = request.headers.get('content-length')
  if (!length || !/^\d+$/.test(length)) throw new FormsError('length_required', 411)
  if (Number(length) > limits.bodyBytes) throw new FormsError('payload_too_large', 413)
  try {
    return await request.formData()
  } catch {
    throw new FormsError('invalid_body')
  }
}

// One raw file per request: headers and query carry the metadata and the body
// is streamed to KV untouched. Parsing multipart or hashing in the Worker costs
// CPU per MB (8/113/170 ms measured in Workers for text/5/8 MiB multipart); a
// raw stream to KV stayed at 2-4 ms. The browser declares the SHA-256 and
// Drive verifies it after the upload.
export function parseUpload (request, manifest, env, limits = LIMITS) {
  const url = new URL(request.url)
  const param = name => url.searchParams.get(name) || ''
  const submissionId = param('submission')
  if (!SUBMISSION_ID.test(submissionId)) throw new FormsError('invalid_submission_id')
  const page = param('page')
  const id = param('form')
  const spec = findSpec(manifest, page, id)
  if (!spec) throw new FormsError('form_unknown', 404)
  const name = param('field')
  const field = spec.fields.find(item => item.name === name)
  if (field?.type !== 'file') throw new FormsError('file_not_allowed')
  const index = param('index')
  if (!UPLOAD_REF.test(index) || Number(index) >= limits.files) throw new FormsError('file_reference_invalid')
  const length = request.headers.get('content-length')
  if (!length || !/^\d+$/.test(length)) throw new FormsError('length_required', 411)
  const size = Number(length)
  if (size === 0) throw new FormsError('file_empty')
  if (size > fileLimits(env, limits).file) throw new FormsError('file_too_large', 413)
  const sha256 = (request.headers.get('x-file-sha256') || '').toLowerCase()
  if (!SHA256.test(sha256)) throw new FormsError('file_checksum_required')
  let fileName
  try {
    fileName = decodeURIComponent(request.headers.get('x-file-name') || '')
  } catch {
    throw new FormsError('file_name_invalid')
  }
  const rawType = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  const file = {
    name: (fileName || 'file').replace(/[\u0000-\u001f\u007f\\/]/g, '_').slice(0, limits.fileNameChars), // eslint-disable-line no-control-regex
    // Google-native types would make Drive create a folder or a Doc.
    type: /^[\w.+-]+\/[\w.+-]+$/.test(rawType) && !rawType.startsWith('application/vnd.google-apps.') ? rawType : 'application/octet-stream',
    size,
    sha256
  }
  if (!acceptsFile(field.accept, file)) throw new FormsError('file_type_not_allowed', 415)
  if (!request.body) throw new FormsError('file_empty')
  return { submissionId, key: formKey(page, id), field: name, index: Number(index), ...file }
}

// `uploads(submissionId)` returns the staged raw uploads of this submission;
// file fields reference them by index.
export async function parseSubmission (formData, manifest, { uploads = async () => [], env, limits = LIMITS } = {}) {
  const single = name => {
    const values = formData.getAll(name)
    if (values.length > 1 || values.some(value => typeof value !== 'string')) throw new FormsError('invalid_reserved_field')
    return values[0] ?? ''
  }
  const submissionId = single('_submission_id')
  if (!SUBMISSION_ID.test(submissionId)) throw new FormsError('invalid_submission_id')
  const page = single('_page')
  const id = single('_form')
  const spec = findSpec(manifest, page, id)
  if (!spec) throw new FormsError('form_unknown', 404)

  const specFields = new Map(spec.fields.map(field => [field.name, field]))
  const fields = []
  const files = []
  const reasons = []
  let textBytes = 0
  let filesBytes = 0
  let staged = null
  const limit = fileLimits(env, limits)
  const encoder = new TextEncoder()

  for (let [name, value] of formData.entries()) {
    if (RESERVED.includes(name)) continue
    if (fields.length + files.length >= limits.fields) throw new FormsError('too_many_fields', 413)
    if (encoder.encode(name).length > limits.nameBytes) throw new FormsError('field_name_too_large', 413)
    const field = specFields.get(name)
    if (!field && !reasons.includes('unknown_field')) reasons.push('unknown_field')
    if (typeof value !== 'string') throw new FormsError('upload_required')
    if (field?.type === 'file') {
      if (value === '') continue
      if (!UPLOAD_REF.test(value)) throw new FormsError('file_reference_invalid')
      staged ??= new Map((await uploads(submissionId)).map(row => [String(row.idx), row]))
      const upload = staged.get(value)
      if (!upload || upload.field !== name || upload.form_key !== formKey(page, id) || files.some(file => file.index === upload.idx)) throw new FormsError('file_missing')
      if (files.filter(file => file.field === name).length >= (field.max || 1)) throw new FormsError('too_many_files')
      if (files.length >= limits.files) throw new FormsError('too_many_files')
      filesBytes += upload.size
      if (upload.size > limit.file || filesBytes > limit.total) throw new FormsError('files_too_large', 413)
      if (!acceptsFile(field.accept, upload)) throw new FormsError('file_type_not_allowed', 415)
      files.push({ field: name, index: upload.idx, name: upload.name, type: upload.type, size: upload.size, sha256: upload.sha256, key: upload.kv_key })
      continue
    }
    if (value.length > limits.valueChars) throw new FormsError('field_too_large', 413)
    // Multipart sends CRLF and the urlencoded local retry LF: one digest.
    value = value.replace(/\r\n?/g, '\n')
    textBytes += encoder.encode(name).length + encoder.encode(value).length
    if (textBytes > limits.textBytes) throw new FormsError('fields_too_large', 413)
    fields.push([name, value])
  }

  const emailField = spec.fields.find(field => field.type === 'email')
  const email = emailField ? (fields.find(([name]) => name === emailField.name)?.[1] || '') : ''
  reasons.push(...spamReasons({ honeypot: single('_gotcha'), values: fields.map(([, value]) => value), email, validEmail: validAddress }))
  const key = formKey(page, id)
  const digest = await sha256Hex(JSON.stringify({
    key,
    fields,
    files: files.map(({ field, name, type, size, sha256 }) => [field, name, type, size, sha256])
  }))

  return {
    submissionId,
    key,
    page,
    spec,
    fields,
    files,
    reasons,
    digest,
    email: validAddress(email) ? email : '',
    status: reasons.length ? 'review' : 'accepted'
  }
}
