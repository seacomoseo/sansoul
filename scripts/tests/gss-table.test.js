import test from 'node:test'
import assert from 'node:assert/strict'
import { createGssTable } from '../../assets/js/gss-table.js'

// A detached DOM model exercises reconstruction and policy independently from
// the browser's native HTML parser. The real published document is also checked
// in the browser integration audit.
class Element {
  constructor (tag, attributes = {}, children = []) {
    this.nodeType = 1
    this.tagName = tag.toUpperCase()
    this.attrs = new Map(Object.entries(attributes))
    this.childNodes = children.map(child => typeof child === 'string' ? text(child) : child)
    this.styles = new Map()
    this.style = { setProperty: (key, value) => this.styles.set(key, value) }
  }

  get attributes () { return [...this.attrs].map(([name, value]) => ({ name, value })) }
  get classList () {
    const names = (this.getAttribute('class') || '').split(/\s+/).filter(Boolean)
    return Object.assign(names, { contains: name => names.includes(name) })
  }

  get id () { return this.getAttribute('id') || '' }
  set id (value) { this.setAttribute('id', value) }
  set className (value) { this.setAttribute('class', value) }
  get textContent () { return this.childNodes.map(child => child.textContent).join('') }
  setAttribute (key, value) { this.attrs.set(key, value) }
  getAttribute (key) { return this.attrs.get(key) ?? null }
  hasAttribute (key) { return this.attrs.has(key) }
  append (child) { this.childNodes.push(child) }
  querySelector (selector) { return this.querySelectorAll(selector)[0] || null }
  querySelectorAll (selector) {
    const all = this.childNodes.filter(child => child.nodeType === 1).flatMap(child => [child, ...child.querySelectorAll('*')])
    return all.filter(node => selector === '*' || (selector === '[id]' ? node.hasAttribute('id') : selector.startsWith('.') ? node.classList.contains(selector.slice(1)) : selector.split('.').every((part, index) => index ? node.classList.contains(part) : node.tagName === part.toUpperCase())))
  }
}

const text = value => ({ nodeType: 3, textContent: value })
const element = (tag, attrs, children) => new Element(tag, attrs, children)
function documentWith (children) {
  const content = element('fragment', {}, children)
  return {
    createTextNode: text,
    createElement: tag => tag === 'template' ? { content, set innerHTML (value) { this.source = value } } : element(tag)
  }
}

test('published table copies content and cell colors without importing global CSS or active content', () => {
  const css = element('style', { nonce: 'provider' }, [
    'body,html{height:100%}body{display:flex}@import url(https://example.test/tracker.css);',
    '.ritz .waffle .s1{background-color:#fff2cc;color:#000000;text-align:center;font-size:12pt;padding:3px;font-family:tracking;}',
    '.ritz .waffle .s2{background-color:#a2c4c9;font-weight:bold;position:fixed;display:none;}',
    '.ritz .waffle .s3{background-color:url(https://example.test/pixel);color:var(--evil);width:expression(alert(1));}'
  ])
  const source = element('table', { class: 'waffle grid-minimized', onclick: 'alert(1)' }, [
    element('thead', {}, [element('tr', {}, [element('th', { class: 'header-shim' }, ['A'])])]),
    element('tbody', {}, [element('tr', { onmouseover: 'alert(1)' }, [
      element('th', { class: 'row-header-shim' }, ['1']),
      element('td', { class: 's1', colspan: '2', 'aria-label': 'Morning' }, [
        element('span', { style: 'color:#123456;position:fixed', onfocus: 'alert(1)' }, ['Pilates']),
        element('script', {}, ['alert(1)']),
        element('iframe', { src: 'https://example.test/frame' }),
        element('link', { rel: 'stylesheet', href: 'https://example.test/evil.css' }),
        element('img', { src: 'https://example.test/pixel', onerror: 'alert(1)' }),
        element('svg', {}, [element('a', { href: 'javascript:alert(1)' }, ['SVG'])])
      ]),
      element('td', { class: 's2' }, ['Evening']),
      element('td', { class: 's3' }, ['Safe'])
    ])])
  ])
  const table = createGssTable('provider HTML', documentWith([css, source]))
  assert.equal(table.getAttribute('class'), 'gss__table')
  assert.equal(table.textContent, 'PilatesEveningSafe')
  assert.equal(table.querySelectorAll('thead').length, 0)
  assert.equal(table.getAttribute('onclick'), null)
  assert.equal(table.querySelector('tr').getAttribute('onmouseover'), null)
  for (const tag of ['style', 'script', 'iframe', 'link', 'img', 'svg']) assert.equal(table.querySelectorAll(tag).length, 0)
  const cells = table.querySelectorAll('td')
  assert.equal(cells[0].getAttribute('colspan'), '2')
  assert.equal(cells[0].getAttribute('aria-label'), 'Morning')
  assert.equal(cells[0].styles.get('background-color'), '#fff2cc')
  assert.equal(cells[0].styles.get('font-size'), '12pt')
  assert.equal(cells[0].styles.has('padding'), false)
  assert.equal(cells[0].styles.has('font-family'), false)
  assert.equal(cells[1].styles.get('background-color'), '#a2c4c9', 'consecutive cell rules both apply')
  assert.equal(cells[1].styles.has('position'), false)
  assert.equal(cells[1].styles.has('display'), false)
  assert.equal(cells[2].styles.size, 0)
  assert.equal(cells[0].querySelector('span').styles.get('color'), '#123456')
  assert.equal(cells[0].querySelector('span').getAttribute('onfocus'), null)
})

test('semantic headers and local references survive with unique IDs, and links only retain HTTP URLs', () => {
  const source = element('table', { id: 'schedule' }, [
    element('caption', {}, ['Weekly classes']),
    element('thead', {}, [element('tr', {}, [element('th', { id: 'time', scope: 'col', abbr: 'T' }, ['Time'])])]),
    element('tbody', {}, [element('tr', {}, [element('td', { headers: 'time absent', 'aria-describedby': 'time' }, [
      element('a', { href: 'https://example.test/classes', target: '_blank', ping: 'https://example.test/ping' }, ['Details']),
      element('a', { href: 'javascript:alert(1)' }, ['Unsafe']),
      element('a', { href: 'data:text/html,evil' }, ['Data'])
    ])])])
  ])
  const table = createGssTable('table', documentWith([source]))
  const header = table.querySelector('th')
  const cell = table.querySelector('td')
  assert.notEqual(header.id, 'time')
  assert.equal(header.getAttribute('scope'), 'col')
  assert.equal(header.getAttribute('abbr'), 'T')
  assert.equal(cell.getAttribute('headers'), header.id)
  assert.equal(cell.getAttribute('aria-describedby'), header.id)
  const links = table.querySelectorAll('a')
  assert.equal(links[0].getAttribute('href'), 'https://example.test/classes')
  assert.equal(links[0].getAttribute('ping'), null)
  assert.equal(links[0].getAttribute('target'), null)
  assert.equal(links[1].getAttribute('href'), null)
  assert.equal(links[2].getAttribute('href'), null)
  const another = createGssTable('table', documentWith([source]))
  assert.notEqual(another.querySelector('th').id, header.id)
})

test('missing table is a failure rather than a successful blank sheet', () => {
  assert.throws(() => createGssTable('<html>Unavailable</html>', documentWith([element('p', {}, ['Unavailable'])])), /no table/)
})
