import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { sync, commitMessage } from '../git-sync.js'

const quiet = { log: () => {}, clipboard: () => '', now: () => new Date(2026, 10, 17, 13, 5) }

function git (cwd, ...args) {
  return execFileSync('git', ['-c', 'protocol.file.allow=always', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function write (dir, file, content) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
  fs.writeFileSync(path.join(dir, file), content)
}

function read (dir, file) {
  return fs.readFileSync(path.join(dir, file), 'utf8')
}

function configure (dir) {
  git(dir, 'config', 'user.name', 'Test')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'protocol.file.allow', 'always')
}

// A bare remote plus two clones: `me` runs the command, `other` races ahead.
function setup (t, files = { 'content/a.md': 'a\n', 'data/b.yml': 'b: 1\n' }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-git-sync-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const remote = path.join(root, 'remote.git')
  git(root, 'init', '-q', '--bare', '-b', 'main', remote)
  const seed = path.join(root, 'seed')
  git(root, 'init', '-q', '-b', 'main', seed)
  configure(seed)
  for (const [file, content] of Object.entries(files)) write(seed, file, content)
  git(seed, 'add', '-A')
  git(seed, 'commit', '-q', '-m', 'seed')
  git(seed, 'remote', 'add', 'origin', remote)
  git(seed, 'push', '-q', 'origin', 'main')
  const clone = name => {
    const dir = path.join(root, name)
    git(root, 'clone', '-q', '--recurse-submodules', remote, dir)
    configure(dir)
    return dir
  }
  return { root, remote, me: clone('me'), other: clone('other'), clone }
}

function commitAndPush (dir, files, message = 'other change') {
  for (const [file, content] of Object.entries(files)) write(dir, file, content)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', message)
  git(dir, 'push', '-q', 'origin', 'main')
}

test('automatic commit message names the date and the first changed paths', () => {
  const date = new Date(2026, 10, 17, 9, 4)
  assert.equal(commitMessage(['a.md'], date), 'Update: 2026-11-17 09:04 · a.md')
  assert.equal(commitMessage(['a', 'b', 'c', 'd', 'e'], date), 'Update: 2026-11-17 09:04 · a, b, c +2')
})

test('up commits, rebases onto non-conflicting remote work and pushes', async t => {
  const { me, other } = setup(t)
  commitAndPush(other, { 'data/b.yml': 'b: 2\n' })
  write(me, 'content/a.md', 'mine\n')
  write(me, 'content/new.md', 'new\n')
  const result = await sync('up', { cwd: me, ...quiet })
  assert.equal(result.ok, true)
  git(me, 'fetch', '-q')
  assert.equal(git(me, 'rev-parse', 'HEAD'), git(me, 'rev-parse', 'origin/main'))
  assert.equal(git(me, 'log', '-1', '--format=%s'), 'Update: 2026-11-17 13:05 · content/a.md, content/new.md')
  assert.equal(git(me, 'show', 'origin/main:data/b.yml'), 'b: 2')
  assert.equal(git(me, 'status', '--porcelain'), '')
})

test('up uses the given message and does nothing when there is nothing new', async t => {
  const { me } = setup(t)
  write(me, 'content/a.md', 'x\n')
  assert.equal((await sync('up', { cwd: me, message: 'Mi mensaje', ...quiet })).ok, true)
  assert.equal(git(me, 'log', '-1', '--format=%s'), 'Mi mensaje')
  const head = git(me, 'rev-parse', 'HEAD')
  assert.equal((await sync('up', { cwd: me, ...quiet })).ok, true)
  assert.equal(git(me, 'rev-parse', 'HEAD'), head)
})

test('up conflict aborts cleanly, pushes a rescue branch and writes an agent prompt', async t => {
  const { me, other } = setup(t)
  commitAndPush(other, { 'content/a.md': 'theirs\n' })
  write(me, 'content/a.md', 'mine\n')
  let copied = ''
  const result = await sync('up', { cwd: me, ...quiet, clipboard: text => { copied = text; return 'pbcopy' } })
  assert.equal(result.ok, false)
  assert.equal(result.rescue, 'local/2026-11-17-1305')
  assert.equal(result.rescuePushed, true)
  assert.deepEqual(result.files, ['content/a.md'])
  assert.equal(git(me, 'show', `origin/${result.rescue}:content/a.md`), 'mine')
  assert.equal(read(me, 'content/a.md'), 'mine\n')
  assert.equal(git(me, 'status', '--porcelain'), '')
  assert.ok(!fs.existsSync(path.join(me, '.git/rebase-merge')))
  assert.equal(copied, result.prompt)
  assert.equal(read(me, '.git/sansoul-agent-prompt.md'), result.prompt)
  assert.match(result.prompt, /`content\/a\.md`/)
  assert.match(result.prompt, /git merge origin\/local\/2026-11-17-1305/)
  // A second failure on the same minute gets its own rescue branch.
  assert.equal((await sync('up', { cwd: me, ...quiet })).rescue, 'local/2026-11-17-1305-2')
})

test('down keeps uncommitted work in place while bringing remote changes in', async t => {
  const { me, other } = setup(t)
  commitAndPush(other, { 'data/b.yml': 'b: 2\n' })
  write(me, 'content/a.md', 'editing\n')
  write(me, 'content/draft.md', 'draft\n')
  const result = await sync('down', { cwd: me, ...quiet })
  assert.equal(result.ok, true)
  assert.equal(git(me, 'rev-parse', 'HEAD'), git(me, 'rev-parse', 'origin/main'))
  assert.equal(read(me, 'data/b.yml'), 'b: 2\n')
  assert.equal(read(me, 'content/a.md'), 'editing\n')
  assert.equal(read(me, 'content/draft.md'), 'draft\n')
  assert.match(git(me, 'status', '--porcelain'), /content\/a\.md/)
})

test('down conflict restores the working tree exactly and saves a rescue branch', async t => {
  const { me, other } = setup(t)
  commitAndPush(other, { 'content/a.md': 'theirs\n' })
  write(me, 'content/a.md', 'mine\n')
  const before = git(me, 'rev-parse', 'HEAD')
  const result = await sync('down', { cwd: me, ...quiet })
  assert.equal(result.ok, false)
  assert.equal(git(me, 'rev-parse', 'HEAD'), before)
  assert.equal(read(me, 'content/a.md'), 'mine\n')
  assert.equal(git(me, 'show', `origin/${result.rescue}:content/a.md`), 'mine')
})

test('lockfile conflicts take the remote lockfile and regenerate it', async t => {
  const { me, other } = setup(t, { 'package.json': '{}\n', 'pnpm-lock.yaml': 'lock: 0\n' })
  commitAndPush(other, { 'pnpm-lock.yaml': 'lock: theirs\n' })
  write(me, 'pnpm-lock.yaml', 'lock: mine\n')
  write(me, 'content/a.md', 'mine\n')
  const calls = []
  const regenerateLock = (cwd, file) => { calls.push(file); write(cwd, file, 'lock: regenerated\n'); return true }
  const result = await sync('up', { cwd: me, ...quiet, regenerateLock })
  assert.equal(result.ok, true)
  assert.deepEqual(calls, ['pnpm-lock.yaml'])
  assert.equal(git(me, 'show', 'origin/main:pnpm-lock.yaml'), 'lock: regenerated')
  assert.equal(git(me, 'show', 'origin/main:content/a.md'), 'mine')
})

test('generated root docs conflicts take the remote copy and regenerate', async t => {
  const prefix = '<!-- Generated by `sh do root-docs` -->\n'
  const { me, other } = setup(t, { 'README.md': `${prefix}v1\n` })
  commitAndPush(other, { 'README.md': `${prefix}v2\n` })
  write(me, 'README.md', `${prefix}v3\n`)
  const result = await sync('up', { cwd: me, ...quiet, regenerateDocs: cwd => { write(cwd, 'README.md', `${prefix}fresh\n`); return true } })
  assert.equal(result.ok, true)
  assert.equal(git(me, 'show', 'origin/main:README.md'), `${prefix}fresh`.trim())
  assert.equal(git(me, 'log', '-1', '--format=%s', 'origin/main'), 'Regenerate root docs')
})

test('hand-written README conflicts are never resolved automatically', async t => {
  const { me, other } = setup(t, { 'README.md': 'v1\n' })
  commitAndPush(other, { 'README.md': 'v2\n' })
  write(me, 'README.md', 'v3\n')
  assert.equal((await sync('up', { cwd: me, ...quiet })).ok, false)
})

test('engine pointer conflicts keep the descendant commit', async t => {
  const { root, me, other } = setup(t)
  const engine = path.join(root, 'engine')
  git(root, 'init', '-q', '-b', 'main', engine)
  configure(engine)
  const engineCommit = n => { write(engine, 'v', `${n}\n`); git(engine, 'add', '-A'); git(engine, 'commit', '-q', '-m', `v${n}`); return git(engine, 'rev-parse', 'HEAD') }
  engineCommit(1)
  git(other, 'submodule', 'add', '-q', engine, 'core')
  git(other, 'commit', '-q', '-m', 'add core')
  git(other, 'push', '-q', 'origin', 'main')
  git(me, 'pull', '-q', 'origin', 'main')
  git(me, 'submodule', 'update', '-q', '--init')
  const v2 = engineCommit(2)
  const v3 = engineCommit(3)
  git(path.join(other, 'core'), 'fetch', '-q', 'origin')
  git(path.join(other, 'core'), 'checkout', '-q', v2)
  commitAndPush(other, {}, 'core -> v2')
  git(path.join(me, 'core'), 'fetch', '-q', 'origin')
  git(path.join(me, 'core'), 'checkout', '-q', v3)
  const result = await sync('up', { cwd: me, ...quiet })
  assert.equal(result.ok, true)
  assert.equal(git(me, 'rev-parse', 'origin/main:core'), v3)
})

test('refuses to run in the middle of an unfinished rebase', async t => {
  const { me, other } = setup(t)
  commitAndPush(other, { 'content/a.md': 'theirs\n' })
  write(me, 'content/a.md', 'mine\n')
  git(me, 'commit', '-qam', 'mine')
  git(me, 'fetch', '-q')
  assert.throws(() => git(me, 'rebase', 'origin/main'))
  const result = await sync('up', { cwd: me, ...quiet })
  assert.equal(result.ok, false)
  assert.equal(result.rescue, '')
  assert.match(result.prompt, /operación de Git a medias/)
})
