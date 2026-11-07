import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { PREVIEW_CHANNEL, PREVIEW_TOKEN_PARAM, isPreviewUpdate, validPreviewData, safeImageURL, previewFieldPath } from '../../assets/js/cms/live-preview-protocol.js'

const source = fs.readFileSync(new URL('../../assets/js/preview-receiver.js', import.meta.url), 'utf8').replace(/^import .*\n/gm, '').replace(/^export /gm, '')

test('structural activation preserves Hugo DOM while protecting navigation and resolving field focus', () => {
  const origin = 'http://127.0.0.1:13214'
  const token = '12345678-1234-1234-1234-123456789abc'
  const events = {}
  const reports = []
  const capture = {}
  let mutations = 0
  const node = { dataset: { sansoulBinding: 'p0' }, replaceChildren: () => { mutations++ } }
  const manifest = { bindings: [{ id: 'p0', path: 'prototype_copy' }] }
  const target = {
    location: { origin, search: `?${PREVIEW_TOKEN_PARAM}=${token}` },
    document: { getElementById: () => ({ textContent: JSON.stringify(manifest) }), querySelectorAll: () => [node], addEventListener: (name, fn, option) => { events[name] = fn; capture[name] = option } },
    addEventListener: (name, fn) => { events[name] = fn }
  }
  const cms = { __sansoulPreviewSessions: new Map([[token, { current: { contentWindow: target } }]]) }
  target.parent = { parent: cms, postMessage: message => reports.push(message) }
  const context = { URLSearchParams, PREVIEW_CHANNEL, PREVIEW_TOKEN_PARAM, isPreviewUpdate, validPreviewData, safeImageURL, previewFieldPath, console, renderPreviewMarkdown: () => { throw new Error('Structural activation must not render DOM') } }
  vm.runInNewContext(source + '\nthis.start = initPreviewReceiver', context)
  context.start(target)
  let prevented = 0
  let stopped = 0
  const event = { source: cms, origin, data: { channel: PREVIEW_CHANNEL, type: 'activate-structural', token, draft: { prototype_copy: 'Compiled through get/remap' } } }
  events.message({ ...event, origin: 'https://outside.example' })
  events.submit({ preventDefault: () => { prevented++ } })
  assert.equal(prevented, 0)
  events.message(event)
  events.submit({ preventDefault: () => { prevented++ }, stopImmediatePropagation: () => { stopped++ } })
  events.click({ target: { closest: selector => selector === '[data-sansoul-binding]' ? node : selector.includes('[data-h]') ? {} : null }, preventDefault: () => { prevented++ }, stopImmediatePropagation: () => { stopped++ } })
  assert.equal(capture.click, true)
  assert.equal(capture.auxclick, true)
  assert.equal(capture.submit, true)
  assert.equal(stopped, 2)
  assert.equal(prevented, 2)
  assert.equal(mutations, 0)
  assert.deepEqual(reports.map(item => item.type), ['ready', 'structural-active', 'focus'])
  assert.equal(reports.at(-1).path, 'prototype_copy')
})
