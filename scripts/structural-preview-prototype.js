#!/usr/bin/env node

/* Local CLI prototype, run from the consumer root. Copies only public build
inputs, compiles one unsaved Markdown document, and always removes its workspace.
It is not a sandbox for untrusted themes, Hugo templates, or project config. */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'

const publicInputs = ['hugo.yml', 'content', 'data', 'assets', 'uploads', 'static', 'layouts', 'i18n']
const excluded = new Set(['.git', '.env', 'auth.json', 'node_modules', 'public', 'resources', 'TODO.md'])

export async function copyPublic (source, destination, signal) {
  signal?.throwIfAborted()
  const stat = await fs.lstat(source)
  if (stat.isSymbolicLink()) throw new Error(`Symbolic links are not accepted: ${source}`)
  if (stat.isDirectory()) {
    await fs.mkdir(destination, { recursive: true })
    for (const name of await fs.readdir(source)) {
      if (name.startsWith('.') || excluded.has(name) || /\.(?:pem|key)$/i.test(name)) continue
      await copyPublic(path.join(source, name), path.join(destination, name), signal)
    }
  } else if (stat.isFile()) await fs.copyFile(source, destination)
  else throw new Error(`Unsupported input: ${source}`)
}

export async function copyDependencies (source, destination, boundary, destinationRoot = destination, signal) {
  signal?.throwIfAborted()
  const stat = await fs.lstat(source)
  if (stat.isSymbolicLink()) {
    const real = await fs.realpath(source)
    if (real !== boundary && !real.startsWith(boundary + path.sep)) throw new Error('Dependency symlink escapes node_modules')
    const localTarget = path.join(destinationRoot, path.relative(boundary, real))
    await fs.symlink(path.relative(path.dirname(destination), localTarget), destination)
  } else if (stat.isDirectory()) {
    await fs.mkdir(destination, { recursive: true })
    for (const name of await fs.readdir(source)) await copyDependencies(path.join(source, name), path.join(destination, name), boundary, destinationRoot, signal)
  } else if (stat.isFile()) await fs.copyFile(source, destination)
}

function run (command, args, cwd, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      detached: process.platform !== 'win32',
      env: { PATH: process.env.PATH, TMPDIR: os.tmpdir(), SANSOUL_VIDEO_METADATA_WATCH: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let log = ''
    let failure
    const stop = () => {
      failure = new Error('Structural preview build cancelled or timed out')
      try {
        if (process.platform === 'win32') child.kill('SIGKILL')
        else process.kill(-child.pid, 'SIGKILL')
      } catch (error) { if (error.code !== 'ESRCH') failure = error }
    }
    const timer = setTimeout(stop, 120000)
    signal?.addEventListener('abort', stop, { once: true })
    if (signal?.aborted) stop()
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { log = (log + data).slice(-100000) })
    child.once('error', error => { failure = error })
    child.once('close', code => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', stop)
      if (failure) reject(failure)
      else if (code === 0) resolve(log)
      else reject(new Error(`${command} failed (${code}):\n${log}`))
    })
  })
}

export async function compileStructuralDraft ({ project, target, markdown, signal }) {
  if (typeof target !== 'string' || !/^content\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.[a-zA-Z][a-zA-Z0-9-]*\.md$/.test(target) || target.includes('..')) throw new Error('Target must be one content/<type>/<name>.<lang>.md file')
  if (typeof markdown !== 'string' || Buffer.byteLength(markdown) > 1000000) throw new Error('Draft exceeds the 1 MB limit')
  signal?.throwIfAborted()
  project = await fs.realpath(project)
  // Validate every existing target ancestor before any copy or write.
  let cursor = project
  for (const segment of target.split('/')) {
    cursor = path.join(cursor, segment)
    const stat = await fs.lstat(cursor).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (stat?.isSymbolicLink()) throw new Error('Target cannot traverse symbolic links')
  }
  const enginePath = await fs.stat(path.join(project, 'core/do')).then(() => 'core', () => 'themes/sansoul')
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-structural-preview-'))
  const started = performance.now()
  try {
    for (const name of [...publicInputs, enginePath]) {
      const source = path.join(project, name)
      if (await fs.lstat(source).then(() => true, error => {
        if (error.code !== 'ENOENT') throw error
        return false
      })) await copyPublic(source, path.join(workspace, name), signal)
    }
    const dependencies = path.join(project, 'node_modules')
    const dependencyStat = await fs.lstat(dependencies).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (dependencyStat?.isSymbolicLink()) throw new Error('node_modules must be a real local directory')
    if (dependencyStat) await copyDependencies(dependencies, path.join(workspace, 'node_modules'), await fs.realpath(dependencies), undefined, signal)
    await fs.writeFile(path.join(workspace, 'do'), `#!/bin/sh\nexec sh ${enginePath}/do "$@"\n`)
    await fs.mkdir(path.dirname(path.join(workspace, target)), { recursive: true })
    await fs.writeFile(path.join(workspace, target), markdown)
    const copiedMs = performance.now() - started
    await run('sh', ['do', 'prebuild'], workspace, signal)
    const log = await run('hugo', ['--buildDrafts', '--buildFuture', '--environment', 'development', '--baseURL', 'http://127.0.0.1/', '--config', `${enginePath}/hugo.default.yml,${enginePath}/prebuild/public/hugo.prebuild.yml,hugo.yml,${enginePath}/hugo.dev.yml`], workspace, signal)
    const files = new Map()
    const collect = async (directory, prefix = '') => {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const name = prefix + entry.name
        if (entry.isDirectory()) await collect(path.join(directory, entry.name), name + '/')
        else if (entry.isFile()) files.set(name, await fs.readFile(path.join(directory, entry.name)))
      }
    }
    await collect(path.join(workspace, 'public'))
    return { files, copiedMs, totalMs: performance.now() - started, log }
  } finally {
    await fs.rm(workspace, { recursive: true, force: true })
  }
}

async function main () {
  const [target, draftFile, output] = process.argv.slice(2)
  if (!target || !draftFile || !output) throw new Error('Usage from project root: node <engine>/scripts/structural-preview-prototype.js content/<type>/<name>.<lang>.md /path/draft.md /path/new-output-directory')
  // Exclusive creation prevents accidentally overwriting an existing site.
  await fs.mkdir(output)
  try {
    const result = await compileStructuralDraft({ project: process.cwd(), target, markdown: await fs.readFile(draftFile, 'utf8') })
    for (const [name, bytes] of result.files) {
      await fs.mkdir(path.dirname(path.join(output, name)), { recursive: true })
      await fs.writeFile(path.join(output, name), bytes)
    }
    console.log(JSON.stringify({ output: path.resolve(output), files: result.files.size, copiedMs: Math.round(result.copiedMs), totalMs: Math.round(result.totalMs) }))
  } catch (error) {
    await fs.rm(output, { recursive: true, force: true })
    throw error
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
