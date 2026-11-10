import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { parseOptions, sourceSnapshot, changedSources } from '../production-server.js'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor (predicate, message) {
  const until = Date.now() + 12000
  while (Date.now() < until) {
    if (await predicate()) return
    await delay(40)
  }
  throw new Error(`Timeout: ${message}`)
}
async function unusedPort () {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

test('local options are explicit and reject invalid ports or unexpected Hugo flags', () => {
  assert.deepEqual(parseOptions([]), { port: 1313, bind: 'localhost' })
  assert.deepEqual(parseOptions(['--port=14001', '--bind', '127.0.0.1']), { port: 14001, bind: '127.0.0.1' })
  for (const args of [['--port', '0'], ['--port', 'abc'], ['--port'], ['--disableFastRender']]) assert.throws(() => parseOptions(args))
})

test('source polling covers deletion and nested additions but ignores generated output', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-poll-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  fs.mkdirSync(path.join(directory, 'content'))
  fs.writeFileSync(path.join(directory, 'content/a.md'), 'a')
  const before = sourceSnapshot(directory)
  fs.rmSync(path.join(directory, 'content/a.md'))
  fs.mkdirSync(path.join(directory, 'content/new'))
  fs.writeFileSync(path.join(directory, 'content/new/b.md'), 'b')
  for (const output of ['public', 'resources', 'worker', 'functions/_commerce', 'core/prebuild/public', 'node_modules', '.git']) {
    fs.mkdirSync(path.join(directory, output), { recursive: true })
    fs.writeFileSync(path.join(directory, output, 'generated'), 'generated')
  }
  fs.mkdirSync(path.join(directory, 'content/public'))
  fs.writeFileSync(path.join(directory, 'content/public/source.md'), 'public is a valid content name')
  assert.deepEqual(changedSources(before, sourceSnapshot(directory)).sort(), ['content/a.md', 'content/new/b.md', 'content/public/source.md'])
})

for (const engine of ['core', 'themes/sansoul']) {
  test(`production server rebuilds, recovers, locks and cleans (${engine})`, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-production-'))
    const scriptDir = path.join(directory, engine, 'scripts')
    fs.mkdirSync(scriptDir, { recursive: true })
    for (const file of ['production-server.js', 'lifecycle.js', 'engine-paths.js']) fs.copyFileSync(new URL(`../${file}`, import.meta.url), path.join(scriptDir, file))
    fs.writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}')
    fs.copyFileSync(new URL('../../do', import.meta.url), path.join(directory, engine, 'do'))
    fs.mkdirSync(path.join(directory, 'content'))
    fs.writeFileSync(path.join(directory, 'content/source.txt'), 'initial')
    const events = path.join(os.tmpdir(), `sansoul-events-${process.pid}-${Date.now()}.txt`)
    fs.writeFileSync(path.join(directory, 'do'), `#!/bin/sh
set -eu
if [ "$1" = local ] || [ "$1" = live ]; then exec sh "${engine}/do" "$@"; fi
[ "$1" = build ]
[ "$SANSOUL_BUILD_PRODUCTION" = 1 ]
node "${engine}/scripts/lifecycle.js" validate "$SANSOUL_LIFECYCLE_TOKEN"
printf 'start\\n' >> "$TEST_EVENTS"
sleep 0.25
mkdir -p public resources "${engine}/prebuild/public"
cp content/source.txt public/index.html
printf '0123456789' > public/movie.mp4
printf 'missing' > public/404.html
printf 'generated' > resources/stats.json
if [ -f content/fail ]; then printf 'failed\\n' >> "$TEST_EVENTS"; exit 23; fi
printf 'finish\\n' >> "$TEST_EVENTS"
`)
    const port = await unusedPort()
    const baseURL = `http://127.0.0.1:${port}`
    const child = spawn('sh', ['do', engine === 'core' ? 'local' : 'live', '--bind', '127.0.0.1', '--port', String(port)], {
      cwd: directory, env: { ...process.env, TEST_EVENTS: events }, stdio: ['ignore', 'pipe', 'pipe']
    })
    let output = ''
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk })
    const exited = new Promise(resolve => child.once('close', code => resolve(code)))
    t.after(async () => {
      if (child.exitCode === null) child.kill('SIGTERM')
      await exited
      fs.rmSync(directory, { recursive: true, force: true })
      fs.rmSync(events, { force: true })
    })
    const response = async () => { try { return await fetch(baseURL) } catch { return null } }
    await waitFor(async () => (await response())?.status === 200, 'initial ready').catch(error => { throw new Error(`${error.message}\n${output}`) })
    assert.equal(await (await response()).text(), 'initial')
    const count = () => fs.readFileSync(events, 'utf8').match(/start/g)?.length || 0
    await delay(1000)
    assert.equal(count(), 1, 'generated output must not trigger a rebuild')
    const range = await fetch(`${baseURL}/movie.mp4`, { headers: { Range: 'bytes=2-4' } })
    assert.equal(range.status, 206)
    assert.equal(range.headers.get('content-type'), 'video/mp4')
    assert.equal(await range.text(), '234')
    assert.equal((await fetch(`${baseURL}/missing`)).status, 404)
    // All servers/build commands must refuse the same held lock.
    const competing = spawn(process.execPath, [path.join(scriptDir, 'lifecycle.js'), 'guard', '--', 'sh', 'do', 'build'], { cwd: directory, stdio: 'ignore' })
    assert.equal(await new Promise(resolve => competing.once('close', resolve)), 1)
    fs.writeFileSync(path.join(directory, 'content/fail'), 'bad')
    await waitFor(() => output.includes('Build failed;'), 'failure reported')
    assert.equal((await response()).status, 503, 'partial output must never masquerade as a valid build')
    fs.rmSync(path.join(directory, 'content/fail'))
    fs.writeFileSync(path.join(directory, 'content/source.txt'), 'recovered')
    await waitFor(async () => {
      const result = await response()
      return result?.status === 200 && await result.text() === 'recovered'
    }, 'recovery after correction')
    // A new source edit during a build queues a second, serialized full build.
    fs.writeFileSync(path.join(directory, 'content/source.txt'), 'first')
    const prior = count()
    await waitFor(() => count() > prior, 'next build started')
    fs.writeFileSync(path.join(directory, 'content/source.txt'), 'latest')
    await waitFor(() => count() > prior + 1, 'change during build rebuilt')
    await waitFor(async () => (await response())?.status === 200, 'latest build ready')
    const lines = fs.readFileSync(events, 'utf8').trim().split('\n')
    assert.ok(!lines.join('\n').includes('start\nstart'), 'full builds never overlap except the intentionally failed cycle')
    child.kill('SIGTERM')
    assert.equal(await exited, 0, output)
    for (const generated of ['public', 'resources', '.sansoul-dev.lock', `${engine}/prebuild/public`]) assert.equal(fs.existsSync(path.join(directory, generated)), false, generated)
  })
}
