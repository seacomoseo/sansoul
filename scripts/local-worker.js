/*
Purpose: Run the project Worker locally behind `sh do local`, so forms and
  commerce work against local D1/KV without touching Cloudflare.
Run from: production-server.js, after each successful production build.
Side effects: Writes worker/entry.generated.js and worker/wrangler.jsonc
  (worker-config.js without --resolve), applies D1 migrations to the local
  state in worker/.wrangler/state and runs `wrangler dev` on 127.0.0.1.
Safety: FORMS_PROVIDER is forced to `hold` (nothing is delivered) and
  COMMERCE_ENV to `test` (Stripe only accepts test keys). Optional secrets go in
  worker/.dev.vars, which Git ignores.
*/
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import path from 'node:path'
import { relativeEnginePath } from './engine-paths.js'
import { readProject } from './project.js'
import { planWorker, renderConfig, renderEntry } from './worker-config.js'

export const LOCAL_VARS = Object.freeze({ FORMS_PROVIDER: 'hold', COMMERCE_ENV: 'test' })
const STATE = path.join('worker', '.wrangler', 'state')

// The Worker checks origins against the public site (baseURL): it sees that
// URL through --local-upstream, and the proxy maps the local Origin to it.
export function wranglerDevArgs ({ port, baseURL }) {
  const site = new URL(baseURL)
  return ['dev', '--config', 'worker/wrangler.jsonc', '--ip', '127.0.0.1', '--port', String(port),
    '--local-upstream', site.host, '--upstream-protocol', site.protocol.replace(':', ''),
    '--persist-to', STATE, '--show-interactive-dev-session=false',
    ...Object.entries(LOCAL_VARS).flatMap(([key, value]) => ['--var', `${key}:${value}`])]
}

export function writeLocalWorker (projectDir) {
  const plan = planWorker(projectDir, { core: relativeEnginePath(projectDir) })
  if (!plan.forms && !plan.commerce) return null
  const dir = path.join(projectDir, 'worker')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'entry.generated.js'), renderEntry(plan))
  fs.writeFileSync(path.join(dir, 'wrangler.jsonc'), renderConfig(plan))
  return plan
}

function freePort () {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

function wranglerCommand (projectDir) {
  const core = path.join(projectDir, relativeEnginePath(projectDir))
  const version = JSON.parse(fs.readFileSync(path.join(core, 'package.json'), 'utf8')).devDependencies.wrangler
  return args => ['npx', ['--yes', `wrangler@${version}`, ...args]]
}

function run (lifecycle, [command, args], options) {
  const child = lifecycle.track(spawn(command, args, { ...options, detached: process.platform !== 'win32' }))
  return { child, done: new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code)) }) }
}

// Returns null when the project has no Worker backend; otherwise the running
// Worker ({ port, origin, child }). Rejects when migrations or startup fail.
export async function startLocalWorker ({ projectDir, lifecycle, log = console.log, timeoutMs = 60000 }) {
  const plan = writeLocalWorker(projectDir)
  if (!plan) return null
  const { baseURL } = readProject(projectDir)
  const wrangler = wranglerCommand(projectDir)
  const env = { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' }
  for (const { binding } of plan.databases) {
    const { child, done } = run(lifecycle, wrangler(['d1', 'migrations', 'apply', binding, '--local', '--config', 'worker/wrangler.jsonc', '--persist-to', STATE]), { cwd: projectDir, env, stdio: ['ignore', 'ignore', 'inherit'] })
    const code = await done
    await lifecycle.waitForChild(child)
    if (code !== 0) throw new Error(`local D1 migrations failed for ${binding}`)
  }
  const port = await freePort()
  const { child, done } = run(lifecycle, wrangler(wranglerDevArgs({ port, baseURL })), { cwd: projectDir, env, stdio: ['ignore', 'ignore', 'inherit'] })
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const exited = await Promise.race([done.then(code => ({ code })), new Promise(resolve => setTimeout(resolve, 500))])
    if (exited) {
      await lifecycle.waitForChild(child)
      throw new Error(`wrangler dev exited with ${exited.code}`)
    }
    if (await reachable(port)) {
      log(`Worker (forms/commerce, local D1/KV, ${Object.entries(LOCAL_VARS).map(pair => pair.join('=')).join(', ')}) on /api/*`)
      return { port, origin: new URL(baseURL).origin, child }
    }
  }
  // Never leave a stray Worker sharing the local state with the next one.
  await lifecycle.stopChildAndWait(child)
  throw new Error('wrangler dev did not start in time')
}

function reachable (port) {
  return new Promise(resolve => {
    const probe = httpRequest({ host: '127.0.0.1', port, path: '/', method: 'HEAD', timeout: 1000 }, response => { response.resume(); resolve(true) })
    probe.once('error', () => resolve(false))
    probe.once('timeout', () => { probe.destroy(); resolve(false) })
    probe.end()
  })
}

// Streams /api/* to the local Worker. A local browser Origin becomes the public
// origin the Worker expects; any other Origin passes unchanged (and fails there).
export function proxyToWorker (request, response, { port, origin, localOrigins }) {
  const headers = { ...request.headers, host: new URL(origin).host }
  if (localOrigins.includes(headers.origin)) headers.origin = origin
  const upstream = httpRequest({ host: '127.0.0.1', port, path: request.url, method: request.method, headers }, answer => {
    response.writeHead(answer.statusCode, answer.headers)
    answer.pipe(response)
  })
  upstream.once('error', () => {
    if (response.headersSent) return response.destroy()
    response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
    response.end('Local Worker unavailable.')
  })
  response.once('close', () => { if (!response.writableFinished) upstream.destroy() })
  request.pipe(upstream)
}
