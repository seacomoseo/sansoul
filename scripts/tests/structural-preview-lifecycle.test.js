import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../structural-preview-server.js', import.meta.url))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const alive = pid => { try { process.kill(pid, 0); return true } catch (error) { if (error.code === 'ESRCH') return false; throw error } }
async function waitFor (check) {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    if (await check()) return
    await sleep(30)
  }
  throw new Error('Timed out waiting for the owned preview process')
}

for (const stage of ['startup', 'ready']) {
  test(`CLI SIGHUP during ${stage} removes the workspace and owned process tree`, { skip: process.platform === 'win32', timeout: 30000 }, async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-preview-signal-'))
    const project = path.join(root, 'project')
    const runtime = path.join(root, 'runtime')
    const bin = path.join(root, 'bin')
    await fs.mkdir(path.join(project, 'core/layouts/partials'), { recursive: true })
    await fs.mkdir(runtime)
    await fs.mkdir(bin)
    await fs.writeFile(path.join(project, 'core/layouts/partials/head.html'), '')
    const prebuild = stage === 'startup'
      ? '#!/bin/sh\nprintf "%s\\n" "$$" > "$TMPDIR/prebuild.pid"\nsleep 60 &\nprintf "%s\\n" "$!" > "$TMPDIR/sleeper.pid"\nwait\n'
      : '#!/bin/sh\nexit 0\n'
    await fs.writeFile(path.join(project, 'core/do'), prebuild)
    await fs.writeFile(path.join(bin, 'hugo'), `#!/usr/bin/env node
const fs = require('node:fs')
if (process.argv.includes('--help')) { console.log('--renderToDisk'); process.exit(0) }
fs.writeFileSync(process.env.TMPDIR + '/hugo.pid', String(process.pid))
fs.mkdirSync('public/admin', { recursive: true })
fs.writeFileSync('public/admin/index.html', '<script id="sansoul-preview-index">' + JSON.stringify({ entries: { fixture: { lang: 'es' } } }) + '</script>')
setInterval(() => {}, 1000)
`, { mode: 0o755 })
    const child = spawn(process.execPath, [cli, '--port', '0'], { cwd: project, env: { ...process.env, TMPDIR: runtime, PATH: bin + path.delimiter + process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let errors = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { errors += chunk })
    const done = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
    const leaders = []
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM')
        await Promise.race([done, sleep(2000)])
        for (const pid of leaders) { try { process.kill(-pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error } }
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
        await done
      }
      await fs.rm(root, { recursive: true, force: true })
    })
    const marker = path.join(runtime, stage === 'startup' ? 'sleeper.pid' : 'hugo.pid')
    await waitFor(async () => {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(errors || 'Preview exited before the signal test')
      return fs.stat(marker).then(() => stage === 'startup' || output.includes('Structural preview ready'), () => false)
    })
    const worker = Number(await fs.readFile(marker, 'utf8'))
    const leader = stage === 'startup' ? Number(await fs.readFile(path.join(runtime, 'prebuild.pid'), 'utf8')) : worker
    leaders.push(leader)
    assert.ok(alive(leader))
    assert.ok(alive(worker))
    assert.equal((await fs.readdir(runtime)).filter(name => name.startsWith('sansoul-structural-server-')).length, 1)
    assert.equal(child.kill('SIGHUP'), true)
    await waitFor(() => child.exitCode !== null || child.signalCode !== null)
    assert.deepEqual(await done, { code: 0, signal: null }, errors)
    await waitFor(() => !alive(leader) && !alive(worker))
    assert.equal((await fs.readdir(runtime)).filter(name => name.startsWith('sansoul-structural-server-')).length, 0)
  })
}
