import { looksLikeEmail, spamReasons } from './antispam.js'
import { FormsError, sha256Hex } from './http.js'
import { findSpec, formKey } from './manifest.js'

export const LIMITS = Object.freeze({
  bodyBytes: 12 * 1024 * 1024,
  fields: 120,
  nameBytes: 200,
  valueChars: 20000,
  textBytes: 96 * 1024,
  fileBytes: 8 * 1024 * 1024,
  filesBytes: 10 * 1024 * 1024,
  fileNameChars: 200
})
export const RESERVED = Object.freeze(['_form', '_page', '_submission_id', '_gotcha'])
const SUBMISSION_ID = /^[A-Za-z0-9-]{16,64}$/
const FORM_TYPES = /^(multipart\/form-data|application\/x-www-form-urlencoded)(\s*;|$)/i

function acceptsFile (accept, file) {
  if (!accept) return true
  const name = file.name.toLowerCase()
  const type = (file.type || '').toLowerCase()
  return accept.toLowerCase().split(',').map(item => item.trim()).filter(Boolean).some(rule => {
    if (rule.startsWith('.')) return name.endsWith(rule)
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1))
    return type === rule
  })
}

// Read the browser body once: ordered entries, repeated and empty values and
// binary files keep their exact shape (no Base64 or GAS normalization).
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

export async function parseSubmission (formData, manifest, limits = LIMITS) {
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
  const encoder = new TextEncoder()

  for (const [name, value] of formData.entries()) {
    if (RESERVED.includes(name)) continue
    if (fields.length + files.length >= limits.fields) throw new FormsError('too_many_fields', 413)
    if (encoder.encode(name).length > limits.nameBytes) throw new FormsError('field_name_too_large', 413)
    const field = specFields.get(name)
    if (!field && !reasons.includes('unknown_field')) reasons.push('unknown_field')
    if (typeof value === 'string') {
      if (field?.type === 'file') {
        if (value === '') continue
        throw new FormsError('file_expected')
      }
      if (value.length > limits.valueChars) throw new FormsError('field_too_large', 413)
      textBytes += encoder.encode(name).length + encoder.encode(value).length
      if (textBytes > limits.textBytes) throw new FormsError('fields_too_large', 413)
      fields.push([name, value])
      continue
    }
    if (field?.type !== 'file') throw new FormsError('file_not_allowed')
    // Browsers send an empty part for a file input without selection.
    if (value.size === 0 && !value.name) continue
    if (value.size > limits.fileBytes) throw new FormsError('file_too_large', 413)
    filesBytes += value.size
    if (filesBytes > limits.filesBytes) throw new FormsError('files_too_large', 413)
    if (files.filter(file => file.field === name).length >= (field.max || 1)) throw new FormsError('too_many_files')
    if (!acceptsFile(field.accept, value)) throw new FormsError('file_type_not_allowed', 415)
    const bytes = new Uint8Array(await value.arrayBuffer())
    files.push({
      field: name,
      name: String(value.name || 'file').replace(/[\r\n\\/]/g, '_').slice(0, limits.fileNameChars),
      type: /^[\w.+-]+\/[\w.+-]+$/.test(value.type) ? value.type : 'application/octet-stream',
      size: bytes.byteLength,
      sha256: await sha256Hex(bytes),
      bytes
    })
  }

  const emailField = spec.fields.find(field => field.type === 'email')
  const email = emailField ? (fields.find(([name]) => name === emailField.name)?.[1] || '') : ''
  reasons.push(...spamReasons({ honeypot: single('_gotcha'), values: fields.map(([, value]) => value), email }))
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
    email: looksLikeEmail(email) ? email : '',
    status: reasons.length ? 'review' : 'accepted'
  }
}
