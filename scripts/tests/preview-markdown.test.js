import assert from 'node:assert/strict'
import test from 'node:test'
import { previewVideoSource, renderPreviewMarkdown, resolvePreviewGet, safePreviewURL } from '../../assets/js/cms/preview-markdown.js'

// A structural DOM fixture intentionally offers no HTML parser or innerHTML.
// Browser integration separately verifies the caller's Sveltia lexer and CSS.
class Node {
  constructor (tag = '', value = '', type = 1) {
    this.tagName = tag.toUpperCase()
    this.nodeType = type
    this.value = value
    this.childNodes = []
    this.attributes = {}
    this.style = { setProperty: (name, value) => { this.style[name] = value } }
    this.classList = {
      contains: value => this.className.split(/\s+/).includes(value),
      add: value => { this.className = `${this.className} ${value}`.trim() }
    }
    this.className = ''
  }

  append (...nodes) {
    for (const node of nodes) {
      if (node.nodeType === 11) this.append(...Array.from(node.childNodes))
      else {
        if (node.parentNode) node.parentNode.childNodes.splice(node.parentNode.childNodes.indexOf(node), 1)
        node.parentNode = this
        this.childNodes.push(node)
      }
    }
  }

  set textContent (value) { this.value = value; this.childNodes = [] }
  get textContent () { return this.value + this.childNodes.map(node => node.textContent).join('') }
  get firstChild () { return this.childNodes[0] }
  get firstElementChild () { return this.childNodes.find(node => node.nodeType === 1) }
  setAttribute (key, value) { this.attributes[key] = value }
}

const document = {
  createElement: tag => new Node(tag),
  createTextNode: value => new Node('', value, 3),
  createDocumentFragment: () => new Node('', '', 11)
}
const origin = 'https://site.example'
const word = text => ({ type: 'text', text })
const paragraph = (...tokens) => ({ type: 'paragraph', tokens })
const image = (href, title = '', text = 'Alternative') => ({ type: 'image', text, href, title })
const render = (tokens, options = {}) => renderPreviewMarkdown(document, '', { origin, lexer: () => tokens, ...options })
const all = (node, predicate) => [node, ...node.childNodes.flatMap(child => all(child, predicate))].filter(predicate)
const tags = (node, tag) => all(node, node => node.tagName === tag.toUpperCase())

test('remote media and links accept explicit safe schemes and owned blobs', () => {
  assert.equal(safePreviewURL('https://cdn.example/photo.jpg', origin), 'https://cdn.example/photo.jpg')
  assert.equal(safePreviewURL('http://cdn.example/movie.mp4', origin), 'http://cdn.example/movie.mp4')
  assert.equal(safePreviewURL('/u/file.svg', origin), `${origin}/u/file.svg`)
  assert.equal(safePreviewURL('blob:https://site.example/owned', origin), 'blob:https://site.example/owned')
  assert.equal(safePreviewURL('mailto:info@example.com', origin, { link: true }), 'mailto:info@example.com')
  assert.equal(safePreviewURL('tel:+1234', origin, { link: true }), 'tel:+1234')
  assert.equal(safePreviewURL('#heading', origin, { link: true }), `${origin}/#heading`)
})

test('URL validation blocks executable schemes, foreign blobs and parser ambiguities', () => {
  for (const value of ['javascript:alert(1)', 'data:image/svg+xml,hello', 'vbscript:msgbox(1)', 'file:///etc/passwd', 'blob:https://elsewhere.example/id', 'java\nscript:alert(1)', '\\evil.example/foo', ' https://example.com', 'https://user:secret@example.com/']) {
    assert.equal(safePreviewURL(value, origin, { link: true }), '', value)
  }
})

test('get resolves local nested values and preserves Hugo empty/false global fallback', () => {
  const data = { org: { name: 'Local' }, enabled: false, empty: '', zero: 0, array: [], object: {} }
  const globals = { org: { name: 'Global' }, enabled: true, empty: 'Fallback', zero: 10, array: 'Array fallback', object: 'Object fallback' }
  assert.equal(resolvePreviewGet('org.name', data, globals), 'Local')
  assert.equal(resolvePreviewGet('enabled', data, globals), 'true')
  assert.equal(resolvePreviewGet('empty', data, globals), 'Fallback')
  assert.equal(resolvePreviewGet('zero', data, globals), '10')
  assert.equal(resolvePreviewGet('array', data, globals), 'Array fallback')
  assert.equal(resolvePreviewGet('object', data, globals), 'Object fallback')
  assert.equal(resolvePreviewGet('__proto__.polluted', data, globals), '')
})

test('all three get spellings reach lexer as escaped text', () => {
  let source
  const markdown = '{{ get org.name }} / {{% get "org.name" %}} / {{< get org.name >}}'
  renderPreviewMarkdown(document, markdown, { data: { org: { name: '<script>**x**' } }, lexer: value => { source = value; return [] } })
  assert.equal(source, '\\<script\\>\\*\\*x\\*\\* / \\<script\\>\\*\\*x\\*\\* / \\<script\\>\\*\\*x\\*\\*')
})

test('missing lexer gracefully preserves source instead of treating it as HTML', () => {
  const fragment = renderPreviewMarkdown(document, '**bold** <script>alert(1)</script>')
  assert.equal(fragment.textContent, '**bold** <script>alert(1)</script>')
  assert.equal(fragment.childNodes[0].nodeType, 3)
})

test('author HTML stays literal, blocked URLs never become href or src attributes', () => {
  const fragment = render([
    { type: 'html', text: '<svg onload="alert(1)"><script>x</script></svg>' },
    paragraph({ type: 'link', href: 'javascript&#58;alert(1)', title: '', text: 'Unsafe', tokens: [word('Unsafe')] }),
    paragraph(image('data:image/svg+xml,<svg onload=alert(1)>'))
  ])
  assert.equal(tags(fragment, 'svg').length, 0)
  assert.equal(tags(fragment, 'script').length, 0)
  assert.equal(tags(fragment, 'a').length, 0)
  assert.equal(tags(fragment, 'img').length, 0)
  assert.match(fragment.textContent, /<svg onload/)
})

test('icons lead list items and heading labels using SanSoul wrappers', () => {
  const fragment = render([
    { type: 'list', ordered: true, start: 3, items: [{ tokens: [word('::check:: Item “quoted” and @@author@@')] }] },
    { type: 'heading', depth: 2, tokens: [word('::txt:Hi:: Heading')] }
  ])
  const li = tags(fragment, 'li')[0]
  assert.equal(li.className, 'li-icon')
  assert.equal(li.firstChild.className, 'icon icon--mat')
  assert.equal(li.firstChild.attributes.part, 'check')
  assert.equal(li.childNodes[1].tagName, 'DIV')
  assert.equal(tags(fragment, 'ol')[0].style['--item'], '3')
  assert.equal(tags(fragment, 'q')[0].textContent, 'quoted')
  assert.equal(tags(fragment, 'cite')[0].textContent, 'author')
  const heading = tags(fragment, 'h2')[0]
  assert.equal(heading.className, 'md__heading')
  assert.equal(heading.firstChild.className, 'icon icon--txt')
})

test('button links retain semantic labels, metadata, icons and btns paragraph', () => {
  const fragment = render([paragraph({ type: 'link', href: '/buy/', title: 'Help {alt dot sm swap}', text: '[::check:: Buy]', tokens: [word('[::check:: Buy]')] })])
  const a = tags(fragment, 'a')[0]
  assert.equal(a.className, 'btn alt btn--dot btn--sm btn--swap')
  assert.equal(a.href, `${origin}/buy/`)
  assert.equal(a.title, 'Help')
  assert.equal(a.firstChild.className, 'icon icon--mat')
  assert.equal(tags(a, 'b')[0].textContent, ' Buy')
  assert.equal(tags(fragment, 'p')[0].className, 'btns')
})

test('images use picture/figure/caption and ratio only when explicitly supplied', () => {
  const fragment = render([paragraph(image('https://cdn.example/a.svg', 'Caption {3/2}'), image('/u/other.jpg'))])
  assert.equal(tags(fragment, 'figure').length, 2)
  assert.equal(tags(fragment, 'p').length, 0)
  const wrappers = all(fragment, node => node.classList.contains('img'))
  assert.equal(wrappers[0].className, 'img img--ratio')
  assert.equal(wrappers[0].style['--img-ratio'], '3/2')
  assert.equal(wrappers[1].className, 'img')
  assert.equal(wrappers[1].style['--img-ratio'], undefined)
  assert.equal(tags(fragment, 'picture')[0].className, 'img__in')
  assert.equal(tags(fragment, 'img')[0].src, 'https://cdn.example/a.svg')
  assert.equal(tags(fragment, 'figcaption')[0].textContent, 'Caption')
})

test('uploaded media resolver remains subject to safe URL validation', () => {
  const good = render([paragraph(image('/u/a.jpg'))], { resolveImage: () => 'blob:https://site.example/owned' })
  assert.equal(tags(good, 'img')[0].src, 'blob:https://site.example/owned')
  const bad = render([paragraph(image('/u/a.jpg'))], { resolveImage: () => 'javascript:alert(1)' })
  assert.equal(tags(bad, 'img').length, 0)
})

test('YouTube and Vimeo embeds are reconstructed from provider IDs', () => {
  assert.deepEqual(previewVideoSource('https://youtu.be/dQw4w9WgXcQ?autoplay=1', origin), { type: 'iframe', src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' })
  assert.deepEqual(previewVideoSource('https://vimeo.com/12345/abcd', origin), { type: 'iframe', src: 'https://player.vimeo.com/video/12345?h=abcd' })
  assert.equal(previewVideoSource('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ', origin), null)
  const fragment = render([paragraph(image('https://www.youtube.com/watch?v=dQw4w9WgXcQ', '', 'Video title'), image('https://cdn.example/movie.mp4'))])
  const iframe = tags(fragment, 'iframe')[0]
  assert.equal(iframe.title, 'Video title')
  assert.equal(iframe.src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  const video = tags(fragment, 'video')[0]
  assert.equal(video.controls, true)
  assert.equal(video.muted, undefined)
  assert.equal(video.poster, undefined)
  assert.equal(video.autoplay, undefined)
})

test('tables preserve head/body and aligned cells; inline titles omit block wrappers', () => {
  const cell = value => ({ tokens: [word(value)] })
  const fragment = render([{ type: 'table', align: ['center'], header: [cell('Head')], rows: [[cell('Cell')]] }])
  assert.equal(fragment.firstChild.className, 'table-inner')
  assert.equal(tags(fragment, 'th')[0].className, 'align-center')
  assert.equal(tags(fragment, 'td')[0].textContent, 'Cell')
  const inline = render([paragraph(word('Hi '), { type: 'strong', tokens: [word('bold')] })], { inline: true })
  assert.equal(tags(inline, 'p').length, 0)
  assert.equal(tags(inline, 'strong')[0].textContent, 'bold')
})
