import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

test('divider shortcode emits headings and shapes instead of an indented Markdown code block', async t => {
  if (spawnSync('hugo', ['version']).status !== 0) return t.skip('Hugo unavailable')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-divider-shortcode-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  for (const directory of ['content', 'data', 'layouts/shortcodes', 'layouts/partials/func', 'layouts/partials/sections']) {
    await fs.mkdir(path.join(root, directory), { recursive: true })
  }
  await fs.copyFile(new URL('../../layouts/shortcodes/dividers.html', import.meta.url), path.join(root, 'layouts/shortcodes/dividers.html'))
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\nmarkup:\n  goldmark:\n    renderer:\n      unsafe: true\n')
  await fs.writeFile(path.join(root, 'data/options.yml'), 'div: [tilt, curve, hide]\n')
  await fs.writeFile(path.join(root, 'content/_index.md'), '---\ntitle: Dividers\n---\n\nBefore.\n\n{{< dividers >}}\n\nAfter.\n')
  await fs.writeFile(path.join(root, 'layouts/index.html'), '{{ .Content }}')
  await fs.writeFile(path.join(root, 'layouts/partials/func/i18n-cms.html'), '{{ return (dict "opt-div-tilt" "Tilt" "opt-div-curve" "Curve") }}')
  await fs.writeFile(path.join(root, 'layouts/partials/sections/divider-attr.html'), '{{ return (dict "class" "div" "style" "--div: url(/divider.svg)") }}')
  await fs.copyFile(new URL('../../layouts/partials/func/attrs.html', import.meta.url), path.join(root, 'layouts/partials/func/attrs.html'))
  await fs.writeFile(path.join(root, 'layouts/partials/link.html'), '<a href="{{ .url }}">{{ .label }}</a>')
  const build = spawnSync('hugo', ['--source', root], { encoding: 'utf8' })
  assert.equal(build.status, 0, build.stdout + build.stderr)
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  assert.doesNotMatch(html, /<pre|<code|&lt;h2/)
  assert.equal((html.match(/<h2\b/g) || []).length, 2)
  assert.equal((html.match(/class="div--example div"/g) || []).length, 2)
  assert.match(html, /id="div-tilt"/)
  assert.match(html, /id="div-curve"/)
  assert.doesNotMatch(html, /id="div-hide"/)
})
