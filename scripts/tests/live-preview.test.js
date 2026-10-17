import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import vm from 'node:vm'
import { PREVIEW_CHANNEL, PREVIEW_TOKEN_PARAM, boundedPreviewValue, createPreviewData, isPreviewUpdate, safeImageURL, validPreviewData, resolvePreviewTarget, previewFieldPath } from '../../assets/js/cms/live-preview-protocol.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const origin = 'https://example.com'
const receiverSource = fs.readFileSync(path.join(root, 'assets/js/preview-receiver.js'), 'utf8').replace(/^import .*\n/gm, '').replace(/^export /gm, '')
const bindingContext = { previewFieldPath }
vm.runInNewContext(receiverSource + '\nthis.resolve = resolvePreviewBinding', bindingContext)

test('receiver only accepts exact CMS grandparent, origin and iframe token', () => {
  const cms = {}
  const sandbox = { parent: cms }
  const receiver = { parent: sandbox, location: { origin } }
  const event = { origin, source: cms, data: { channel: PREVIEW_CHANNEL, type: 'update', token: 'nonce' } }
  assert.equal(isPreviewUpdate(event, receiver, 'nonce'), true)
  for (const invalid of [{ ...event, source: sandbox }, { ...event, source: {} }, { ...event, origin: 'https://attacker.test' }, { ...event, data: { ...event.data, token: 'wrong' } }, { ...event, data: { ...event.data, type: 'ready' } }, { ...event, data: null }]) assert.equal(isPreviewUpdate(invalid, receiver, 'nonce'), false)
})

test('remote image/video and own asset blobs work without executable URL schemes', () => {
  for (const value of ['/u/a.png', 'https://remote.test/a.png', 'http://remote.test/video.mp4', '//remote.test/a.svg', 'blob:' + origin + '/1234']) assert.ok(safeImageURL(value, origin))
  for (const value of ['javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'blob:https://remote.test/123', null, '']) assert.equal(safeImageURL(value, origin), '')
})

test('recursive draft data supports arbitrary collection fields and resolves media assets', () => {
  const draft = { title: '<img onerror=alert(1)>', custom: { price: 10, enabled: false }, tpl: { sections: [{ params: { boxes: [{ md: '![X](/u/b.png)', img: '/u/a.png' }] } }] } }
  const payload = createPreviewData(draft, value => ({ url: 'blob:' + origin + value }), origin)
  assert.equal(payload.draft.custom.enabled, false)
  assert.equal(payload.draft.tpl.sections[0].params.boxes[0].img, '/u/a.png')
  assert.equal(payload.assets['/u/b.png'], 'blob:' + origin + '/u/b.png')
  assert.equal(validPreviewData(payload, origin), true)
  assert.equal(draft.tpl.sections[0].params.boxes[0].img, '/u/a.png')
})

test('malformed, oversized, deeply nested and prototype-polluting payloads fail closed', () => {
  const valid = createPreviewData({ title: 'Title' }, null, origin)
  let nested = 'x'
  for (let i = 0; i < 30; i++) nested = { nested }
  for (const invalid of [null, {}, { ...valid, draft: [] }, { ...valid, draft: nested }, { ...valid, draft: { title: 'x'.repeat(100001) } }, { ...valid, draft: { values: new Array(501).fill('x') } }, { ...valid, assets: { x: 'javascript:alert(1)' } }, { ...valid, draft: JSON.parse('{"__proto__":{"polluted":true}}') }]) assert.equal(validPreviewData(invalid, origin), false)
  assert.throws(() => boundedPreviewValue({ bad: () => {} }))
  assert.equal({}.polluted, undefined)
})

test('entry lookup uses actual language/permalink and explicit new-entry prototypes', () => {
  const index = { defaultLang: 'es', entries: { 'content/blog/a.en.md': { url: '/en/custom-path/', type: 'blog', lang: 'en' } }, prototypes: { 'blog:es': '/noticias/modelo/', 'blog:en': '/en/story/' } }
  assert.equal(resolvePreviewTarget(index, 'content/blog/a.en.md', 'blog', 'en').url, '/en/custom-path/')
  assert.equal(resolvePreviewTarget(index, '', 'blog', 'en').prototype, true)
  assert.equal(resolvePreviewTarget(index, '', 'blog', 'en').url, '/en/story/')
  assert.equal(resolvePreviewTarget(index, '', 'unknown', 'es'), null)
})

test('registration covers all content collections and leaves CMS init to the configuration transaction', () => {
  const source = fs.readFileSync(path.join(root, 'assets/js/cms/live-preview.js'), 'utf8').replace(/^import .*\n/gm, '').replace(/^export /gm, '')
  const registrations = []
  const order = []
  const window = {
    location: new URL(origin + '/admin/'),
    document: { documentElement: { dataset: {} }, getElementById: () => ({ textContent: JSON.stringify({ defaultLang: 'es', entries: { 'content/blog/a.es.md': { url: '/a/', type: 'blog' }, 'content/single/home.es.md': { url: '/', type: 'single' } }, prototypes: {} }) }) },
    crypto: { randomUUID: () => '12345678-1234-1234-1234-123456789abc' },
    __sansoulPreviewManualInit: true,
    CMS: {
      React: { useEffect: () => {}, useRef: current => ({ current }), useState: current => [current, () => {}], createElement: (type, props, ...children) => ({ type, props, children }) },
      init: () => order.push('init'),
      registerPreviewTemplate: (name, component) => { order.push('register'); registrations.push({ name, component }) }
    }
  }
  vm.runInNewContext(source + '\ninitLivePreview(); initLivePreview()', { window, console, URL, livePreview: true, PREVIEW_CHANNEL, PREVIEW_TOKEN_PARAM, createPreviewData, resolvePreviewTarget, previewFieldPath })
  assert.deepEqual(registrations.map(item => item.name), ['blog', 'single'])
  assert.deepEqual(order, ['register', 'register'])
  const props = { entry: { get: key => ({ path: 'content/blog/a.es.md', collection: 'blog', data: { toJS: () => ({ title: 'Draft' }) } })[key] }, window: {} }
  const tree = registrations[0].component(props)
  assert.match(tree.children[1].props.src, /\/a\/\?sansoul-preview-token=/)
})

test('field focus retries the documented leaf path after lazy list mounting', async () => {
  const source = fs.readFileSync(path.join(root, 'assets/js/cms/live-preview.js'), 'utf8').replace(/^import .*\n/gm, '').replace(/^export /gm, '')
  const context = { previewFieldPath }
  vm.runInNewContext(source + '\nthis.focus = focusPreviewField', context)
  const clicked = []
  const editor = { activeElement: null }
  const document = { defaultView: { parent: { document: editor }, setTimeout: callback => callback() }, body: { append: node => { assert.equal(node.type, 'button') } }, createElement: () => ({ dataset: {}, style: {}, click () {
    clicked.push(this.dataset.keyPath)
    if (clicked.length === 3) editor.activeElement = { closest: () => ({ getAttribute: () => this.dataset.keyPath }) }
  }, remove () {} }) }
  assert.equal(await context.focus(document, 'tpl.sections.1.params.boxes.0.md'), true)
  assert.deepEqual(clicked, new Array(3).fill('tpl.sections.1.params.boxes.0.md'))
  assert.equal(await context.focus(document, '__proto__.x'), false)
  let release
  document.defaultView.setTimeout = callback => { release = callback }
  const old = context.focus(document, 'old.field')
  const releaseOld = release
  const latest = context.focus(document, 'new.field')
  const releaseLatest = release
  editor.activeElement = { closest: () => ({ getAttribute: () => 'new.field' }) }
  releaseOld()
  releaseLatest()
  assert.equal(await old, false)
  assert.equal(await latest, true)
})

test('receiver preserves ordered get overrides, global fallback and the effective focus path', () => {
  const binding = { value: 'Static fallback', sources: [{ path: 'title', global: true }, { path: 'h1', global: true }] }
  for (const empty of [undefined, '', false, 0, [], {}]) {
    const resolved = bindingContext.resolve(binding, { title: 'Draft title', h1: empty })
    assert.equal(resolved.value, 'Draft title')
    assert.equal(resolved.path, 'title')
  }
  assert.equal(bindingContext.resolve(binding, { title: 'Draft title', h1: 'Override' }).path, 'h1')
  assert.equal(bindingContext.resolve(binding, { title: '', h1: false }, { title: 'Global title' }).value, 'Global title')
  assert.equal(bindingContext.resolve(binding, {}, {}).value, 'Static fallback')
  assert.equal(bindingContext.resolve({ ...binding, sources: [...binding.sources, { value: false }] }, { title: 'Draft' }).value, 'Draft')
  const content = bindingContext.resolve({ path: 'body' }, { body: '**Unsaved body**' })
  assert.equal(content.value, '**Unsaved body**')
  assert.equal(content.path, 'body')
  const inherited = { preserve: true, sources: [{ path: 'footer.md', global: true }] }
  assert.equal(bindingContext.resolve(inherited, {}).preserve, true)
  assert.equal(bindingContext.resolve(inherited, { footer: { md: 'Draft footer' } }).preserve, false)
  assert.equal(bindingContext.resolve(inherited, { footer: { md: '' } }).preserve, true)
})

test('Hugo emits direct/get field origins without rendering false branches', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-cms-bindings-'))
  const write = (name, contents) => { const target = path.join(directory, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, contents) }
  try {
    write('hugo.yml', 'baseURL: https://example.com/\ndisableKinds: [taxonomy, term]\n')
    for (const name of ['preview/annotate', 'preview/attrs', 'func/get-params-merge', 'func/get-param', 'func/index-split', 'func/if']) write(`layouts/partials/${name}.html`, fs.readFileSync(path.join(root, `layouts/partials/${name}.html`), 'utf8'))
    write('layouts/index.html', `{{ $x := partial "preview/annotate" (dict "value" .Params.tpl "path" "tpl") }}{{ $box := index (index $x.sections 0).params.boxes 0 }}{{ $box = partial "func/get-params-merge" (dict "Page" . "item" $box) }}<h1{{ partial "preview/attrs" (dict "item" $box "field" "title" "kind" "inline") }}>{{ $box.title }}</h1>
{{ page.Store.Get "sansoul.preview.bindings" | jsonify | safeHTML }}
{{ partial "preview/annotate" (dict "value" (dict "md" "{{% content %}}") "path" "") | jsonify | safeHTML }}
{{ partial "preview/annotate" (dict "value" (dict "md" "{{% unsupported %}}") "path" "") | jsonify | safeHTML }}
{{ partial "preview/annotate" (dict "value" (dict "md" "{{< internal-link index >}}" "get" (slice (dict "from" "footer.md" "to" "md"))) "path" "") | jsonify | safeHTML }}
{{ partial "preview/annotate" (dict "value" (dict "md" "Hello {{ get org.name }}") "path" "") | jsonify | safeHTML }}`)
    write('content/_index.md', '---\ntitle: Main title\ntpl:\n  sections:\n  - params:\n      boxes:\n      - title: Box\n        md: Content\n        get:\n        - from: title\n          to: title\n        - from: h1\n          to: title\n---\n')
    const result = spawnSync('hugo', [], { cwd: directory, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    const output = fs.readFileSync(path.join(directory, 'public/index.html'), 'utf8')
    assert.match(output, /data-sansoul-binding="p0"/)
    assert.match(output, /Main title/)
    assert.match(output, /"path":"title"/)
    assert.match(output, /"global":true/)
    const lines = output.trim().split('\n')
    const [binding] = JSON.parse(lines[1])
    assert.equal(binding.sources.length, 2)
    assert.equal(bindingContext.resolve(binding, { title: 'Edited title' }).value, 'Edited title')
    assert.equal(bindingContext.resolve(binding, { title: 'Edited title' }).path, 'title')
    assert.equal(bindingContext.resolve(binding, { title: 'Edited title', h1: 'Edited override' }).value, 'Edited override')
    assert.equal(JSON.parse(lines[2])._preview.md.path, 'body')
    assert.equal(JSON.parse(lines[3])._preview, undefined)
    assert.equal(JSON.parse(lines[4])._preview.md.preserve, true)
    assert.ok(JSON.parse(lines[5])._preview.md.template64)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})
