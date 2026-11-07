import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { hasConsent } from '../../../assets/js/consent.js'
const source = name => fs.readFileSync(new URL(`../../../assets/js/${name}.js`, import.meta.url), 'utf8').replace(/^import .+\n/gm, '').replace(/^export /gm, '')

export function fixture (module, { legal = true, area = false, saved = '', count = 1 } = {}) {
  const intersections = []
  const mutations = []
  const listeners = new Map()
  const grants = new Map()
  const errors = []
  let cookieOpens = 0
  class Element {
    constructor () {
      this.children = []
      this.dataset = {}
      this.events = {}
      this.isConnected = true
      this.style = {}
      const classes = new Set()
      this.classList = { toggle: (name, value) => value ? classes.add(name) : classes.delete(name), contains: name => classes.has(name) }
    }
    get childNodes () { return this.children }
    get nextElementSibling () { return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] }
    appendChild (node) { this.children.push(node); node.parentElement = this; return node }
    before (node) { node.remove(); this.parentElement.children.splice(this.parentElement.children.indexOf(this), 0, node); node.parentElement = this.parentElement }
    remove () { const index = this.parentElement?.children.indexOf(this); if (index >= 0) this.parentElement.children.splice(index, 1) }
    replaceChildren (...nodes) { this.children = nodes }
    addEventListener (name, callback) { this.events[name] = callback }
    setAttribute (name, value) { this[name] = value }
    removeAttribute (name) { delete this[name] }
    querySelector () { return { style: {} } }
    closest (selector) {
      let current = this
      while (current) {
        if (selector === '[data-disqus-thread]' && Object.hasOwn(current.dataset, 'disqusThread')) return current
        current = current.parentElement
      }
      return null
    }
    click () { this.events.click?.() }
  }
  const parent = new Element()
  const element = new Element()
  element.id = module === 'comments' ? 'disqus_thread' : 'map-demo'
  element.dataset = { view: '{"coordinates":[40,-3]}', area: String(area) }
  parent.appendChild(element)
  const fallback = parent.appendChild(new Element())
  const elements = [element]
  for (let index = 1; index < count; index++) {
    const next = parent.appendChild(new Element())
    next.id = `map-demo-${index}`
    next.dataset = { ...element.dataset }
    elements.push(next)
    parent.appendChild(new Element())
  }
  const changes = []
  const json = { value: saved, dispatchEvent (event) { changes.push(event) } }
  parent.querySelector = () => json
  const document = {
    body: parent,
    documentElement: { clientWidth: 1024 },
    createElement: () => new Element(),
    querySelectorAll: selector => {
      const descendants = node => node.children.flatMap(child => [child, ...descendants(child)])
      return selector === 'iframe[src]' ? descendants(parent).filter(node => node.tagName === 'IFRAME') : elements
    },
    querySelector: selector => selector === '.cookies__toggle' ? { click: () => cookieOpens++ } : null
  }
  const window = {
    localStorage: { getItem: key => grants.get(key) },
    location: { href: 'https://fixture.example/article/#x' },
    addEventListener (name, callback) {
      if (!listeners.has(name)) listeners.set(name, [])
      listeners.get(name).push(callback)
    }
  }
  const maps = []
  const markers = []
  const groups = []
  const loaded = []
  const pendingSDK = []
  let rejectSDK = false
  let deferredSDK = false
  let drawRequests = 0
  const requests = []
  let resetCalls = 0
  let deferredScripts = false
  let rejectScripts = false
  const pendingScripts = []
  let deferredDraw = false
  const pendingDraw = []
  const scriptCache = new Map()
  const loadScript = url => {
    if (scriptCache.has(url)) return scriptCache.get(url)
    requests.push(url)
    const promise = new Promise((resolve, reject) => {
      const finish = () => {
        if (rejectScripts) { rejectScripts = false; reject(new Error('offline')); return }
        if (url.endsWith('embed.js')) {
          window.DISQUS = { reset: ({ reload, config }) => {
            assert.equal(reload, true)
            const context = { page: {} }
            config.call(context)
            assert.equal(context.page.url, 'https://fixture.example/article/')
            resetCalls++
            const thread = elements.find(node => node.id === 'disqus_thread')
            const frame = thread?.appendChild(new Element())
            if (frame) { frame.tagName = 'IFRAME'; frame.src = 'https://disqus.com/embed/comments/' }
          } }
          const frame = element.appendChild(new Element())
          frame.tagName = 'IFRAME'
          frame.src = 'https://disqus.com/embed/comments/'
        }
        resolve()
      }
      if (deferredScripts) pendingScripts.push(finish)
      else finish()
    })
    scriptCache.set(url, promise)
    promise.catch(() => scriptCache.delete(url))
    return promise
  }
  const layer = (position, geometry) => ({
    position,
    addTo () { return this }, bindPopup () { return this }, openPopup () { return this },
    getLatLng () { return this.position },
    setLatLng (next) { this.position = next },
    toGeoJSON () { return { geometry: geometry || { type: 'Point', coordinates: [this.position.lng, this.position.lat] } } }
  })
  const L = {
    map: () => {
      const map = { events: {}, removed: false, layers: [], setView () { return this }, fitBounds () {}, addLayer (item) { this.layers.push(item) }, addControl () {}, on (name, fn) { this.events[name] = fn }, remove () { this.removed = true } }
      maps.push(map)
      return map
    },
    marker: position => { const item = layer(position); markers.push(item); return item },
    circle: (position, options) => { const item = layer(position); item.radius = options.radius; return item },
    geoJSON: geometry => ({ eachLayer: fn => fn(layer(null, geometry)), getBounds: () => ({}) }),
    latLngBounds: () => ({ extend () {} }),
    FeatureGroup: class {
      constructor () { this.layers = []; groups.push(this) }
      addLayer (item) { this.layers.push(item) }
      clearLayers () { this.layers = [] }
      getLayers () { return this.layers }
    },
    Control: { Draw: class {} },
    Draw: { Event: { CREATED: 'created' } }
  }
  const context = {
    document, window, L, URL, params: { mediaConsent: 'Consent', mediaRetry: 'Retry', mediaLoading: 'Loading', mediaLoad: 'Load', disqusId: 'fixture' }, cookiesLegal: legal,
    hasConsent: (type, enabled) => hasConsent(type, enabled, window.localStorage),
    IntersectionObserver: class { constructor (callback) { this.callback = callback; intersections.push(this) } observe () {} disconnect () { this.disconnected = true } },
    MutationObserver: class { constructor (callback) { this.callback = callback; mutations.push(this) } observe () {} },
    console: { error: (...args) => errors.push(args) },
    loadLeaflet: () => {
      loaded.push('leaflet')
      if (rejectSDK) { rejectSDK = false; return Promise.reject(new Error('offline')) }
      if (deferredSDK) return new Promise(resolve => pendingSDK.push(resolve))
      return Promise.resolve()
    },
    loadLeafletDraw: () => { drawRequests++; return deferredDraw ? new Promise(resolve => pendingDraw.push(resolve)) : Promise.resolve() },
    myIcon: () => ({}), fill: () => ({ style: {} }), tile: () => loaded.push('tiles'), loadScript,
    Event: class { constructor (type, options = {}) { this.type = type; Object.assign(this, options) } }
  }
  const init = { map: 'initMap', 'form-geo': 'initFormGeo', comments: 'initComments' }[module]
  const api = vm.runInNewContext(source('media-consent') + '\n' + source(module) + `\n;({ ${init} })`, context)
  return {
    init: () => api[init](), element, elements, fallback,
    get mutationObserverCount () { return mutations.length },
    replaceThread () {
      const previous = elements[0]
      previous.isConnected = false
      previous.remove()
      const next = parent.appendChild(new Element())
      next.id = 'disqus_thread'
      elements.splice(0, elements.length, next)
      return next
    },
    appendExternalFrame: src => { const frame = parent.appendChild(new Element()); frame.tagName = 'IFRAME'; frame.src = src; return frame },
    hasExternalFrame: frame => parent.children.includes(frame),
    appendThreadFrame: thread => { const frame = thread.appendChild(new Element()); frame.tagName = 'IFRAME'; frame.src = 'https://disqus.com/embed/comments/'; return frame }, json, changes, maps, markers, groups, loaded, errors, requests,
    get notice () { return parent.children.find(node => ['media-consent', 'media-retry'].includes(node.className)) },
    get drawRequests () { return drawRequests },
    get resetCalls () { return resetCalls },
    get cookieOpens () { return cookieOpens },
    get listenerCount () { return listeners.get('cookies:changed')?.length || 0 },
    intersect: () => intersections.filter(observer => !observer.disconnected).forEach(observer => observer.callback(elements.map(target => ({ target, isIntersecting: true })))),
    captureIntersection () {
      const callbacks = intersections.filter(observer => !observer.disconnected).map(observer => observer.callback)
      const entries = elements.map(target => ({ target, isIntersecting: true }))
      return () => callbacks.forEach(callback => callback(entries))
    },
    grant (allowed) {
      if (allowed) grants.set('controlcookiemedia', '1')
      else grants.delete('controlcookiemedia')
      listeners.get('cookies:changed')?.forEach(callback => callback())
    },
    mutate: () => mutations.forEach(observer => observer.callback()),
    failScripts: () => { rejectScripts = true },
    deferScripts: () => { deferredScripts = true },
    releaseScripts: () => { deferredScripts = false; pendingScripts.splice(0).forEach(finish => finish()) },
    deferDraw: () => { deferredDraw = true },
    releaseDraw: () => { deferredDraw = false; pendingDraw.splice(0).forEach(resolve => resolve()) },
    failSDK: () => { rejectSDK = true },
    deferSDK: () => { deferredSDK = true },
    releaseSDK: () => { deferredSDK = false; pendingSDK.splice(0).forEach(resolve => resolve()) }
  }
}
