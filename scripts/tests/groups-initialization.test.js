import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { prepareFieldGroups } from '../../assets/js/cms/field-groups.js'

const source = fs.readFileSync(new URL('../../assets/js/cms/_index.js', import.meta.url), 'utf8')
  .replace(/^import .*\n/gm, '')
  .replace(/import\('\.\/([^']+)'\)/g, "loadModule('$1')")
  .split('initializeCMS().catch')[0]
const flatConfig = { collections: [{ name: 'pages', fields: [{ name: 'title', _sansoul_group: { name: 'text', label: 'Text' } }] }] }

async function initialize ({ CMS = {}, config = flatConfig, loadError, enabled = true } = {}) {
  const order = []
  const document = { documentElement: { dataset: {} } }
  let initialized
  const window = { document, __sansoulPreviewManualInit: true, CMS: { init: args => { initialized = args; order.push('init') }, registerCustomFormat: () => order.push('format'), registerEventListener: () => {}, ...CMS } }
  const context = {
    window, fieldGroups: enabled, prepareFieldGroups,
    loadFieldGroupConfig: async () => { if (loadError) throw loadError; return config },
    console: { error: () => {} },
    loadModule: async name => name === 'live-preview'
      ? { initLivePreview: groups => { assert.ok(groups.config); order.push('preview') } }
      : { initHashChange () {}, initEditorComponents () {}, initCustomFields () {} }
  }
  vm.runInNewContext(source + '\nthis.initialize = initializeCMS', context)
  await context.initialize()
  return { order, initialized, window }
}

test('config and formats are prepared before previews and the single CMS init', async () => {
  const { order, initialized } = await initialize()
  assert.deepEqual(order, ['format', 'preview', 'init'])
  assert.equal(initialized.config.load_config_file, false)
  assert.equal(initialized.config.collections[0].fields[0].name, '_sansoul_group_text')
})

test('missing custom-format API uses stripped flat config before init', async () => {
  const { order, initialized, window } = await initialize({ CMS: { registerCustomFormat: undefined } })
  assert.deepEqual(order, ['preview', 'init'])
  assert.equal(initialized.config.collections[0].fields[0].name, 'title')
  assert.equal(initialized.config.collections[0].fields[0]._sansoul_group, undefined)
  assert.equal(window.document.documentElement.dataset.sansoulFieldGroups, 'flat')
})

test('registration rejection falls back to an explicitly flat configuration', async () => {
  const { initialized } = await initialize({ CMS: { registerCustomFormat: () => { throw Error('unsupported') } } })
  assert.equal(initialized.config.collections[0].fields[0].name, 'title')
  assert.equal(initialized.config.collections[0].format, undefined)
})

test('configuration loading failure and CMS init failure never call a generic init', async () => {
  let count = 0
  await assert.rejects(initialize({ loadError: Error('offline'), CMS: { init: () => { count++ } } }), /offline/)
  assert.equal(count, 0)
  await assert.rejects(initialize({ CMS: { init: args => { count++; assert.ok(args.config); throw Error('invalid config') } } }), /invalid config/)
  assert.equal(count, 1)
})
