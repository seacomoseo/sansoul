import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createServer, request } from 'node:http'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOCAL_VARS, proxyToWorker, wranglerDevArgs, writeLocalWorker } from '../local-worker.js'
import { serveOutput } from '../production-server.js'

const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

test('wrangler dev sees the public site and forces safe providers', () => {
  const args = wranglerDevArgs({ port: 9000, baseURL: 'https://www.example.com/' })
  const value = flag => args[args.indexOf(flag) + 1]
  assert.equal(value('--local-upstream'), 'www.example.com')
  assert.equal(value('--upstream-protocol'), 'https')
  assert.equal(value('--ip'), '127.0.0.1')
  assert.equal(value('--port'), '9000')
  assert.deepEqual(LOCAL_VARS, { FORMS_PROVIDER: 'hold', COMMERCE_ENV: 'test' })
  assert.ok(args.includes('FORMS_PROVIDER:hold') && args.includes('COMMERCE_ENV:test'))
})

test('local Worker files are written only for projects with a backend', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-local-worker-'))
  const write = () => {
    // Through the consumer path, as `sh do local` runs it (core is a symlink here).
    const script = "import { writeLocalWorker } from './core/scripts/local-worker.js'; console.log(JSON.stringify(writeLocalWorker(process.cwd())?.databases?.map(db => db.binding) ?? null))"
    const result = spawnSync(process.execPath, ['--preserve-symlinks', '--input-type=module', '-e', script], { cwd: project, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return JSON.parse(result.stdout)
  }
  try {
    fs.symlinkSync(engine, path.join(project, 'core'))
    fs.writeFileSync(path.join(project, 'hugo.yml'), 'baseURL: https://example.com/\nparams:\n  owner: acme\n  repo: site\n')
    assert.equal(write(), null)
    assert.equal(fs.existsSync(path.join(project, 'worker/wrangler.jsonc')), false)
    fs.mkdirSync(path.join(project, 'worker'))
    fs.writeFileSync(path.join(project, 'worker/forms.generated.js'), 'export const manifest = {\n  "forms": {\n    "a#b": "x"\n  }\n}\n')
    assert.deepEqual(write(), ['FORMS_DB'])
    const config = JSON.parse(fs.readFileSync(path.join(project, 'worker/wrangler.jsonc'), 'utf8').replace(/^\/\/.*\n/, ''))
    assert.equal(config.account_id, undefined)
    assert.equal(config.d1_databases[0].database_id, 'local-site-forms')
    assert.match(fs.readFileSync(path.join(project, 'worker/entry.generated.js'), 'utf8'), /createFormsWorker/)
  } finally {
    fs.rmSync(project, { recursive: true, force: true })
  }
})

function listen (handler) {
  return new Promise(resolve => {
    const server = createServer(handler)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

function send (port, { method = 'POST', headers = {}, body = '' }) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/api/forms/submit?x=1', method, headers }, response => {
      let text = ''
      response.on('data', chunk => { text += chunk })
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, text }))
    })
    req.once('error', reject)
    req.end(body)
  })
}

test('proxy maps the local Origin to the public one and streams both ways', async () => {
  const seen = []
  const worker = await listen((req, res) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      seen.push({ url: req.url, host: req.headers.host, origin: req.headers.origin, body })
      res.writeHead(201, { 'set-cookie': 'a=b; Path=/', 'content-type': 'application/json' })
      res.end('{"ok":true}')
    })
  })
  const options = { port: worker.address().port, origin: 'https://www.example.com', localOrigins: ['http://localhost:1313'] }
  const front = await listen((req, res) => proxyToWorker(req, res, options))
  try {
    const port = front.address().port
    let answer = await send(port, { headers: { origin: 'http://localhost:1313' }, body: 'field=1' })
    assert.equal(answer.status, 201)
    assert.equal(answer.headers['set-cookie'][0], 'a=b; Path=/')
    assert.equal(answer.text, '{"ok":true}')
    assert.deepEqual(seen[0], { url: '/api/forms/submit?x=1', host: 'www.example.com', origin: 'https://www.example.com', body: 'field=1' })
    answer = await send(port, { headers: { origin: 'https://evil.example' } })
    assert.equal(seen[1].origin, 'https://evil.example')
  } finally {
    front.close()
    worker.close()
  }
  const down = await listen((req, res) => proxyToWorker(req, res, { ...options, port: 1 }))
  try {
    assert.equal((await send(down.address().port, {})).status, 502)
  } finally {
    down.close()
  }
})

test('production server: /api/* goes to the Worker, or 503 while it is unavailable', async () => {
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-local-api-'))
  let worker = null
  let expects = true
  const proxied = []
  const handler = serveOutput(publicDir, () => true, {
    worker: () => worker,
    backend: () => expects,
    proxy: (req, res, options) => { proxied.push(options); res.writeHead(200); res.end('worker') },
    localOrigins: ['http://localhost:1313']
  })
  const front = await listen(handler)
  try {
    const port = front.address().port
    let answer = await send(port, {})
    assert.equal(answer.status, 503)
    assert.equal(answer.headers['retry-after'], '2')
    worker = { port: 1, origin: 'https://www.example.com' }
    answer = await send(port, {})
    assert.equal(answer.text, 'worker')
    assert.deepEqual(proxied[0], { port: 1, origin: 'https://www.example.com', localOrigins: ['http://localhost:1313'] })
    worker = null
    expects = false
    assert.equal((await send(port, {})).status, 405)
  } finally {
    front.close()
    fs.rmSync(publicDir, { recursive: true, force: true })
  }
})
