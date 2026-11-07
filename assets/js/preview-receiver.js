import { PREVIEW_CHANNEL, PREVIEW_TOKEN_PARAM, isPreviewUpdate, validPreviewData, safeImageURL, previewFieldPath } from './cms/live-preview-protocol'
import { renderPreviewMarkdown } from './cms/preview-markdown'
import { formatImage } from './cms/markdown-metadata'

const lookup = (data, path) => path.split('.').reduce((value, key) => value?.[key], data)
const nonempty = value => Boolean(value) && (!Array.isArray(value) || value.length > 0) && (typeof value !== 'object' || Object.keys(value).length > 0)

// Match get-params-merge: later get directives only replace an earlier value
// when their page/global lookup produces a nonempty value.
export function resolvePreviewBinding (binding, draft, globals = {}) {
  const resolve = source => {
    const path = previewFieldPath(source.path || source.template?.match(/\{\{(?:<|%)?\s*get\s+["']?([\w.-]+)/)?.[1])
    let value = source.template ?? source.value ?? (source.path ? lookup(draft, source.path) : '')
    if (source.global && !nonempty(value)) value = lookup(globals, source.path)
    return { value, path, preserve: Boolean(source.preserve) }
  }
  let result = resolve(binding)
  for (const source of binding.sources || []) {
    const candidate = resolve(source)
    if (nonempty(candidate.value)) result = candidate
  }
  return result
}

// Media presentation belongs to the bound box, independent of the image URL.
export function resolvePreviewMedia (binding, draft, globals = {}) {
  return Object.fromEntries(['img_w', 'img_h', 'ratio'].map(key => {
    const source = binding[key]
    if (!source) return [key, '']
    // A page path overrides an inherited value; clearing it restores inheritance.
    const direct = source.path ? { ...source, value: undefined } : source
    const resolved = resolvePreviewBinding(direct, draft, globals).value
    return [key, resolved == null && source.value != null ? source.value : resolved]
  }))
}

export function initPreviewReceiver (targetWindow = window) {
  if (targetWindow.parent === targetWindow || targetWindow.__sansoulPreviewReceiver) return
  const token = new URLSearchParams(targetWindow.location.search).get(PREVIEW_TOKEN_PARAM)
  if (!/^[a-f0-9-]{36}$/i.test(token || '')) return
  const document = targetWindow.document
  let manifest
  try { manifest = JSON.parse(document.getElementById('sansoul-preview-manifest').textContent) } catch { return }
  targetWindow.__sansoulPreviewReceiver = true
  const generation = new URLSearchParams(targetWindow.location.search).get('sansoul-preview-generation')
  const report = (type, extra = {}) => targetWindow.parent.postMessage({ channel: PREVIEW_CHANNEL, type, token, ...(generation ? { generation: Number(generation) } : {}), ...extra }, targetWindow.location.origin)
  const authorized = () => {
    try { return targetWindow.parent.parent.__sansoulPreviewSessions?.get(token)?.current?.contentWindow === targetWindow } catch { return false }
  }
  let active = false
  const bindings = new Map((manifest.bindings || []).map(binding => [binding.id, binding]))
  const activePaths = new Map()
  const destinations = new Map()
  const originals = new Map()
  const render = (source, data, assets, inline = false) => renderPreviewMarkdown(document, String(source ?? ''), {
    data,
    globals: manifest.globals,
    origin: targetWindow.location.origin,
    inline,
    createIcon: targetWindow.parent.parent.__sansoulPreviewCreateIcon,
    lexer: typeof targetWindow.parent.parent.marked?.lexer === 'function' ? text => targetWindow.parent.parent.marked.lexer(text, { gfm: true }) : undefined,
    resolveImage: path => assets[path] || path
  })
  targetWindow.addEventListener('message', event => {
    const structural = event.data?.type === 'activate-structural'
    const message = structural ? { ...event, origin: event.origin, source: event.source, data: { ...event.data, type: 'update' } } : event
    if (!isPreviewUpdate(message, targetWindow, token) || !authorized()) return
    if (structural) {
      if (!validPreviewData({ draft: event.data.draft, assets: {} }, targetWindow.location.origin)) return report('error')
      // Hugo owns this DOM. Activate focus/navigation guards without applying
      // the lightweight renderer over resolved conditionals or remapped values.
      active = true
      for (const binding of bindings.values()) activePaths.set(binding.id, resolvePreviewBinding(binding, event.data.draft, manifest.globals).path)
      return report('structural-active')
    }
    if (!validPreviewData(event.data.data, targetWindow.location.origin)) return report('error')
    const { draft, assets } = event.data.data
    if (!active) {
      active = true
      const iconFont = safeImageURL(manifest.iconFont, targetWindow.location.origin)
      if (iconFont && new URL(iconFont).origin === targetWindow.location.origin && targetWindow.FontFace) {
        const font = new targetWindow.FontFace('SanSoul Preview Icons', `url("${iconFont}")`, { weight: '100 700' })
        font.load().then(face => document.fonts.add(face)).catch(error => console.warn('SanSoul preview icon font could not load.', error))
      }
      const css = safeImageURL(manifest.css, targetWindow.location.origin)
      if (css && new URL(css).origin === targetWindow.location.origin) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = css
        document.head.append(link)
      }
    }
    try {
      for (const node of document.querySelectorAll('[data-sansoul-binding]')) {
        const binding = bindings.get(node.dataset.sansoulBinding)
        if (!binding) continue
        const resolved = resolvePreviewBinding(binding, draft, manifest.globals)
        activePaths.set(binding.id, resolved.path)
        if (!destinations.has(binding.id)) {
          const destination = binding.kind === 'inline' ? (node.querySelector('a') || node) : node
          destinations.set(binding.id, destination)
          originals.set(binding.id, Array.from(destination.childNodes))
        }
        const destination = destinations.get(binding.id)
        if (resolved.preserve) {
          destination.replaceChildren(...originals.get(binding.id))
          continue
        }
        let source = resolved.value
        if (binding.kind === 'image') {
          const raw = assets[source] || source
          const url = safeImageURL(raw, targetWindow.location.origin)
          if (!url) { node.hidden = true; continue }
          node.hidden = false
          const alt = binding.alt ? resolvePreviewBinding(binding.alt, draft, manifest.globals).value : (node.querySelector('img')?.alt || '')
          // The DOM Markdown renderer owns the same safe image/video vocabulary.
          const fragment = render(formatImage({ src: url, alt: String(alt ?? ''), ...resolvePreviewMedia(binding, draft, manifest.globals) }), draft, assets)
          const media = fragment.querySelector('.img')
          if (media) {
            node.classList.toggle('img--ratio', media.classList.contains('img--ratio'))
            const ratio = media.style.getPropertyValue('--img-ratio')
            if (ratio) node.style.setProperty('--img-ratio', ratio)
            else node.style.removeProperty('--img-ratio')
            node.replaceChildren(...media.childNodes)
          }
        } else {
          if (source && typeof source === 'object') source = ''
          node.querySelectorAll('.icon').forEach(icon => icon.dispatchEvent(new targetWindow.Event('Unmount')))
          destination.replaceChildren(render(source, draft, assets, binding.kind === 'inline'))
        }
      }
      report('applied')
    } catch (error) {
      console.warn('SanSoul could not render this experimental preview.', error)
      report('error')
    }
  })
  const focusBinding = event => {
    if (!active) return
    const node = event.target.closest('[data-sansoul-binding]')
    const binding = node && bindings.get(node.dataset.sansoulBinding)
    const path = binding && activePaths.get(binding.id)
    if (path) report('focus', { path })
    if (event.target.closest('a,[data-h],[data-b],.box--go')) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }
  document.addEventListener('click', focusBinding, true)
  document.addEventListener('auxclick', focusBinding, true)
  document.addEventListener('submit', event => {
    if (!active) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }, true)
  if (authorized()) report('ready')
}

if (typeof window !== 'undefined') initPreviewReceiver()
