import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

test('development resolves isolated SVG files, native images and divider views without a global plan', async t => {
  if (spawnSync('hugo', ['version']).status !== 0) return t.skip('Hugo unavailable')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-dev-svg-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const write = async (name, text) => {
    const filename = path.join(root, name)
    await fs.mkdir(path.dirname(filename), { recursive: true })
    await fs.writeFile(filename, text)
  }
  for (const name of ['files/svg-deferred', 'files/svg-development', 'files/svg-resource', 'files/draws-svg', 'func/svg-fragment-id', 'func/svg-resource-id', 'func/svg-draw-id', 'func/svg-namespace-ids', 'func/publish-content-resource']) {
    await write(`layouts/partials/${name}.html`, await fs.readFile(new URL(`../../layouts/partials/${name}.html`, import.meta.url), 'utf8'))
  }
  await write('hugo.yml', 'baseURL: https://fixture.example/sub/\n')
  await write('content/_index.md', '---\ntitle: Home\n---\n')
  await write('content/other.md', '---\ntitle: Other\n---\n')
  await write('assets/u/icons/one.svg', '<svg id="shared" viewBox="0 0 10 10"><defs><linearGradient id="paint"><stop stop-color="red"/></linearGradient></defs><rect width="10" height="10" fill="url(#paint)"/></svg>')
  await write('assets/u/icons/two.svg', '<svg id="shared" viewBox="0 0 20 10"><rect width="20" height="10"><animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite"/></rect></svg>')
  await write('assets/u/dividers/curve.svg', '<svg viewBox="0 0 1024 128"><path d="M0 0H1024L512 128Z"/></svg>')
  await write('data/utilities.yml', 'divs:\n  curve:\n    size: 1\n')
  await write('layouts/partials/files/svg-plan.html', '{{ errorf "Global SVG planner must not run in development" }}')
  await write('layouts/partials/scripts.html', '{{ return (resources.FromString "fixture.js" "void 0") }}')
  await write('layouts/partials/styles.html', '{{ return (resources.FromString "fixture.css" "body{}") }}')
  await write('layouts/partials/files/style-links.html', '<style>body{}</style>')
  await write('layouts/partials/files/glyphs.html', '<style>/* local glyphs */</style>')
  const layout = `{{ page.Store.Set "sansoul.resources.html.svgs" (slice "one" "two") }}
{{ page.Store.Set "sansoul.resources.html.divs" (slice "curve" "fade") }}
{{ page.Store.Set "sansoul.resources.html.glyphs" (slice "home") }}
{{ $one := partial "func/svg-resource-id" "one" | urlize }}{{ $two := partial "func/svg-resource-id" "two" | urlize }}
{{ $html := printf "<html><head>__SANSOUL_STYLES____SANSOUL_GLYPHS__</head><body><svg><use href='__SANSOUL_SVG_%s__'/></svg><svg><use href='__SANSOUL_SVG_%s__'/></svg><img src='__SANSOUL_SVG_IMAGE_%s__'><div style='--div:url(__SANSOUL_DRAWS_curve__#div-curve-pr)'></div><script src='__SANSOUL_SCRIPTS__'></script></body></html>" $one $two $one }}
{{ partial "files/svg-deferred" (dict "html" $html "format" "html") }}`
  await write('layouts/index.html', layout)
  await write('layouts/_default/single.html', layout)
  const build = () => {
    const result = spawnSync('hugo', ['--source', root, '--environment', 'development'], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stdout + result.stderr)
  }
  build()
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  assert.doesNotMatch(html, /__SANSOUL_/)
  const uses = [...html.matchAll(/<use href='([^']+)'/g)].map(match => match[1])
  assert.equal(uses.length, 2)
  assert.notEqual(uses[0], uses[1], 'same source root ID remains isolated in distinct files')
  const resource = async url => fs.readFile(path.join(root, 'public', url.replace(/^\/sub\//, '').split('#')[0]), 'utf8')
  assert.match(uses[0], /^\/sub\/draws\/dev\/.*#shared$/)
  assert.match(await resource(uses[0]), /stop-color="red"/)
  assert.match(await resource(uses[1]), /<animate/)
  const image = html.match(/<img src='([^']+)'/)[1]
  assert.equal(image, uses[0].split('#')[0], 'native image references a complete SVG document')
  const divider = html.match(/--div:url\(([^)]+)\)/)[1]
  assert.match(await resource(divider), /<view[^>]*id="div-curve-pr"/)
  const other = await fs.readFile(path.join(root, 'public/other/index.html'), 'utf8')
  assert.ok(other.includes(uses[0]), 'pages reuse content-addressed individual assets')
  await write('assets/u/icons/one.svg', '<svg id="shared" viewBox="0 0 10 10"><rect width="10" height="10" fill="blue"/></svg>')
  build()
  const changed = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  assert.ok(!changed.includes(uses[0]), 'changed source receives a fresh URL')
  assert.ok(changed.includes(uses[1]), 'unchanged source keeps its URL')
})
