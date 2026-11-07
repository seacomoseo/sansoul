import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { hasConsent } from '../../assets/js/consent.js'

const source = fs.readFileSync(new URL('../../assets/js/cookies.js', import.meta.url), 'utf8').replace(/^import .+\n/gm, '').replace(/^export /gm, '')

function fixture ({ failure, initial = {}, legal = true, deferred = false } = {}) {
  const values = new Map(Object.entries(initial))
  const events = []
  const listeners = {}
  const timers = []
  const classes = new Set()
  const inputs = ['media', 'analytics'].map(value => ({ value, checked: true }))
  let hidden = false
  let analyticsCalls = 0
  const storage = new Proxy({
    getItem (key) {
      if (failure === 'read') throw new Error('Storage blocked')
      return values.get(key) ?? null
    },
    removeItem (key) {
      if (failure === 'remove') throw new Error('Storage blocked')
      values.delete(key)
    }
  }, {
    set (target, key, value) {
      if (failure === 'write' || (failure === 'partial' && key === 'controlcookieanalytics')) throw new Error('Quota exceeded')
      values.set(key, String(value))
      return true
    }
  })
  const window = { dispatchEvent: event => events.push(event) }
  Object.defineProperty(window, 'localStorage', { get () {
    if (failure === 'getter') throw new Error('Storage blocked')
    return storage
  } })
  const message = {
    querySelectorAll: () => inputs,
    querySelector: () => ({ focus () {} }),
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
    setAttribute: () => { hidden = true },
    removeAttribute: () => { hidden = false }
  }
  const document = { querySelector: selector => selector === '.cookies' || (selector === '.cookies[hidden="until-found"]' && hidden) ? message : null, addEventListener: (name, fn) => { listeners[name] = fn } }
  const api = vm.runInNewContext(source + '\n;({ initCookies })', {
    document, window, params: {}, cookiesLegal: legal,
    googleAnalytics: () => { analyticsCalls++ },
    hasConsent: (type, enabled) => hasConsent(type, enabled, storage),
    CustomEvent: class { constructor (type, options) { this.type = type; this.detail = options?.detail } },
    setTimeout: (callback, delay) => deferred ? timers.push({ callback, delay }) : callback()
  })
  return {
    init: api.initCookies, values, events, inputs,
    flush: () => timers.splice(0).sort((a, b) => a.delay - b.delay).forEach(timer => timer.callback()),
    analyticsCalls: () => analyticsCalls,
    visible: () => !hidden && !classes.has('cookies--hide'),
    toggle () {
      listeners.click({ target: { closest: selector => selector === '.cookies__toggle' ? {} : null } })
    },
    click (action) {
      const button = { classList: { contains: name => name === `cookies__btn--${action}` } }
      listeners.click({ target: { closest: selector => selector === '.cookies__btn' ? button : null } })
    }
  }
}

for (const failure of ['getter', 'read', 'write', 'partial', 'remove']) {
  test(`consent storage ${failure} failure retains the prompt without grants or completion`, () => {
    const initial = failure === 'remove' ? { controlcookie: '1', controlcookiemedia: '1', controlcookieanalytics: 'true' } : {}
    const ui = fixture({ failure, initial })
    assert.doesNotThrow(ui.init)
    assert.doesNotThrow(() => ui.click(failure === 'remove' ? 'reject' : 'all'))
    assert.equal(ui.visible(), true)
    assert.deepEqual(ui.events, [])
    assert.equal(ui.analyticsCalls(), 0)
    assert.deepEqual(Object.fromEntries(ui.values), initial, 'partial writes roll back when storage allows it')
  })
}

test('successful consent save and rejection persist before publishing effective consent', () => {
  const ui = fixture()
  ui.init()
  ui.click('all')
  assert.equal(ui.visible(), false)
  assert.equal(ui.values.get('controlcookie'), '1')
  assert.deepEqual(ui.events.map(event => event.type), ['cookies:media', 'cookies:analytics', 'cookies:changed'])
  assert.equal(ui.events.at(-1).detail.media, true)
  assert.equal(ui.analyticsCalls(), 1)
  ui.events.length = 0
  ui.click('reject')
  assert.equal(ui.values.get('controlcookie'), '2')
  assert.equal(ui.values.has('controlcookiemedia'), false)
  assert.deepEqual(ui.events.map(event => event.type), ['cookies:changed'])
  assert.equal(ui.events[0].detail.media, false)
})

test('disabled consent enforcement preserves bypass even when persistence fails', () => {
  const ui = fixture({ failure: 'write', legal: false })
  ui.init()
  ui.click('all')
  assert.equal(hasConsent('media', false, { getItem () { throw new Error('blocked') } }), true)
  assert.deepEqual(ui.events, [])
})

test('missing cookie banner remains a safe no-op without accessing storage', () => {
  const window = {}
  Object.defineProperty(window, 'localStorage', { get () { throw new Error('must not be accessed') } })
  assert.doesNotThrow(() => vm.runInNewContext(source + '\ninitCookies()', { document: { querySelector: () => null }, window, params: {}, cookiesLegal: false }))
})


test('rejection retains disabled essential checkboxes and does not grant optional categories', () => {
  const ui = fixture()
  ui.inputs.push({ value: 'essential', checked: true, disabled: true })
  ui.init()
  ui.click('reject')
  assert.equal(ui.values.get('controlcookieessential'), '1')
  assert.equal(ui.values.has('controlcookiemedia'), false)
  assert.equal(ui.inputs.at(-1).checked, true)
  assert.deepEqual(ui.events.map(event => event.type), ['cookies:essential', 'cookies:changed'])
  assert.equal(ui.analyticsCalls(), 0)
})


test('failed persistence reopens the prompt despite a pending initial close timer', () => {
  const ui = fixture({ failure: 'write', initial: { controlcookie: '1' }, deferred: true })
  ui.init()
  ui.click('all')
  ui.flush()
  assert.equal(ui.visible(), true, 'the stale initial close cannot hide the failure prompt')
  assert.deepEqual(ui.events, [])
})


test('closing after reopening ignores the stale open animation timer', () => {
  const ui = fixture({ initial: { controlcookie: '1' }, deferred: true })
  ui.init()
  ui.flush()
  ui.toggle()
  ui.click('reject')
  ui.flush()
  assert.equal(ui.visible(), false)
})
