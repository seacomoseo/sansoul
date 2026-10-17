import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

test('Hugo renders range and legacy radio fields, accessible labels, external gallery and inclusive list dates', async t => {
  if (spawnSync('hugo', ['version']).status !== 0) return t.skip('Hugo unavailable')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-authoring-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  for (const folder of ['content/product', 'data/types', 'layouts']) await fs.mkdir(path.join(root, folder), { recursive: true })
  await fs.cp(new URL('../../layouts/partials', import.meta.url), path.join(root, 'layouts/partials'), { recursive: true })
  await fs.cp(new URL('../../i18n', import.meta.url), path.join(root, 'i18n'), { recursive: true })
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\nparams:\n  currency: EUR\n')
  for (const type of ['all', 'product']) await fs.writeFile(path.join(root, `data/types/${type}.yml`), 'tpl:\n  list: {}\n')
  await fs.writeFile(path.join(root, 'layouts/partials/icon.html'), '{{ return "" }}')
  for (const [name, date] of [['before', '2023-04-30'], ['start', '2023-05-01'], ['middle', '2023-08-01'], ['end', '2023-11-01'], ['after', '2023-11-02']]) {
    await fs.writeFile(path.join(root, `content/product/${name}.md`), `---\ntitle: ${name}\ndate: ${date}\nsum: Test\n---\n`)
  }
  await fs.writeFile(path.join(root, 'layouts/index.html'), `{{ $list := partial "blocks/list" (dict "level" 1 "list" (dict "type" "product" "date" "2023-05-01" "end" "2023-11-01")) }}
<script id="titles" type="application/json">{{ $titles := slice }}{{ range $list.boxes }}{{ $titles = $titles | append .title }}{{ end }}{{ $titles | jsonify | safeJS }}</script>
{{ partial "blocks/gallery-item" (dict "img" "https://example.org/a.png" "url" "https://example.org/a.png" "alt" "External image") }}
{{ partial "blocks/form" (dict "Page" . "section" (dict "id" "fixture") "form" (dict "id" "fixture-form" "subject" "Test" "action" "about:blank" "mail" "info@example.com" "labels" "out") "inputs" (slice (dict "type" "range" "name" "Budget" "label" "Budget" "min" 0 "max" 100 "step" 5 "value" 0) (dict "type" "bool" "name" "Choice" "items" (slice (dict "label" "Yes") (dict "label" "No"))) (dict "type" "text" "name" "Name" "label" "Your name"))) }}`)
  const built = spawnSync('hugo', ['--source', root], { encoding: 'utf8' })
  assert.equal(built.status, 0, built.stdout + built.stderr)
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  const titles = JSON.parse(html.match(/<script id="titles" type="application\/json">(.*?)<\/script>/s)[1])
  assert.deepEqual(titles.sort(), ['end', 'middle', 'start'])
  assert.match(html, /data-lightbox="https:\/\/example.org\/a.png"/)
  assert.match(html, /aria-label="External image"/)
  const range = html.match(/<input[^>]*type="range"[^>]*>/)[0]
  for (const attr of ['min="0"', 'max="100"', 'step="5"', 'value="0"']) assert.ok(range.includes(attr), range)
  assert.match(html, /<output[^>]*for="fixture-form-field-0"[^>]*>0<\/output>/)
  assert.equal((html.match(/type="radio"/g) || []).length, 2)
  assert.match(html, /<label[^>]*for="fixture-form-field-2"/)
  assert.match(html, /<input[^>]*id="fixture-form-field-2"/)
})
