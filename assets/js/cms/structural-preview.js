import { createGroupCodec } from './format-codec.js'

export function readStructuralPreviewConfig (document, origin) {
  const meta = document.querySelector?.('meta[name="sansoul-structural-preview"]')
  if (!meta) return null
  try {
    const config = JSON.parse(meta.content)
    const endpoint = new URL(config.endpoint, origin)
    if (endpoint.origin !== origin || endpoint.username || endpoint.password || endpoint.hash || typeof config.token !== 'string' || !config.token) return null
    return { endpoint: endpoint.href, token: config.token }
  } catch { return null }
}

// New entries have no public path until a CMS save. Use an isolated, stable
// filename per editor and locale; Hugo still resolves the draft's own slug/tpl.
export function resolveStructuralTarget ({ path, collection, config, lang, id }) {
  if (path) return path
  const folder = config?.collections?.find(item => item.name === collection)?.folder
  if (!/^content\/[a-zA-Z0-9_-]+$/.test(folder || '') || !/^[a-zA-Z][a-zA-Z0-9-]*$/.test(lang || '') || !/^[a-f0-9-]{36}$/i.test(id || '')) throw new Error('La colección nueva necesita una carpeta content/<tipo> y un idioma válidos para la preview local.')
  return `${folder}/cms-preview-${id}.${lang}.md`
}

export function serializeStructuralDraft (data, { target, collection, groups }) {
  if (!/^content\/(?!.*(?:^|\/)\.\.?\/)[^\\\0]+\.md$/i.test(target || '') || target.includes('//') || target.split('/').some(part => part === '.' || part === '..')) throw new Error('La entrada necesita una ruta Markdown estable en content/ para compilar el borrador local.')
  const plain = groups?.flatten(data, collection, target) || data
  const inspect = value => {
    if (typeof value === 'string') {
      if (/blob:/i.test(value)) throw new Error('Guarda primero los archivos nuevos: Hugo no puede leer archivos temporales del navegador.')
    } else if (value && typeof value === 'object') Object.values(value).forEach(inspect)
  }
  inspect(plain)
  const definition = groups?.config?.collections?.find(item => item.name === collection)
  return createGroupCodec({ format: 'frontmatter', bodyField: definition?.body_field || groups?.config?.body_field, output: groups?.config?.output?.yaml, delimiters: definition?.frontmatter_delimiter || groups?.config?.frontmatter_delimiter }).toFile(plain)
}

// One controller belongs to one mounted editor. Abort and sequence checks are
// both necessary: a completed server compilation can outlive fetch cancellation.
export function createStructuralPreviewClient ({ config, origin, fetcher = fetch, delay = 350, timers = globalThis, onStatus = () => {}, onResult = () => {} }) {
  let sequence = 0
  let timer
  let controller
  let disposed = false
  return {
    update (draft) {
      if (disposed) return
      const requestId = ++sequence
      timers.clearTimeout(timer)
      controller?.abort()
      onStatus('pending')
      timer = timers.setTimeout(async () => {
        controller = new AbortController()
        onStatus('compiling')
        try {
          const response = await fetcher(config.endpoint, { method: 'POST', credentials: 'same-origin', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, requestId }), signal: controller.signal })
          if (disposed || sequence !== requestId) return
          if (response.status === 409) { onStatus('stale'); return }
          const result = await response.json()
          if (!response.ok) throw new Error(result.error || 'No se ha podido compilar el borrador.')
          const url = new URL(result.url, origin)
          if (url.origin !== origin || url.username || url.password || !Number.isSafeInteger(result.generation)) throw new Error('El servicio devolvió una vista previa no válida.')
          onResult({ ...result, url: url.href })
          onStatus('compiled')
        } catch (error) {
          if (!disposed && sequence === requestId && error.name !== 'AbortError') onStatus('error', error.message)
        }
      }, delay)
    },
    cancel () { ++sequence; timers.clearTimeout(timer); controller?.abort() },
    dispose () { disposed = true; ++sequence; timers.clearTimeout(timer); controller?.abort() }
  }
}
