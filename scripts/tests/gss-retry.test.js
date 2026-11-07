import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = name => fs.readFileSync(new URL(`../../assets/js/${name}.js`, import.meta.url), 'utf8')
  .replace(/^import .+\n/gm, '').replace(/^export /gm, '')
const sheetNode = url => ({ dataset: { gss: url }, innerHTML: '', replaceChildren (table) { this.innerHTML = table.outerHTML } })
const flush = () => new Promise(resolve => setImmediate(resolve))

function fixture (nodes = [sheetNode('https://sheets.example/one')]) {
  const observers = []
  const requests = []
  const errors = []
  const context = {
    console: { error: error => errors.push(error) },
    document: { querySelectorAll: selector => selector === '[data-gss]' ? nodes : [] },
    createGssTable: html => {
      if (!html.includes('<table')) throw new Error('Published sheet response contains no table')
      return { outerHTML: html }
    },
    fetch: url => new Promise((resolve, reject) => requests.push({ url, resolve, reject })),
    IntersectionObserver: class {
      observed = new Set()
      constructor (callback) { this.callback = callback; observers.push(this) }
      observe (node) { this.observed.add(node) }
      unobserve (node) { this.observed.delete(node) }
      disconnect () { this.observed.clear() }
      emit (isIntersecting = true) { this.callback([...this.observed].map(target => ({ target, isIntersecting })), this) }
    }
  }
  const { initGss } = vm.runInNewContext(source('scroll-shot') + '\n' + source('gss') + '\n;({ initGss })', context)
  return { nodes, observers, requests, errors, initGss }
}

test('sheet loading remains retryable after network and HTTP failures, then completes once', async () => {
  const f = fixture()
  f.initGss()
  const observer = f.observers[0]
  observer.emit()
  observer.emit()
  assert.equal(f.requests.length, 1)
  assert.equal(observer.observed.size, 1)
  f.requests[0].reject(new Error('offline'))
  await flush()
  assert.equal(f.errors.length, 1)
  assert.equal(observer.observed.size, 1)
  assert.equal(f.nodes[0].innerHTML, '')
  observer.emit(false)
  observer.emit()
  f.requests[1].resolve({ ok: false, status: 503 })
  await flush()
  assert.equal(f.errors.length, 2)
  assert.equal(observer.observed.size, 1)
  observer.emit(false)
  observer.emit()
  f.requests[2].resolve({ ok: true, text: async () => '<table><tr><td>Published value</td></tr></table>' })
  await flush()
  assert.match(f.nodes[0].innerHTML, /Published value/)
  assert.equal(observer.observed.size, 0)
  observer.emit()
  assert.equal(f.requests.length, 3)
})

test('sheet initialization is absent-safe and shares requests across repeated initialization', async () => {
  const empty = fixture([])
  empty.initGss()
  assert.equal(empty.observers.length, 0)
  const f = fixture()
  f.initGss()
  f.initGss()
  for (const observer of f.observers) observer.emit()
  assert.equal(f.requests.length, 1)
  f.requests[0].resolve({ ok: true, text: async () => '<table><tr><td>Once</td></tr></table>' })
  await flush()
  f.initGss()
  f.observers.at(-1).emit()
  await flush()
  assert.equal(f.requests.length, 1)
  assert.ok(f.observers.every(observer => observer.observed.size === 0))
})

test('new sheet selection wins over a stale response', async () => {
  const node = sheetNode('https://sheets.example/one')
  const f = fixture([node])
  f.initGss()
  f.observers[0].emit()
  node.dataset.gss = 'https://sheets.example/two'
  f.initGss()
  f.observers[1].emit()
  assert.equal(f.requests.length, 2)
  f.requests[1].resolve({ ok: true, text: async () => '<table><tr><td>New sheet</td></tr></table>' })
  await flush()
  f.requests[0].resolve({ ok: true, text: async () => '<table><tr><td>Old sheet</td></tr></table>' })
  await flush()
  assert.match(node.innerHTML, /New sheet/)
  assert.doesNotMatch(node.innerHTML, /Old sheet/)
  f.initGss()
  f.observers.at(-1).emit()
  await flush()
  assert.equal(f.requests.length, 2)
})


test('a successful HTTP response without a published table remains retryable', async () => {
  const f = fixture()
  f.initGss()
  const observer = f.observers[0]
  observer.emit()
  f.requests[0].resolve({ ok: true, text: async () => '<html>Temporarily unavailable</html>' })
  await flush()
  assert.equal(f.errors.length, 1)
  assert.equal(observer.observed.size, 1)
  observer.emit(false)
  observer.emit()
  assert.equal(f.requests.length, 2)
  f.requests[1].resolve({ ok: true, text: async () => '<table><tr><td>Recovered</td></tr></table>' })
  await flush()
  assert.match(f.nodes[0].innerHTML, /Recovered/)
  assert.equal(observer.observed.size, 0)
})
