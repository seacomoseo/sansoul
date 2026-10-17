import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { loadResource } from '../../assets/js/load-resource.js'
import { matchesFormCondition, formFieldHasValue } from '../../assets/js/form-conditions.js'
import { hasConsent } from '../../assets/js/consent.js'

test('managed scripts and styles share pending loads, remember success and retry failures', async t => {
  const previous = globalThis.document
  const nodes = []
  class Resource extends EventTarget {
    dataset = {}
    remove () { nodes.splice(nodes.indexOf(this), 1) }
  }
  globalThis.document = {
    baseURI: 'https://fixture.example/nested/',
    querySelectorAll: () => nodes,
    createElement: () => new Resource(),
    head: { appendChild: node => nodes.push(node) }
  }
  t.after(() => { globalThis.document = previous })
  for (const type of ['script', 'style']) {
    const url = `./${type}.js`
    const first = loadResource(url, type)
    assert.equal(first, loadResource(url, type))
    nodes.at(-1).dispatchEvent(new Event('load'))
    await first
    assert.equal(nodes.at(-1).dataset.loaded, 'true')
    await loadResource(url, type)
    const failed = loadResource(`./retry-${type}`, type)
    const failure = assert.rejects(failed, /Error loading/)
    nodes.at(-1).dispatchEvent(new Event('error'))
    await failure
    const retry = loadResource(`./retry-${type}`, type)
    nodes.at(-1).dispatchEvent(new Event('load'))
    await retry
  }
})

test('conditional forms apply AND before OR and inspect every radio with the same name', () => {
  for (const [values, expected] of [[['A'], true], [['B', 'C'], true], [['B'], false], [[], false]]) {
    assert.equal(matchesFormCondition('{A} || {B} && {C}', key => values.includes(key)), expected)
  }
  assert.equal(matchesFormCondition('', () => true), false)
  const form = { querySelectorAll: () => [
    { name: 'Choice', type: 'radio', checked: false },
    { name: 'Choice', type: 'radio', checked: true },
    { name: 'Zero', type: 'range', value: '0' },
    { name: 'Disabled', type: 'text', value: 'yes', disabled: true }
  ] }
  assert.equal(formFieldHasValue(form, 'Choice'), true)
  assert.equal(formFieldHasValue(form, 'Zero'), true)
  assert.equal(formFieldHasValue(form, 'Disabled'), false)
})

test('consent treats counters and legacy true as grants and fails closed for unavailable storage', () => {
  for (const [value, expected] of [[null, false], ['false', false], ['0', false], ['1', true], ['2', true], ['true', true]]) {
    assert.equal(hasConsent('media', true, { getItem: () => value }), expected)
  }
  assert.equal(hasConsent('media', true, { getItem: () => { throw new Error('blocked') } }), false)
  assert.equal(hasConsent('media', false), true)
})

test('conditional required validation uses the checked radio rather than only the first radio', () => {
  const source = fs.readFileSync(new URL('../../assets/js/form-validate.js', import.meta.url), 'utf8').replace(/^import .+\n/gm, '').replace(/^export /gm, '')
  const required = { name: 'Details', type: 'text', tagName: 'INPUT', value: '', dataset: { reqIf: 'Choice' }, closest: () => ({ classList: { add () {} } }), classList: { contains: () => false } }
  const radios = [{ name: 'Choice', type: 'radio', checked: false }, { name: 'Choice', type: 'radio', checked: true }]
  const form = {
    querySelectorAll: selector => selector === '[data-req], [data-req-if]' ? [required] : selector === '[name]' ? radios : [],
    querySelector: () => ({ checked: true }), classList: { remove () {}, add () {} }
  }
  const api = vm.runInNewContext(source + '\n;({ formValid })', { params: {}, document: { createElement: () => ({ innerHTML: '' }) }, matchesFormCondition, formFieldHasValue, Intl })
  assert.equal(api.formValid(form).valid, false)
  radios[1].checked = false
  assert.equal(api.formValid(form).valid, true)
})

test('search accepts grouped taxonomy objects and escapes untrusted titles without HTML injection', async () => {
  const source = fs.readFileSync(new URL('../../assets/js/fixedsearch.js', import.meta.url), 'utf8')
  const listeners = {}
  const status = { textContent: '' }
  const results = { children: [], replaceChildren () { this.children = [] }, append (node) { this.children.push(node) }, querySelectorAll: () => [] }
  const input = { value: 'componentes', addEventListener: (name, fn) => { listeners[name] = fn }, focus: () => {} }
  const form = { dataset: { index: '/index.json', empty: 'No matches', error: 'Unavailable' }, classList: { remove: () => {} }, addEventListener: () => {} }
  const element = () => ({ children: [], dataset: {}, setAttribute () {}, append (node) { this.children.push(node) }, set innerHTML (text) { this.value = text } })
  class Fuse {
    constructor (records) { assert.equal(records.length, 1); assert.match(records[0].searchText, /Composition/); this.records = records }
    search () { return this.records.map(item => ({ item })) }
  }
  vm.runInNewContext(source, {
    document: { getElementById: id => ({ search__form: form, search__input: input, search__results: results, search__status: status })[id], createElement: element, addEventListener: () => {} },
    fetch: async () => ({ ok: true, json: async () => ({ blog: [{ title: '<img src=x onerror=alert(1)>', url: '/demo/', category: [{ title: 'Composition' }], lock: true }] }) }),
    Fuse, URL, location: new URL('https://fixture.example/search/'), btoa: value => Buffer.from(value).toString('base64'), console
  })
  await listeners.input()
  assert.equal(results.children.length, 1)
  const link = results.children[0].children[0].children[0]
  assert.equal(link.textContent, '<img src=x onerror=alert(1)>')
  assert.equal(link.dataset.h, Buffer.from('/demo/').toString('base64'))
  assert.equal(link.children.length, 0)
})


test('saving consent normalizes legacy grants and invalid counters without revoking acceptance', () => {
  const source = fs.readFileSync(new URL('../../assets/js/cookies.js', import.meta.url), 'utf8').replace(/^import .+\n/gm, '').replace(/^export /gm, '')
  for (const previous of ['true', 'NaN', '2']) {
    const storage = { controlcookie: previous, controlcookiemedia: previous, getItem (key) { return this[key] == null ? null : String(this[key]) }, removeItem (key) { delete this[key] } }
    const listeners = {}
    const events = []
    const checkbox = { value: 'media', checked: true }
    const message = { querySelectorAll: () => [checkbox], querySelector: () => ({ focus () {} }), classList: { add () {}, remove () {} }, setAttribute () {}, removeAttribute () {} }
    const document = { querySelector: selector => selector === '.cookies' ? message : null, addEventListener: (name, callback) => { listeners[name] = callback } }
    const api = vm.runInNewContext(source + '\n;({ initCookies })', { document, localStorage: storage, window: { localStorage: storage, dispatchEvent: event => events.push(event) }, cookiesLegal: true, params: {}, hasConsent: (type, legal) => hasConsent(type, legal, storage), setTimeout: () => {}, CustomEvent: class { constructor (type, options) { this.type = type; this.detail = options?.detail } } })
    api.initCookies()
    const button = { classList: { contains: name => name === 'cookies__btn--save' } }
    listeners.click({ target: { closest: selector => selector === '.cookies__btn' ? button : null } })
    assert.equal(hasConsent('media', true, storage), true)
    assert.equal(events.at(-1).detail.media, true)
    assert.equal(storage.controlcookiemedia, previous === '2' ? 3 : 1)
    assert.equal(storage.controlcookie, previous === '2' ? 3 : 1)
  }
})
