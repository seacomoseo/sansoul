import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCMSConfig } from '../check-cms-config.js'

const base = fields => ({ i18n: { default_locale: 'es', locales: ['es'] }, collections: [{ name: 'pages', sortable_fields: { fields: ['title'] }, fields }] })
test('CMS schema rejects nested field arrays and duplicate siblings before opening the editor', () => {
  assert.throws(() => validateCMSConfig(base([{ name: 'tpl', fields: [[{ name: 'title' }]] }])), /Invalid CMS field/)
  assert.throws(() => validateCMSConfig(base([{ name: 'title' }, { name: 'title' }])), /Duplicate CMS field/)
  assert.equal(validateCMSConfig(base([{ name: 'tpl', fields: [{ name: 'title' }, { name: 'box', fields: [{ name: 'title' }] }] }])), 'es')
})

test('CMS object fields require a child schema before opening Sveltia', () => {
  assert.throws(() => validateCMSConfig(base([{ name: 'footer', widget: 'object' }])), /requires fields or types/)
  assert.equal(validateCMSConfig({ ...base([]), _anchors: [{ fragment: { widget: 'object' } }] }), 'es')
  assert.equal(validateCMSConfig(base([{ name: 'footer', widget: 'object', fields: [{ name: 'md', widget: 'string' }] }])), 'es')
})

test('CMS select fields require effective non-empty options', () => {
  for (const options of [undefined, []]) assert.throws(() => validateCMSConfig(base([{ name: 'choice', widget: 'select', options }])), /requires non-empty options/)
  assert.equal(validateCMSConfig(base([{ name: 'choice', widget: 'select', options: ['text'] }])), 'es')
})
