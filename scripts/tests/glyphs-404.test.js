import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

// site.Pages leaves out the 404 page, so its Material Symbols (e.g. "cancel")
// never reached the font subset and showed as their first letter (14.29.3).
test('the 404 page icons reach the shared glyph set', async t => {
  if (spawnSync('hugo', ['version']).status !== 0) return t.skip('Hugo unavailable')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-glyphs-404-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const write = async (name, text) => {
    const filename = path.join(root, name)
    await fs.mkdir(path.dirname(filename), { recursive: true })
    await fs.writeFile(filename, text)
  }
  await write('layouts/partials/files/svg-plan.html', await fs.readFile(new URL('../../layouts/partials/files/svg-plan.html', import.meta.url), 'utf8'))
  // Stubs: only the glyph union matters here; the stub prints it.
  await write('layouts/partials/files/glyphs.html', '{{ return (delimit .glyphs ",") }}')
  for (const name of ['files/svg-combined-sprite', 'files/svg-resource', 'func/svg-draw-id', 'func/svg-fragment-id', 'func/svg-namespace-ids', 'func/svg-resource-id']) {
    await write(`layouts/partials/${name}.html`, '{{ return dict }}')
  }
  await write('hugo.yml', 'baseURL: https://fixture.example/\ndisableKinds: [taxonomy, term, rss, sitemap]\n')
  await write('content/_index.md', '---\ntitle: Home\n---\n')
  const store = glyph => `{{ page.Store.Set "sansoul.output-format" "html" }}{{ page.Store.Set "sansoul.resources.html.glyphs" (slice "${glyph}") }}`
  await write('layouts/404.html', store('cancel'))
  await write('layouts/index.html', store('home') + '{{ with (templates.Defer (dict "key" "glyphs")) }}GLYPHS={{ index (partial "files/svg-plan" (dict "format" "html")) "glyphs-html" }}{{ end }}')
  const result = spawnSync('hugo', ['--source', root], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  assert.match(html, /GLYPHS=cancel,home/)
})
