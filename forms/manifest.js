// The manifest is generated from the rendered Hugo forms (scripts/build-manifest.js)
// and bundled with the project Worker. It is the only source of delivery policy:
// visitor input selects a form, never its recipients, texts or account.
export const MANIFEST_VERSION = 1
export const FIELD_TYPES = Object.freeze(['text', 'email', 'tel', 'number', 'date', 'time', 'range', 'area', 'select', 'radio', 'checkbox', 'file', 'geo', 'hidden'])
const EMAIL = /^[^\s@<>,;"]{1,64}@[^\s@<>,;"]{1,190}\.[^\s@<>,;"]{2,63}$/

export function formKey (page, id) {
  return `${page}#${id}`
}

function validSpec (spec) {
  if (!spec || typeof spec !== 'object') return false
  if (typeof spec.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(spec.id)) return false
  if (typeof spec.lang !== 'string' || typeof spec.subject !== 'string' || /[\r\n]/.test(spec.subject)) return false
  if (!Array.isArray(spec.to) || !spec.to.length || !spec.to.every(address => EMAIL.test(address))) return false
  if (typeof spec.account !== 'string') return false
  if (spec.title !== undefined && (typeof spec.title !== 'string' || /[\r\n]/.test(spec.title))) return false
  if (spec.confirm !== null && (typeof spec.confirm !== 'object' || typeof spec.confirm.subject !== 'string' || /[\r\n]/.test(spec.confirm.subject))) return false
  if (!Array.isArray(spec.fields)) return false
  return spec.fields.every(field => field && typeof field.name === 'string' && field.name && FIELD_TYPES.includes(field.type))
}

export function validateManifest (manifest) {
  if (!manifest || manifest.version !== MANIFEST_VERSION || typeof manifest.forms !== 'object' || typeof manifest.specs !== 'object') {
    throw new Error('forms_manifest_invalid')
  }
  // Drive folder name (Forms/<project>/<form>): plain label, never a path.
  if (manifest.project !== undefined && (typeof manifest.project !== 'string' || /[/\\\r\n]/.test(manifest.project) || manifest.project.length > 120)) {
    throw new Error('forms_manifest_invalid_project')
  }
  // GitHub repository of the CMS: the panel admits people with push access.
  if (manifest.repo !== undefined && manifest.repo !== '' && (typeof manifest.repo !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(manifest.repo))) {
    throw new Error('forms_manifest_invalid_repo')
  }
  // Public site origins (baseURL) accepted besides the Worker's own origin.
  if (manifest.origins !== undefined && (!Array.isArray(manifest.origins) || !manifest.origins.every(origin => typeof origin === 'string' && /^https?:\/\/[^/\s]+$/.test(origin)))) {
    throw new Error('forms_manifest_invalid_origins')
  }
  for (const [key, ref] of Object.entries(manifest.forms)) {
    if (!validSpec(manifest.specs[ref])) throw new Error(`forms_manifest_invalid_spec:${key}`)
  }
  return manifest
}

export function findSpec (manifest, page, id) {
  if (typeof page !== 'string' || typeof id !== 'string') return null
  const ref = Object.hasOwn(manifest.forms, formKey(page, id)) ? manifest.forms[formKey(page, id)] : null
  return ref && Object.hasOwn(manifest.specs, ref) ? manifest.specs[ref] : null
}
