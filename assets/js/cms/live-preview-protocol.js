export const PREVIEW_CHANNEL = 'sansoul-live-preview-v2'
export const PREVIEW_TOKEN_PARAM = 'sansoul-preview-token'

export function isPreviewUpdate (event, receiver, token) {
  return event.origin === receiver.location.origin && event.source === receiver.parent.parent &&
    event.data?.channel === PREVIEW_CHANNEL && event.data.type === 'update' && event.data.token === token
}

export function safeImageURL (value, origin) {
  if (typeof value !== 'string' || value.length > 4096 || !value.trim()) return ''
  try {
    const url = new URL(value, origin)
    if (url.protocol === 'blob:' && url.origin === origin) return url.href
    if (['http:', 'https:'].includes(url.protocol)) return url.href
  } catch {}
  return ''
}

// Drafts remain data: no HTML is transferred or assigned to HTML parsing sinks.
// Bound both recursive shape and aggregate size before sending or accepting it.
export function boundedPreviewValue (value) {
  let count = 0
  let characters = 0
  const visit = (item, depth) => {
    if (++count > 20000 || depth > 24) throw new Error('Preview draft is too complex.')
    if (item === null || typeof item === 'boolean') return item
    if (typeof item === 'number' && Number.isFinite(item)) return item
    if (typeof item === 'string') {
      characters += item.length
      if (item.length > 100000 || characters > 1000000) throw new Error('Preview draft is too large.')
      return item
    }
    if (Array.isArray(item) && item.length <= 500) return item.map(child => visit(child, depth + 1))
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const entries = Object.entries(item)
      if (entries.length > 500) throw new Error('Preview object is too large.')
      const result = Object.create(null)
      for (const [key, child] of entries) {
        if (['__proto__', 'constructor', 'prototype'].includes(key) || key.length > 200) throw new Error('Invalid preview key.')
        if (child !== undefined) result[key] = visit(child, depth + 1)
      }
      return result
    }
    throw new Error('Invalid preview value.')
  }
  return visit(value, 0)
}

export function createPreviewData (data, getAsset, origin) {
  const draft = boundedPreviewValue(data)
  const assets = Object.create(null)
  const asset = value => {
    if (!getAsset || !/^(?:\/|https?:|blob:)/i.test(value)) return
    try {
      const url = safeImageURL(getAsset(value)?.url, origin)
      if (url && Object.keys(assets).length < 500) assets[value] = url
    } catch {}
  }
  const visit = value => {
    if (typeof value === 'string') {
      asset(value)
      for (const match of value.matchAll(/!\[[^\]]*\]\(([^\s)]+)/g)) asset(match[1])
    } else if (value && typeof value === 'object') Object.values(value).forEach(visit)
  }
  visit(draft)
  return { draft, assets }
}

export function validPreviewData (data, origin) {
  try {
    if (!data || !data.draft || Array.isArray(data.draft) || typeof data.draft !== 'object' || !data.assets || Array.isArray(data.assets) || typeof data.assets !== 'object') return false
    boundedPreviewValue(data)
    return Object.values(data.assets).every(url => typeof url === 'string' && safeImageURL(url, origin) === url)
  } catch { return false }
}

export function resolvePreviewTarget (index, entryPath, type, lang) {
  const existing = index.entries?.[entryPath]
  if (existing) return { ...existing, prototype: false }
  const url = index.prototypes?.[`${type}:${lang}`] || index.prototypes?.[`${type}:${index.defaultLang}`]
  return url ? { url, type, lang, prototype: true } : null
}

export function previewFieldPath (value) {
  return typeof value === 'string' && value.length <= 1000 && /^[a-zA-Z_][\w-]*(?:\.(?:[\w-]+))*$/.test(value) && !value.split('.').some(key => ['__proto__', 'constructor', 'prototype'].includes(key)) ? value : ''
}
