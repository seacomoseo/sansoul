import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { formUsesAjax } from '../../assets/js/form-transport.js'

test('form ajax choice preserves provider defaults and explicit overrides with files', () => {
  for (const prov of ['', 'gas', 'fsc']) {
    for (const files of [false, true]) {
      const form = { dataset: { prov }, querySelector: () => files }
      assert.equal(formUsesAjax(form), prov === 'gas' || (prov === 'fsc' && !files))
      form.dataset.ajax = 'true'
      assert.equal(formUsesAjax(form), true)
      form.dataset.ajax = 'false'
      assert.equal(formUsesAjax(form), false)
    }
  }
})

test('form rendering preserves false, true and inherited ajax as distinct transport choices', async t => {
  if (spawnSync('hugo', ['version']).status !== 0) return t.skip('Hugo unavailable')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-form-transport-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'layouts'), { recursive: true })
  await fs.cp(new URL('../../layouts/partials', import.meta.url), path.join(root, 'layouts/partials'), { recursive: true })
  await fs.cp(new URL('../../i18n', import.meta.url), path.join(root, 'i18n'), { recursive: true })
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\n')
  await fs.writeFile(path.join(root, 'layouts/partials/icon.html'), '{{ return "" }}')
  await fs.writeFile(path.join(root, 'layouts/index.html'), `{{ range slice "auto" "ajax" "native" }}{{ $form := dict "id" . "subject" "Test" "action" "https://receiver.example/contact" }}{{ if ne . "auto" }}{{ $form = merge $form (dict "ajax" (eq . "ajax")) }}{{ end }}{{ partial "blocks/form" (dict "Page" $ "section" (dict "id" "fixture") "form" $form "inputs" (slice (dict "type" "text" "name" "Name"))) }}{{ end }}`)
  const result = spawnSync('hugo', ['--source', root], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  const tag = id => html.match(new RegExp(`<form[^>]*id="${id}"[^>]*>`))[0]
  assert.doesNotMatch(tag('auto'), /data-ajax/)
  assert.match(tag('ajax'), /data-ajax="true"/)
  assert.match(tag('native'), /data-ajax="false"/)
})

test('generic fetch submits once, handles HTTP failure and restores controls; native override bypasses fetch', async t => {
  const saved = new Map(['document', 'FormData', 'fetch', 'CustomEvent'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  t.after(() => {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  })
  const messages = []
  const events = []
  const classes = () => ({ values: new Set(), add (value) { this.values.add(value) } })
  class Form {
    constructor (ajax, files = false) {
      this.id = 'fixture'
      this.dataset = { ajax }
      this.button = { disabled: false }
      this.listeners = []
      this.files = files
      this.attrs = { action: btoa('https://receiver.example/contact') }
    }

    addEventListener (name, handler) { if (name === 'submit') this.listeners.push(handler) }
    getAttribute (key) { return this.attrs[key] }
    querySelectorAll () { return [] }
    querySelector (selector) {
      if (selector === '[type="file"]') return this.files
      if (selector === 'button[type="submit"]') return this.button
      return null
    }

    append (message) { messages.push(message) }
    submit () { this.navigatedTo = this.action }
    reset () { this.wasReset = true }
  }
  const forms = [new Form('true'), new Form('true', true), new Form('false')]
  globalThis.document = {
    querySelectorAll: () => forms,
    dispatchEvent: event => events.push(event.type),
    createElement: () => ({ innerHTML: '', classList: classes(), append () {} })
  }
  globalThis.FormData = class extends Map { constructor () { super([['Name', 'Example']]) } }
  globalThis.CustomEvent = class { constructor (type) { this.type = type } }
  const requests = []
  let failed = false
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    return { ok: !failed, status: failed ? 422 : 200 }
  }
  let source = await fs.readFile(new URL('../../assets/js/form-send.js', import.meta.url), 'utf8')
  source = source.replace(/^import .*\n/gm, '')
  source = `const sendGa4Events = () => {}; const formValid = () => ({valid: true}); const changeValues = () => {}; const waitCSS = fn => fn(); const params = {formSubmitSending:'Sending',formSubmitOk:'Sent',formSubmitWrong:'Error'}; const formUsesAjax = ${formUsesAjax.toString()};\n${source}`
  const { initFormSend } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
  initFormSend()
  initFormSend()
  assert.equal(forms[0].listeners.length, 1, 'reinitialization must not double-submit')
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
  const send = form => form.listeners[0]({ preventDefault () {}, target: form })
  await send(forms[0])
  await flush()
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, 'https://receiver.example/contact')
  assert.equal(requests[0].options.body, 'Name=Example')
  assert.equal(forms[0].wasReset, true)
  assert.equal(forms[0].button.disabled, false)
  assert.deepEqual(events, ['submited-fixture'])
  failed = true
  await send(forms[1])
  await flush()
  assert.ok(requests[1].options.body instanceof FormData, 'files use a multipart body')
  assert.equal(forms[1].wasReset, undefined)
  assert.equal(forms[1].dataset.sending, 'false')
  assert.equal(forms[1].button.disabled, false)
  assert.match(messages.at(-1).innerHTML, /HTTP status 422/)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  globalThis.fetch = (url, options) => {
    requests.push({ url, options })
    return new Promise(() => {})
  }
  forms[0].wasReset = false
  await send(forms[0])
  t.mock.timers.tick(60001)
  await flush()
  assert.equal(requests[2].options.signal.aborted, true)
  assert.equal(forms[0].button.disabled, false)
  assert.equal(forms[0].dataset.sending, 'false')
  assert.equal(forms[0].wasReset, false)
  assert.match(messages.at(-1).innerHTML, /Submission timed out/)
  await send(forms[2])
  assert.equal(requests.length, 3)
  assert.equal(forms[2].navigatedTo, 'https://receiver.example/contact')
})

test('concurrent initialization replays each persisted submission once', async t => {
  const saved = new Map(['document', 'localStorage', 'fetch'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  t.after(() => {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  })
  const values = new Map([['sansoul.form.pending.fixture', JSON.stringify({ submissionId: 'fixture', action: 'https://receiver.example/contact', body: 'Name=Example' })]])
  globalThis.localStorage = {
    get length () { return values.size },
    key: index => [...values.keys()][index],
    getItem: key => values.get(key),
    removeItem: key => values.delete(key)
  }
  globalThis.document = { querySelectorAll: () => [] }
  let requests = 0
  let resolveFetch
  globalThis.fetch = () => { requests++; return new Promise(resolve => { resolveFetch = resolve }) }
  let source = await fs.readFile(new URL('../../assets/js/form-send.js', import.meta.url), 'utf8')
  source = source.replace(/^import .*\n/gm, '')
  source = `const waitCSS = fn => fn(); const params = {};\n${source}`
  const { initFormSend } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
  initFormSend()
  initFormSend()
  assert.equal(requests, 1)
  resolveFetch({ ok: true, json: async () => ({ result: 'success' }) })
  for (let i = 0; i < 12; i++) await Promise.resolve()
  assert.equal(values.size, 0)
  initFormSend()
  assert.equal(requests, 1)
})
