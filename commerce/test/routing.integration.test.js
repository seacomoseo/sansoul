import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../scripts/build-catalog.js'
import { makeStripeSignature } from '../signature.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const THEME = resolve(TEST_DIR, '../..')
const FUNCTION_FIXTURE = resolve(THEME, '_examples/commerce-backend/functions')
const WORKERS = process.env.COMMERCE_RUNTIME === 'workers'
const WRANGLER = resolve(THEME, 'node_modules/wrangler/bin/wrangler.js')
const ORDER_ID = '33333333-3333-4333-8333-333333333333'
const IDEMPOTENCY_KEY = 'routing-order-replay'
const SESSION_ID = 'cs_test_routing001'
const ADMIN_TOKEN = 'local-commerce-routing-admin-token'
const WEBHOOK_SECRET = 'whsec_local_routing_fixture'
const STATUS_TOKEN = 'c'.repeat(64)

function runWrangler (args, cwd, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WRANGLER, ...args], {
      cwd,
      env: { ...process.env, CI: '1', CLOUDFLARE_SEND_METRICS: 'false' },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let output = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout)
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    child.on('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve(output)
      else reject(new Error(`wrangler exited ${code}: ${output.slice(-8000)}`))
    })
  })
}

async function unusedPort () {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise(resolve => server.close(resolve))
  return port
}

function startPages (cwd, publicDir, port, origin, bindings = []) {
  const args = [
    WRANGLER,
    ...(WORKERS ? ['dev', '--local'] : ['pages', 'dev', publicDir]),
    '--port', String(port),
    '--ip', '127.0.0.1',
    '--show-interactive-dev-session=false',
    '--binding', 'COMMERCE_ENV=test',
    '--binding', 'COMMERCE_PROVIDER=fake',
    '--binding', 'COMMERCE_TEST_FIXTURE=synthetic-commerce-test',
    '--binding', `COMMERCE_TEST_ORIGIN=${origin}`,
    '--binding', `FAKE_WEBHOOK_SECRET=${WEBHOOK_SECRET}`,
    '--binding', 'COMMERCE_ADMIN_TOKEN=local-commerce-routing-admin-token',
    '--binding', 'COMMERCE_RATE_LIMIT_SALT=local-test-rate-limit-salt-32-bytes',
    ...bindings
  ]
  const child = spawn(process.execPath, WORKERS ? args.map((arg, index) => arg === '--binding' ? '--var' : args[index - 1] === '--binding' ? arg.replace('=', ':') : arg) : args, {
    cwd,
    env: { ...process.env, CI: '1', CLOUDFLARE_SEND_METRICS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.output = ''
  child.stdout.on('data', chunk => { child.output += chunk })
  child.stderr.on('data', chunk => { child.output += chunk })
  return child
}

async function waitForRoute (server, url, expectedStatus) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error(`Wrangler Pages stopped early: ${server.output.slice(-8000)}`)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) })
      if (response.status === expectedStatus) return response
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Wrangler Pages did not become ready: ${server.output.slice(-8000)}`)
}

async function stopPages (server) {
  if (!server || server.exitCode !== null) return
  await new Promise(resolve => {
    const timer = setTimeout(() => server.kill('SIGKILL'), 5000)
    server.once('close', () => {
      clearTimeout(timer)
      resolve()
    })
    server.kill('SIGTERM')
  })
}

function sqlString (value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

test('generated Pages routes disable never-commerce but preserve signed order APIs when sales are paused', { timeout: 240000 }, async () => {
  const workspace = mkdtempSync(resolve(process.env.TMPDIR || tmpdir(), 'commerce-routing-'))
  let server

  try {
    const functionsDir = resolve(workspace, 'functions')
    const publicDir = resolve(workspace, 'public')
    const databaseName = 'commerce-routing'
    const port = await unusedPort()
    const origin = `http://127.0.0.1:${port}`
    cpSync(FUNCTION_FIXTURE, functionsDir, { recursive: true })
    if (WORKERS) {
      const entry = readFileSync(resolve(THEME, '_examples/commerce-backend/worker.js'), 'utf8').replace('export default createCommerceWorker', 'const worker = createCommerceWorker')
      writeFileSync(resolve(workspace, 'worker.js'), `${entry}
export default { async fetch (...args) { const response = await worker.fetch(...args); const headers = new Headers(response.headers); headers.set('x-test-worker-invoked', 'true'); headers.set('x-test-worker-path', new URL(args[0].url).pathname); return new Response(response.body, { status: response.status, headers }) } }
`)
    }
    symlinkSync(THEME, resolve(workspace, 'core'), 'dir')
    writeFileSync(resolve(workspace, 'wrangler.toml'), [
      'name = "commerce-routing"',
      'compatibility_date = "2025-12-10"',
      ...(WORKERS ? ['main = "worker.js"', '[assets]', `directory = "${publicDir}"`, 'binding = "ASSETS"', 'run_worker_first = ["/api/commerce/*"]', 'not_found_handling = "404-page"'] : [`pages_build_output_dir = "${publicDir}"`]),
      '',
      '[[d1_databases]]',
      'binding = "COMMERCE_DB"',
      `database_name = "${databaseName}"`,
      'database_id = "00000000-0000-0000-0000-000000000001"',
      ''
    ].join('\n'))

    const neverCommerce = buildCatalog(workspace)
    assert.equal(neverCommerce.enabled, false)
    assert.equal(neverCommerce.functionsEnabled, false)
    assert.deepEqual(JSON.parse(readFileSync(resolve(publicDir, '_routes.json'), 'utf8')), {
      version: 1,
      include: ['/'],
      exclude: ['/']
    })

    await runWrangler(['d1', 'execute', databaseName, '--local', '--file', resolve(THEME, 'commerce/migrations/0001_commerce.sql')], workspace)
    await runWrangler(['d1', 'execute', databaseName, '--local', '--file', resolve(THEME, 'commerce/migrations/0002_buyer_status.sql')], workspace)
    await runWrangler(['d1', 'execute', databaseName, '--local', '--file', resolve(THEME, 'commerce/migrations/0003_provider_session_expiry.sql')], workspace)
    await runWrangler(['d1', 'execute', databaseName, '--local', '--file', resolve(THEME, 'commerce/migrations/0004_operations_and_delivery.sql')], workspace)
    await runWrangler(['d1', 'execute', databaseName, '--local', '--file', resolve(THEME, 'commerce/migrations/0005_outbox_indexes.sql')], workspace)
    await runWrangler(['d1', 'execute', databaseName, '--local', '--file', resolve(THEME, 'commerce/migrations/0006_bounded_maintenance.sql')], workspace)

    const now = Math.floor(Date.now() / 1000)
    const requestHash = createHash('sha256').update(JSON.stringify([{ id: '11111111-1111-4111-8111-111111111111', quantity: 1 }])).digest('hex')
    const snapshot = JSON.stringify({
      orderId: ORDER_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      catalogRelease: 'a'.repeat(64),
      currency: 'eur',
      stockMode: 'made_to_order',
      createdAt: now,
      items: [],
      subtotalMinor: 1000,
      totalMinor: 1000
    })
    const capabilityHash = createHash('sha256').update(STATUS_TOKEN).digest('hex')
    const seedPath = resolve(workspace, 'routing-fixture.sql')
    writeFileSync(seedPath, [
      `INSERT INTO commerce_idempotency (idempotency_key, request_hash, order_id, snapshot_json, status, session_id, checkout_url, created_at, updated_at, expires_at) VALUES (${sqlString(IDEMPOTENCY_KEY)}, ${sqlString(requestHash)}, ${sqlString(ORDER_ID)}, ${sqlString(snapshot)}, 'ready', ${sqlString(SESSION_ID)}, 'https://checkout.example.invalid/session', ${now}, ${now}, ${now + 1800});`,
      `INSERT INTO orders (id, session_id, idempotency_key, catalog_release, currency, amount_total_minor, snapshot_json, payment_status, fulfillment_status, reservation_state, created_at, updated_at, expires_at) VALUES (${sqlString(ORDER_ID)}, ${sqlString(SESSION_ID)}, ${sqlString(IDEMPOTENCY_KEY)}, '${'a'.repeat(64)}', 'eur', 1000, ${sqlString(snapshot)}, 'pending', 'awaiting_payment', 'unreserved', ${now}, ${now}, ${now + 1800});`,
      `INSERT INTO order_status_capabilities (capability_hash, order_id, idempotency_key, session_id, created_at, updated_at, expires_at) VALUES (${sqlString(capabilityHash)}, ${sqlString(ORDER_ID)}, ${sqlString(IDEMPOTENCY_KEY)}, ${sqlString(SESSION_ID)}, ${now}, ${now}, ${now + 3600});`
    ].join('\n'))
    await runWrangler(['d1', 'execute', databaseName, '--local', '--file', seedPath], workspace)

    if (WORKERS) {
      writeFileSync(resolve(publicDir, 'index.html'), '<h1>Static fixture</h1>')
      writeFileSync(resolve(publicDir, '404.html'), '<h1>Not found fixture</h1>')
      writeFileSync(resolve(publicDir, 'fixture.css'), 'body { color: black }')
      writeFileSync(resolve(publicDir, '_redirects'), '/old / 301\n')
      writeFileSync(resolve(publicDir, '_headers'), '/fixture.css\n  X-Static-Fixture: yes\n')
    }
    server = startPages(workspace, publicDir, port, origin)
    const inactiveRoute = await waitForRoute(server, `${origin}/api/commerce/status/${ORDER_ID}`, 404)
    if (WORKERS) assert.deepEqual(await inactiveRoute.json(), { error: 'commerce_unavailable' })
    else assert.notEqual(inactiveRoute.headers.get('content-type')?.split(';')[0], 'application/json')
    if (WORKERS) {
      assert.equal(inactiveRoute.headers.get('x-test-worker-invoked'), 'true')
      for (const [path, status] of [['/', 200], ['/fixture.css', 200], ['/missing-page', 404], ['/missing.css', 404], ['/api/commerce', 404], ['/api/commerceevil/checkout', 404], ['/api/commerce-admin/orders', 404], ['/API/commerce/checkout', 404]]) {
        const response = await fetch(`${origin}${path}`)
        assert.equal(response.status, status)
        assert.equal(response.headers.get('x-test-worker-invoked'), null, `static path entered Worker: ${path}`)
      }
      // Known runtime normalization: both asset selection and the Request path
      // decode %2F. Guards apply to the normalized prefix, NOT to the raw wire URL;
      // this is NOT proof of zero invocations outside raw API URLs.
      const encodedSeparator = await fetch(`${origin}/api/commerce%2Fcheckout`)
      assert.equal(encodedSeparator.status, 404)
      assert.equal(encodedSeparator.headers.get('x-test-worker-invoked'), 'true')
      const encodedBody = await encodedSeparator.text()
      console.error('[encoded-prefix]', encodedSeparator.headers.get('x-test-worker-path'), encodedBody)
      assert.equal(encodedSeparator.headers.get('x-test-worker-path'), '/api/commerce/checkout')
      assert.deepEqual(JSON.parse(encodedBody), { error: 'commerce_unavailable' })
      assert.equal((await fetch(`${origin}/fixture.css`)).headers.get('x-static-fixture'), 'yes')
      const redirect = await fetch(`${origin}/old`, { redirect: 'manual' })
      assert.equal(redirect.status, 301)
      assert.equal(redirect.headers.get('x-test-worker-invoked'), null)
      const head = await fetch(`${origin}/`, { method: 'HEAD' })
      assert.equal(head.status, 200)
      assert.equal(head.headers.get('x-test-worker-invoked'), null)
    }
    await stopPages(server)
    server = null

    mkdirSync(resolve(workspace, 'data'), { recursive: true })
    writeFileSync(resolve(workspace, 'data/commerce.yml'), 'enabled: false\nfunctions_enabled: true\ncheckout_approved: false\n')
    const pausedCatalog = buildCatalog(workspace)
    assert.equal(pausedCatalog.enabled, false)
    assert.equal(pausedCatalog.functionsEnabled, true)
    assert.deepEqual(JSON.parse(readFileSync(resolve(publicDir, '_routes.json'), 'utf8')), {
      version: 1,
      include: ['/api/commerce/*'],
      exclude: []
    })

    server = startPages(workspace, publicDir, port, origin)
    await waitForRoute(server, `${origin}/api/commerce/status/${ORDER_ID}`, 404)

    const statusUrl = `${origin}/api/commerce/status/${ORDER_ID}`
    const privateStatus = await fetch(statusUrl)
    assert.equal(privateStatus.status, 404)
    assert.deepEqual(await privateStatus.json(), { error: 'order_not_found' })

    const checkoutRequest = () => fetch(`${origin}/api/commerce/checkout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin,
        'idempotency-key': IDEMPOTENCY_KEY
      },
      body: JSON.stringify({ items: [{ id: '11111111-1111-4111-8111-111111111111', quantity: 1 }] })
    })
    for (let attempt = 0; attempt < 2; attempt++) {
      const blockedCheckout = await checkoutRequest()
      assert.equal(blockedCheckout.status, 404)
      const body = await blockedCheckout.json()
      assert.equal(body.error, 'commerce_unavailable')
      assert.equal('checkout_url' in body, false)
    }

    const rawEvent = JSON.stringify({
      id: 'evt_routingpaid',
      type: 'checkout.session.completed',
      created: now,
      livemode: false,
      data: {
        object: {
          object: 'checkout.session',
          id: SESSION_ID,
          client_reference_id: ORDER_ID,
          metadata: { commerce_order_id: ORDER_ID },
          payment_intent: 'pi_routing001',
          payment_status: 'paid',
          amount_total: 1000,
          currency: 'eur'
        }
      }
    })
    const badWebhook = await fetch(`${origin}/api/commerce/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=bad' },
      body: rawEvent
    })
    assert.equal(badWebhook.status, 400)
    assert.deepEqual(await badWebhook.json(), { error: 'invalid_signature' })

    const signature = await makeStripeSignature(rawEvent, WEBHOOK_SECRET)
    const signedWebhook = await fetch(`${origin}/api/commerce/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': signature },
      body: rawEvent
    })
    assert.equal(signedWebhook.status, 200)
    assert.deepEqual(await signedWebhook.json(), { received: true })

    const statusAfterPayment = await fetch(statusUrl, {
      headers: { cookie: `__Secure-commerce-status-${ORDER_ID}=${STATUS_TOKEN}` }
    })
    assert.equal(statusAfterPayment.status, 200)
    assert.deepEqual(await statusAfterPayment.json(), { order_id: ORDER_ID, payment_status: 'paid' })

    const unauthorizedOrders = await fetch(`${origin}/api/commerce/admin/orders`)
    assert.equal(unauthorizedOrders.status, 401)
    assert.deepEqual(await unauthorizedOrders.json(), { error: 'unauthorized' })
    const unauthorizedExport = await fetch(`${origin}/api/commerce/admin/export.csv`)
    assert.equal(unauthorizedExport.status, 401)
    const authorization = { authorization: `Bearer ${ADMIN_TOKEN}` }
    const authorizedOrders = await fetch(`${origin}/api/commerce/admin/orders?limit=10`, { headers: authorization })
    assert.equal(authorizedOrders.status, 200)
    assert.equal((await authorizedOrders.json()).orders.length, 1)
    const authorizedExport = await fetch(`${origin}/api/commerce/admin/export.csv`, { headers: authorization })
    assert.equal(authorizedExport.status, 200)
    assert.match(await authorizedExport.text(), new RegExp(ORDER_ID))

    const unauthorizedReconcile = await fetch(`${origin}/api/commerce/admin/reconcile`, { method: 'POST' })
    assert.equal(unauthorizedReconcile.status, 401)
    const reconciled = await fetch(`${origin}/api/commerce/admin/reconcile`, { method: 'POST', headers: authorization })
    assert.equal(reconciled.status, 200)
    assert.deepEqual(await reconciled.json(), {
      operation: 'orders',
      has_more: false,
      checked: 0,
      updated: 0,
      recovered_sessions: 0,
      deferred: 0,
      failed: 0,
      unmatched_checked: 0,
      unmatched_recovered: 0,
      skipped_concurrent: 0
    })
  } finally {
    await stopPages(server)
    rmSync(workspace, { recursive: true, force: true })
  }
})
