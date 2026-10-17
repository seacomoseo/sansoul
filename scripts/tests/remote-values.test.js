import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

test('remote mapping preserves zero, false and explicit empty values while defaulting missing fields', async t => {
  if (spawnSync('hugo', ['version']).status !== 0) return t.skip('Hugo unavailable')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-remote-values-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'layouts'), { recursive: true })
  await fs.mkdir(path.join(root, 'data'), { recursive: true })
  await fs.cp(new URL('../../layouts/partials', import.meta.url), path.join(root, 'layouts/partials'), { recursive: true })
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify([{ id: 'free', price: 0, enabled: false, quantity: 0, empty: '' }]))
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  t.after(() => new Promise(resolve => server.close(resolve)))
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\nsecurity:\n  http:\n    urls: ["^http://127[.]0[.]0[.]1:"]\n')
  await fs.writeFile(path.join(root, 'data/remote.json'), JSON.stringify([{ lang: 'en', src: `http://127.0.0.1:${server.address().port}/items.json`, types: [{ type: 'product', maps: [
    { from: 'id', to: 'slug' }, { to: 'price' }, { to: 'enabled' }, { to: 'quantity', def: '99', kind: 'int' }, { to: 'empty', def: 'fallback' }, { from: 'absent', to: 'nested.missing', def: '99', kind: 'int' }
  ] }] }]))
  await fs.writeFile(path.join(root, 'layouts/index.html'), '{{ partial "content-adapters/remote-pages" (dict "Lang" "en") | jsonify | safeHTML }}')
  let output = ''
  const child = spawn('hugo', ['--source', root])
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk })
  const status = await new Promise(resolve => child.on('close', resolve))
  assert.equal(status, 0, output)
  const pages = JSON.parse(await fs.readFile(path.join(root, 'public/index.html'), 'utf8'))
  assert.deepEqual(pages[0].params, { price: 0, enabled: false, quantity: 0, empty: '', nested: { missing: 99 } })
})
