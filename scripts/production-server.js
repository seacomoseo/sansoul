/*
Purpose: Serve complete production builds and serialize rebuilds after source changes.
Run from: A consumer project root. Never run beside another SanSoul build/server.
Side effects: Runs the normal build pipeline; removes generated output on exit.
*/
import { createServer } from 'node:http'
import { createReadStream, existsSync, lstatSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Lifecycle } from './lifecycle.js'
import { relativeEnginePath } from './engine-paths.js'

const ignoredDirectories = new Set(['.git', 'node_modules', '.sansoul-dev.lock'])
const ignoredFiles = new Set(['.hugo_build.lock', '.DS_Store'])
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf', '.yml': 'application/yaml', '.yaml': 'application/yaml'
}

export function parseOptions (args) {
  const options = { port: 1313, bind: 'localhost' }
  for (let index = 0; index < args.length; index++) {
    const [name, inline] = args[index].split('=')
    if (name === '--help' || name === '-h') return { help: true }
    if (!['--port', '--bind'].includes(name)) throw new Error(`Unknown local option: ${args[index]}`)
    const value = inline === undefined ? args[++index] : inline
    if (!value) throw new Error(`Missing value for ${name}`)
    if (name === '--port') {
      const port = Number(value)
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be an integer between 1 and 65535')
      options.port = port
    } else options.bind = value
  }
  return options
}

// Polling also covers new/deleted directories without relying on platform-specific
// recursive fs.watch support. Only known generated output paths are excluded, not content folders with the same name.
export function sourceSnapshot (directory) {
  const files = new Map()
  function visit (relative = '') {
    const absolute = path.join(directory, relative)
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (ignoredDirectories.has(entry.name) || ignoredFiles.has(entry.name)) continue
      const child = path.join(relative, entry.name)
      if (['public', 'resources', 'worker', 'functions/_commerce', 'core/prebuild/public', 'themes/sansoul/prebuild/public'].includes(child.split(path.sep).join('/'))) continue
      try {
        const stats = lstatSync(path.join(directory, child))
        if (stats.isDirectory()) visit(child)
        else if (stats.isFile() || stats.isSymbolicLink()) files.set(child, `${stats.mtimeMs}:${stats.ctimeMs}:${stats.size}`)
      } catch (error) {
        if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error
      }
    }
  }
  visit()
  return files
}

export function changedSources (previous, current) {
  return [...new Set([...previous.keys(), ...current.keys()])].filter(file => previous.get(file) !== current.get(file))
}

// worker(): the running local Worker ({ port, origin }) or null; /api/* goes
// there through proxy() when the project has a forms/commerce backend.
export function serveOutput (publicDir, isReady, { worker = () => null, backend: expectsWorker = () => false, proxy, localOrigins = [] } = {}) {
  return (request, response) => {
    const fail = (code, message) => {
      response.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
      response.end(request.method === 'HEAD' ? undefined : message)
    }
    const backend = worker()
    if (/^\/api\//.test(request.url)) {
      if (backend && isReady()) return proxy(request, response, { ...backend, localOrigins })
      if (expectsWorker()) {
        response.setHeader('Retry-After', '2')
        return fail(503, 'Local Worker unavailable: building, or it failed to start (see the local log).')
      }
    }
    if (!['GET', 'HEAD'].includes(request.method)) return fail(405, 'Only GET and HEAD are supported.')
    if (!isReady()) {
      response.setHeader('Retry-After', '1')
      return fail(503, 'Production build unavailable. Check the local build log and reload after a successful build.')
    }
    let pathname
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname) } catch { return fail(400, 'Invalid URL') }
    if (pathname.includes('\0')) return fail(400, 'Invalid URL')
    const root = path.resolve(publicDir)
    let file = path.resolve(root, `.${pathname}`)
    const inside = value => value.startsWith(`${root}${path.sep}`)
    if (!inside(file) && file !== root) return fail(403, 'Forbidden')
    let status = 200
    try {
      if (statSync(file).isDirectory()) {
        if (!pathname.endsWith('/')) {
          response.writeHead(301, { Location: `${pathname}/${new URL(request.url, 'http://localhost').search}` })
          return response.end()
        }
        file = path.join(file, 'index.html')
      }
      if (!existsSync(file)) throw Object.assign(new Error('Not found'), { code: 'ENOENT' })
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) return fail(500, 'Unable to read generated output')
      file = path.join(root, '404.html')
      status = 404
      if (!existsSync(file)) return fail(404, 'Not found')
    }
    try {
      if (!inside(realpathSync(file))) return fail(403, 'Forbidden')
      const stats = statSync(file)
      if (!stats.isFile()) return fail(404, 'Not found')
      const headers = { 'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' }
      let start = 0
      let end = stats.size - 1
      if (request.headers.range && status === 200) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range)
        if (!match || (!match[1] && !match[2])) return fail(416, 'Invalid range')
        start = match[1] ? Number(match[1]) : Math.max(0, stats.size - Number(match[2]))
        end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end
        if (start > end || start >= stats.size) {
          response.setHeader('Content-Range', `bytes */${stats.size}`)
          return fail(416, 'Range unavailable')
        }
        status = 206
        headers['Content-Range'] = `bytes ${start}-${end}/${stats.size}`
      }
      headers['Content-Length'] = stats.size ? end - start + 1 : 0
      response.writeHead(status, headers)
      if (request.method === 'HEAD' || !stats.size) return response.end()
      const stream = createReadStream(file, { start, end })
      stream.on('error', () => response.destroy())
      response.on('close', () => stream.destroy())
      stream.pipe(response)
    } catch { fail(500, 'Unable to read generated output') }
  }
}

export async function startProductionServer (options = {}) {
  const { port = 1313, bind = 'localhost', projectDir = process.cwd(), pollMs = 400, debounceMs = 200 } = options
  relativeEnginePath(projectDir)
  const lifecycle = new Lifecycle({ projectDir, label: 'LOCAL' })
  lifecycle.acquire()
  let snapshot
  let timer
  let debounce
  let building = false
  let pending = false
  let ready = false
  let stopping = false
  let latestBuildFailed = false
  let worker = null
  let hasBackend = false
  let localWorker
  const localOrigins = [...new Set([bind, 'localhost', '127.0.0.1'].map(host => `http://${host}:${port}`))]
  const server = createServer(serveOutput(path.join(projectDir, 'public'), () => ready, { worker: () => worker, backend: () => hasBackend, proxy: (...args) => localWorker.proxyToWorker(...args), localOrigins }))
  const log = message => console.log(`LOCAL ${message}`)
  let shutdownPromise
  const shutdown = (code = 0) => {
    if (shutdownPromise) return shutdownPromise
    stopping = true
    ready = false
    clearInterval(timer)
    clearTimeout(debounce)
    shutdownPromise = (async () => {
      server.closeAllConnections()
      await new Promise(resolve => server.close(resolve))
      const stopped = await lifecycle.stopChildren()
      if (stopped) {
        try { lifecycle.removeGeneratedOutputs() } finally { lifecycle.release() }
      } else {
        console.error('LOCAL Unable to stop the build safely; leaving generated output and lifecycle lock intact.')
        code = 1
      }
      process.exitCode = code || (latestBuildFailed ? 1 : 0)
      for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.removeListener(signal, onSignal)
    })()
    return shutdownPromise
  }
  const onSignal = () => { shutdown().catch(error => { console.error(error); process.exitCode = 1 }) }
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, onSignal)

  async function rebuild () {
    if (stopping) return
    if (building) { pending = true; return }
    building = true
    ready = false
    log('Building production (prebuild, Hugo, image processing and CMS validation)…')
    try {
      // The build regenerates the Worker inputs: restart it afterwards.
      if (worker) {
        const previous = worker
        worker = null
        await lifecycle.stopChildAndWait(previous.child)
      }
      const child = lifecycle.track(spawn('sh', ['do', 'build'], {
        cwd: projectDir,
        env: { ...process.env, SANSOUL_LIFECYCLE_TOKEN: lifecycle.lockToken, SANSOUL_BUILD_PRODUCTION: '1' },
        stdio: 'inherit', detached: process.platform !== 'win32'
      }))
      const result = await new Promise((resolve, reject) => {
        child.once('error', reject)
        child.once('exit', (code, signal) => resolve({ code, signal }))
      })
      const stopped = await lifecycle.waitForChild(child)
      latestBuildFailed = result.code !== 0 || Boolean(result.signal) || !stopped
      if (!latestBuildFailed && !stopping) {
        try {
          // Loaded only for projects whose build produced a Worker backend.
          hasBackend = ['worker/forms.generated.js', 'functions/_commerce/catalog.generated.js'].some(file => existsSync(path.join(projectDir, file)))
          if (hasBackend) {
            localWorker ||= await import('./local-worker.js')
            worker = await localWorker.startLocalWorker({ projectDir, lifecycle, log })
            // An empty forms manifest needs no Worker.
            if (!worker) hasBackend = false
          }
        } catch (error) {
          console.error(`LOCAL Worker unavailable (static pages still served): ${error.message}`)
        }
      }
      if (!stopping) {
        ready = !latestBuildFailed
        log(ready ? `Production ready at http://${bind}:${port}/` : 'Build failed; serving HTTP 503 until a successful source change rebuild.')
      }
    } catch (error) {
      latestBuildFailed = true
      console.error(`LOCAL Build failed: ${error.message}`)
    } finally {
      building = false
      if (pending && !stopping) { pending = false; await rebuild() }
    }
  }
  try {
    snapshot = sourceSnapshot(projectDir)
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, bind, resolve)
    })
    timer = setInterval(() => {
      try {
        const current = sourceSnapshot(projectDir)
        const changes = changedSources(snapshot, current)
        snapshot = current
        if (!changes.length) return
        clearTimeout(debounce)
        debounce = setTimeout(() => rebuild().catch(error => { console.error(error); shutdown(1) }), debounceMs)
      } catch (error) { console.error(error); shutdown(1) }
    }, pollMs)
    await rebuild()
  } catch (error) {
    await shutdown(1)
    throw error
  }
  return { server, shutdown }
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : '').href) {
  try {
    const options = parseOptions(process.argv.slice(2))
    if (options.help) console.log('sh do local [--port 1313] [--bind localhost]\nFull production rebuild on source changes; /api/* runs the project Worker locally (forms held, commerce test). live aliases local. Exit removes public/resources.')
    else await startProductionServer(options)
  } catch (error) {
    console.error(`LOCAL ${error.message}`)
    process.exitCode = 1
  }
}
