import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

test('remote image presentation dimensions never become invented intrinsic schema facts', async t => {
  if (spawnSync('hugo', ['version']).status !== 0) return t.skip('Hugo unavailable')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-remote-image-schema-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'layouts'), { recursive: true })
  await fs.cp(path.join(engine, 'layouts/partials'), path.join(root, 'layouts/partials'), { recursive: true })
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\n')
  await fs.writeFile(path.join(root, 'layouts/index.html'), `{{ range slice (dict "width" 360 "height" 220) dict }}{{ partial "media/out-img" (dict "img" "https://unreachable.invalid/photo.jpg" "alt" "Accurate caption" "dimensions" . "vid" dict) }}{{ end }}`)
  const built = spawnSync('hugo', ['--source', root], { encoding: 'utf8' })
  assert.equal(built.status, 0, built.stdout + built.stderr)
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  assert.match(html, /<img[^>]*height="220"[^>]*width="360"/)
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(match => JSON.parse(match[1]))
  assert.equal(schemas.length, 2)
  for (const schema of schemas) {
    assert.equal(schema['@type'], 'ImageObject')
    assert.equal(schema.url, 'https://unreachable.invalid/photo.jpg')
    assert.equal(schema.contentUrl, schema.url)
    assert.equal(schema.caption, 'Accurate caption')
    assert.equal(schema.width, undefined)
    assert.equal(schema.height, undefined)
  }
})
