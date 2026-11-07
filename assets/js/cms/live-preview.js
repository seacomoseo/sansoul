import { livePreview } from '@params'
import { readStructuralPreviewConfig, resolveStructuralTarget, serializeStructuralDraft, createStructuralPreviewClient } from './structural-preview'
import { createIconPreviewElement } from './custom-fields'
import { PREVIEW_CHANNEL, PREVIEW_TOKEN_PARAM, createPreviewData, resolvePreviewTarget, previewFieldPath } from './live-preview-protocol'

let registered = false

// Use Sveltia's documented data-key-path click delegation in its native preview
// document. Its own editor resolves nested paths, expands groups and highlights.
const focusRequests = new WeakMap()

export async function focusPreviewField (document, path) {
  if (!previewFieldPath(path)) return false
  const request = {}
  focusRequests.set(document, request)
  // Sveltia mounts deep lists lazily; a newly mounted minimized list can reset
  // an ancestor just opened by its highlighter. Reapply the documented leaf
  // path after mounting, with bounded retries and cancellation on a new click.
  for (let attempt = 0; attempt < 8; attempt++) {
    if (focusRequests.get(document) !== request) return false
    const proxy = document.createElement('button')
    proxy.type = 'button'
    proxy.dataset.keyPath = path
    proxy.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none'
    document.body.append(proxy)
    proxy.click()
    proxy.remove()
    await new Promise(resolve => document.defaultView.setTimeout(resolve, 200))
    const editor = document.defaultView.parent.document
    if (editor.activeElement?.closest('[data-key-path]')?.getAttribute('data-key-path') === path) return true
    // Offscreen fields inside a list have anonymous lazy placeholders. Bring
    // the nearest mounted field/group into view before invoking the official
    // highlighter again; it cannot locate the unmounted leaf on its own.
    const parts = path.split('.')
    for (let index = parts.length - 1; index > 0; index--) {
      const prefix = parts.slice(0, index).join('.')
      let ancestor = editor.querySelector?.(`[data-key-path="${prefix}"]`)
      if (!ancestor) {
        const child = editor.querySelector?.(`[data-key-path^="${prefix}."]`)
        ancestor = child?.parentElement?.closest('[role="group"]')
      }
      if (ancestor?.getClientRects().length) {
        ancestor.scrollIntoView({ block: 'start' })
        await new Promise(resolve => document.defaultView.setTimeout(resolve, 200))
        break
      }
    }
  }
  return false
}

export function initLivePreview (groups = null) {
  if (!livePreview || registered) return
  const diagnostic = window.document.documentElement.dataset
  diagnostic.sansoulLivePreviewStatus = 'initializing'
  const CMS = window.CMS
  const React = CMS?.React
  if (!React?.useEffect || !React?.createElement || typeof CMS?.registerPreviewTemplate !== 'function') {
    diagnostic.sansoulLivePreviewStatus = 'unsupported'
    console.warn('SanSoul live preview requires Sveltia CMS custom preview templates and CMS.React.')
    return
  }
  const structural = readStructuralPreviewConfig(window.document, window.location.origin)
  let index
  try { index = JSON.parse(window.document.getElementById('sansoul-preview-index').textContent) } catch {
    if (!structural) return
    index = { entries: {}, prototypes: {} }
  }
  window.__sansoulPreviewSessions = new Map()
  window.__sansoulPreviewCreateIcon = value => {
    const node = createIconPreviewElement(value)
    if (/^[a-z][a-z\d_]*$/.test(value)) node.style.fontFamily = 'SanSoul Preview Icons'
    return node
  }
  const { createElement: h, useEffect, useRef, useState } = React

  function LivePage ({ entry, getAsset, window: previewWindow, document: previewDocument }) {
    diagnostic.sansoulLivePreviewStatus = 'rendering'
    const iframe = useRef(null)
    const token = useRef(window.crypto.randomUUID())
    const connected = useRef(false)
    const path = entry.get('path') || ''
    const type = entry.get('collection') || path.split('/')[1]
    const lang = path.match(/\.([a-z][\w-]*)\.md$/i)?.[1] || previewDocument?.documentElement.lang || index.defaultLang
    const target = resolvePreviewTarget(index, path, type, lang)
    let payload
    try {
      const data = entry.get('data')?.toJS?.() || {}
      payload = createPreviewData(groups?.flatten(data, type, path) || data, getAsset, window.location.origin)
    } catch {}
    const latest = useRef(payload)
    latest.current = payload
    const experimental = 'Vista previa experimental · cambios sin guardar · puede diferir del resultado publicado. La estructura y los condicionales requieren publicar y recompilar.'
    const [status, setStatus] = useState('Cargando la página de Hugo…')
    const send = () => {
      if (latest.current) iframe.current?.contentWindow?.postMessage({ channel: PREVIEW_CHANNEL, type: 'update', token: token.current, data: latest.current }, window.location.origin)
    }
    useEffect(() => {
      window.__sansoulPreviewSessions.set(token.current, iframe)
      const receive = event => {
        if (event.origin !== window.location.origin || event.source !== iframe.current?.contentWindow || event.data?.channel !== PREVIEW_CHANNEL || event.data?.token !== token.current) return
        if (event.data.type === 'ready') { connected.current = true; send() }
        if (event.data.type === 'applied') { diagnostic.sansoulLivePreviewStatus = 'applied'; setStatus(experimental) }
        if (event.data.type === 'focus') focusPreviewField(previewDocument || previewWindow.document, groups?.fieldPath(event.data.path, type, path) || event.data.path).catch(error => console.warn('SanSoul could not focus this preview field.', error))
        if (event.data.type === 'error') setStatus('No se ha aplicado el borrador. El contenido supera los límites de la vista previa o la página no incluye un manifiesto compatible.')
      }
      previewWindow.addEventListener('message', receive)
      const timeout = previewWindow.setTimeout(() => {
        if (!connected.current) setStatus('No se ha conectado la vista previa. Comprueba que el CMS y la página publicada pertenecen a esta misma versión y origen.')
      }, 8000)
      return () => {
        window.__sansoulPreviewSessions.delete(token.current)
        previewWindow.clearTimeout(timeout)
        previewWindow.removeEventListener('message', receive)
      }
    }, [previewWindow, path])
    useEffect(send)
    if (!target) return h('p', { role: 'status' }, 'Vista previa experimental: esta colección todavía no tiene una página publicada que pueda usarse como modelo. Guarda y publica la primera entrada para obtenerla.')
    const url = new URL(target.url, window.location.origin)
    if (url.origin !== window.location.origin) return h('p', null, 'La vista previa requiere una página del mismo origen que el CMS.')
    url.searchParams.set(PREVIEW_TOKEN_PARAM, token.current)
    return h('div', { style: { height: '100vh', display: 'flex', flexDirection: 'column' } },
      h('p', { role: 'status', style: { font: '12px system-ui', padding: '8px', margin: 0 } }, `${status}${target.prototype ? ' · Entrada nueva: se usa la estructura de otra página de esta colección.' : ''}${!payload ? ' · Borrador demasiado grande para previsualizar.' : ''}`),
      h('iframe', {
        ref: iframe,
        title: 'Vista previa experimental de Hugo',
        src: url.href,
        sandbox: 'allow-same-origin allow-scripts',
        style: { width: '100%', flex: 1, border: 0, minHeight: '600px' },
        onLoad: send
      }))
  }

  function StructuralPage ({ entry, getAsset, window: previewWindow, document: previewDocument }) {
    const iframe = useRef(null)
    const token = useRef(window.crypto.randomUUID())
    const client = useRef(null)
    const compiledGeneration = useRef(null)
    const draftID = useRef(window.crypto.randomUUID())
    const [url, setURL] = useState(null)
    const [status, setStatus] = useState('Preparando el borrador local…')
    const storedPath = entry.get('path') || ''
    const collection = entry.get('collection') || storedPath.split('/')[1]
    let path = storedPath
    const draft = useRef(null)
    let markdown
    let invalid
    try {
      path = resolveStructuralTarget({ path: storedPath, collection, config: groups?.config, lang: previewDocument?.documentElement.lang || index.defaultLang, id: draftID.current })
      const data = entry.get('data')?.toJS?.() || {}
      draft.current = groups?.flatten(data, collection, path) || data
      markdown = serializeStructuralDraft(data, { target: path, collection, groups, getAsset, origin: window.location.origin })
    } catch (error) { invalid = error.message }
    useEffect(() => {
      window.__sansoulPreviewSessions.set(token.current, iframe)
      const labels = { pending: 'Cambios pendientes · la vista anterior está desactualizada.', compiling: 'Compilando con Hugo · la vista anterior está desactualizada.', compiled: 'Hugo ha compilado el borrador · esperando la página del iframe.', stale: 'Compilación sustituida · esperando el borrador más reciente.' }
      client.current = createStructuralPreviewClient({ config: structural, origin: window.location.origin, onStatus: (state, message) => {
        if (state === 'pending') compiledGeneration.current = null
        diagnostic.sansoulLivePreviewStatus = `structural-${state}`
        setStatus(state === 'error' ? `No se ha actualizado la vista previa: ${message} La vista anterior está desactualizada.` : labels[state])
      }, onResult: result => {
        compiledGeneration.current = result.generation
        const next = new URL(result.url)
        next.searchParams.set(PREVIEW_TOKEN_PARAM, token.current)
        next.searchParams.set('sansoul-preview-generation', result.generation)
        setURL(next.href)
      } })
      const receive = event => {
        if (event.origin !== window.location.origin || event.source !== iframe.current?.contentWindow || event.data?.channel !== PREVIEW_CHANNEL || event.data?.token !== token.current) return
        if (event.data.generation !== compiledGeneration.current) return
        if (event.data.type === 'structural-active') setStatus('Borrador local compilado y visible · cambios sin guardar.')
        if (event.data.type === 'ready') iframe.current?.contentWindow?.postMessage({ channel: PREVIEW_CHANNEL, type: 'activate-structural', token: token.current, draft: draft.current }, window.location.origin)
        // Hugo owns the complete draft in local mode. Never apply the hosted
        // lightweight payload, which cannot re-evaluate get/remap/if semantics.
        if (event.data.type === 'focus') focusPreviewField(previewDocument || previewWindow.document, groups?.fieldPath(event.data.path, collection, path) || event.data.path).catch(error => console.warn('SanSoul could not focus this preview field.', error))
      }
      previewWindow.addEventListener('message', receive)
      return () => { window.__sansoulPreviewSessions.delete(token.current); client.current?.dispose(); previewWindow.removeEventListener('message', receive) }
    }, [previewWindow, path])
    useEffect(() => {
      if (invalid) { client.current?.cancel(); setStatus(`${invalid} La vista anterior no representa este borrador.`); return }
      client.current?.update({ target: path, markdown })
    }, [path, markdown, invalid])
    return h('div', { style: { height: '100vh', display: 'flex', flexDirection: 'column' } },
      h('p', { role: 'status', style: { font: '12px system-ui', padding: '8px', margin: 0 } }, status),
      url && h('iframe', { ref: iframe, title: 'Vista previa estructural local de Hugo', src: url, sandbox: 'allow-same-origin allow-scripts', style: { width: '100%', flex: 1, border: 0, minHeight: '600px' } }))
  }
  const collections = new Set(Object.values(index.entries).map(item => item.type).concat(Object.keys(index.prototypes).map(key => key.split(':')[0])))
  if (structural) for (const collection of groups?.config?.collections || []) {
    if (collection.folder?.startsWith('content/') && (!collection.extension || collection.extension === 'md')) collections.add(collection.name)
  }
  for (const collection of collections) CMS.registerPreviewTemplate(collection, structural ? StructuralPage : LivePage)
  registered = true
  diagnostic.sansoulLivePreviewStatus = 'registered'
}
