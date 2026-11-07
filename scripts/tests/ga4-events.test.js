import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import { ga4EventName, sendGa4Events } from '../../assets/js/ga4-event.js'
import { parseLinkMatch, formatLink, linkPattern } from '../../assets/js/cms/markdown-metadata.js'

test('analytics names validate and contact deduplicates without changing custom case', () => {
  for (const value of ['none', false, null, {}, ' bad', 'a-b', '1event', 'a'.repeat(41), 'ga_reserved', 'google_reserved', 'firebase_reserved']) assert.equal(ga4EventName(value), '')
  assert.equal(ga4EventName('Download_Asset'), 'Download_Asset')
  assert.equal(ga4EventName(true), 'contact')
  const calls = []
  globalThis.gtag = (...args) => calls.push(args)
  try {
    sendGa4Events(true, 'contact', { id: 'hero' })
    sendGa4Events(true, 'lead', { type: 'form' })
    sendGa4Events(false, 'none', {})
    sendGa4Events(true, 'none', {})
    sendGa4Events(false, 'download', {})
    sendGa4Events(true, 'contact, lead_contact,special_click,lead_contact,ga_invalid', {})
    assert.deepEqual(calls.map(call => call[1]), ['contact', 'contact', 'lead', 'contact', 'download', 'contact', 'lead_contact', 'special_click'])
  } finally { delete globalThis.gtag }
  assert.doesNotThrow(() => sendGa4Events(true, 'lead', {}))
})

test('delegated clicks preserve automatic contacts and add only requested events once', () => {
  const calls = []
  const listeners = []
  const context = vm.createContext({ sendGa4Events: (automatic, custom, details) => calls.push({ automatic: Boolean(automatic), custom, details }), document: { addEventListener: (_, fn) => listeners.push(fn) }, gtag: () => {}, atob })
  const source = fs.readFileSync(new URL('../../assets/js/ga4.js', import.meta.url), 'utf8').replace(/^import .*\n/, '').replace('export function', 'function')
  vm.runInContext(source + '\ninitGa4(); initGa4()', context)
  assert.equal(listeners.length, 1)
  const click = (href, classes, ga4) => {
    const b = { href, dataset: { ga4 }, closest: () => ({ id: 'hero' }), classList: { value: classes, contains: value => classes.split(' ').includes(value) } }
    listeners[0]({ target: { closest: () => b } })
  }
  click('tel:+341234', 'link__phone', 'lead')
  click('https://example.com/file', 'ga4', 'download')
  click('mailto:a@example.com', 'ga4', 'contact')
  assert.deepEqual(calls.map(({ automatic, custom, details }) => [automatic, custom, details.type]), [[true, 'lead', 'phone'], [false, 'download', 'custom'], [true, 'contact', 'email_send']])
  context.gtag = undefined
  click('tel:+341234', 'link__phone', 'lead')
  assert.equal(calls.length, 3)
})

test('Markdown custom event metadata round trips and invalid names remain ordinary titles', () => {
  const block = formatLink({ url: '/file', anchor: 'Download', ga4: 'Download_File, lead_contact' })
  assert.match(block, /\{ga4:Download_File,lead_contact\}/)
  assert.equal(parseLinkMatch(block.match(linkPattern)).ga4, 'Download_File,lead_contact')
  assert.equal(parseLinkMatch('[Old](/x "{ga4}")'.match(linkPattern)).ga4, 'contact')
  assert.equal(parseLinkMatch('[Bad](/x "{ga4:1bad}")'.match(linkPattern)).ga4, '')
})

test('successful forms add a custom event, while review receipts do not count as conversions', () => {
  const calls = []
  const events = []
  const source = fs.readFileSync(new URL('../../assets/js/form-send.js', import.meta.url), 'utf8')
  const body = source.slice(source.indexOf('function formSubmited ('), source.indexOf('\nfunction formSubmitError'))
  const context = vm.createContext({ sendGa4Events: (...args) => calls.push(args), document: { dispatchEvent: event => events.push(event.type) }, CustomEvent: class { constructor (type) { this.type = type } }, gtag: () => {}, atob })
  vm.runInContext(body + '\nthis.done = formSubmited', context)
  const form = { id: 'request', dataset: { ga4: 'request_quote' }, parentElement: { closest: () => ({ id: 'contact' }) } }
  context.done(form, { status: 'accepted' })
  context.done(form, { status: 'review' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], true)
  assert.equal(calls[0][1], 'request_quote')
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][2])), { id: 'contact', type: 'form', label: 'request' })
  assert.equal(events.length, 2)
  context.gtag = undefined
  context.done(form)
  assert.equal(calls.length, 1)
})

test('CMS preserves explicit GA4 none through Markdown roundtrip', () => {
  const markdown = formatLink({ url: '/file', anchor: 'File', ga4: 'none' })
  assert.match(markdown, /ga4:none/)
  assert.equal(parseLinkMatch(markdown.match(linkPattern)).ga4, 'none')
})
