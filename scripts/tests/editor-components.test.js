import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import * as syntax from '../../assets/js/cms/markdown-metadata.js'

const source = fs.readFileSync(new URL('../../assets/js/cms/editor-components.js', import.meta.url), 'utf8')
  .replace(/^import .+\n/gm, '')
  .replace('export function initEditorComponents', 'function initEditorComponents')

const text = nodeValue => ({ nodeType: 3, nodeValue, childNodes: [] })

class Element {
  constructor (...children) {
    this.nodeType = 1
    this.childNodes = children
    this.className = ''
    this.dataset = {}
    this.attributes = {}
    this.classList = { contains: name => this.className.split(/\s+/).includes(name) }
  }

  get children () { return this.childNodes.filter(child => child.nodeType === 1) }
  getAttribute (name) { return this.attributes[name] ?? null }
  appendChild (node) { this.childNodes.push(node) }
  replaceChildren (...nodes) { this.childNodes = nodes }
}

function editorContext () {
  const components = []
  const previews = []
  const context = vm.createContext({
    ...syntax,
    t: new Proxy({}, { get: (_, key) => key }),
    window: { CMS: { registerEditorComponent: value => components.push(value) } },
    document: { createElement: () => new Element() },
    createIconPreviewElement: value => {
      previews.push(value)
      return new Element(text(value))
    }
  })
  vm.runInContext(source, context)
  return { context, components, previews }
}

test('icon summaries work with plain or nested framework text and exclude their own preview', () => {
  const { context, previews } = editorContext()
  for (const value of ['home', 'brand:github', 'svg:base/logo', 'emoji:✨', 'text:OK']) {
    const label = new Element(text(value))
    const placeholder = new Element(text(' '), label)
    placeholder.attributes = { 'aria-label': 'Icon', title: 'Icon' }
    context.decorateIconPlaceholder(placeholder)
    assert.equal(placeholder.dataset.sansoulEnhanced, 'true')
    assert.equal(placeholder.children.length, 2)
    assert.equal(previews.at(-1), value)
    assert.equal(context.getSummaryText(placeholder).trim(), value)
    // Observer notifications from our own preview must neither duplicate nor
    // pollute the source value; subsequent framework text changes still work.
    const count = previews.length
    context.decorateIconPlaceholder(placeholder)
    assert.equal(previews.length, count)
    label.childNodes = [new Element(text('arrow_forward'))]
    context.decorateIconPlaceholder(placeholder)
    assert.equal(previews.at(-1), 'arrow_forward')
    assert.equal(placeholder.children.length, 2)
  }
  const plain = new Element(text('check'))
  context.decorateIconPlaceholder(plain)
  assert.equal(previews.at(-1), 'check')
})

test('temporary and whitespace-only summaries do not become an icon value', () => {
  const { context, previews } = editorContext()
  const placeholder = new Element(new Element(text('Icon')))
  placeholder.attributes = { 'aria-label': 'Icon', title: 'Icon' }
  context.decorateIconPlaceholder(placeholder)
  assert.equal(previews.length, 0)
  const whitespace = new Element(text(' '))
  assert.equal(context.getSummaryText(whitespace), '')
  whitespace.childNodes.push(new Element(text('home')))
  context.decorateIconPlaceholder(whitespace)
  assert.equal(previews.at(-1), 'home')
})

test('all Markdown media pickers accept images and videos while retaining URL and multiple selection', () => {
  const { context, components } = editorContext()
  vm.runInContext('initEditorComponentStyles = () => {}; initInlineComponentPreviews = () => {}; initSelectionPrefill = () => {}; initEditorComponents()', context)
  const find = id => components.find(component => component.id === id)
  const mediaFields = [
    find('gallery').fields.find(field => field.name === 'images').fields.find(field => field.name === 'src'),
    find('gallery-simple').fields.find(field => field.name === 'images'),
    find('inline-image').fields.find(field => field.name === 'src')
  ]
  for (const field of mediaFields) {
    assert.equal(field.widget, 'file')
    assert(field.accept.split(',').includes('image/*'))
    assert(field.accept.split(',').includes('video/*'))
    assert.equal(field.choose_url, true)
    assert.equal(field.max_file_size, 25000000)
  }
  assert.equal(mediaFields[1].multiple, true)
  for (const id of ['gallery', 'inline-image']) {
    const editor = find(id)
    for (const src of ['/u/photo.avif', '/u/illustration.svg', '/u/clip.mp4', 'https://example.org/photo.webp']) {
      const markdown = `![Description](${src})`
      assert.equal(editor.toBlock(editor.fromBlock(markdown.match(editor.pattern))), markdown)
    }
  }
})
