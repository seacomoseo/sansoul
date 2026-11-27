import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

test('combined sprite image views keep their aspect ratio and never reveal a neighbour', async t => {
  if (spawnSync('hugo', ['version']).status !== 0) return t.skip('Hugo unavailable')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-combined-svg-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const write = async (name, text) => {
    const filename = path.join(root, name)
    await fs.mkdir(path.dirname(filename), { recursive: true })
    await fs.writeFile(filename, text)
  }
  for (const name of ['files/svg-combined-sprite', 'files/svg-sprite', 'func/svg-sizes', 'func/publish-content-resource']) {
    await write(`layouts/partials/${name}.html`, await fs.readFile(new URL(`../../layouts/partials/${name}.html`, import.meta.url), 'utf8'))
  }
  await write('hugo.yml', 'baseURL: https://fixture.example/\n')
  await write('content/_index.md', '---\ntitle: Home\n---\n')
  await write('assets/u/wide.svg', '<svg viewBox="0 0 120 30"><rect width="120" height="30"/></svg>')
  await write('assets/u/tall.svg', '<svg viewBox="0 0 40 80"><rect width="40" height="80"/></svg>')
  await write('layouts/index.html', `{{ $images := slice }}
{{ range slice "wide" "tall" }}{{ $images = $images | append (dict "name" . "id" . "view_id" (print "view-" .) "source" (resources.Get (print "u/" . ".svg"))) }}{{ end }}
{{ (partial "files/svg-combined-sprite" (dict "group" "fixture" "images" $images)).url }}`)
  const result = spawnSync('hugo', ['--source', root], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  const url = (await fs.readFile(path.join(root, 'public/index.html'), 'utf8')).trim()
  const sprite = await fs.readFile(path.join(root, 'public', url), 'utf8')
  const views = [...sprite.matchAll(/<view id="([^"]+)" viewBox="([^"]+)"([^>]*)>/g)].map(([, id, box, rest]) => {
    const [x, y, width, height] = box.split(/\s+/).map(Number)
    return { id, x, y, width, height, rest }
  })
  assert.deepEqual(views.map(view => [view.id, view.width, view.height]), [['view-wide', 120, 30], ['view-tall', 40, 80]])
  for (const view of views) assert.match(view.rest, /preserveAspectRatio="xMidYMid meet"/, `${view.id} letterboxes instead of stretching`)
  const [wide, tall] = views
  assert.ok(tall.x >= wide.x + wide.width, 'images own distinct horizontal bands')
  assert.ok(tall.y >= wide.y + wide.height, 'images own distinct vertical bands')
})
