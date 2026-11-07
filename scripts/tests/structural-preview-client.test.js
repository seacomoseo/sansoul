import test from 'node:test'
import assert from 'node:assert/strict'
import { readStructuralPreviewConfig, resolveStructuralTarget, serializeStructuralDraft, createStructuralPreviewClient } from '../../assets/js/cms/structural-preview.js'
import { createGroupCodec } from '../../assets/js/cms/format-codec.js'

const origin = 'http://127.0.0.1:1313'
const config = { endpoint: origin + '/__sansoul/structural/draft', token: 'local-token' }
const wait = () => new Promise(resolve => setTimeout(resolve, 15))

test('local mode requires valid same-origin configuration and is absent on hosted CMS', () => {
  assert.equal(readStructuralPreviewConfig({}, origin), null)
  for (const value of [{ endpoint: 'https://other.test/draft', token: 'x' }, { endpoint: '/draft', token: '' }, {}]) assert.equal(readStructuralPreviewConfig({ querySelector: () => ({ content: JSON.stringify(value) }) }, origin), null)
  assert.deepEqual(readStructuralPreviewConfig({ querySelector: () => ({ content: JSON.stringify(config) }) }, origin), config)
})

test('new content uses its own stable temporary path and locale without borrowing a page', () => {
  const options = { collection: 'articles', config: { collections: [{ name: 'articles', folder: 'content/blog' }] }, lang: 'es', id: '12345678-1234-1234-1234-123456789abc' }
  const target = resolveStructuralTarget(options)
  assert.equal(target, 'content/blog/cms-preview-12345678-1234-1234-1234-123456789abc.es.md')
  assert.equal(resolveStructuralTarget(options), target)
  assert.ok(resolveStructuralTarget({ ...options, lang: 'en' }).endsWith('.en.md'))
  assert.equal(resolveStructuralTarget({ path: 'content/blog/existing.es.md' }), 'content/blog/existing.es.md')
  for (const change of [{ collection: 'unknown' }, { lang: '../es' }, { id: '../file' }, { config: { collections: [{ name: 'articles', folder: 'data/blog' }] } }]) assert.throws(() => resolveStructuralTarget({ ...options, ...change }), /colección nueva/)
})

test('structural source keeps full composition, explicit empty/false/null, unknown fields and Markdown body', () => {
  const data = { title: 'Draft', unknown: { empty: '', disabled: false, nil: null }, tpl: { sections: [{ if: 'price', get: ['title'], remap: { from: 'price', to: 'label' } }] }, body: '# Body\n\nText  \n' }
  let flattened = false
  const source = serializeStructuralDraft({ virtual: data }, { target: 'content/blog/draft.es.md', collection: 'blog', groups: { flatten: (value, type, path) => { assert.equal(type, 'blog'); assert.equal(path, 'content/blog/draft.es.md'); flattened = true; return value.virtual } } })
  assert.equal(flattened, true)
  assert.deepEqual(createGroupCodec({ format: 'frontmatter' }).fromFile(source), data)
  for (const target of ['', '../draft.md', 'content/../draft.md', 'content/a.txt', 'content/a\\b.md']) assert.throws(() => serializeStructuralDraft(data, { target }))
  assert.doesNotThrow(() => serializeStructuralDraft({ img: '/u/existing.png' }, { target: 'content/a.md', getAsset: () => ({ url: 'blob:' + origin + '/x' }) }))
  assert.throws(() => serializeStructuralDraft({ img: 'blob:' + origin + '/new' }, { target: 'content/a.md' }), /Guarda primero/)
})

test('debounce sends only latest source with bearer token and cancels superseded transport', async () => {
  const requests = []
  const results = []
  const client = createStructuralPreviewClient({ config, origin, delay: 1, fetcher: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })), onResult: result => results.push(result) })
  client.update({ target: 'content/a.md', markdown: 'first' })
  client.update({ target: 'content/a.md', markdown: 'second' })
  await wait()
  assert.equal(requests.length, 1)
  assert.equal(requests[0].options.headers.Authorization, 'Bearer local-token')
  assert.equal(JSON.parse(requests[0].options.body).markdown, 'second')
  client.update({ target: 'content/a.md', markdown: 'third' })
  assert.equal(requests[0].options.signal.aborted, true)
  await wait()
  requests[1].resolve({ ok: true, json: async () => ({ url: '/draft/3/', generation: 3 }) })
  await wait()
  requests[0].resolve({ ok: true, json: async () => ({ url: '/draft/2/', generation: 2 }) })
  await wait()
  assert.equal(results.length, 1)
  assert.equal(results[0].generation, 3)
  client.dispose()
})

test('failures and superseded compilations retain stale status, unsafe URLs never render', async () => {
  const states = []
  let response = { status: 409 }
  let rendered = 0
  const client = createStructuralPreviewClient({ config, origin, delay: 0, fetcher: async () => response, onStatus: (...state) => states.push(state), onResult: () => { rendered++ } })
  client.update({}); await wait()
  assert.equal(states.at(-1)[0], 'stale')
  response = { ok: true, json: async () => ({ url: 'https://attacker.test/', generation: 1 }) }
  client.update({}); await wait()
  assert.equal(states.at(-1)[0], 'error')
  assert.equal(rendered, 0)
  client.cancel()
  response = { ok: true, json: async () => ({ url: '/valid/', generation: 2 }) }
  client.update({}); await wait()
  assert.equal(rendered, 1)
  client.dispose()
  client.update({}); await wait()
  assert.equal(rendered, 1)
})

test('local CMS registers an empty content collection without a published prototype', async () => {
  const { readFile } = await import('node:fs/promises')
  const vm = await import('node:vm')
  const source = (await readFile(new URL('../../assets/js/cms/live-preview.js', import.meta.url), 'utf8')).replace(/^import .*\n/gm, '').replace(/^export /gm, '')
  const registrations = []
  const window = { location: new URL(origin + '/admin/'), document: { documentElement: { dataset: {} }, querySelector: () => ({ content: JSON.stringify(config) }), getElementById: () => null }, CMS: { React: { useEffect () {}, createElement () {} }, registerPreviewTemplate: (name, component) => registrations.push([name, component.name]) } }
  vm.runInNewContext(source + '\ninitLivePreview(groups)', { window, livePreview: true, readStructuralPreviewConfig, groups: { config: { collections: [{ name: 'empty', folder: 'content/empty' }, { name: 'settings', folder: 'data', extension: 'yml' }] } } })
  assert.deepEqual(registrations, [['empty', 'StructuralPage']])
})
