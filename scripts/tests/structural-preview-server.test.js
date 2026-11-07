import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { markStructuralDraft, startStructuralPreviewServer } from '../structural-preview-server.js'

const project = process.env.SANSOUL_STRUCTURAL_PROJECT
async function session (service) {
  const response = await fetch(`${service.url}/admin/`)
  assert.equal(response.status, 200)
  const html = await response.text()
  const metadata = html.match(/name="sansoul-structural-preview" content="([^"]+)"/)
  assert.ok(metadata, 'Only the proxied admin has session metadata')
  return JSON.parse(metadata[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'))
}
function draft (title, enabled = false, extra = false) {
  return `---
title: ${title}
url: /persistent-structural/
prototype_enabled: ${enabled}
prototype_copy: Hugo lookup and remap
tpl:
  sections:
  - boxes:
    - title: ${title}
    - if: prototype_enabled
      get:
      - from: prototype_copy
        to: title
      remap:
      - from: title
        to: md
        copy: true
${extra ? '    - title: Added structural box\n' : ''}---
Unsaved body.
`
}

test('draft instrumentation preserves front matter formats, body, BOM and line endings', () => {
  const key = 'private_test_marker'
  for (const source of ['---\ntitle: Test\n---\nBody', '+++\r\ntitle = "Test"\r\n+++\r\nBody', '\uFEFF---\r\ntitle: Test\r\n---\r\nBody']) {
    const marked = markStructuralDraft(source, key, 'revision')
    assert.ok(marked.includes('private_test_marker'))
    assert.equal(marked.replace(/private_test_marker(?::| =) "revision"\r?\n/, ''), source)
  }
  assert.deepEqual(JSON.parse(markStructuralDraft('{"title":"Test","flag":false,"empty":null}', key, 'revision')), { title: 'Test', flag: false, empty: null, [key]: 'revision' })
  assert.deepEqual(JSON.parse(markStructuralDraft('{}', key, 'revision')), { [key]: 'revision' })
  assert.equal(markStructuralDraft('Body only', key, 'revision'), '---\nprivate_test_marker: "revision"\n---\nBody only')
})

test('persistent server startup failure removes its isolated workspace', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-persistent-failure-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'core/layouts/partials'), { recursive: true })
  await fs.writeFile(path.join(root, 'core/layouts/partials/head.html'), '')
  await fs.writeFile(path.join(root, 'core/do'), '#!/bin/sh\nexit 7\n')
  const before = (await fs.readdir(os.tmpdir())).filter(name => name.startsWith('sansoul-structural-server-')).sort()
  await assert.rejects(startStructuralPreviewServer({ project: root, port: 0 }), /prebuild failed/)
  assert.deepEqual((await fs.readdir(os.tmpdir())).filter(name => name.startsWith('sansoul-structural-server-')).sort(), before)
})

test('persistent Hugo renders current if/get/remap, coalesces drafts, restores targets and rejects unsafe requests', { skip: !project, timeout: 180000 }, async t => {
  const target = 'content/single/persistent-structural.es.md'
  const original = await fs.readFile(path.join(project, 'content/single/_home.es.md'))
  const service = await startStructuralPreviewServer({ project, port: 0, debounceMs: 150, timeoutMs: 15000 })
  t.after(() => service.close())
  const config = await session(service)
  const headers = { 'Content-Type': 'application/json', Origin: service.url, Authorization: `Bearer ${config.token}` }
  const post = (data, override = {}) => fetch(service.url + config.endpoint, { method: 'POST', headers: { ...headers, ...override }, body: JSON.stringify(data) })
  for (const [title, enabled, extra] of [['First draft', false, false], ['Second draft', true, false], ['Third draft', true, true]]) {
    const response = await post({ target, markdown: draft(title, enabled, extra), requestId: title })
    const result = await response.json()
    assert.equal(response.status, 200, JSON.stringify(result))
    t.diagnostic(JSON.stringify({ draft: title, copiedMs: result.copiedMs, renderMs: result.renderMs, totalMs: result.totalMs }))
    assert.equal(result.hugoPid, service.hugoPid)
    assert.equal(result.copiedMs, Math.round(service.copiedMs))
    assert.equal(result.requestId, title)
    const html = await (await fetch(service.url + result.url)).text()
    assert.ok(html.includes(title))
    assert.equal(html.includes('<p>Hugo lookup and remap</p>'), enabled)
    assert.equal(html.includes('Added structural box'), extra)
    assert.ok(!html.includes(config.token), 'Draft page must not expose API token')
  }
  for (const markdown of ['+++\ntitle = "TOML draft"\nurl = "/persistent-structural/"\n+++\nBody', '{"title":"JSON draft","url":"/persistent-structural/"}\nBody']) {
    const response = await post({ target, markdown })
    const result = await response.json()
    assert.equal(response.status, 200, JSON.stringify(result))
  }
  assert.equal((await post({ target, markdown: draft('Missing upload') + '\n![new](/u/not-yet-saved.png)' })).status, 422)
  assert.equal((await post({ target, markdown: draft('Escaping upload') + '\n![new](/u/../../outside.png)' })).status, 400)
  assert.equal((await post({ target, markdown: draft('Remote asset') + '\n[remote](https://example.com/u/remote.png)' })).status, 200)
  await fs.mkdir(path.join(service.workspace, 'uploads'), { recursive: true })
  await fs.writeFile(path.join(service.workspace, 'uploads/structural-existing.txt'), 'Local test file')
  assert.equal((await post({ target, markdown: draft('Existing asset with query') + '\n[asset](/u/structural-existing.txt?download#part)' })).status, 200)
  const first = post({ target, markdown: draft('Superseded') })
  const second = post({ target, markdown: draft('Newest') })
  const statuses = await Promise.all([first, second]).then(values => values.map(value => value.status))
  assert.deepEqual(statuses.sort(), [200, 409])
  assert.equal((await post({ target: 'content/single/language.zz-preview-disabled.md', markdown: draft('Wrong language') })).status, 422)
  assert.equal((await post({ target: '../hugo.yml', markdown: '' })).status, 400)
  assert.equal((await post({ target, markdown: 'x'.repeat(1000001) })).status, 400)
  assert.equal((await post({ target, markdown: '' }, { Authorization: 'Bearer wrong' })).status, 401)
  assert.equal((await post({ target, markdown: '' }, { Origin: 'https://outside.example' })).status, 403)
  assert.equal((await fetch(service.url + config.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403)
  assert.equal((await fetch(service.url + '/__sansoul/files')).status, 404)
  assert.equal((await post({ target, markdown: '---\ntitle: [invalid\n---\n' })).status, 422)
  const recovered = await post({ target, markdown: draft('Recovered') })
  assert.equal(recovered.status, 200, JSON.stringify(await recovered.json()))
  const next = await post({ target: 'content/single/another-persistent.es.md', markdown: draft('Other target') })
  assert.equal(next.status, 200, JSON.stringify(await next.json()))
  await assert.rejects(fs.stat(path.join(service.workspace, target)), { code: 'ENOENT' })
  assert.deepEqual(await fs.readFile(path.join(project, 'content/single/_home.es.md')), original)
  await assert.rejects(fs.stat(path.join(project, target)), { code: 'ENOENT' })
  await service.close()
  await assert.rejects(fs.stat(service.workspace), { code: 'ENOENT' })
  assert.throws(() => process.kill(service.hugoPid, 0), { code: 'ESRCH' })
})

test('a draft arriving during Hugo rendering cannot inherit the previous page generation', { skip: !project, timeout: 120000 }, async t => {
  const held = new Map()
  const arrivals = new Map()
  const gate = http.createServer((req, res) => {
    const name = req.url.slice(1)
    res.setHeader('Content-Type', 'text/plain')
    held.set(name, res)
    arrivals.get(name)?.()
  })
  await new Promise(resolve => gate.listen(0, '127.0.0.1', resolve))
  const gateURL = `http://127.0.0.1:${gate.address().port}/`
  let service
  const release = name => {
    const response = held.get(name)
    if (response && !response.writableEnded) response.end('released')
  }
  t.after(async () => {
    for (const name of held.keys()) release(name)
    await service?.close()
    gate.closeAllConnections()
    await new Promise(resolve => gate.close(resolve))
  })
  const arrived = name => new Promise(resolve => {
    if (held.has(name)) resolve()
    else arrivals.set(name, resolve)
  })
  const bounded = async promise => {
    let timer
    try { return await Promise.race([promise, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('Hugo did not reach the held render: ' + [...held.keys()].join(','))), 25000) })]) } finally { clearTimeout(timer) }
  }
  service = await startStructuralPreviewServer({ project, port: 0, debounceMs: 30, timeoutMs: 20000, onLog: message => t.diagnostic(message) })
  // The isolated test alone allows its own loopback gate; normal Hugo policy stays intact.
  await fs.appendFile(path.join(service.workspace, 'hugo.yml'), `\nsecurity:\n  http:\n    urls: ['^https://[a-zA-Z]', '^${gateURL.replaceAll('.', '\\.')}']\n`)
  await new Promise(resolve => setTimeout(resolve, 1500))
  const head = path.join(service.workspace, 'layouts/partials/head.html')
  await fs.writeFile(head, `{{ with .Params.preview_gate }}{{ $gate := resources.GetRemote (print "${gateURL}" .) }}{{ with $gate }}<!-- {{ .Content }} -->{{ end }}{{ end }}\n` + await fs.readFile(head, 'utf8'))
  const config = await session(service)
  const target = 'content/single/inflight-proof.es.md'
  const makeDraft = (title, name) => draft(title, true).replace('prototype_enabled:', `preview_gate: ${name}\nprototype_enabled:`)
  const post = markdown => fetch(service.url + config.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: service.url, Authorization: `Bearer ${config.token}` }, body: JSON.stringify({ target, markdown }) })
  const first = post(makeDraft('First in-flight', 'A'))
  first.catch(() => {})
  await bounded(arrived('A'))
  let completed = false
  const newest = post(makeDraft('Newest in-flight', 'B')).then(response => { completed = true; return response })
  newest.catch(() => {})
  const deadline = Date.now() + 10000
  while (!(await fs.readFile(path.join(service.workspace, target), 'utf8')).includes('Newest in-flight')) {
    assert.ok(Date.now() < deadline, 'The newer draft must be written while Hugo holds the older page')
    await new Promise(resolve => setTimeout(resolve, 30))
  }
  release('A')
  await bounded(arrived('B'))
  await new Promise(resolve => setTimeout(resolve, 350))
  assert.equal(completed, false, 'The newer response must wait for its own Hugo page, even when the file hash already changed')
  release('B')
  const response = await newest
  const result = await response.json()
  assert.equal(response.status, 200, JSON.stringify(result))
  assert.equal((await first).status, 409)
  const html = await (await fetch(service.url + result.url)).text()
  assert.ok(html.includes('Newest in-flight'))
  assert.ok(!html.includes('First in-flight'))
})
