#!/usr/bin/env node

/* Run from a trusted consumer project. Public inputs and local dependencies are
copied once; unsaved drafts never change that project's sources or outputs. */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import net from 'node:net'
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
import { copyPublic, copyDependencies } from './structural-preview-prototype.js'

const endpoint = '/__sansoul/structural/draft'
const inputs = ['hugo.yml', 'content', 'data', 'assets', 'uploads', 'static', 'layouts', 'i18n']
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const hash = text => createHash('sha256').update(text).digest('hex')
const exists = file => fs.lstat(file).catch(error => { if (error.code !== 'ENOENT') throw error })
function problem (message, status = 400) { return Object.assign(new Error(message), { status }) }
function validDraft ({ target, markdown } = {}) {
  if (typeof target !== 'string' || !/^content\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.[a-zA-Z][a-zA-Z0-9-]*\.md$/.test(target) || target.includes('..')) throw problem('Target must be one content/<type>/<name>.<lang>.md file')
  if (typeof markdown !== 'string' || Buffer.byteLength(markdown) > 1000000) throw problem('Draft exceeds the 1 MB limit')
}
// Instrument only the isolated draft, preserving authored front matter and body.
export function markStructuralDraft (markdown, key, value) {
  const bom = markdown.startsWith('\uFEFF') ? '\uFEFF' : ''
  const source = markdown.slice(bom.length)
  const opening = source.match(/^(---|\+\+\+)[ \t]*\r?\n/)
  if (opening) {
    const newline = opening[0].endsWith('\r\n') ? '\r\n' : '\n'
    const field = opening[1] === '---' ? `${key}: ${JSON.stringify(value)}` : `${key} = ${JSON.stringify(value)}`
    return bom + opening[0] + field + newline + source.slice(opening[0].length)
  }
  const json = source.match(/^(\s*)\{/)
  if (json) {
    const offset = json[0].length
    const comma = /^\s*}/.test(source.slice(offset)) ? '' : ','
    return bom + source.slice(0, offset) + `${JSON.stringify(key)}:${JSON.stringify(value)}${comma}` + source.slice(offset)
  }
  return bom + `---\n${key}: ${JSON.stringify(value)}\n---\n` + source
}

async function safeTarget (root, target) {
  let cursor = root
  for (const segment of target.split('/')) {
    cursor = path.join(cursor, segment)
    if ((await exists(cursor))?.isSymbolicLink()) throw problem('Target cannot traverse symbolic links')
  }
}
function childProcess (command, args, cwd) {
  const child = spawn(command, args, { cwd, detached: process.platform !== 'win32', env: { PATH: process.env.PATH, TMPDIR: os.tmpdir(), SANSOUL_VIDEO_METADATA_WATCH: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
  child.log = ''
  child.error = null
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { child.log = (child.log + data).slice(-100000) })
  child.done = new Promise(resolve => {
    child.once('error', error => { child.error = error })
    child.once('close', code => { child.closed = true; child.code = code; resolve() })
  })
  return child
}
async function stopChild (child) {
  if (!child || child.closed) return
  const kill = signal => { try { process.platform === 'win32' ? child.kill(signal) : process.kill(-child.pid, signal) } catch (error) { if (error.code !== 'ESRCH') throw error } }
  kill('SIGTERM')
  await Promise.race([child.done, delay(1500)])
  if (!child.closed) { kill('SIGKILL'); await child.done }
}
async function freePort () {
  const probe = net.createServer()
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve) })
  const port = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  return port
}
function json (res, status, value) {
  if (res.destroyed || res.writableEnded) return
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}
async function body (req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > 1100000) throw problem('Request exceeds the 1 MB draft limit', 413)
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw problem('Invalid JSON request') }
}

export async function startStructuralPreviewServer ({ project = process.cwd(), port = 13164, debounceMs = 200, timeoutMs = 45000, demo = false, onLog = () => {}, startupSignal } = {}) {
  startupSignal?.throwIfAborted()
  if (!Number.isInteger(Number(port)) || Number(port) < 0 || Number(port) > 65535) throw new Error('Invalid port')
  project = await fs.realpath(project)
  const started = performance.now()
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-structural-server-'))
  const token = randomBytes(32).toString('hex')
  const proofKey = 'sansoul_preview_proof_' + randomBytes(16).toString('hex')
  let server, hugo, prebuild, ready = false, closed = false, generation = 0, latest = null, queue = Promise.resolve()
  const requests = new Set()
  let activeTarget = null
  const originals = new Map()
  const close = async () => {
    if (closed) return
    closed = true
    for (const request of requests) request.reject(problem('Preview service closed', 503))
    if (server?.listening) {
      server.closeAllConnections?.()
      await new Promise(resolve => server.close(resolve))
    }
    await stopChild(prebuild)
    await stopChild(hugo)
    await fs.rm(workspace, { recursive: true, force: true })
  }
  try {
    const enginePath = await exists(path.join(project, 'core/do')) ? 'core' : 'themes/sansoul'
    for (const name of [...inputs, enginePath]) if (await exists(path.join(project, name))) await copyPublic(path.join(project, name), path.join(workspace, name), startupSignal)
    const deps = path.join(project, 'node_modules')
    const stat = await exists(deps)
    if (stat?.isSymbolicLink()) throw new Error('node_modules must be a real local directory')
    if (stat) await copyDependencies(deps, path.join(workspace, 'node_modules'), await fs.realpath(deps), undefined, startupSignal)
    await fs.writeFile(path.join(workspace, 'do'), `#!/bin/sh\nexec sh ${enginePath}/do "$@"\n`)
    // Couple the Page snapshot to the on-disk hash: a newer file alone must
    // never certify HTML still being rendered from an older Page object.
    const head = path.join(workspace, 'layouts/partials/head.html')
    const originalHead = await fs.readFile(await exists(head) ? head : path.join(workspace, enginePath, 'layouts/partials/head.html'), 'utf8')
    await fs.mkdir(path.dirname(head), { recursive: true })
    await fs.writeFile(head, originalHead + '\n{{ with .File }}{{ $source := print "content/" .Path }}{{ if fileExists $source }}<meta name="sansoul-structural-source" content="{{ $source }}" data-sha256="{{ readFile $source | crypto.SHA256 }}" data-proof="{{ index $.Params "' + proofKey + '" }}">{{ end }}{{ end }}\n')
    const copiedMs = performance.now() - started
    startupSignal?.throwIfAborted()
    prebuild = childProcess('sh', ['do', 'prebuild'], workspace)
    let prebuildTimer, abortPrebuild
    try {
      await Promise.race([
        prebuild.done,
        new Promise((resolve, reject) => { prebuildTimer = setTimeout(() => reject(new Error('Preview prebuild timed out')), timeoutMs) }),
        new Promise((resolve, reject) => {
          if (!startupSignal) return
          abortPrebuild = () => reject(startupSignal.reason)
          startupSignal.addEventListener('abort', abortPrebuild, { once: true })
          if (startupSignal.aborted) abortPrebuild()
        })
      ])
    } finally {
      clearTimeout(prebuildTimer)
      if (abortPrebuild) startupSignal.removeEventListener('abort', abortPrebuild)
    }
    startupSignal?.throwIfAborted()
    if (prebuild.error || prebuild.code !== 0) throw new Error(`Preview prebuild failed: ${prebuild.error?.message || prebuild.log}`)
    const privatePort = await freePort()
    const config = `${enginePath}/hugo.default.yml,${enginePath}/prebuild/public/hugo.prebuild.yml,hugo.yml,${enginePath}/hugo.local.yml`
    const help = spawnSync('hugo', ['server', '--help'], { encoding: 'utf8', env: { PATH: process.env.PATH } })
    const diskFlag = help.stdout?.includes('--renderToDisk') ? '--renderToDisk' : '--renderToMemory=false'
    hugo = childProcess('hugo', ['server', '--bind', '127.0.0.1', '--port', String(privatePort), '--baseURL', `http://127.0.0.1:${privatePort}/`, '--appendPort=false', diskFlag, '--disableFastRender', '--disableLiveReload', '--buildDrafts', '--buildFuture', '--environment', 'development', '--config', config], workspace)
    const adminPath = path.join(workspace, 'public/admin/index.html')
    const waitUntil = async (check, timeout = timeoutMs) => {
      const until = performance.now() + timeout
      while (!closed && performance.now() < until) {
        if (!ready) startupSignal?.throwIfAborted()
        if (hugo.closed) throw problem(`Hugo stopped: ${hugo.error?.message || hugo.log}`, 503)
        const value = await check()
        if (value) return value
        await delay(80)
      }
      if (!closed) onLog(hugo.log)
      throw problem(closed ? 'Preview service closed' : 'Hugo did not render the current draft; check its front matter and template', closed ? 503 : 422)
    }
    await waitUntil(() => fs.readFile(adminPath, 'utf8').then(text => text.includes('sansoul-preview-index'), () => false))
    const initialAdmin = await fs.readFile(adminPath, 'utf8')
    const initialIndex = JSON.parse(initialAdmin.match(/<script[^>]*id="sansoul-preview-index"[^>]*>([\s\S]*?)<\/script>/)[1])
    const activeLanguages = new Set(Object.values(initialIndex.entries || {}).map(entry => entry.lang?.toLowerCase()).filter(Boolean))
    const demoFiles = new Map()
    let demoConfig
    if (demo) {
      const require = createRequire(path.join(project, 'package.json'))
      let YAML
      try { YAML = require('yaml') } catch { throw new Error('Demo preview requires the project’s installed yaml dependency; install declared dependencies first') }
      const html = await fs.readFile(adminPath, 'utf8')
      const configHref = html.match(/<link[^>]+href="([^"]+)"[^>]+rel="cms-config-url"/)?.[1] || html.match(/<link[^>]+rel="cms-config-url"[^>]+href="([^"]+)"/)?.[1]
      if (!configHref) throw new Error('Generated CMS configuration was not found')
      const configFile = path.resolve(workspace, 'public', '.' + new URL(configHref, 'http://localhost').pathname)
      if (!configFile.startsWith(path.join(workspace, 'public') + path.sep)) throw new Error('Invalid CMS configuration path')
      demoConfig = YAML.parse(await fs.readFile(configFile, 'utf8'), { merge: true, maxAliasCount: -1 })
      demoConfig.backend = { name: 'test-repo' }
      demoConfig.publish_mode = 'simple'
      const collectSeed = async (directory, relative) => {
        for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
          const name = relative + '/' + entry.name
          if (entry.isDirectory()) await collectSeed(path.join(directory, entry.name), name)
          else if (entry.isFile()) demoFiles.set(name, await fs.readFile(path.join(directory, entry.name)))
        }
      }
      for (const root of ['content', 'data']) if (await exists(path.join(workspace, root))) await collectSeed(path.join(workspace, root), root)
      for (const name of ['uploads/base/poster.png', 'uploads/base/icon.png']) if (await exists(path.join(workspace, name))) demoFiles.set(name, await fs.readFile(path.join(workspace, name)))
    }
    const proxy = (req, res) => {
      if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' })
      const upstream = http.request({ hostname: '127.0.0.1', port: privatePort, path: req.url, method: req.method, headers: { accept: req.headers.accept || '*/*', host: `127.0.0.1:${privatePort}` } }, remote => {
        const headers = { ...remote.headers, 'cache-control': 'no-store' }
        delete headers['content-length']
        delete headers['transfer-encoding']
        if (/^\/admin\/?(?:\?|$)/.test(req.url) && remote.statusCode === 200 && req.method === 'GET') {
          let html = ''
          remote.setEncoding('utf8')
          remote.on('data', chunk => { html += chunk })
          remote.on('end', () => {
            const metadata = JSON.stringify({ endpoint, token }).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
            res.writeHead(remote.statusCode, headers)
            if (demo) html = html.replace(/(<link[^>]+rel="cms-config-url"[^>]*>)/g, '<link rel="cms-config-url" href="/__sansoul/demo/config.json">').replace('</head>', '<link rel="cms-seed-url" href="/__sansoul/demo/seed/manifest.json"></head>')
            res.end(html.replace('</head>', `<meta name="sansoul-structural-preview" content="${metadata}"></head>`))
          })
        } else { res.writeHead(remote.statusCode, headers); remote.pipe(res) }
      })
      upstream.on('error', () => json(res, 503, { error: 'Hugo is unavailable' }))
      res.on('close', () => upstream.destroy())
      upstream.end()
    }
    const perform = async job => {
      if (job !== latest || closed) throw problem('Draft superseded', 409)
      await delay(debounceMs)
      if (job !== latest || closed) throw problem('Draft superseded', 409)
      await safeTarget(workspace, job.target)
      // Browser CMS backends may expose existing uploads as blob URLs. The
      // copied filesystem, rather than those transport URLs, proves availability.
      for (const reference of new Set(job.markdown.match(/(?<![A-Za-z0-9_:/.-])\/u\/[^\s)"'<>]+/g) || [])) {
        let asset
        try { asset = decodeURIComponent(reference.split(/[?#]/)[0]) } catch { throw problem('Invalid upload path') }
        const relative = path.posix.normalize('uploads/' + asset.slice(3))
        if (!relative.startsWith('uploads/') || asset.includes('\\') || asset.includes('\0')) throw problem('Invalid upload path')
        await safeTarget(workspace, relative)
        if (!(await exists(path.join(workspace, relative)))?.isFile()) throw problem('Guarda primero los archivos nuevos: la imagen no existe en la copia local (' + reference + ').', 422)
      }

      if (activeTarget && activeTarget !== job.target) {
        const previous = path.join(workspace, activeTarget)
        const original = originals.get(activeTarget)
        if (original === null) await fs.rm(previous, { force: true })
        else await fs.writeFile(previous, original)
      }
      const file = path.join(workspace, job.target)
      if (!originals.has(job.target)) originals.set(job.target, await fs.readFile(file).catch(error => { if (error.code !== 'ENOENT') throw error; return null }))
      activeTarget = job.target
      await fs.mkdir(path.dirname(file), { recursive: true })
      // Atomic replacement avoids Hugo observing a partially written draft.
      const temporary = `${file}.sansoul-tmp`
      const proof = randomBytes(16).toString('hex')
      const marked = markStructuralDraft(job.markdown, proofKey, proof)
      await fs.writeFile(temporary, marked)
      await fs.rename(temporary, file)
      const written = performance.now()
      let route
      await waitUntil(async () => {
        if (job !== latest) throw problem('Draft superseded', 409)
        let admin
        try { admin = await fs.readFile(adminPath, 'utf8') } catch { return false }
        const raw = admin.match(/<script[^>]*id="sansoul-preview-index"[^>]*>([\s\S]*?)<\/script>/)?.[1]
        if (!raw) return false
        let index
        try { index = JSON.parse(raw) } catch { return false }
        route = index.entries?.[job.target]?.url
        if (typeof route !== 'string' || !route.startsWith('/') || route.startsWith('//')) return false
        const pathname = new URL(route, 'http://localhost').pathname
        let output = path.resolve(workspace, 'public', '.' + decodeURIComponent(pathname))
        if (!output.startsWith(path.join(workspace, 'public') + path.sep)) return false
        if (pathname.endsWith('/')) output = path.join(output, 'index.html')
        const html = await fs.readFile(output, 'utf8').catch(() => '')
        if (!html.includes(`content="${job.target}" data-sha256="${hash(marked)}" data-proof="${proof}"`)) return false
        if (index.entries[job.target].lang.toLowerCase() !== job.target.match(/\.([a-zA-Z][a-zA-Z0-9-]*)\.md$/)[1].toLowerCase()) throw problem('Hugo ha renderizado un idioma distinto al del borrador.', 422)
        return true
      })
      if (job !== latest) throw problem('Draft superseded', 409)
      return { url: `${route}${route.includes('?') ? '&' : '?'}sansoul_structural_generation=${job.generation}`, generation: job.generation, requestId: job.requestId, hugoPid: hugo.pid, copiedMs: Math.round(copiedMs), renderMs: Math.round(performance.now() - written), totalMs: Math.round(performance.now() - job.started) }
    }
    server = http.createServer(async (req, res) => {
      const address = server.address()
      const origin = `http://127.0.0.1:${address.port}`
      if (req.headers.host !== `127.0.0.1:${address.port}`) return json(res, 403, { error: 'Invalid host' })
      if (req.headers.origin && req.headers.origin !== origin) return json(res, 403, { error: 'Invalid origin' })
      if (demo && req.method === 'GET') {
        const route = req.url?.split('?')[0]
        if (route === '/__sansoul/demo/config.json') return json(res, 200, demoConfig)
        if (route === '/__sansoul/demo/seed/manifest.json') return json(res, 200, { files: [...demoFiles.keys()] })
        if (route?.startsWith('/__sansoul/demo/seed/')) {
          const bytes = demoFiles.get(route.slice('/__sansoul/demo/seed/'.length))
          if (!bytes) return json(res, 404, { error: 'Not found' })
          res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' })
          return res.end(bytes)
        }
      }
      if (req.url?.split('?')[0] !== endpoint) {
        if (req.url?.startsWith('/__sansoul/')) return json(res, 404, { error: 'Not found' })
        return proxy(req, res)
      }
      if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
      if (req.headers.origin !== origin) return json(res, 403, { error: 'Invalid origin' })
      const supplied = Buffer.from(req.headers.authorization || '')
      const expected = Buffer.from(`Bearer ${token}`)
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return json(res, 401, { error: 'Invalid preview token' })
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'JSON is required' })
      let job
      try {
        const data = await body(req)
        validDraft(data)
        const language = data.target.match(/\.([a-zA-Z][a-zA-Z0-9-]*)\.md$/)[1].toLowerCase()
        if (!activeLanguages.has(language)) throw problem(`El idioma ${language} no está activo en Hugo. Actívalo y reinicia la preview local.`, 422)
        await safeTarget(project, data.target)
        job = { ...data, requestId: typeof data.requestId === 'string' ? data.requestId.slice(0, 128) : undefined, generation: ++generation, started: performance.now() }
        latest?.reject(problem('Draft superseded', 409))
        const result = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject })
        latest = job
        requests.add(job)
        queue = queue.catch(() => {}).then(() => perform(job)).then(job.resolve, job.reject)
        req.on('aborted', () => { if (latest === job) latest = null; job.reject(problem('Draft cancelled', 409)) })
        json(res, 200, await result)
      } catch (error) { json(res, error.status || 500, { error: error.message }) } finally { if (job) requests.delete(job) }
    })
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(port), '127.0.0.1', resolve) })
    const url = `http://127.0.0.1:${server.address().port}`
    startupSignal?.throwIfAborted()
    ready = true
    onLog(`Structural preview ready at ${url}/admin/`)
    return { url, workspace, hugoPid: hugo.pid, copiedMs, close }
  } catch (error) { await close(); throw error }
}

async function main () {
  const args = process.argv.slice(2)
  let port = 13164
  const demo = args.includes('--demo')
  const remaining = args.filter(arg => arg !== '--demo')
  if (remaining.length) {
    if (remaining.length !== 2 || remaining[0] !== '--port') throw new Error('Usage: node <engine>/scripts/structural-preview-server.js [--demo] [--port 13164]')
    port = Number(remaining[1])
  }
  let service
  let stopping = false
  const controller = new AbortController()
  const stop = async () => {
    if (stopping) return
    stopping = true
    controller.abort()
    await service?.close()
  }
  const onStop = () => { stop().catch(error => { console.error(error.message); process.exitCode = 1 }) }
  process.once('SIGINT', onStop)
  process.once('SIGTERM', onStop)
  process.once('SIGHUP', onStop)
  try {
    service = await startStructuralPreviewServer({ port, demo, onLog: console.log, startupSignal: controller.signal })
    if (stopping) await service.close()
  } catch (error) { if (error !== controller.signal.reason) throw error }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
