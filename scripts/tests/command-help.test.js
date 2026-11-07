import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

test('empty command and help describe canonical commands without starting a build', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-command-help-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'core'))
  fs.copyFileSync(new URL('../../do', import.meta.url), path.join(root, 'core/do'))
  for (const args of [[], ['help'], ['--help'], ['-h']]) {
    const result = spawnSync('sh', ['core/do', ...args], { cwd: root, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    for (const command of ['dev', 'cms', 'preview', 'build', 'local']) assert.ok(result.stdout.includes(`sh do ${command}`))
    assert.match(result.stdout, /live = local; hugo = build/)
    assert.deepEqual(fs.readdirSync(root), ['core'])
  }
  const unknown = spawnSync('sh', ['core/do', 'does-not-exist'], { cwd: root, encoding: 'utf8' })
  assert.equal(unknown.status, 2)
  assert.match(unknown.stderr, /Unknown command/)
})
