import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { PREVIEW_TOKEN_PARAM } from '../../assets/js/cms/live-preview-protocol.js'

const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const bootstrap = fs.readFileSync(path.join(engine, 'assets/js/preview-bootstrap.js'), 'utf8').replace(/^import .*\n/gm, '').replace(/^export /gm, '')
const token = '12345678-1234-1234-1234-123456789abc'

test('preview bootstrap downloads the receiver only once in a tokenized same-origin frame', () => {
  const run = ({ framed = true, search = `?${PREVIEW_TOKEN_PARAM}=${token}`, source = '/nested/js/preview-receiver.abcdef012345.js', existing = false } = {}) => {
    const loaded = []
    const window = {
      parent: {},
      location: new URL(`https://fixture.example/nested/page/${search}`),
      __sansoulPreviewReceiver: existing,
      document: {
        currentScript: { dataset: { sansoulPreviewReceiver: source } },
        createElement: () => ({}),
        head: { append: script => loaded.push(script) }
      }
    }
    if (!framed) window.parent = window
    vm.runInNewContext(bootstrap + '\nloadPreviewReceiver(window)', { window, PREVIEW_TOKEN_PARAM, URL, URLSearchParams, console })
    return { loaded, window }
  }
  for (const options of [{ framed: false }, { framed: false, search: `?${PREVIEW_TOKEN_PARAM}=${token}` }, { search: '' }, { search: `?${PREVIEW_TOKEN_PARAM}=wrong` }, { source: 'https://attacker.example/receiver.js' }, { source: '' }, { existing: true }]) assert.equal(run(options).loaded.length, 0)
  const { loaded, window } = run()
  assert.equal(loaded.length, 1, 'automatic and repeated initialization share the same pending load')
  assert.equal(loaded[0].src, 'https://fixture.example/nested/js/preview-receiver.abcdef012345.js')
  assert.equal(loaded[0].defer, true)
  assert.equal(window.__sansoulPreviewLoading, true)
})

test('static cache rules use one splat and cover content-addressed batch files without caching stable library names', () => {
  const source = fs.readFileSync(path.join(engine, 'static/_headers'), 'utf8')
  const blocks = source.trim().split(/\n\s*\n/).map(block => ({ pattern: block.split('\n')[0], headers: block.split('\n').slice(1).join('\n') }))
  for (const { pattern } of blocks) assert.ok((pattern.match(/\*/g) || []).length <= 1, `Cloudflare accepts only one splat per rule: ${pattern}`)
  const matches = url => blocks.filter(({ pattern }) => new RegExp('^' + pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(url))
  for (const url of ['/js/sansoul-123456789abc/chunk-ABC123.js', '/js/sansoul-123456789abc/abc.abcdef123456.js', '/js/preview-receiver.abcdef123456.js', '/draws.abcdef123456.svg']) assert.ok(matches(url).some(block => block.headers.includes('max-age=31536000, immutable')), url)
  for (const url of ['/js/fuse.js', '/js/preview-receiver.js', '/js/simple-lightbox.min.js']) assert.equal(matches(url).length, 0, url)
})

const hasHugo = spawnSync('hugo', ['version'], { encoding: 'utf8' }).status === 0

test('real Hugo preserves CSS order, URL bases and opt-out while publishing a fingerprinted lazy preview', { skip: !hasHugo, timeout: 60000 }, () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-asset-delivery-'))
  const write = (name, text) => {
    fs.mkdirSync(path.dirname(path.join(fixture, name)), { recursive: true })
    fs.writeFileSync(path.join(fixture, name), text)
  }
  try {
    for (const name of ['files/style-links.html', 'preview/live.html', 'func/publish-content-resource.html']) write(`layouts/partials/${name}`, fs.readFileSync(path.join(engine, 'layouts/partials', name)))
    fs.cpSync(path.join(engine, 'assets/js'), path.join(fixture, 'assets/js'), { recursive: true })
    write('hugo.yml', 'baseURL: https://fixture.example/nested/\ndisableKinds: [taxonomy, term, RSS, sitemap]\n')
    write('flat.yml', 'params:\n  assets_inline_css: false\n')
    write('data/styles.yml', 'icons:\n  style: outlined\n')
    write('content/check.md', '---\ntitle: Delivery\n---\n')
    write('layouts/partials/styles.html', '{{ return (resources.FromString "css/preview.css" "body{color:black}") }}')
    write('layouts/_default/baseof.html', `{{ $sheets := slice }}
{{ range slice "first" "large" "relative" "absolute" "import" "escaped" "closing" "last" }}{{ $sheets = $sheets | append (resources.Get (print "css/" . ".css")) }}{{ end }}
<!doctype html><html><head>{{ partial "files/style-links" $sheets }}</head><body>{{ block "main" . }}{{ end }}{{ partial "preview/live" . }}</body></html>`)
    write('layouts/_default/single.html', '{{ define "main" }}Delivery{{ end }}')
    const contents = {
      first: '.same{color:red}',
      large: `.large{--token:${'x'.repeat(1024)}}`,
      relative: '.relative{background:url(../image.png)}',
      absolute: '.absolute{background:url(/image.png)}',
      import: '@import "other.css";',
      escaped: '.escaped\\:name{color:blue}',
      closing: '.closing{--token:"</style>"}',
      last: '.same{color:green}'
    }
    for (const [name, content] of Object.entries(contents)) write(`assets/css/${name}.css`, content)
    const build = flat => {
      const result = spawnSync('hugo', ['--config', flat ? 'hugo.yml,flat.yml' : 'hugo.yml', '--destination', flat ? 'public-flat' : 'public-inline'], { cwd: fixture, encoding: 'utf8', timeout: 30000 })
      assert.equal(result.status, 0, result.stdout + result.stderr)
      return fs.readFileSync(path.join(fixture, flat ? 'public-flat' : 'public-inline', 'check/index.html'), 'utf8')
    }
    const inline = build(false)
    const flat = build(true)
    const ordered = html => [...html.matchAll(/<style data-sansoul-css="([^"]+)">([^]*?)<\/style>|<link rel="stylesheet" href="([^"]+)">/g)].map(match => ({ url: match[1] || match[3], inline: Boolean(match[1]), content: match[2] || contents[path.basename(match[3], '.css')] }))
    const segments = ordered(inline)
    assert.deepEqual(segments.map(item => item.inline), [true, false, false, false, false, false, false, true])
    assert.deepEqual(segments.map(item => item.url), Object.keys(contents).map(name => `/nested/css/${name}.css`))
    assert.equal(segments.map(item => item.content).join(''), Object.values(contents).join(''), 'the exact authored cascade remains in its original order')
    assert.equal(ordered(flat).filter(item => item.inline).length, 0)
    assert.equal(ordered(flat).length, 8)
    assert.doesNotMatch(inline, /<script src="[^"]*preview-receiver/)
    const receiver = inline.match(/data-sansoul-preview-receiver="([^"]+)"/)[1]
    assert.match(receiver, /^\/nested\/js\/preview-receiver\.[a-f0-9]{12}\.js$/)
    assert.ok(fs.existsSync(path.join(fixture, 'public-inline', receiver.replace('/nested/', ''))))
    assert.match(inline, /sansoul-preview-token/)
    assert.match(inline, /id="sansoul-preview-manifest"/)
    assert.equal(fs.existsSync(path.join(fixture, 'public-inline/js/preview-receiver.js')), false, 'there is no stable receiver alias requiring revalidation')
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})
