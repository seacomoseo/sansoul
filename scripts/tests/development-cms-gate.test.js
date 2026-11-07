import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

test('dev omits CMS output and preview instrumentation while normal builds keep them', async t => {
  if (spawnSync('hugo', ['version']).status !== 0) return t.skip('Hugo unavailable')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-dev-cms-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const write = async (name, text) => {
    const filename = path.join(root, name)
    await fs.mkdir(path.dirname(filename), { recursive: true })
    await fs.writeFile(filename, text)
  }
  for (const name of ['preview/attrs', 'preview/live', 'files/statics', 'func/publish-content-resource']) {
    await write(`layouts/partials/${name}.html`, await fs.readFile(new URL(`../../layouts/partials/${name}.html`, import.meta.url), 'utf8'))
  }
  await write('dev.yml', await fs.readFile(new URL('../../hugo.dev.yml', import.meta.url), 'utf8'))
  await write('hugo.yml', 'baseURL: https://fixture.example/\nparams:\n  cms_enabled: true\ncascade:\n- params:\n    sentinel: kept\n')
  await write('data/config.yml', '{}\n')
  await write('data/styles.yml', '{}\n')
  await write('content/_index.md', '---\ntitle: Home\n---\n')
  await write('content/page/cms.md', '---\ntitle: CMS info\nurl: /admin/info/\n---\nInfo.\n')
  await write('layouts/_default/single.html', '{{ .Content }}')
  for (const name of ['redirects', 'llms', 'og-svgs']) await write(`layouts/partials/files/${name}.html`, 'fixture')
  await write('layouts/partials/cms/index.html', '{{ (resources.FromString "admin/config.fixture.yml" "fixture: true").Publish }}CMS editor')
  await write('layouts/partials/styles.html', '{{ return (resources.FromString "preview.css" "body{}") }}')
  await write('assets/js/preview-receiver.js', 'export function receiver () {}')
  await write('assets/js/preview-bootstrap.js', '/* bootstrap fixture */')
  await write('layouts/index.html', `{{ partial "files/statics" . }}<html><body><h1>{{ .Title }} {{ .Params.sentinel }}</h1><div{{ partial "preview/attrs" (dict "item" (dict "_preview" (dict "img" (dict "path" "img"))) "field" "img" "kind" "image") }}></div>{{ partial "preview/live" . }}</body></html>`)
  for (const disabled of [true, false]) {
    const destination = disabled ? 'public-dev' : 'public-build'
    const built = spawnSync('hugo', ['--source', root, '--destination', destination, '--config', disabled ? 'hugo.yml,dev.yml' : 'hugo.yml'], { encoding: 'utf8' })
    assert.equal(built.status, 0, built.stdout + built.stderr)
    const output = path.join(root, destination)
    const html = await fs.readFile(path.join(output, 'index.html'), 'utf8')
    assert.match(html, /<h1>Home kept<\/h1>/)
    const present = async filename => fs.stat(path.join(output, filename)).then(() => true, () => false)
    for (const filename of ['admin/index.html', 'admin/config.fixture.yml']) assert.equal(await present(filename), !disabled, filename)
    assert.equal(await present('admin/info/index.html'), true, 'source pages retain project cascades')
    if (disabled) {
      assert.doesNotMatch(html, /data-sansoul-binding|sansoul-preview-manifest|data-sansoul-preview-receiver/)
      assert.equal(await present('js'), false)
      assert.equal(await present('preview.css'), false)
    } else {
      assert.match(html, /data-sansoul-binding/)
      assert.match(html, /sansoul-preview-manifest/)
      assert.match(html, /data-sansoul-preview-receiver/)
    }
  }
})
