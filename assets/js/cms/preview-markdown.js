import { parseImage, parseLinkTitle } from './markdown-metadata.js'

const COLORS = ['main', 'alt', 'cta', 'light', 'dark', 'turn', 'such', 'whatsapp']
const BLOCKS = new Set(['paragraph', 'text', 'heading', 'blockquote', 'list', 'table', 'code', 'hr', 'space', 'html'])
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”' }

// Only URL-bearing attributes created by this module receive author data.
export function safePreviewURL (value, origin, { link = false, blob = true } = {}) {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u0020\u007f\\]/.test(value)) return ''
  try {
    const base = new URL(origin)
    const url = new URL(value, base)
    if (url.username || url.password) return ''
    if (['http:', 'https:'].includes(url.protocol)) return url.href
    if (blob && url.protocol === 'blob:' && url.origin === base.origin) return url.href
    if (link && ['mailto:', 'tel:'].includes(url.protocol)) return url.href
  } catch {}
  return ''
}

function decodeText (value = '') {
  return String(value).replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
    if (name[0] !== '#') return ENTITIES[name] ?? entity
    const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1))
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '\ufffd'
  })
}

function lookup (data, path) {
  return path.split('.').reduce((value, key) => {
    if (!value || typeof value !== 'object' || ['__proto__', 'prototype', 'constructor'].includes(key)) return undefined
    return Object.hasOwn(value, key) ? value[key] : undefined
  }, data)
}

function nonempty (value) {
  return Boolean(value) && (!Array.isArray(value) || value.length > 0) && (typeof value !== 'object' || Object.keys(value).length > 0)
}

export function resolvePreviewGet (path, data = {}, globals = {}) {
  const local = lookup(data, path)
  const value = nonempty(local) ? local : lookup(globals, path)
  return ['string', 'number', 'boolean'].includes(typeof value) ? String(value) : ''
}

function expandGet (markdown, options) {
  return markdown.replace(/\{\{\s*(?:%\s*get\s+([\w.]+|"[\w.]+"|'[\w.]+')\s*%|<\s*get\s+([\w.]+|"[\w.]+"|'[\w.]+')\s*>|get\s+([\w.]+|"[\w.]+"|'[\w.]+'))\s*\}\}/g, (_, percent, angle, plain) => {
    const path = (percent || angle || plain).replace(/^["']|["']$/g, '')
    // The Hugo shortcode emits a plain value; preserve that as text in the AST.
    return resolvePreviewGet(path, options.data || options.params, options.globals).replace(/[\\`*_[\]{}<>!#|~^=+]/g, '\\$&')
  })
}

export function previewVideoSource (value, origin) {
  const safe = safePreviewURL(value, origin)
  if (!safe) return null
  const url = new URL(safe)
  const host = url.hostname.toLowerCase()
  let id = ''
  if (host === 'youtu.be') id = url.pathname.split('/')[1]
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
    id = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1]
  }
  if (/^[\w-]{11}$/.test(id || '')) return { type: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}` }
  if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(host)) {
    const match = url.pathname.match(/^\/(?:video\/)?(\d+)(?:\/([\da-f]+))?\/?$/i)
    if (match) {
      const hash = match[2] || url.searchParams.get('h')
      return { type: 'iframe', src: `https://player.vimeo.com/video/${match[1]}${hash && /^[\da-f]+$/i.test(hash) ? `?h=${hash}` : ''}` }
    }
  }
  if (/\.(?:mp4|webm|mov|avi|m4v|ogv)$/i.test(url.pathname)) return { type: 'video', src: safe }
  return null
}

/**
 * Approximate SanSoul's Markdown hooks using a caller-supplied Marked lexer.
 * No author HTML is parsed or inserted. `createIcon(value, document)` must return
 * a trusted DOM node, and `resolveImage(value)` a URL, never HTML. The lexer is
 * normally Sveltia's documented window.marked.lexer, injected by the CMS realm.
 */
export function renderPreviewMarkdown (document, markdown, options = {}) {
  const result = document.createDocumentFragment()
  const origin = options.origin || document.location?.origin || 'http://localhost'
  const make = (tag, className = '', text) => {
    const element = document.createElement(tag)
    if (className) element.className = className
    if (text !== undefined) element.textContent = text
    return element
  }
  const text = value => document.createTextNode(decodeText(value))
  const icon = value => {
    if (!value || ['hide', 'none'].includes(value)) return document.createTextNode('')
    const injected = options.createIcon?.(value, document)
    if (injected?.nodeType) {
      injected.classList.add('icon')
      injected.setAttribute('aria-hidden', 'true')
      return injected
    }
    const literal = value.startsWith('txt:') || /[^\x20-\x7e]/.test(value)
    if (/^(?:svg|brand):/.test(value)) {
      const path = value.replace(/^brand:/, 'icons/brands/').replace(/^svg:/, '')
      if (/^[\w/-]+$/.test(path) && !path.split('/').includes('..')) {
        const img = make('img', 'icon icon--svg')
        img.src = new URL(`/u/${path}.svg`, origin).href
        img.alt = ''
        return img
      }
      return document.createTextNode('')
    }
    const element = make('i', `icon icon--${literal ? 'txt' : 'mat'}`, literal ? value.replace(/^txt:/, '') : '')
    element.setAttribute('aria-hidden', 'true')
    if (!literal && /^[a-z][a-z\d_]*$/.test(value)) element.setAttribute('part', value)
    return element
  }
  const inlineText = value => {
    const fragment = document.createDocumentFragment()
    const pattern = /::([^\n]+?)::|“([^\n]+?)”|«([^\n]+?)»|@@([^\n]+?)@@|==([^\n]+?)==|\+\+([^\n]+?)\+\+|(?<!~)~([^~\n]+?)~(?!~)|\^([^\n^]+?)\^/g
    const source = decodeText(value)
    let offset = 0
    for (const match of source.matchAll(pattern)) {
      if (match.index > offset) fragment.append(document.createTextNode(source.slice(offset, match.index)))
      if (match[1]) fragment.append(icon(match[1]))
      else {
        const index = match.findIndex((part, index) => index > 1 && part !== undefined)
        const tags = { 2: 'q', 3: 'q', 4: 'cite', 5: 'mark', 6: 'ins', 7: 'sub', 8: 'sup' }
        const element = make(tags[index], index === 3 ? 'aquotes' : '')
        element.append(inlineText(match[index]))
        fragment.append(element)
      }
      offset = match.index + match[0].length
    }
    if (offset < source.length) fragment.append(document.createTextNode(source.slice(offset)))
    return fragment
  }
  const media = token => {
    const metadata = parseImage(decodeText(token.text), token.href, token.title || '')
    const figure = make('figure', 'md__fig')
    const ratio = metadata.alt === 'disc' ? '1/1' : metadata.ratio
    const validRatio = ratio.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/)
    const hasRatio = validRatio && validRatio.slice(1).every(part => Number.isFinite(Number(part)) && Number(part) > 0)
    const wrapper = make('div', `img${hasRatio ? ' img--ratio' : ''}${metadata.alt === 'disc' ? ' img--disc' : ''}`)
    if (hasRatio) wrapper.style.setProperty('--img-ratio', ratio)
    const original = safePreviewURL(metadata.src, origin)
    const resolved = options.resolveImage?.(metadata.src) ?? original
    const src = safePreviewURL(resolved, origin)
    const video = previewVideoSource(original, origin)
    if (src) {
      if (video) {
        const element = make(video.type, 'img__in')
        element.src = video.type === 'iframe' ? video.src : src
        const quotient = hasRatio ? Number(validRatio[1]) / Number(validRatio[2]) : 16 / 9
        element.width = Math.max(1, Math.round(1080 * Math.min(1, quotient)))
        element.height = Math.max(1, Math.round(1080 / Math.max(1, quotient)))
        if (video.type === 'iframe') {
          element.title = metadata.alt || 'Video'
          element.loading = 'lazy'
          element.allow = 'fullscreen; picture-in-picture'
          element.setAttribute('allowfullscreen', '')
          element.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
        } else {
          element.controls = true
          element.playsInline = true
          element.preload = 'metadata'
          if (metadata.alt) element.setAttribute('aria-label', metadata.alt)
        }
        wrapper.append(element)
      } else {
        const picture = make('picture', 'img__in')
        const image = make('img')
        image.src = src
        image.alt = metadata.alt === 'disc' ? '' : metadata.alt
        image.loading = 'lazy'
        picture.append(image)
        wrapper.append(picture)
      }
    } else wrapper.append(text(metadata.alt))
    figure.append(wrapper)
    if (metadata.title) figure.append(make('figcaption', 'md__figcaption', metadata.title))
    return figure
  }
  const renderLink = token => {
    const metadata = parseLinkTitle(token.title || '')
    const isButton = token.text.startsWith('[') && token.text.endsWith(']')
    const color = COLORS.filter(color => metadata.tokens.includes(color)).at(-1) || 'cta'
    const classes = isButton
      ? ['btn', color !== 'cta' && color, ...['dot', 'sm', 'swap'].filter(token => metadata.tokens.includes(token)).map(token => `btn--${token}`)].filter(Boolean)
      : ['link']
    const href = safePreviewURL(decodeText(token.href), origin, { link: true, blob: false })
    const anchor = make(href ? 'a' : 'span', classes.join(' '))
    if (href) anchor.href = href
    if (metadata.title) anchor.title = metadata.title
    const children = (token.tokens || []).map(child => ({ ...child }))
    if (isButton) {
      if (children[0]?.type === 'text') children[0].text = children[0].text.replace(/^\[/, '')
      if (children.at(-1)?.type === 'text') children.at(-1).text = children.at(-1).text.replace(/\]$/, '')
    }
    const label = render(children, true)
    if (isButton) {
      const bold = make('b')
      bold.append(label)
      const first = bold.firstChild
      if (first?.nodeType === 1 && first.classList.contains('icon')) anchor.append(first)
      anchor.append(bold)
    } else anchor.append(label)
    return anchor
  }
  const paragraph = token => {
    const fragment = document.createDocumentFragment()
    let p = make('p')
    const children = render(token.tokens || [{ type: 'text', text: token.text }], true)
    for (const child of Array.from(children.childNodes)) {
      if (child.nodeType === 1 && child.tagName === 'FIGURE') {
        if (p.childNodes.length) fragment.append(p)
        fragment.append(child)
        p = make('p')
      } else p.append(child)
    }
    if (p.childNodes.length) fragment.append(p)
    for (const child of Array.from(fragment.childNodes)) {
      if (child.tagName === 'P' && child.firstElementChild?.classList.contains('btn')) child.className = 'btns'
    }
    return fragment
  }
  const render = (tokens, inline = false) => {
    const fragment = document.createDocumentFragment()
    for (const token of tokens) {
      if (token.type === 'space') continue
      if (inline && BLOCKS.has(token.type) && token.type !== 'text' && token.type !== 'html') {
        fragment.append(token.tokens ? render(token.tokens, true) : text(token.text || ''))
        continue
      }
      switch (token.type) {
        case 'escape': fragment.append(text(token.text)); break
        case 'html': fragment.append(document.createTextNode(token.text || token.raw || '')); break
        case 'text':
          fragment.append(token.tokens ? render(token.tokens, true) : inlineText(token.text))
          break
        case 'paragraph': fragment.append(paragraph(token)); break
        case 'image': fragment.append(media(token)); break
        case 'link': fragment.append(renderLink(token)); break
        case 'br': fragment.append(make('br')); break
        case 'hr': fragment.append(make('hr')); break
        case 'codespan': fragment.append(make('code', '', decodeText(token.text))); break
        case 'code': {
          const pre = make('pre')
          pre.append(make('code', '', token.text))
          fragment.append(pre)
          break
        }
        case 'heading': {
          const heading = make(`h${Math.max(1, Math.min(6, token.depth))}`, 'md__heading')
          const label = make('i')
          label.append(render(token.tokens || [], true))
          const first = label.firstChild
          if (first?.nodeType === 1 && first.classList.contains('icon')) heading.append(first)
          heading.append(label)
          fragment.append(heading)
          break
        }
        case 'strong':
        case 'em':
        case 'del':
        case 'blockquote': {
          const element = make(token.type)
          element.append(render(token.tokens || [], token.type !== 'blockquote'))
          fragment.append(element)
          break
        }
        case 'list': {
          const list = make(token.ordered ? 'ol' : 'ul')
          if (token.ordered && Number(token.start) > 1) list.style.setProperty('--item', String(Number(token.start)))
          for (const item of token.items || []) {
            const li = make('li')
            const wrapper = make('div')
            wrapper.append(render(item.tokens || []))
            const container = wrapper.firstChild?.tagName === 'P' ? wrapper.firstChild : wrapper
            const firstNode = container.firstChild
            const first = firstNode?.tagName === 'A' ? firstNode.firstChild : firstNode
            if (first?.nodeType === 1 && first.classList.contains('icon')) {
              li.className = 'li-icon'
              li.append(first)
            }
            if (item.task) {
              const checkbox = make('input')
              checkbox.type = 'checkbox'
              checkbox.disabled = true
              checkbox.checked = Boolean(item.checked)
              li.append(checkbox)
            }
            li.append(wrapper)
            list.append(li)
          }
          fragment.append(list)
          break
        }
        case 'table': {
          const wrapper = make('div', 'table-inner')
          const table = make('table')
          const row = (cells, header = false) => {
            const tr = make('tr')
            cells.forEach((cell, index) => {
              const alignment = token.align?.[index]
              const td = make(header ? 'th' : 'td', ['left', 'center', 'right'].includes(alignment) ? `align-${alignment}` : '')
              td.append(render(cell.tokens || [], true))
              tr.append(td)
            })
            return tr
          }
          const head = make('thead')
          head.append(row(token.header || [], true))
          const body = make('tbody')
          for (const cells of token.rows || []) body.append(row(cells))
          table.append(head, body)
          wrapper.append(table)
          fragment.append(wrapper)
          break
        }
        default: fragment.append(text(token.raw || token.text || ''))
      }
    }
    return fragment
  }
  const source = expandGet(String(markdown || ''), options)
  if (typeof options.lexer !== 'function') {
    result.append(document.createTextNode(source))
    return result
  }
  result.append(render(options.lexer(source), options.inline))
  return result
}
