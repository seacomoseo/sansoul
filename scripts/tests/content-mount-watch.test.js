import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { spawn, spawnSync } from 'node:child_process'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

test('file mounts preserve live sibling, home and collection content invalidation', { timeout: 45000 }, async t => {
  if (spawnSync('hugo', ['version']).status !== 0) return t.skip('Hugo unavailable')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-content-watch-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const write = async (name, value) => {
    const target = path.join(root, name)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, value)
  }
  await write('content/single/_home.en.md', '---\ntitle: Home before\n---\n')
  await write('content/single/test.en.md', '---\ntitle: Single before\n---\nBody before')
  await write('content/blog/_index.en.md', '---\ntitle: Blog\n---\n')
  await write('content/blog/entry.en.md', '---\ntitle: Entry\n---\nCollection before')
  await write('content/root.en.md', '---\ntitle: Root before\n---\n')
  await write('content/plain/entry.en.md', '---\ntitle: Plain before\n---\n')
  await write('content/global.en.yml', 'message: Global before\n')
  // Execute the actual generator block, including its dynamic index directories.
  const source = await fs.readFile(new URL('../../prebuild/layouts/index.html', import.meta.url), 'utf8')
  const start = source.indexOf('{{ $content_mounts := ')
  const end = source.indexOf('{{ if $content_mounts }}')
  assert.ok(start !== -1 && end > start, 'Main mount generator block exists')
  const block = source.slice(start, end)
  await write('generator/layouts/index.html', block + '{{ dict "module" (dict "mounts" $content_mounts) | jsonify }}')
  await write('generator/hugo.yml', JSON.stringify({
    disableKinds: ['taxonomy', 'term'],
    params: { mainModuleMounts: [
      { source: 'content/single/_home.en.md', target: 'content/_index.en.md' },
      { source: 'content', target: 'content', files: ['! single/_home.*.md', '! */_index.*.md', '! global.*.yml'] }
    ] },
    module: { mounts: [{ source: '../content', target: 'assets/content' }] }
  }))
  const generated = spawnSync('hugo', ['--source', path.join(root, 'generator')], { encoding: 'utf8' })
  assert.equal(generated.status, 0, generated.stdout + generated.stderr)
  const config = JSON.parse(await fs.readFile(path.join(root, 'generator/public/index.html'), 'utf8'))
  config.baseURL = 'http://localhost/'
  await write('hugo.json', JSON.stringify(config))
  await write('layouts/index.html', '{{ .Title }} {{ .Content }} {{ (index hugo.Data "global.en").message }} {{ range site.RegularPages }}{{ .Title }} {{ end }}')
  await write('layouts/_default/single.html', '{{ .Title }} {{ .Content }}')
  await write('layouts/_default/list.html', '{{ .Title }}')
  const listener = net.createServer()
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve))
  const port = listener.address().port
  await new Promise(resolve => listener.close(resolve))
  const child = spawn('hugo', ['server', '--source', root, '--port', String(port), '--disableFastRender'], { stdio: ['ignore', 'pipe', 'pipe'] })
  const exited = new Promise(resolve => child.once('exit', resolve))
  let output = ''
  child.stdout.on('data', data => { output += data })
  child.stderr.on('data', data => { output += data })
  t.after(async () => {
    child.kill('SIGINT')
    await exited
  })
  const expect = async (url, text, status = 200, absent = false) => {
    const deadline = Date.now() + 8000
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}${url}`)
        if (response.status === status && (status === 404 || (await response.text()).includes(text) !== absent)) return
      } catch {}
      await delay(100)
    }
    assert.fail(`Timed out waiting for ${url}: ${text}\n${output}`)
  }
  await expect('/single/test/', 'Single before')
  await write('content/single/test.en.md', '---\ntitle: Single after\n---\nBody after')
  await expect('/single/test/', 'Single after')
  await expect('/single/test/', 'Body after')
  await write('content/single/_home.en.md', '---\ntitle: Home after\n---\n')
  await expect('/', 'Home after')
  await write('content/blog/entry.en.md', '---\ntitle: Entry\n---\nCollection after')
  await expect('/blog/entry/', 'Collection after')
  await write('content/root.en.md', '---\ntitle: Root after\n---\n')
  await expect('/root/', 'Root after')
  await write('content/plain/entry.en.md', '---\ntitle: Plain after\n---\n')
  await expect('/plain/entry/', 'Plain after')
  await write('content/global.en.yml', 'message: Global after\n')
  await expect('/', 'Global after')
  await write('content/single/created.en.md', '---\ntitle: Created\n---\n')
  await expect('/single/created/', 'Created')
  await fs.rm(path.join(root, 'content/single/created.en.md'))
  await expect('/', 'Created', 200, true)
})
