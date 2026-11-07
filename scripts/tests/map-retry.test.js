import { fixture as mediaFixture } from './helpers/media-consent-fixture.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = name => fs.readFileSync(new URL(`../../assets/js/${name}.js`, import.meta.url), 'utf8')
  .replace(/^import .+\n/gm, '').replace(/^export /gm, '')
const flush = () => new Promise(resolve => setImmediate(resolve))

function observers (nodes) {
  const instances = []
  class IntersectionObserver {
    observed = new Set()
    constructor (callback) { this.callback = callback; instances.push(this) }
    observe (node) { this.observed.add(node) }
    unobserve (node) { this.observed.delete(node) }
    disconnect () { this.observed.clear() }
    emit (intersecting = true) {
      this.callback([...this.observed].map(target => ({ target, isIntersecting: intersecting })), this)
    }
  }
  return { instances, IntersectionObserver, document: { querySelectorAll: () => nodes } }
}

function loaders () {
  const requests = []
  const window = {}
  const leaflet = { Control: {} }
  const load = type => url => new Promise((resolve, reject) => {
    requests.push({
      type,
      url,
      reject,
      resolve: () => {
        if (type === 'script') {
          if (url.includes('leaflet.draw')) leaflet.Control.Draw = class {}
          else window.L = leaflet
        }
        resolve()
      }
    })
  })
  const api = vm.runInNewContext(source('leaflet') + '\n;({ loadLeaflet, loadLeafletDraw })', {
    window, params: { leafletBase: '/example/vendor/leaflet/' }, loadStyle: load('style'), loadScript: load('script')
  })
  return { api, requests, window, leaflet }
}

for (const failedType of ['style', 'script']) {
  test(`Leaflet retries rejected ${failedType} loads and shares pending and completed loads`, async () => {
    const { api, requests } = loaders()
    const first = api.loadLeaflet()
    assert.equal(api.loadLeaflet(), first)
    assert.equal(requests.length, 2)
    const rejected = assert.rejects(first, /offline/)
    requests.forEach(request => request.type === failedType ? request.reject(new Error('offline')) : request.resolve())
    await rejected
    const retry = api.loadLeaflet()
    assert.notEqual(retry, first)
    assert.equal(api.loadLeaflet(), retry)
    requests.slice(2).forEach(request => request.resolve())
    await retry
    assert.equal(api.loadLeaflet(), retry)
    assert.equal(requests.length, 4)
  })

  test(`Leaflet Draw safely loads Leaflet first, shares requests and retries ${failedType} failure`, async () => {
    const { api, requests, window } = loaders()
    const first = api.loadLeafletDraw()
    assert.equal(api.loadLeafletDraw(), first)
    assert.equal(window.L, undefined)
    assert.equal(requests.length, 2)
    requests.slice().forEach(request => request.resolve())
    await flush()
    assert.equal(requests.length, 4)
    const rejected = assert.rejects(first, /draw offline/)
    requests.slice(2).forEach(request => request.type === failedType ? request.reject(new Error('draw offline')) : request.resolve())
    await rejected
    const retry = api.loadLeafletDraw()
    assert.equal(api.loadLeafletDraw(), retry)
    await flush()
    assert.equal(requests.length, 6)
    assert.ok(requests.slice(4).every(request => request.url.includes('leaflet.draw')))
    requests.slice(4).forEach(request => request.resolve())
    await retry
    assert.equal(api.loadLeafletDraw(), retry)
  })
}

test('externally loaded Leaflet and Draw remain usable without duplicate resource loads', async () => {
  const { api, requests, window, leaflet } = loaders()
  window.L = leaflet
  leaflet.Control.Draw = class {}
  const first = api.loadLeaflet()
  assert.equal(api.loadLeaflet(), first)
  await first
  const draw = api.loadLeafletDraw()
  assert.equal(api.loadLeafletDraw(), draw)
  await draw
  assert.equal(requests.length, 0)
})

test('scrollShot preserves synchronous start/end and cleanup, and is absent-safe', () => {
  const node = {}
  const fixture = observers([node])
  const events = []
  const { scrollShot } = vm.runInNewContext(source('scroll-shot') + '\n;({ scrollShot })', fixture)
  const cleanup = scrollShot({ query: '.fixture', doOnLoad: () => events.push('load'), doStart: () => events.push('start'), doEnd: () => events.push('end') })
  fixture.instances[0].emit()
  fixture.instances[0].emit(false)
  assert.deepEqual(events, ['load', 'start', 'end'])
  cleanup()
  assert.equal(fixture.instances[0].observed.size, 0)
  scrollShot({ query: '.fixture', end: true, doStart: () => events.push('once') })
  fixture.instances[1].emit()
  assert.equal(fixture.instances[1].observed.size, 0)
  fixture.document.querySelectorAll = () => []
  assert.equal(scrollShot({ query: '.absent' }), undefined)
  assert.equal(fixture.instances.length, 2)
})

test('scrollShot waits for async success, handles rejection and waits for reintersection to retry', async () => {
  const node = {}
  const fixture = observers([node])
  const errors = []
  let resolve
  let reject
  let attempts = 0
  const { scrollShot } = vm.runInNewContext(source('scroll-shot') + '\n;({ scrollShot })', { ...fixture, console: { error: error => errors.push(error) } })
  scrollShot({ query: '.fixture', end: true, doStart: () => { attempts++; return new Promise((yes, no) => { resolve = yes; reject = no }) } })
  const observer = fixture.instances[0]
  observer.emit()
  observer.emit()
  assert.equal(attempts, 1)
  assert.equal(observer.observed.size, 1)
  reject(new Error('offline'))
  await flush()
  assert.equal(errors.length, 1)
  assert.equal(observer.observed.size, 1)
  await flush()
  assert.equal(attempts, 1)
  observer.emit(false)
  observer.emit()
  resolve()
  await flush()
  assert.equal(attempts, 2)
  assert.equal(observer.observed.size, 0)
})

for (const [module, area] of [['map', false], ['form-geo', false], ['form-geo', true]]) {
  test(`${module}${area ? ' area' : ''} retries failed SDK loading, shares concurrent starts and initializes once`, async () => {
    const fixture = mediaFixture(module, { area })
    fixture.grant(true)
    fixture.failSDK()
    fixture.init()
    fixture.init()
    fixture.intersect()
    fixture.intersect()
    await flush()
    assert.equal(fixture.loaded.filter(name => name === 'leaflet').length, 1)
    assert.equal(fixture.maps.length, 0)
    assert.equal(fixture.errors.length, 1)
    assert.equal(fixture.notice.hidden, false)
    fixture.notice.children[0].click()
    fixture.notice.children[0].click()
    await flush()
    assert.equal(fixture.maps.length, 1)
    assert.equal(fixture.loaded.filter(name => name === 'leaflet').length, 2)
    if (area) assert.equal(fixture.drawRequests, 1)
    fixture.init()
    fixture.intersect()
    await flush()
    assert.equal(fixture.maps.length, 1)
  })
}
