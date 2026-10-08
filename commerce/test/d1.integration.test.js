import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { makeStripeSignature } from '../signature.js'
import { CHECKOUT_RECOVERY_TTL_SECONDS, STRIPE_IDEMPOTENCY_RETRY_TTL_SECONDS } from '../expiry.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(TEST_DIR, '../../../../')
const THEME = resolve(ROOT, 'themes/sansoul')
const WRANGLER = resolve(THEME, 'node_modules/wrangler/bin/wrangler.js')
const ADMIN_TOKEN = 'local-commerce-admin-token-not-a-secret'
const WEBHOOK_SECRET = 'whsec_local_test_only'
const firstId = '11111111-1111-4111-8111-111111111111'
const secondId = '22222222-2222-4222-8222-222222222222'
const thirdId = '33333333-3333-4333-8333-333333333333'
const quoteId = '44444444-4444-4444-8444-444444444444'
const retiredId = '55555555-5555-4555-8555-555555555555'
const fourthId = '66666666-6666-4666-8666-666666666666'
const fifthId = '77777777-7777-4777-8777-777777777777'
const sixthId = '88888888-8888-4888-8888-888888888888'
const cancelProductId = '99999999-9999-4999-8999-999999999998'

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

async function queryD1 (databaseName, sql, cwd, extraArgs = []) {
  const output = await runWrangler(['d1', 'execute', databaseName, '--local', ...extraArgs, '--json', '--command', sql], cwd)
  const results = JSON.parse(output)
  return results.flatMap(result => result.results || [])
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

async function waitForRoute (server, url, expectedStatus = 405) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error(`Wrangler Pages stopped early: ${server.output.slice(-8000)}`)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) })
      if (response.status === expectedStatus) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Wrangler Pages did not become ready: ${server.output.slice(-8000)}`)
}

function startPages (args, cwd, publicDir = resolve(ROOT, 'public')) {
  const child = spawn(process.execPath, [WRANGLER, 'pages', 'dev', publicDir, ...args], {
    cwd,
    env: { ...process.env, CI: '1', CLOUDFLARE_SEND_METRICS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.output = ''
  child.stdout.on('data', chunk => { child.output += chunk })
  child.stderr.on('data', chunk => { child.output += chunk })
  return child
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

function statusCookie (header) {
  assert.equal(typeof header, 'string')
  const pair = header.split(';', 1)[0]
  const separator = pair.indexOf('=')
  assert.ok(separator > 0)
  return { pair, name: pair.slice(0, separator), token: pair.slice(separator + 1) }
}

function sqlString (value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

// The measured full D1 run took 298585 ms; allow 2x headroom for local Wrangler startup/queries.
test('Pages Functions + local D1 checkout, webhook, operations, recovery and restore', { timeout: 600000 }, async t => {
  const started = performance.now()
  let previousStage = started
  const stage = name => {
    const now = performance.now()
    t.diagnostic(`${name}: stage_ms=${Math.round(now - previousStage)} total_ms=${Math.round(now - started)}`)
    previousStage = now
  }
  const workspace = mkdtempSync(resolve(process.env.TMPDIR || tmpdir(), 'commerce-d1-'))
  let server

  try {
    const functionsDir = resolve(workspace, 'functions')
    const publicDir = resolve(workspace, 'public')
    const catalogPath = resolve(functionsDir, '_commerce/catalog.generated.js')
    const routesPath = resolve(publicDir, '_routes.json')
    cpSync(resolve(ROOT, 'functions'), functionsDir, { recursive: true })
    mkdirSync(resolve(workspace, 'themes'), { recursive: true })
    symlinkSync(THEME, resolve(workspace, 'themes/sansoul'), 'dir')
    writeFileSync(resolve(functionsDir, 'api/commerce/webhook.js'), `import { handleWebhook } from '../../../themes/sansoul/commerce/webhook.js'

const eventReadBarriers = new Map()

async function synchronizeRead (key) {
  let barrier = eventReadBarriers.get(key)
  if (!barrier) {
    let release
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('webhook_read_barrier_timeout')), 10000)
      release = () => {
        clearTimeout(timer)
        resolve()
      }
    })
    barrier = { ready, release, reads: 0 }
    eventReadBarriers.set(key, barrier)
  }
  barrier.reads++
  if (barrier.reads === 2) barrier.release()
  await barrier.ready
}

export async function onRequest (context) {
  const barrierKey = context.request.headers.get('x-test-synchronize-event-read')
  if (!barrierKey) return handleWebhook(context.request, context.env)

  const database = context.env.COMMERCE_DB
  const synchronizedDatabase = {
    prepare (sql) {
      const prepared = database.prepare(sql)
      if (!sql.includes('SELECT status FROM webhook_events')) return prepared
      let args = []
      return {
        bind (...values) {
          args = values
          return this
        },
        async first () {
          let result
          try {
            result = await prepared.bind(...args).first()
          } catch (error) {
            console.error('test D1 first failed:', error.message)
            throw error
          }
          await synchronizeRead(barrierKey)
          return result
        }
      }
    },
    batch (statements) {
      return database.batch(statements).catch(error => {
        console.error('test D1 batch failed:', error.message)
        throw error
      })
    }
  }
  const response = await handleWebhook(context.request, { ...context.env, COMMERCE_DB: synchronizedDatabase })
  const headers = new Headers(response.headers)
  headers.set('x-test-synchronized-event-reads', String(eventReadBarriers.get(barrierKey).reads))
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}`)

    writeFileSync(resolve(functionsDir, 'api/commerce/admin/[[path]].js'), `import { catalog } from '../../../_commerce/catalog.generated.js'
import { handleAdmin } from '../../../../themes/sansoul/commerce/admin.js'

let synchronizedCursorReads = 0
let cursorReadsReady
let releaseCursorReads

async function synchronizeCursorRead () {
  if (!cursorReadsReady) {
    cursorReadsReady = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('admin_cursor_read_barrier_timeout')), 10000)
      releaseCursorReads = () => {
        clearTimeout(timer)
        resolve()
      }
    })
  }
  synchronizedCursorReads++
  if (synchronizedCursorReads === 2) releaseCursorReads()
  await cursorReadsReady
}

export async function onRequest (context) {
  if (context.request.headers.get('x-test-synchronize-cursor-read') !== 'true') return handleAdmin(context.request, context.env, catalog)
  const database = context.env.COMMERCE_DB
  let firstCursorRead = true
  const synchronizedDatabase = {
    prepare (sql) {
      const prepared = database.prepare(sql)
      if (!firstCursorRead || !sql.includes('SELECT cursor_created_at')) return prepared
      firstCursorRead = false
      let args = []
      return {
        bind (...values) {
          args = values
          return this
        },
        async first () {
          const result = await prepared.bind(...args).first()
          await synchronizeCursorRead()
          return result
        }
      }
    },
    batch (statements) {
      return database.batch(statements)
    }
  }
  const response = await handleAdmin(context.request, { ...context.env, COMMERCE_DB: synchronizedDatabase }, catalog)
  const headers = new Headers(response.headers)
  headers.set('x-test-synchronized-cursor-reads', String(synchronizedCursorReads))
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}`)

    const databaseName = 'commerce-integration'
    const port = await unusedPort()
    const origin = `http://127.0.0.1:${port}`
    const configPath = resolve(workspace, 'wrangler.toml')
    const config = [
      'name = "commerce-integration"',
      'compatibility_date = "2025-12-10"',
      `pages_build_output_dir = "${publicDir}"`,
      '',
      '[[d1_databases]]',
      'binding = "COMMERCE_DB"',
      `database_name = "${databaseName}"`,
      'database_id = "00000000-0000-0000-0000-000000000001"',
      ''
    ].join('\n')
    writeFileSync(configPath, config)
    mkdirSync(publicDir, { recursive: true })
    const disabledCatalog = {
      schemaVersion: 2,
      enabled: false,
      checkout: { approved: false, legalVersion: null, destinationCountries: [], taxPolicy: null, shippingPolicy: null },
      release: 'a'.repeat(64),
      origin: 'https://example.invalid',
      currency: 'eur',
      minorUnit: 2,
      stockMode: 'made_to_order',
      products: []
    }
    writeFileSync(catalogPath, `export const catalog = ${JSON.stringify(disabledCatalog)}\n`)
    writeFileSync(routesPath, `${JSON.stringify({ version: 1, include: ['/'], exclude: ['/'] })}\n`)
    server = startPages(['--port', String(port), '--ip', '127.0.0.1', '--show-interactive-dev-session=false'], workspace, publicDir)
    await waitForRoute(server, `${origin}/api/commerce/checkout`, 404)
    assert.equal((await fetch(`${origin}/api/commerce/checkout`)).status, 404)
    await stopPages(server)
    server = null

    const catalog = {
      schemaVersion: 2,
      enabled: true,
      checkout: { approved: false, legalVersion: null, destinationCountries: [], taxPolicy: null, shippingPolicy: null },
      release: 'a'.repeat(64),
      origin,
      currency: 'eur',
      minorUnit: 2,
      stockMode: 'finite',
      products: [
        { id: firstId, sku: 'TEST-001', active: true, quote: false, priceMinor: 1050, names: { es: 'Modelo A' } },
        { id: secondId, sku: 'TEST-002', active: true, quote: false, priceMinor: 250, names: { es: 'Modelo B' } },
        { id: thirdId, sku: 'TEST-003', active: true, quote: false, priceMinor: 399, names: { es: 'Modelo C' } },
        { id: fourthId, sku: 'TEST-006', active: true, quote: false, priceMinor: 700, names: { es: 'Modelo D' } },
        { id: fifthId, sku: 'TEST-007', active: true, quote: false, priceMinor: 900, names: { es: 'Modelo E' } },
        { id: sixthId, sku: 'TEST-008', active: true, quote: false, priceMinor: 1000, names: { es: 'Modelo F' } },
        { id: cancelProductId, sku: 'TEST-009', active: true, quote: false, priceMinor: 1050, names: { es: 'Modelo I' } },
        { id: quoteId, sku: 'TEST-004', active: true, quote: true, priceMinor: null, names: { es: 'Presupuesto' } },
        { id: retiredId, sku: 'TEST-005', active: false, quote: false, priceMinor: 500, names: { es: 'Retirado' } }
      ]
    }
    writeFileSync(catalogPath, `export const catalog = ${JSON.stringify(catalog)}\n`)
    writeFileSync(routesPath, `${JSON.stringify({ version: 1, include: ['/api/commerce/*'], exclude: [] })}\n`)

    await runWrangler(['d1', 'execute', databaseName, '--local', '--file', resolve(THEME, 'commerce/migrations/0001_commerce.sql')], workspace)
    const legacyOrderId = '99999999-9999-4999-8999-999999999999'
    await runWrangler(['d1', 'execute', databaseName, '--local', '--command', `INSERT INTO commerce_idempotency (idempotency_key, request_hash, order_id, snapshot_json, status, session_id, checkout_url, created_at, updated_at, expires_at) VALUES ('legacy-before-status-migration', 'legacy-hash', '${legacyOrderId}', '{}', 'ready', 'cs_test_legacy123', 'https://checkout.stripe.com/c/pay/legacy', 1700000000, 1700000000, 1700001800)`], workspace)
    await runWrangler(['d1', 'execute', databaseName, '--local', '--command', `INSERT INTO orders (id, session_id, idempotency_key, catalog_release, currency, amount_total_minor, snapshot_json, payment_status, fulfillment_status, reservation_state, created_at, updated_at, expires_at) VALUES ('${legacyOrderId}', 'cs_test_legacy123', 'legacy-before-status-migration', '${'b'.repeat(64)}', 'eur', 1000, '{}', 'pending', 'awaiting_payment', 'unreserved', 1700000000, 1700000000, 1700001800)`], workspace)
    await runWrangler(['d1', 'execute', databaseName, '--local', '--file', resolve(THEME, 'commerce/migrations/0002_buyer_status.sql')], workspace)
    await runWrangler(['d1', 'execute', databaseName, '--local', '--file', resolve(THEME, 'commerce/migrations/0003_provider_session_expiry.sql')], workspace)
    await runWrangler(['d1', 'execute', databaseName, '--local', '--file', resolve(THEME, 'commerce/migrations/0004_operations_and_delivery.sql')], workspace)
    assert.equal((await queryD1(databaseName, `SELECT id FROM orders WHERE id = '${legacyOrderId}'`, workspace)).length, 1)
    await runWrangler(['d1', 'execute', databaseName, '--local', '--command', `UPDATE orders SET payment_status = 'expired' WHERE id = '${legacyOrderId}'`], workspace)

    server = startPages([
      '--port', String(port),
      '--ip', '127.0.0.1',
      '--show-interactive-dev-session=false',
      '--binding', 'COMMERCE_ENV=test',
      '--binding', 'COMMERCE_PROVIDER=fake',
      '--binding', 'COMMERCE_TEST_FIXTURE=synthetic-commerce-test',
      '--binding', `COMMERCE_TEST_ORIGIN=${origin}`,
      '--binding', `FAKE_WEBHOOK_SECRET=${WEBHOOK_SECRET}`,
      '--binding', 'COMMERCE_RATE_LIMIT_SALT=local-test-rate-limit-salt-32-bytes',
      '--binding', `COMMERCE_ADMIN_TOKEN=${ADMIN_TOKEN}`,
      '--binding', 'COMMERCE_FAKE_EMAIL_FAIL_FIRST=true'
    ], workspace, publicDir)
    await waitForRoute(server, `${origin}/api/commerce/checkout`)
    const statusUnavailableMethod = await fetch(`${origin}/api/commerce/status/${firstId}`, { method: 'POST' })
    assert.equal(statusUnavailableMethod.status, 405)

    const checkout = async (items, key, cookie, clientIp) => {
      const response = await fetch(`${origin}/api/commerce/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin, 'idempotency-key': key, ...(cookie ? { cookie } : {}), ...(clientIp ? { 'cf-connecting-ip': clientIp } : {}) },
        body: JSON.stringify({ items })
      })
      return { response, body: await response.json(), setCookie: response.headers.get('set-cookie') }
    }
    const buyerStatus = async (id, cookie) => {
      const response = await fetch(`${origin}/api/commerce/status/${id}`, { headers: cookie ? { cookie } : {} })
      return { response, body: await response.json() }
    }
    const admin = async (path, method = 'GET', body, extraHeaders = {}) => {
      const response = await fetch(`${origin}/api/commerce/admin/${path}`, {
        method,
        headers: { authorization: `Bearer ${ADMIN_TOKEN}`, ...(body ? { 'content-type': 'application/json' } : {}), ...extraHeaders },
        ...(body ? { body: JSON.stringify(body) } : {})
      })
      return { response, body: response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text() }
    }
    const unauthenticatedAdmin = async (path, method = 'POST') => fetch(`${origin}/api/commerce/admin/${path}`, { method })
    const webhook = async (event, signature = true, extraHeaders = {}) => {
      const raw = JSON.stringify(event)
      const response = await fetch(`${origin}/api/commerce/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(signature ? { 'stripe-signature': await makeStripeSignature(raw, WEBHOOK_SECRET) } : {}),
          ...extraHeaders
        },
        body: raw
      })
      return { response, body: await response.json() }
    }
    const event = (type, object) => ({
      id: `evt_${crypto.randomUUID().replaceAll('-', '')}`,
      type,
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      data: { object }
    })
    const sessionEvent = (type, order, paymentStatus = 'paid', paymentIntent = 'pi_local001') => event(type, {
      object: 'checkout.session',
      id: order.checkoutSession,
      client_reference_id: order.id,
      metadata: { commerce_order_id: order.id },
      payment_intent: paymentIntent,
      payment_status: paymentStatus,
      amount_total: order.amount,
      currency: 'eur',
      customer_details: { name: 'Synthetic Buyer', email: 'buyer@example.invalid', phone: '+0000000000' },
      shipping_details: {
        name: 'Synthetic Recipient',
        address: { line1: '1 Synthetic Way', line2: null, city: 'Test City', state: null, postal_code: '00000', country: 'ES' }
      }
    })
    const paidSessionEvent = (order, paymentIntent) => event('checkout.session.completed', {
      object: 'checkout.session',
      id: order.session_id,
      client_reference_id: order.id,
      metadata: { commerce_order_id: order.id },
      payment_intent: paymentIntent,
      payment_status: 'paid',
      amount_total: order.amount_total_minor,
      currency: 'eur'
    })
    const partialRefundEvent = (order, paymentIntent, refundAmount = 300) => event('charge.refunded', {
      object: 'charge',
      payment_intent: paymentIntent,
      metadata: { commerce_order_id: order.id },
      amount: order.amount_total_minor,
      amount_refunded: refundAmount,
      currency: 'eur'
    })
    const orderRows = async () => (await admin('orders?limit=100')).body.orders
    const orderById = async id => (await orderRows()).find(order => order.id === id)
    const orderByKey = async key => (await queryD1(databaseName, `SELECT * FROM orders WHERE idempotency_key = '${key}'`, workspace))[0]
    const reservationByOrder = async id => (await queryD1(databaseName, `SELECT status, quantity FROM stock_reservations WHERE order_id = '${id}'`, workspace))[0]
    const seedOrder = async ({ key, paymentStatus, fulfillmentStatus, stockMode = 'made_to_order', reserve = false, expired = false }) => {
      const id = crypto.randomUUID()
      const now = Math.floor(Date.now() / 1000)
      const createdAt = expired ? now - 3600 : now
      const expiresAt = expired ? 0 : now + 86400
      const sessionId = expired ? null : `cs_test_${crypto.randomUUID().replaceAll('-', '')}`
      const snapshot = JSON.stringify({
        orderId: id,
        idempotencyKey: key,
        catalogRelease: 'a'.repeat(64),
        currency: 'eur',
        stockMode,
        createdAt,
        totalMinor: 1050,
        items: [{ sku: 'TEST-009', productId: cancelProductId, name: 'Modelo I', quantity: 1, unitAmountMinor: 1050, lineTotalMinor: 1050 }]
      })
      const idempotencyStatus = sessionId ? 'ready' : 'creating'
      const checkoutUrl = sessionId ? `https://checkout.stripe.com/c/pay/${sessionId}` : null
      const statements = [
        `INSERT INTO commerce_idempotency (idempotency_key, request_hash, order_id, snapshot_json, status, session_id, checkout_url, created_at, updated_at, expires_at) VALUES (${sqlString(key)}, ${sqlString(`hash-${key}`)}, ${sqlString(id)}, ${sqlString(snapshot)}, ${sqlString(idempotencyStatus)}, ${sessionId ? sqlString(sessionId) : 'NULL'}, ${checkoutUrl ? sqlString(checkoutUrl) : 'NULL'}, ${createdAt}, ${now}, ${expiresAt});`,
        `INSERT INTO orders (id, session_id, idempotency_key, catalog_release, currency, amount_total_minor, snapshot_json, payment_status, fulfillment_status, reservation_state, refund_amount_minor, created_at, updated_at, expires_at) VALUES (${sqlString(id)}, ${sessionId ? sqlString(sessionId) : 'NULL'}, ${sqlString(key)}, '${'a'.repeat(64)}', 'eur', 1050, ${sqlString(snapshot)}, ${sqlString(paymentStatus)}, ${sqlString(fulfillmentStatus)}, '${reserve ? 'reserved' : 'unreserved'}', ${paymentStatus === 'partially_refunded' ? 300 : 0}, ${createdAt}, ${now}, ${expiresAt});`
      ]
      if (reserve) statements.push(`INSERT INTO stock_reservations (order_id, product_id, quantity, status, expires_at, created_at, updated_at) VALUES (${sqlString(id)}, '${cancelProductId}', 1, 'held', ${expiresAt}, ${createdAt}, ${now});`)
      const seedPath = resolve(workspace, `seed-${key}.sql`)
      writeFileSync(seedPath, statements.join('\n'))
      await runWrangler(['d1', 'execute', databaseName, '--local', '--file', seedPath], workspace)
      return (await queryD1(databaseName, `SELECT * FROM orders WHERE id = '${id}'`, workspace))[0]
    }

    for (const [productId, quantity] of [[firstId, 100], [secondId, 3], [thirdId, 2], [fourthId, 2], [fifthId, 1], [sixthId, 1], [cancelProductId, 1]]) {
      const result = await admin('inventory', 'POST', { product_id: productId, on_hand: quantity })
      assert.equal(result.response.status, 200)
    }

    stage('setup, migrations and Pages readiness')
    const concurrentWebhookCheckout = await checkout([{ id: firstId, quantity: 1 }], 'concurrent-webhook-dedup', null, '198.51.100.71')
    assert.equal(concurrentWebhookCheckout.response.status, 201)
    const concurrentWebhookOrder = await orderById(concurrentWebhookCheckout.body.order_id)
    const auditPath = resolve(workspace, 'webhook-dedup-audit.sql')
    writeFileSync(auditPath, [
      'CREATE TABLE webhook_audit (effect TEXT NOT NULL, order_id TEXT NOT NULL);',
      `CREATE TRIGGER webhook_order_audit AFTER UPDATE ON orders WHEN NEW.id = '${concurrentWebhookOrder.id}' BEGIN INSERT INTO webhook_audit (effect, order_id) VALUES ('order', NEW.id); END;`,
      `CREATE TRIGGER webhook_reservation_audit AFTER UPDATE ON stock_reservations WHEN NEW.order_id = '${concurrentWebhookOrder.id}' BEGIN INSERT INTO webhook_audit (effect, order_id) VALUES ('reservation', NEW.order_id); END;`,
      `CREATE TRIGGER webhook_outbox_audit AFTER INSERT ON outbox WHEN NEW.order_id = '${concurrentWebhookOrder.id}' BEGIN INSERT INTO webhook_audit (effect, order_id) VALUES ('outbox', NEW.order_id); END;`
    ].join('\n'))
    await runWrangler(['d1', 'execute', databaseName, '--local', '--file', auditPath], workspace)
    const concurrentWebhookEvent = sessionEvent('checkout.session.completed', {
      id: concurrentWebhookOrder.id,
      checkoutSession: concurrentWebhookOrder.session_id,
      amount: concurrentWebhookOrder.amount_total_minor
    }, 'paid', 'pi_webhookdedup123')
    const concurrentWebhookResults = await Promise.all([1, 2].map(() => webhook(concurrentWebhookEvent, true, {
      'x-test-synchronize-event-read': 'paid-dedup'
    })))
    assert.ok(concurrentWebhookResults.every(result => result.response.status === 200), JSON.stringify({ results: concurrentWebhookResults.map(result => ({ status: result.response.status, body: result.body })), logs: server.output.slice(-4000) }))
    assert.ok(concurrentWebhookResults.every(result => result.response.headers.get('x-test-synchronized-event-reads') === '2'))
    assert.equal(concurrentWebhookResults.filter(result => result.body.duplicate === true).length, 1)
    const webhookAudit = await queryD1(databaseName, `SELECT effect, COUNT(*) AS count FROM webhook_audit WHERE order_id = '${concurrentWebhookOrder.id}' GROUP BY effect ORDER BY effect`, workspace)
    assert.deepEqual(webhookAudit, [
      { effect: 'order', count: 1 },
      { effect: 'outbox', count: 1 },
      { effect: 'reservation', count: 1 }
    ])
    const concurrentWebhookEventRow = (await queryD1(databaseName, `SELECT status, processed_at FROM webhook_events WHERE event_id = '${concurrentWebhookEvent.id}'`, workspace))[0]
    assert.equal(concurrentWebhookEventRow.status, 'processed')
    assert.notEqual(concurrentWebhookEventRow.processed_at, -1)
    assert.equal((await orderById(concurrentWebhookOrder.id)).payment_status, 'paid')

    const finitePartialCheckout = await checkout([{ id: firstId, quantity: 1 }], 'rc1-finite-partial-before-paid', null, '198.51.100.91')
    assert.equal(finitePartialCheckout.response.status, 201)
    const finitePartialOrder = await orderByKey('rc1-finite-partial-before-paid')
    assert.equal(finitePartialOrder.amount_total_minor, 1050)
    const finitePartialPaymentIntent = 'pi_rc1finitepartial'
    const finitePartialEvent = partialRefundEvent(finitePartialOrder, finitePartialPaymentIntent)
    const failExceptionPath = resolve(workspace, 'fail-partial-exception-outbox.sql')
    writeFileSync(failExceptionPath, `CREATE TRIGGER fail_partial_exception BEFORE INSERT ON outbox WHEN NEW.order_id = '${finitePartialOrder.id}' AND NEW.event_type = 'payment.inventory_exception' BEGIN SELECT RAISE(ABORT, 'synthetic_partial_exception_failure'); END;`)
    await runWrangler(['d1', 'execute', databaseName, '--local', '--file', failExceptionPath], workspace)
    assert.equal((await webhook(finitePartialEvent)).response.status, 500)
    assert.equal((await orderByKey('rc1-finite-partial-before-paid')).payment_status, 'pending')
    assert.equal((await reservationByOrder(finitePartialOrder.id)).status, 'held')
    assert.equal((await queryD1(databaseName, `SELECT event_id FROM webhook_events WHERE event_id = '${finitePartialEvent.id}'`, workspace)).length, 0)
    assert.equal((await queryD1(databaseName, `SELECT event_key FROM outbox WHERE order_id = '${finitePartialOrder.id}'`, workspace)).length, 0)
    await runWrangler(['d1', 'execute', databaseName, '--local', '--command', 'DROP TRIGGER fail_partial_exception'], workspace)

    const finitePartialRaces = await Promise.all([1, 2].map(() => webhook(finitePartialEvent, true, {
      'x-test-synchronize-event-read': 'partial-refund-dedup'
    })))
    assert.ok(finitePartialRaces.every(result => result.response.status === 200))
    assert.ok(finitePartialRaces.every(result => result.response.headers.get('x-test-synchronized-event-reads') === '2'))
    assert.equal(finitePartialRaces.filter(result => result.body.duplicate === true).length, 1)
    let finitePartialState = await orderByKey('rc1-finite-partial-before-paid')
    assert.equal(finitePartialState.payment_status, 'partially_refunded')
    assert.equal(finitePartialState.fulfillment_status, 'inventory_exception')
    assert.equal(finitePartialState.refund_amount_minor, 300)
    assert.equal((await reservationByOrder(finitePartialOrder.id)).status, 'held')
    const finiteExceptionNotice = await queryD1(databaseName, `SELECT event_key, event_type, payload_json FROM outbox WHERE order_id = '${finitePartialOrder.id}' AND event_type = 'payment.inventory_exception'`, workspace)
    assert.equal(finiteExceptionNotice.length, 1)
    assert.deepEqual(JSON.parse(finiteExceptionNotice[0].payload_json), {
      eventKey: `${finitePartialOrder.id}:payment.inventory_exception`,
      orderId: finitePartialOrder.id,
      eventType: 'payment.inventory_exception'
    })
    assert.doesNotMatch(JSON.stringify(finiteExceptionNotice), /buyer@example\.invalid|Synthetic Recipient|Synthetic Way/)

    const finiteLatePaid = await webhook(sessionEvent('checkout.session.completed', {
      id: finitePartialOrder.id,
      checkoutSession: finitePartialOrder.session_id,
      amount: finitePartialOrder.amount_total_minor
    }, 'paid', finitePartialPaymentIntent))
    assert.equal(finiteLatePaid.response.status, 200)
    finitePartialState = await orderByKey('rc1-finite-partial-before-paid')
    assert.equal(finitePartialState.payment_status, 'partially_refunded')
    assert.equal(finitePartialState.fulfillment_status, 'inventory_exception')
    assert.equal(finitePartialState.refund_amount_minor, 300)
    assert.equal((await reservationByOrder(finitePartialOrder.id)).status, 'held')
    assert.equal((await queryD1(databaseName, `SELECT event_key FROM outbox WHERE order_id = '${finitePartialOrder.id}' AND event_type = 'payment.paid'`, workspace)).length, 0)
    assert.equal((await admin(`orders/${finitePartialOrder.id}/manufacture`, 'POST')).response.status, 409)
    assert.equal((await admin(`orders/${finitePartialOrder.id}/ship`, 'POST')).response.status, 409)
    const finitePartialCookie = statusCookie(finitePartialCheckout.setCookie).pair
    const finitePartialPublicStatus = await buyerStatus(finitePartialOrder.id, finitePartialCookie)
    assert.deepEqual(finitePartialPublicStatus.body, { order_id: finitePartialOrder.id, payment_status: 'partially_refunded' })
    assert.doesNotMatch(JSON.stringify(finitePartialPublicStatus.body), /buyer@example|Synthetic Recipient|Synthetic Way/)
    const unauthorizedPartialExport = await unauthenticatedAdmin('export.csv?payment_status=partially_refunded&fulfillment_status=inventory_exception', 'GET')
    assert.equal(unauthorizedPartialExport.status, 401)
    const privatePartialExport = await admin('export.csv?limit=100&payment_status=partially_refunded&fulfillment_status=inventory_exception', 'GET')
    assert.equal(privatePartialExport.response.status, 200)
    assert.match(privatePartialExport.body, /buyer@example\.invalid/)
    assert.doesNotMatch(JSON.stringify(await queryD1(databaseName, `SELECT payload_json FROM outbox WHERE order_id = '${finitePartialOrder.id}'`, workspace)), /buyer@example|Synthetic Recipient|Synthetic Way/)

    const finitePaidCheckout = await checkout([{ id: firstId, quantity: 1 }], 'rc1-finite-paid-before-partial', null, '198.51.100.92')
    assert.equal(finitePaidCheckout.response.status, 201)
    const finitePaidOrder = await orderByKey('rc1-finite-paid-before-partial')
    const finitePaidIntent = 'pi_rc1finitepaid'
    assert.equal((await webhook(sessionEvent('checkout.session.completed', {
      id: finitePaidOrder.id,
      checkoutSession: finitePaidOrder.session_id,
      amount: finitePaidOrder.amount_total_minor
    }, 'paid', finitePaidIntent))).response.status, 200)
    assert.equal((await orderByKey('rc1-finite-paid-before-partial')).fulfillment_status, 'ready')
    assert.equal((await reservationByOrder(finitePaidOrder.id)).status, 'committed')
    assert.equal((await webhook(partialRefundEvent(finitePaidOrder, finitePaidIntent))).response.status, 200)
    const finitePaidState = await orderByKey('rc1-finite-paid-before-partial')
    assert.equal(finitePaidState.payment_status, 'partially_refunded')
    assert.equal(finitePaidState.fulfillment_status, 'inventory_exception')
    assert.equal(finitePaidState.refund_amount_minor, 300)
    assert.equal((await reservationByOrder(finitePaidOrder.id)).status, 'committed')
    assert.equal((await admin(`orders/${finitePaidOrder.id}/manufacture`, 'POST')).response.status, 409)
    const finitePaidShip = await admin(`orders/${finitePaidOrder.id}/ship`, 'POST')
    assert.equal(finitePaidShip.response.status, 409)
    assert.equal(finitePaidShip.body.error, 'invalid_order_transition')

    const madePartialOrder = await seedOrder({ key: 'rc1-mto-partial-before-paid', paymentStatus: 'pending', fulfillmentStatus: 'awaiting_payment' })
    const madePartialIntent = 'pi_rc1mtopartial'
    assert.equal((await webhook(partialRefundEvent(madePartialOrder, madePartialIntent))).response.status, 200)
    let madePartialState = await queryD1(databaseName, `SELECT payment_status, fulfillment_status, refund_amount_minor FROM orders WHERE id = '${madePartialOrder.id}'`, workspace)
    assert.deepEqual(madePartialState[0], { payment_status: 'partially_refunded', fulfillment_status: 'inventory_exception', refund_amount_minor: 300 })
    assert.equal((await webhook(paidSessionEvent(madePartialOrder, madePartialIntent))).response.status, 200)
    madePartialState = await queryD1(databaseName, `SELECT payment_status, fulfillment_status, refund_amount_minor FROM orders WHERE id = '${madePartialOrder.id}'`, workspace)
    assert.deepEqual(madePartialState[0], { payment_status: 'partially_refunded', fulfillment_status: 'inventory_exception', refund_amount_minor: 300 })
    assert.equal((await queryD1(databaseName, `SELECT order_id FROM stock_reservations WHERE order_id = '${madePartialOrder.id}'`, workspace)).length, 0)

    const madePaidOrder = await seedOrder({ key: 'rc1-mto-paid-before-partial', paymentStatus: 'paid', fulfillmentStatus: 'ready' })
    assert.equal((await webhook(partialRefundEvent(madePaidOrder, 'pi_rc1mtopaid'))).response.status, 200)
    const madePaidState = await queryD1(databaseName, `SELECT payment_status, fulfillment_status, refund_amount_minor FROM orders WHERE id = '${madePaidOrder.id}'`, workspace)
    assert.deepEqual(madePaidState[0], { payment_status: 'partially_refunded', fulfillment_status: 'inventory_exception', refund_amount_minor: 300 })
    assert.equal((await queryD1(databaseName, `SELECT order_id FROM stock_reservations WHERE order_id = '${madePaidOrder.id}'`, workspace)).length, 0)

    stage('C4 dedup and RC1 partial/paid event matrices')
    const unmatchedOrderId = '88888888-8888-4888-8888-888888888888'
    const unmatchedSessionId = 'cs_test_unmatched123'
    const unmatchedReplayEvent = event('checkout.session.completed', {
      object: 'checkout.session',
      id: unmatchedSessionId,
      client_reference_id: unmatchedOrderId,
      metadata: { commerce_order_id: unmatchedOrderId },
      payment_intent: 'pi_unmatched123',
      payment_status: 'paid',
      amount_total: 1000,
      currency: 'eur',
      customer_details: { name: 'PRIVATE-UNMATCHED-BUYER', email: 'private@example.invalid' },
      shipping_details: { name: 'PRIVATE-UNMATCHED-RECIPIENT', address: { line1: 'Private street', city: 'Test', postal_code: '00000', country: 'ES' } }
    })
    const firstUnmatched = await webhook(unmatchedReplayEvent)
    assert.equal(firstUnmatched.response.status, 503)
    assert.equal(firstUnmatched.body.error, 'order_not_found')
    assert.equal((await queryD1(databaseName, `SELECT status FROM webhook_events WHERE event_id = '${unmatchedReplayEvent.id}'`, workspace))[0].status, 'unmatched')
    const unmatchedRecoveryJson = (await queryD1(databaseName, `SELECT recovery_json FROM webhook_events WHERE event_id = '${unmatchedReplayEvent.id}'`, workspace))[0].recovery_json
    assert.doesNotMatch(unmatchedRecoveryJson, /PRIVATE-UNMATCHED|private@example/)
    const unmatchedSnapshot = JSON.stringify({ stockMode: 'made_to_order', items: [] })
    const unmatchedOrderPath = resolve(workspace, 'unmatched-order.sql')
    writeFileSync(unmatchedOrderPath, [
      `INSERT INTO commerce_idempotency (idempotency_key, request_hash, order_id, snapshot_json, status, session_id, checkout_url, created_at, updated_at, expires_at) VALUES ('unmatched-replay-fixture', 'unmatched-hash', '${unmatchedOrderId}', '${unmatchedSnapshot}', 'ready', '${unmatchedSessionId}', 'https://checkout.stripe.com/c/pay/unmatched', 1790000000, 1790000000, 1790001800);`,
      `INSERT INTO orders (id, session_id, idempotency_key, catalog_release, currency, amount_total_minor, snapshot_json, payment_status, fulfillment_status, reservation_state, created_at, updated_at, expires_at) VALUES ('${unmatchedOrderId}', '${unmatchedSessionId}', 'unmatched-replay-fixture', '${'a'.repeat(64)}', 'eur', 1000, '${unmatchedSnapshot}', 'expired', 'awaiting_payment', 'unreserved', 1790000000, 1790000000, 1790001800);`
    ].join('\n'))
    await runWrangler(['d1', 'execute', databaseName, '--local', '--file', unmatchedOrderPath], workspace)
    const unmatchedRecovery = await admin('reconcile', 'POST')
    assert.equal(unmatchedRecovery.response.status, 200)
    assert.equal(unmatchedRecovery.body.unmatched_recovered, 1)
    assert.equal((await orderById(unmatchedOrderId)).payment_status, 'paid')
    assert.equal((await queryD1(databaseName, `SELECT status, processed_at FROM webhook_events WHERE event_id = '${unmatchedReplayEvent.id}'`, workspace))[0].status, 'processed')

    const unmatchedRefundOrderId = '77777777-7777-4777-8777-777777777778'
    const unmatchedRefundEvent = event('charge.refunded', {
      object: 'charge',
      id: 'ch_unmatchedrefund123',
      payment_intent: 'pi_unmatchedrefund123',
      metadata: { commerce_order_id: unmatchedRefundOrderId },
      amount: 1000,
      amount_refunded: 300,
      currency: 'eur'
    })
    assert.equal((await webhook(unmatchedRefundEvent)).response.status, 503)
    const unmatchedRefundSnapshot = JSON.stringify({ orderId: unmatchedRefundOrderId, idempotencyKey: 'refund-recovery-fixture', stockMode: 'made_to_order', items: [] })
    const unmatchedRefundPath = resolve(workspace, 'unmatched-refund-order.sql')
    writeFileSync(unmatchedRefundPath, [
      `INSERT INTO commerce_idempotency (idempotency_key, request_hash, order_id, snapshot_json, status, created_at, updated_at, expires_at) VALUES ('refund-recovery-fixture', 'refund-recovery-hash', '${unmatchedRefundOrderId}', '${unmatchedRefundSnapshot}', 'creating', 1790000000, 1790000000, 1799999999);`,
      `INSERT INTO orders (id, payment_intent_id, idempotency_key, catalog_release, currency, amount_total_minor, snapshot_json, payment_status, fulfillment_status, reservation_state, created_at, updated_at, expires_at) VALUES ('${unmatchedRefundOrderId}', 'pi_unmatchedrefund123', 'refund-recovery-fixture', '${'a'.repeat(64)}', 'eur', 1000, '${unmatchedRefundSnapshot}', 'paid', 'ready', 'unreserved', 1790000000, 1790000000, 1799999999);`
    ].join('\n'))
    await runWrangler(['d1', 'execute', databaseName, '--local', '--file', unmatchedRefundPath], workspace)
    const refundRecovery = await admin('reconcile', 'POST')
    assert.equal(refundRecovery.response.status, 200)
    assert.equal(refundRecovery.body.unmatched_recovered, 1)
    const recoveredRefundOrder = (await queryD1(databaseName, `SELECT payment_status, refund_amount_minor FROM orders WHERE id = '${unmatchedRefundOrderId}'`, workspace))[0]
    assert.deepEqual(recoveredRefundOrder, { payment_status: 'partially_refunded', refund_amount_minor: 300 })

    const ackCheckout = await checkout([{ id: firstId, quantity: 1 }], 'webhook-ack-after-persist', null, '198.51.100.72')
    assert.equal(ackCheckout.response.status, 201)
    const ackOrder = await orderById(ackCheckout.body.order_id)
    const ackEvent = sessionEvent('checkout.session.completed', {
      id: ackOrder.id,
      checkoutSession: ackOrder.session_id,
      amount: ackOrder.amount_total_minor
    }, 'paid', 'pi_ackpersist123')
    const ackTriggerPath = resolve(workspace, 'webhook-ack-trigger.sql')
    writeFileSync(ackTriggerPath, `CREATE TRIGGER fail_webhook_finalization BEFORE UPDATE OF processed_at ON webhook_events WHEN NEW.event_id = '${ackEvent.id}' AND NEW.processed_at <> -1 BEGIN SELECT RAISE(ABORT, 'synthetic_finalization_failure'); END;`)
    await runWrangler(['d1', 'execute', databaseName, '--local', '--file', ackTriggerPath], workspace)
    const failedAck = await webhook(ackEvent)
    assert.equal(failedAck.response.status, 500)
    assert.equal((await queryD1(databaseName, `SELECT event_id FROM webhook_events WHERE event_id = '${ackEvent.id}'`, workspace)).length, 0)
    assert.equal((await orderById(ackOrder.id)).payment_status, 'pending')
    await runWrangler(['d1', 'execute', databaseName, '--local', '--command', 'DROP TRIGGER fail_webhook_finalization'], workspace)
    const persistedAck = await webhook(ackEvent)
    assert.equal(persistedAck.response.status, 200)
    assert.equal((await orderById(ackOrder.id)).payment_status, 'paid')
    assert.equal((await queryD1(databaseName, `SELECT status, processed_at FROM webhook_events WHERE event_id = '${ackEvent.id}'`, workspace))[0].status, 'processed')

    const orphanKeys = ['test-timeout-once-orphan-a', 'test-timeout-once-orphan-b']
    const orphanFailures = await Promise.all(orphanKeys.map((key, index) => checkout(
      [{ id: fourthId, quantity: 1 }], key, null, `198.51.100.${20 + index}`
    )))
    assert.ok(orphanFailures.every(result => result.response.status === 502 && result.body.error === 'payment_provider_unavailable'))
    const orphanOrders = await queryD1(databaseName, `SELECT * FROM orders WHERE idempotency_key IN ('${orphanKeys.join("','")}')`, workspace)
    orphanOrders.sort((left, right) => orphanKeys.indexOf(left.idempotency_key) - orphanKeys.indexOf(right.idempotency_key))
    assert.ok(orphanOrders.every(order => order && order.payment_status === 'pending'))
    const orphanSessionNulls = await queryD1(databaseName, `SELECT session_id IS NULL AS is_null FROM orders WHERE idempotency_key IN ('${orphanKeys.join("','")}')`, workspace)
    assert.equal(orphanSessionNulls.filter(row => row.is_null === 1).length, 2)
    const orphanReservations = async () => queryD1(databaseName, `SELECT order_id, status FROM stock_reservations WHERE order_id IN ('${orphanOrders.map(order => order.id).join("','")}')`, workspace)
    assert.ok((await orphanReservations()).every(row => row.status === 'held'))
    for (const order of orphanOrders) {
      await runWrangler(['d1', 'execute', databaseName, '--local', '--command', `UPDATE stock_reservations SET expires_at = 0 WHERE order_id = '${order.id}'`], workspace)
    }
    const orphanRecovery = await admin('reconcile', 'POST')
    assert.equal(orphanRecovery.response.status, 200)
    assert.equal(orphanRecovery.body.checked, 0)
    assert.equal(orphanRecovery.body.updated, 0)
    assert.equal(orphanRecovery.body.recovered_sessions, 0)
    const recoveredOrphans = await queryD1(databaseName, `SELECT * FROM orders WHERE idempotency_key IN ('${orphanKeys.join("','")}')`, workspace)
    assert.ok(recoveredOrphans.every(order => order.payment_status === 'expired'))
    const recoveredSessionNulls = await queryD1(databaseName, `SELECT session_id IS NULL AS is_null FROM orders WHERE idempotency_key IN ('${orphanKeys.join("','")}')`, workspace)
    assert.equal(recoveredSessionNulls.filter(row => row.is_null === 1).length, 2)
    assert.ok((await orphanReservations()).every(row => row.status === 'expired'))
    const expiredOrphanRetry = await checkout([{ id: fourthId, quantity: 1 }], orphanKeys[0], null, '198.51.100.25')
    assert.equal(expiredOrphanRetry.response.status, 409)
    assert.equal(expiredOrphanRetry.body.error, 'checkout_expired')

    const lostSessionKey = 'test-reconcile-lost-session'
    const lostSessionCheckout = await checkout([{ id: firstId, quantity: 1 }], lostSessionKey, null, '198.51.100.26')
    assert.equal(lostSessionCheckout.response.status, 201)
    const lostSessionOrder = await orderByKey(lostSessionKey)
    const lostSessionPayload = (await queryD1(databaseName, `SELECT request_hash, snapshot_json FROM commerce_idempotency WHERE idempotency_key = '${lostSessionKey}'`, workspace))[0]
    await runWrangler(['d1', 'execute', databaseName, '--local', '--command', `UPDATE orders SET session_id = NULL, payment_intent_id = NULL WHERE id = '${lostSessionOrder.id}'; UPDATE commerce_idempotency SET status = 'creating', session_id = NULL, checkout_url = NULL WHERE idempotency_key = '${lostSessionKey}'; UPDATE order_status_capabilities SET session_id = NULL WHERE order_id = '${lostSessionOrder.id}'`], workspace)
    const lostSessionRecovery = await admin('reconcile', 'POST')
    assert.equal(lostSessionRecovery.response.status, 200)
    assert.equal(lostSessionRecovery.body.recovered_sessions, 1)
    assert.equal((await orderByKey(lostSessionKey)).session_id, lostSessionOrder.session_id)
    assert.deepEqual((await queryD1(databaseName, `SELECT request_hash, snapshot_json FROM commerce_idempotency WHERE idempotency_key = '${lostSessionKey}'`, workspace))[0], lostSessionPayload)
    await admin('reconcile', 'POST')
    assert.equal((await queryD1(databaseName, `SELECT COUNT(*) AS count FROM outbox WHERE order_id = '${unmatchedOrderId}'`, workspace))[0].count, 1)
    assert.equal((await queryD1(databaseName, `SELECT COUNT(*) AS count FROM outbox WHERE order_id = '${unmatchedRefundOrderId}' AND event_type = 'payment.partially_refunded'`, workspace))[0].count, 1)

    const postExpiryCheckouts = await Promise.all([1, 2, 3].map(index => checkout(
      [{ id: fourthId, quantity: 1 }], `post-expiry-concurrent-${index}`, null, `198.51.100.${30 + index}`
    )))
    assert.equal(postExpiryCheckouts.filter(result => result.response.status === 201).length, 2)
    assert.equal(postExpiryCheckouts.filter(result => result.response.status === 409 && result.body.error === 'out_of_stock').length, 1)
    const lateOrphanPaid = await webhook(event('checkout.session.completed', {
      object: 'checkout.session',
      id: 'cs_test_lateorphan001',
      client_reference_id: orphanOrders[0].id,
      metadata: { commerce_order_id: orphanOrders[0].id },
      payment_intent: 'pi_lateorphan001',
      payment_status: 'paid',
      amount_total: orphanOrders[0].amount_total_minor,
      currency: 'eur'
    }))
    assert.equal(lateOrphanPaid.response.status, 200)
    const lateOrphan = await orderByKey(orphanKeys[0])
    assert.equal(lateOrphan.payment_status, 'paid')
    assert.equal(lateOrphan.fulfillment_status, 'inventory_exception')
    assert.equal((await reservationByOrder(lateOrphan.id)).status, 'expired')
    const exceptionNotice = await queryD1(databaseName, `SELECT event_type, payload_json, status FROM outbox WHERE order_id = '${lateOrphan.id}' AND event_type = 'payment.inventory_exception'`, workspace)
    assert.equal(exceptionNotice.length, 1)
    assert.equal(exceptionNotice[0].status, 'pending')
    assert.deepEqual(JSON.parse(exceptionNotice[0].payload_json), {
      eventKey: `${lateOrphan.id}:payment.inventory_exception`,
      orderId: lateOrphan.id,
      eventType: 'payment.inventory_exception'
    })

    stage('unmatched recovery, ack persistence and orphan expiry')
    const noOrigin = await fetch(`${origin}/api/commerce/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'no-origin-key' },
      body: JSON.stringify({ items: [{ id: firstId, quantity: 1 }] })
    })
    assert.equal(noOrigin.status, 403)
    assert.equal((await noOrigin.json()).error, 'origin_not_allowed')

    const malicious = await checkout([{ id: firstId, quantity: 1, price: 1 }], 'tampered-price-key')
    assert.equal(malicious.response.status, 400)
    assert.equal(malicious.body.error, 'invalid_cart_item')
    assert.equal((await checkout([{ id: retiredId, quantity: 1 }], 'retired-product-key')).body.error, 'product_unavailable')
    assert.equal((await checkout([{ id: quoteId, quantity: 1 }], 'quote-product-key')).body.error, 'quote_only')
    assert.equal((await checkout([{ id: firstId, quantity: 11 }], 'too-many-key')).body.error, 'invalid_quantity')

    const timeoutKey = 'test-timeout-once-001'
    const cartA = [{ id: firstId, quantity: 2 }]
    const firstAttempt = await checkout(cartA, timeoutKey)
    assert.equal(firstAttempt.response.status, 502)
    assert.equal(firstAttempt.body.error, 'payment_provider_unavailable')
    const firstCookie = statusCookie(firstAttempt.setCookie)
    const retry = await checkout(cartA, timeoutKey, firstCookie.pair)
    assert.equal(retry.response.status, 201)
    const retryCookie = statusCookie(retry.setCookie)
    assert.equal(retryCookie.token, firstCookie.token)
    const replay = await checkout(cartA, timeoutKey, retryCookie.pair)
    assert.equal(replay.response.status, 200)
    assert.equal(replay.body.order_id, retry.body.order_id)
    assert.equal(replay.body.checkout_url, retry.body.checkout_url)
    const replayCookie = statusCookie(replay.setCookie)
    assert.equal(retryCookie.name, `__Secure-commerce-status-${retry.body.order_id}`)
    assert.equal(replayCookie.token, retryCookie.token)
    assert.match(retry.setCookie, /HttpOnly; Secure; SameSite=Lax; Max-Age=\d+/)
    assert.ok(retry.setCookie.includes('Path=/api/commerce;'))
    assert.equal(JSON.stringify(retry.body).includes(retryCookie.token), false)
    const orderA = await orderById(retry.body.order_id)
    const storedCapability = await queryD1(databaseName, `SELECT capability_hash, idempotency_key, session_id FROM order_status_capabilities WHERE order_id = '${retry.body.order_id}'`, workspace)
    assert.equal(storedCapability.length, 1)
    assert.notEqual(storedCapability[0].capability_hash, retryCookie.token)
    assert.equal(storedCapability[0].idempotency_key, timeoutKey)
    assert.equal(storedCapability[0].session_id, orderA.session_id)
    const unauthorizedReplay = await checkout(cartA, timeoutKey)
    assert.equal(unauthorizedReplay.response.status, 200)
    assert.equal(unauthorizedReplay.setCookie, null)
    assert.equal(orderA.amount_total_minor, 2100)
    assert.equal(orderA.snapshot.items[0].unitAmountMinor, 1050)
    assert.equal(orderA.payment_status, 'pending')
    assert.equal((await buyerStatus(orderA.id)).response.status, 404)
    const alteredToken = `${retryCookie.token[0] === '0' ? '1' : '0'}${retryCookie.token.slice(1)}`
    assert.equal((await buyerStatus(orderA.id, `${retryCookie.name}=${alteredToken}`)).response.status, 404)
    const pendingStatus = await buyerStatus(orderA.id, retryCookie.pair)
    assert.equal(pendingStatus.response.status, 200)
    assert.deepEqual(pendingStatus.body, { order_id: orderA.id, payment_status: 'pending' })
    assert.equal(pendingStatus.response.headers.get('cache-control'), 'no-store')
    assert.equal(pendingStatus.response.headers.get('referrer-policy'), 'no-referrer')

    const ambiguousKey = 'test-timeout-after-create-once-c5-001'
    const ambiguousStart = Math.floor(Date.now() / 1000)
    const ambiguousFirst = await checkout([{ id: firstId, quantity: 1 }], ambiguousKey, null, '198.51.100.81')
    assert.equal(ambiguousFirst.response.status, 502)
    assert.equal(ambiguousFirst.body.error, 'payment_provider_unavailable')
    const ambiguousBeforeRetry = await orderByKey(ambiguousKey)
    const ambiguousRecordBeforeRetry = (await queryD1(databaseName, `SELECT status, session_id IS NULL AS session_id_is_null, created_at, expires_at FROM commerce_idempotency WHERE idempotency_key = '${ambiguousKey}'`, workspace))[0]
    const ambiguousReservationBeforeRetry = (await queryD1(databaseName, `SELECT expires_at, status FROM stock_reservations WHERE order_id = '${ambiguousBeforeRetry.id}'`, workspace))[0]
    assert.equal(ambiguousRecordBeforeRetry.status, 'creating')
    assert.equal(ambiguousRecordBeforeRetry.session_id_is_null, 1)
    assert.equal(ambiguousRecordBeforeRetry.expires_at, ambiguousRecordBeforeRetry.created_at + STRIPE_IDEMPOTENCY_RETRY_TTL_SECONDS)
    assert.equal(ambiguousBeforeRetry.expires_at, ambiguousBeforeRetry.created_at + CHECKOUT_RECOVERY_TTL_SECONDS)
    assert.equal(ambiguousReservationBeforeRetry.expires_at, ambiguousBeforeRetry.expires_at)

    const simulatedDelay = 35 * 60
    await runWrangler(['d1', 'execute', databaseName, '--local', '--command', `UPDATE commerce_idempotency SET created_at = created_at - ${simulatedDelay}, updated_at = updated_at - ${simulatedDelay}, expires_at = expires_at - ${simulatedDelay}, snapshot_json = json_set(snapshot_json, '$.createdAt', json_extract(snapshot_json, '$.createdAt') - ${simulatedDelay}) WHERE idempotency_key = '${ambiguousKey}'`], workspace)
    const ambiguousRetry = await checkout([{ id: firstId, quantity: 1 }], ambiguousKey, statusCookie(ambiguousFirst.setCookie).pair, '198.51.100.81')
    assert.equal(ambiguousRetry.response.status, 201)
    const ambiguousAfterRetry = await orderByKey(ambiguousKey)
    const ambiguousRecordAfterRetry = (await queryD1(databaseName, `SELECT status, session_id, checkout_url, expires_at FROM commerce_idempotency WHERE idempotency_key = '${ambiguousKey}'`, workspace))[0]
    const ambiguousReservationAfterRetry = (await queryD1(databaseName, `SELECT expires_at, status FROM stock_reservations WHERE order_id = '${ambiguousBeforeRetry.id}'`, workspace))[0]
    assert.equal(ambiguousRecordAfterRetry.status, 'ready')
    assert.equal(ambiguousRecordAfterRetry.session_id, ambiguousAfterRetry.session_id)
    assert.equal(ambiguousRecordAfterRetry.checkout_url, ambiguousRetry.body.checkout_url)
    assert.ok(ambiguousRecordAfterRetry.expires_at >= ambiguousStart + 23 * 60 * 60)
    assert.equal(ambiguousAfterRetry.expires_at, ambiguousRecordAfterRetry.expires_at)
    assert.equal(ambiguousReservationAfterRetry.status, 'held')
    assert.equal(ambiguousReservationAfterRetry.expires_at, ambiguousRecordAfterRetry.expires_at)

    await runWrangler(['d1', 'execute', databaseName, '--local', '--command', `UPDATE commerce_idempotency SET expires_at = 0 WHERE idempotency_key = '${ambiguousKey}'`], workspace)
    await runWrangler(['d1', 'execute', databaseName, '--local', '--command', `UPDATE orders SET expires_at = 0 WHERE id = '${ambiguousBeforeRetry.id}'`], workspace)
    await runWrangler(['d1', 'execute', databaseName, '--local', '--command', `UPDATE stock_reservations SET expires_at = 0 WHERE order_id = '${ambiguousBeforeRetry.id}'`], workspace)
    const expiredReplay = await checkout([{ id: firstId, quantity: 1 }], ambiguousKey, null, '198.51.100.81')
    assert.equal(expiredReplay.response.status, 409)
    assert.equal(expiredReplay.body.error, 'checkout_expired')
    assert.equal((await orderByKey(ambiguousKey)).payment_status, 'expired')
    assert.equal((await reservationByOrder(ambiguousBeforeRetry.id)).status, 'expired')

    const expiredSessionKey = 'test-session-expired-c5-001'
    const expiredSession = await checkout([{ id: firstId, quantity: 1 }], expiredSessionKey, null, '198.51.100.82')
    assert.equal(expiredSession.response.status, 409)
    assert.equal(expiredSession.body.error, 'checkout_expired')
    const expiredSessionOrder = await orderByKey(expiredSessionKey)
    const expiredSessionRecord = (await queryD1(databaseName, `SELECT status, session_id, checkout_url IS NULL AS checkout_url_is_null FROM commerce_idempotency WHERE idempotency_key = '${expiredSessionKey}'`, workspace))[0]
    assert.equal(expiredSessionRecord.status, 'creating')
    assert.ok(expiredSessionRecord.session_id)
    assert.equal(expiredSessionRecord.checkout_url_is_null, 1)
    assert.equal(expiredSessionOrder.payment_status, 'expired')
    assert.equal((await reservationByOrder(expiredSessionOrder.id)).status, 'expired')

    const multi = await checkout([{ id: firstId, quantity: 1 }, { id: secondId, quantity: 1 }], 'multiple-items-key')
    assert.equal(multi.response.status, 201)
    const multiOrder = await orderById(multi.body.order_id)
    assert.equal(multiOrder.amount_total_minor, 1300)
    assert.equal(multiOrder.snapshot.items.length, 2)
    const multiCookie = statusCookie(multi.setCookie)
    assert.notEqual(multiCookie.name, retryCookie.name)
    assert.equal((await buyerStatus(multiOrder.id, multiCookie.pair)).body.payment_status, 'pending')
    assert.equal((await buyerStatus(multiOrder.id, `${multiCookie.name}=${retryCookie.token}`)).response.status, 404)

    const sameKey = 'concurrent-same-key'
    const sameKeyResults = await Promise.all([1, 2, 3].map(() => checkout([{ id: firstId, quantity: 1 }], sameKey)))
    assert.ok(sameKeyResults.every(result => [200, 201].includes(result.response.status)))
    assert.equal(new Set(sameKeyResults.map(result => result.body.order_id)).size, 1)
    assert.equal(new Set(sameKeyResults.map(result => result.body.checkout_url)).size, 1)

    const concurrent = await Promise.all([
      checkout([{ id: thirdId, quantity: 1 }], 'finite-reservation-one'),
      checkout([{ id: thirdId, quantity: 1 }], 'finite-reservation-two')
    ])
    assert.ok(concurrent.every(result => [200, 201].includes(result.response.status)))
    const finiteOrders = await Promise.all(concurrent.map(result => orderById(result.body.order_id)))
    assert.equal(new Set(finiteOrders.map(order => order.id)).size, 2)
    const soldOut = await checkout([{ id: thirdId, quantity: 1 }], 'finite-reservation-three')
    assert.equal(soldOut.response.status, 409)
    assert.equal(soldOut.body.error, 'out_of_stock')

    const expiredOrder = finiteOrders[0]
    const expiredCookie = statusCookie(concurrent[0].setCookie)
    const expiredEvent = event('checkout.session.expired', {
      object: 'checkout.session',
      id: expiredOrder.session_id,
      client_reference_id: expiredOrder.id,
      metadata: { commerce_order_id: expiredOrder.id },
      payment_status: 'unpaid',
      amount_total: expiredOrder.amount_total_minor,
      currency: 'eur'
    })
    assert.equal((await webhook(expiredEvent)).response.status, 200)
    assert.equal((await orderById(expiredOrder.id)).payment_status, 'expired')
    assert.equal((await buyerStatus(expiredOrder.id, expiredCookie.pair)).body.payment_status, 'expired')
    const replacement = await checkout([{ id: thirdId, quantity: 1 }], 'finite-replacement-key')
    assert.equal(replacement.response.status, 201)
    const latePaid = await webhook(sessionEvent('checkout.session.completed', {
      id: expiredOrder.id,
      checkoutSession: expiredOrder.session_id,
      amount: expiredOrder.amount_total_minor
    }, 'paid', 'pi_localexpired'))
    assert.equal(latePaid.response.status, 200)
    const inventoryException = await orderById(expiredOrder.id)
    assert.equal(inventoryException.payment_status, 'paid')
    assert.equal(inventoryException.fulfillment_status, 'inventory_exception')

    const badSignature = await webhook(sessionEvent('checkout.session.completed', {
      id: orderA.id,
      checkoutSession: orderA.session_id,
      amount: orderA.amount_total_minor
    }), false)
    assert.equal(badSignature.response.status, 400)
    assert.equal(badSignature.body.error, 'invalid_signature')

    await fetch(`${origin}/?commerce=success&order_id=${encodeURIComponent(orderA.id)}`)
    assert.equal((await orderById(orderA.id)).payment_status, 'pending')
    assert.equal((await buyerStatus(orderA.id, retryCookie.pair)).body.payment_status, 'pending')
    const wrongModeEvent = sessionEvent('checkout.session.completed', {
      id: orderA.id,
      checkoutSession: orderA.session_id,
      amount: orderA.amount_total_minor
    })
    wrongModeEvent.livemode = true
    const wrongMode = await webhook(wrongModeEvent)
    assert.equal(wrongMode.response.status, 503)
    assert.equal(wrongMode.body.error, 'payment_event_mismatch')
    const wrongIdentityEvent = sessionEvent('checkout.session.completed', {
      id: orderA.id,
      checkoutSession: orderA.session_id,
      amount: orderA.amount_total_minor
    })
    wrongIdentityEvent.data.object.metadata.commerce_order_id = secondId
    const wrongIdentity = await webhook(wrongIdentityEvent)
    assert.equal(wrongIdentity.response.status, 503)
    assert.equal(wrongIdentity.body.error, 'payment_event_mismatch')
    assert.equal((await orderById(orderA.id)).payment_status, 'pending')
    const paidEvent = sessionEvent('checkout.session.completed', {
      id: orderA.id,
      checkoutSession: orderA.session_id,
      amount: orderA.amount_total_minor
    })
    const paid = await webhook(paidEvent)
    assert.equal(paid.response.status, 200, JSON.stringify({ body: paid.body, logs: server.output }))
    assert.doesNotMatch(server.output, /buyer@example\.invalid|Synthetic Recipient|Synthetic Way/)
    assert.equal((await orderById(orderA.id)).payment_status, 'paid')
    const privateOrder = await orderById(orderA.id)
    assert.equal(privateOrder.delivery.source, 'stripe_checkout')
    assert.equal(privateOrder.delivery.buyer.email, 'buyer@example.invalid')
    assert.equal(privateOrder.delivery.shipping.recipient, 'Synthetic Recipient')
    const publicStatus = await buyerStatus(orderA.id, retryCookie.pair)
    assert.deepEqual(publicStatus.body, { order_id: orderA.id, payment_status: 'paid' })
    assert.doesNotMatch(JSON.stringify(publicStatus.body), /buyer@example|Synthetic Recipient|Synthetic Way/)
    assert.equal((await reservationByOrder(orderA.id)).status, 'committed')
    assert.equal((await admin(`orders/${orderA.id}/manufacture`, 'POST')).response.status, 200)
    assert.equal((await admin(`orders/${orderA.id}/ship`, 'POST')).response.status, 200)

    const noDeliveryCheckout = await checkout([{ id: firstId, quantity: 1 }], 'paid-without-delivery-details', null, '198.51.100.88')
    assert.equal(noDeliveryCheckout.response.status, 201)
    const noDeliveryOrder = await orderById(noDeliveryCheckout.body.order_id)
    const noDeliveryEvent = sessionEvent('checkout.session.completed', {
      id: noDeliveryOrder.id,
      checkoutSession: noDeliveryOrder.session_id,
      amount: noDeliveryOrder.amount_total_minor
    }, 'paid', 'pi_nodelivery001')
    delete noDeliveryEvent.data.object.customer_details
    delete noDeliveryEvent.data.object.shipping_details
    assert.equal((await webhook(noDeliveryEvent)).response.status, 200)
    assert.equal((await admin(`orders/${noDeliveryOrder.id}/manufacture`, 'POST')).response.status, 200)
    assert.equal((await webhook(partialRefundEvent(noDeliveryOrder, 'pi_nodelivery001'))).response.status, 200)
    assert.equal((await orderById(noDeliveryOrder.id)).payment_status, 'partially_refunded')
    assert.equal((await orderById(noDeliveryOrder.id)).fulfillment_status, 'manufacturing')
    assert.equal((await reservationByOrder(noDeliveryOrder.id)).status, 'committed')
    assert.equal((await admin(`orders/${noDeliveryOrder.id}/cancel-partial`, 'POST')).response.status, 409)
    const cannotShip = await admin(`orders/${noDeliveryOrder.id}/ship`, 'POST')
    assert.equal(cannotShip.response.status, 409)
    assert.equal(cannotShip.body.error, 'delivery_details_missing')
    const duplicate = await webhook(paidEvent)
    assert.equal(duplicate.response.status, 200)
    assert.equal(duplicate.body.duplicate, true)

    const failedOutOfOrder = await webhook(event('payment_intent.payment_failed', {
      object: 'payment_intent',
      id: 'pi_local001',
      amount: orderA.amount_total_minor,
      currency: 'eur',
      metadata: { commerce_order_id: orderA.id }
    }))
    assert.equal(failedOutOfOrder.response.status, 200)
    assert.equal((await orderById(orderA.id)).payment_status, 'paid')

    const partialRefund = await webhook(event('charge.refunded', {
      object: 'charge',
      payment_intent: 'pi_local001',
      amount: orderA.amount_total_minor,
      amount_refunded: 500,
      currency: 'eur'
    }))
    assert.equal(partialRefund.response.status, 200, JSON.stringify(partialRefund.body))
    assert.equal((await orderById(orderA.id)).payment_status, 'partially_refunded')
    assert.equal((await orderById(orderA.id)).fulfillment_status, 'shipped')
    assert.equal((await reservationByOrder(orderA.id)).status, 'committed')
    assert.equal((await buyerStatus(orderA.id, retryCookie.pair)).body.payment_status, 'partially_refunded')
    assert.equal((await admin(`orders/${orderA.id}/cancel-partial`, 'POST')).response.status, 409)
    const fullRefund = await webhook(event('charge.refunded', {
      object: 'charge',
      payment_intent: 'pi_local001',
      amount: orderA.amount_total_minor,
      amount_refunded: orderA.amount_total_minor,
      currency: 'eur'
    }))
    assert.equal(fullRefund.response.status, 200)
    assert.equal((await orderById(orderA.id)).payment_status, 'refunded')
    assert.equal((await orderById(orderA.id)).fulfillment_status, 'shipped')
    assert.equal((await reservationByOrder(orderA.id)).status, 'committed')
    assert.equal((await buyerStatus(orderA.id, retryCookie.pair)).body.payment_status, 'refunded')

    const staleFullRefundCheckout = await checkout([{ id: sixthId, quantity: 1 }], 'refund-full-then-stale-partial')
    assert.equal(staleFullRefundCheckout.response.status, 201)
    const staleFullRefundOrder = await orderById(staleFullRefundCheckout.body.order_id)
    assert.equal(staleFullRefundOrder.amount_total_minor, 1000)
    assert.equal((await webhook(sessionEvent('checkout.session.completed', {
      id: staleFullRefundOrder.id,
      checkoutSession: staleFullRefundOrder.session_id,
      amount: staleFullRefundOrder.amount_total_minor
    }, 'paid', 'pi_fullthenpartial'))).response.status, 200)
    const fullRefundThenPartial = await webhook(event('charge.refunded', {
      object: 'charge',
      payment_intent: 'pi_fullthenpartial',
      amount: 1000,
      amount_refunded: 1000,
      currency: 'eur'
    }))
    assert.equal(fullRefundThenPartial.response.status, 200)
    const stalePartialAfterFullInD1 = await webhook(event('charge.refunded', {
      object: 'charge',
      payment_intent: 'pi_fullthenpartial',
      amount: 1000,
      amount_refunded: 300,
      currency: 'eur'
    }))
    assert.equal(stalePartialAfterFullInD1.response.status, 200)
    const staleRefundState = await orderById(staleFullRefundOrder.id)
    assert.equal(staleRefundState.payment_status, 'refunded')
    assert.equal(staleRefundState.refund_amount_minor, 1000)

    const refundRaceCheckout = await checkout([{ id: firstId, quantity: 1 }], 'refund-race-concurrent-order')
    assert.equal(refundRaceCheckout.response.status, 201)
    const refundRaceOrder = await orderById(refundRaceCheckout.body.order_id)
    assert.equal((await webhook(sessionEvent('checkout.session.completed', {
      id: refundRaceOrder.id,
      checkoutSession: refundRaceOrder.session_id,
      amount: refundRaceOrder.amount_total_minor
    }, 'paid', 'pi_refundrace'))).response.status, 200)
    const concurrentRefunds = await Promise.all([
      webhook(event('charge.refunded', {
        object: 'charge',
        payment_intent: 'pi_refundrace',
        amount: refundRaceOrder.amount_total_minor,
        amount_refunded: refundRaceOrder.amount_total_minor,
        currency: 'eur'
      })),
      webhook(event('charge.refunded', {
        object: 'charge',
        payment_intent: 'pi_refundrace',
        amount: refundRaceOrder.amount_total_minor,
        amount_refunded: 250,
        currency: 'eur'
      }))
    ])
    assert.ok(concurrentRefunds.every(result => result.response.status === 200))
    const concurrentRefundedOrder = await orderById(refundRaceOrder.id)
    assert.equal(concurrentRefundedOrder.payment_status, 'refunded')
    assert.equal(concurrentRefundedOrder.refund_amount_minor, refundRaceOrder.amount_total_minor)

    const staleRefundCheckout = await checkout([{ id: secondId, quantity: 1 }], 'refund-race-stale-partial-order')
    assert.equal(staleRefundCheckout.response.status, 201)
    const staleRefundOrder = await orderById(staleRefundCheckout.body.order_id)
    assert.equal((await webhook(sessionEvent('checkout.session.completed', {
      id: staleRefundOrder.id,
      checkoutSession: staleRefundOrder.session_id,
      amount: staleRefundOrder.amount_total_minor
    }, 'paid', 'pi_stalerefund'))).response.status, 200)
    const staleFullRefund = await webhook(event('charge.refunded', {
      object: 'charge',
      payment_intent: 'pi_stalerefund',
      amount: staleRefundOrder.amount_total_minor,
      amount_refunded: staleRefundOrder.amount_total_minor,
      currency: 'eur'
    }))
    assert.equal(staleFullRefund.response.status, 200)
    const stalePartialRefund = await webhook(event('charge.refunded', {
      object: 'charge',
      payment_intent: 'pi_stalerefund',
      amount: staleRefundOrder.amount_total_minor,
      amount_refunded: 100,
      currency: 'eur'
    }))
    assert.equal(stalePartialRefund.response.status, 200)
    const latePaidAfterRefund = await webhook(sessionEvent('checkout.session.async_payment_succeeded', {
      id: staleRefundOrder.id,
      checkoutSession: staleRefundOrder.session_id,
      amount: staleRefundOrder.amount_total_minor
    }, 'paid', 'pi_stalerefund'))
    assert.equal(latePaidAfterRefund.response.status, 200)
    const lateFailure = await webhook(event('payment_intent.payment_failed', {
      object: 'payment_intent',
      id: 'pi_stalerefund',
      amount: staleRefundOrder.amount_total_minor,
      currency: 'eur',
      metadata: { commerce_order_id: staleRefundOrder.id }
    }))
    assert.equal(lateFailure.response.status, 200)
    const lateExpiration = await webhook(event('checkout.session.expired', {
      object: 'checkout.session',
      id: staleRefundOrder.session_id,
      client_reference_id: staleRefundOrder.id,
      metadata: { commerce_order_id: staleRefundOrder.id },
      payment_status: 'unpaid',
      amount_total: staleRefundOrder.amount_total_minor,
      currency: 'eur'
    }))
    assert.equal(lateExpiration.response.status, 200)
    const staleRefundedOrder = await orderById(staleRefundOrder.id)
    assert.equal(staleRefundedOrder.payment_status, 'refunded')
    assert.equal(staleRefundedOrder.refund_amount_minor, staleRefundOrder.amount_total_minor)
    const staleRefundOutbox = await queryD1(databaseName, `SELECT event_type FROM outbox WHERE order_id = '${staleRefundOrder.id}'`, workspace)
    assert.equal(staleRefundOutbox.filter(item => item.event_type === 'payment.partially_refunded').length, 0)
    assert.equal(staleRefundOutbox.filter(item => item.event_type === 'payment.refunded').length, 1)

    stage('checkout, buyer status, fulfillment and refund monotonicity')
    const legacyPartialOrder = await seedOrder({
      key: 'rc1-legacy-expired-partial',
      paymentStatus: 'partially_refunded',
      fulfillmentStatus: 'awaiting_payment',
      stockMode: 'finite',
      reserve: true,
      expired: true
    })
    assert.equal(legacyPartialOrder.expires_at, 0)
    assert.equal((await reservationByOrder(legacyPartialOrder.id)).status, 'held')
    const beforeLegacyResolution = await checkout([{ id: cancelProductId, quantity: 1 }], 'rc1-legacy-held-blocks-stock', null, '198.51.100.93')
    assert.equal(beforeLegacyResolution.response.status, 409)
    assert.equal(beforeLegacyResolution.body.error, 'out_of_stock')
    let legacyPartialState = await orderByKey('rc1-legacy-expired-partial')
    assert.equal(legacyPartialState.payment_status, 'partially_refunded')
    assert.equal(legacyPartialState.fulfillment_status, 'inventory_exception')
    assert.equal(legacyPartialState.refund_amount_minor, 300)
    assert.equal((await reservationByOrder(legacyPartialOrder.id)).status, 'held')
    const reconciledLegacy = await admin('reconcile', 'POST')
    assert.equal(reconciledLegacy.response.status, 200)
    legacyPartialState = await orderByKey('rc1-legacy-expired-partial')
    assert.equal(legacyPartialState.payment_status, 'partially_refunded')
    assert.equal(legacyPartialState.fulfillment_status, 'inventory_exception')
    assert.equal((await reservationByOrder(legacyPartialOrder.id)).status, 'held')
    const legacyExceptionNotice = await queryD1(databaseName, `SELECT event_type, payload_json FROM outbox WHERE order_id = '${legacyPartialOrder.id}' AND event_type = 'payment.inventory_exception'`, workspace)
    assert.equal(legacyExceptionNotice.length, 1)
    assert.doesNotMatch(JSON.stringify(legacyExceptionNotice), /buyer@example|Synthetic Recipient|Synthetic Way/)
    assert.equal((await unauthenticatedAdmin(`orders/${legacyPartialOrder.id}/cancel-partial`)).status, 401)
    assert.equal((await admin(`orders/${legacyPartialOrder.id}/manufacture`, 'POST')).response.status, 409)
    assert.equal((await admin(`orders/${legacyPartialOrder.id}/ship`, 'POST')).response.status, 409)

    const failCancelPath = resolve(workspace, 'fail-partial-cancel-outbox.sql')
    writeFileSync(failCancelPath, `CREATE TRIGGER fail_partial_cancel BEFORE INSERT ON outbox WHEN NEW.order_id = '${legacyPartialOrder.id}' AND NEW.event_type = 'fulfillment.partial_refund_cancelled' BEGIN SELECT RAISE(ABORT, 'synthetic_partial_cancel_failure'); END;`)
    await runWrangler(['d1', 'execute', databaseName, '--local', '--file', failCancelPath], workspace)
    assert.equal((await admin(`orders/${legacyPartialOrder.id}/cancel-partial`, 'POST')).response.status, 500)
    assert.equal((await orderByKey('rc1-legacy-expired-partial')).fulfillment_status, 'inventory_exception')
    assert.equal((await reservationByOrder(legacyPartialOrder.id)).status, 'held')
    assert.equal((await queryD1(databaseName, `SELECT event_key FROM outbox WHERE order_id = '${legacyPartialOrder.id}' AND event_type = 'fulfillment.partial_refund_cancelled'`, workspace)).length, 0)
    await runWrangler(['d1', 'execute', databaseName, '--local', '--command', 'DROP TRIGGER fail_partial_cancel'], workspace)

    const partialCancelRaces = await Promise.all([1, 2].map(() => admin(`orders/${legacyPartialOrder.id}/cancel-partial`, 'POST')))
    assert.ok(partialCancelRaces.every(result => result.response.status === 200))
    assert.ok(partialCancelRaces.every(result => result.body.fulfillment_status === 'cancelled'))
    legacyPartialState = await orderByKey('rc1-legacy-expired-partial')
    assert.equal(legacyPartialState.payment_status, 'partially_refunded')
    assert.equal(legacyPartialState.fulfillment_status, 'cancelled')
    assert.equal(legacyPartialState.refund_amount_minor, 300)
    assert.equal((await reservationByOrder(legacyPartialOrder.id)).status, 'released')
    const cancelledNotice = await queryD1(databaseName, `SELECT event_type, payload_json FROM outbox WHERE order_id = '${legacyPartialOrder.id}' AND event_type = 'fulfillment.partial_refund_cancelled'`, workspace)
    assert.equal(cancelledNotice.length, 1)
    assert.deepEqual(JSON.parse(cancelledNotice[0].payload_json), {
      eventKey: `${legacyPartialOrder.id}:fulfillment.partial_refund_cancelled`,
      orderId: legacyPartialOrder.id,
      eventType: 'fulfillment.partial_refund_cancelled'
    })
    assert.doesNotMatch(JSON.stringify(cancelledNotice), /buyer@example|Synthetic Recipient|Synthetic Way/)
    assert.equal((await admin(`orders/${legacyPartialOrder.id}/cancel-partial`, 'POST')).response.status, 200)
    assert.equal((await queryD1(databaseName, `SELECT event_key FROM outbox WHERE order_id = '${legacyPartialOrder.id}' AND event_type = 'fulfillment.partial_refund_cancelled'`, workspace)).length, 1)
    assert.equal((await reservationByOrder(legacyPartialOrder.id)).status, 'released')

    const postCancelPurchase = await checkout([{ id: cancelProductId, quantity: 1 }], 'rc1-finite-after-partial-cancel', null, '198.51.100.94')
    assert.equal(postCancelPurchase.response.status, 201)
    assert.equal((await reservationByOrder(postCancelPurchase.body.order_id)).status, 'held')
    const noOversellAfterCancel = await checkout([{ id: cancelProductId, quantity: 1 }], 'rc1-no-oversell-after-partial-cancel', null, '198.51.100.95')
    assert.equal(noOversellAfterCancel.response.status, 409)
    assert.equal(noOversellAfterCancel.body.error, 'out_of_stock')

    const latePaidAfterPartialCancel = await webhook(paidSessionEvent({
      id: legacyPartialOrder.id,
      session_id: 'cs_test_latepartial001',
      amount_total_minor: legacyPartialOrder.amount_total_minor
    }, 'pi_rc1legacycancel'))
    assert.equal(latePaidAfterPartialCancel.response.status, 200)
    legacyPartialState = await orderByKey('rc1-legacy-expired-partial')
    assert.equal(legacyPartialState.payment_status, 'partially_refunded')
    assert.equal(legacyPartialState.fulfillment_status, 'cancelled')
    assert.equal(legacyPartialState.refund_amount_minor, 300)
    assert.equal((await reservationByOrder(legacyPartialOrder.id)).status, 'released')
    assert.equal((await queryD1(databaseName, `SELECT event_key FROM outbox WHERE order_id = '${legacyPartialOrder.id}' AND event_type = 'payment.paid'`, workspace)).length, 0)
    assert.equal((await queryD1(databaseName, `SELECT event_key FROM outbox WHERE order_id = '${legacyPartialOrder.id}' AND event_type = 'fulfillment.partial_refund_cancelled'`, workspace)).length, 1)

    const fullAfterPartialCancel = await webhook(event('charge.refunded', {
      object: 'charge',
      payment_intent: 'pi_rc1legacycancel',
      amount: 1050,
      amount_refunded: 1050,
      currency: 'eur'
    }))
    assert.equal(fullAfterPartialCancel.response.status, 200)
    const fullCancelledState = await orderByKey('rc1-legacy-expired-partial')
    assert.equal(fullCancelledState.payment_status, 'refunded')
    assert.equal(fullCancelledState.fulfillment_status, 'cancelled')
    assert.equal(fullCancelledState.refund_amount_minor, 1050)
    assert.equal((await reservationByOrder(legacyPartialOrder.id)).status, 'released')
    const stalePartialAfterCancel = await webhook(partialRefundEvent(legacyPartialOrder, 'pi_rc1legacycancel'))
    assert.equal(stalePartialAfterCancel.response.status, 200)
    const monotonicCancelledState = await orderByKey('rc1-legacy-expired-partial')
    assert.equal(monotonicCancelledState.payment_status, 'refunded')
    assert.equal(monotonicCancelledState.fulfillment_status, 'cancelled')
    assert.equal(monotonicCancelledState.refund_amount_minor, 1050)
    assert.equal((await reservationByOrder(legacyPartialOrder.id)).status, 'released')
    assert.equal((await queryD1(databaseName, `SELECT event_key FROM outbox WHERE order_id = '${legacyPartialOrder.id}' AND event_type = 'payment.partially_refunded'`, workspace)).length, 0)

    stage('RC1 legacy exception, atomic cancel, repurchase and late/full/stale events')
    const refundBeforePaidKey = 'refund-before-paid-held-stock'
    const refundBeforePaidCheckout = await checkout([{ id: fifthId, quantity: 1 }], refundBeforePaidKey, null, '198.51.100.60')
    assert.equal(refundBeforePaidCheckout.response.status, 201)
    const refundBeforePaidOrder = await orderByKey(refundBeforePaidKey)
    const partialBeforePaid = event('charge.refunded', {
      object: 'charge',
      payment_intent: 'pi_refundbeforepaid',
      metadata: { commerce_order_id: refundBeforePaidOrder.id },
      amount: refundBeforePaidOrder.amount_total_minor,
      amount_refunded: 200,
      currency: 'eur'
    })
    assert.equal((await webhook(partialBeforePaid)).response.status, 200)
    assert.equal((await webhook(partialBeforePaid)).body.duplicate, true)
    assert.equal((await orderByKey(refundBeforePaidKey)).payment_status, 'partially_refunded')
    assert.equal((await orderByKey(refundBeforePaidKey)).fulfillment_status, 'inventory_exception')
    assert.equal((await orderByKey(refundBeforePaidKey)).refund_amount_minor, 200)
    assert.equal((await reservationByOrder(refundBeforePaidOrder.id)).status, 'held')
    assert.equal((await queryD1(databaseName, `SELECT event_key FROM outbox WHERE order_id = '${refundBeforePaidOrder.id}' AND event_type = 'payment.inventory_exception'`, workspace)).length, 1)
    assert.equal((await admin(`orders/${refundBeforePaidOrder.id}/manufacture`, 'POST')).response.status, 409)

    const fullBeforePaid = event('charge.refunded', {
      object: 'charge',
      payment_intent: 'pi_refundbeforepaid',
      metadata: { commerce_order_id: refundBeforePaidOrder.id },
      amount: refundBeforePaidOrder.amount_total_minor,
      amount_refunded: refundBeforePaidOrder.amount_total_minor,
      currency: 'eur'
    })
    assert.equal((await webhook(fullBeforePaid)).response.status, 200)
    let refundedBeforePaid = await orderByKey(refundBeforePaidKey)
    assert.equal(refundedBeforePaid.payment_status, 'refunded')
    assert.equal(refundedBeforePaid.fulfillment_status, 'cancelled')
    assert.equal(refundedBeforePaid.refund_amount_minor, refundBeforePaidOrder.amount_total_minor)
    assert.equal((await reservationByOrder(refundBeforePaidOrder.id)).status, 'released')

    const replacementAfterRefund = await checkout([{ id: fifthId, quantity: 1 }], 'replacement-after-full-refund', null, '198.51.100.61')
    assert.equal(replacementAfterRefund.response.status, 201)
    const stalePartialAfterFull = await webhook(event('charge.refunded', {
      object: 'charge',
      payment_intent: 'pi_refundbeforepaid',
      metadata: { commerce_order_id: refundBeforePaidOrder.id },
      amount: refundBeforePaidOrder.amount_total_minor,
      amount_refunded: 200,
      currency: 'eur'
    }))
    assert.equal(stalePartialAfterFull.response.status, 200)
    assert.equal((await webhook(fullBeforePaid)).body.duplicate, true)
    const paidAfterFullRefund = await webhook(event('checkout.session.completed', {
      object: 'checkout.session',
      id: refundBeforePaidOrder.session_id,
      client_reference_id: refundBeforePaidOrder.id,
      metadata: { commerce_order_id: refundBeforePaidOrder.id },
      payment_intent: 'pi_refundbeforepaid',
      payment_status: 'paid',
      amount_total: refundBeforePaidOrder.amount_total_minor,
      currency: 'eur'
    }))
    assert.equal(paidAfterFullRefund.response.status, 200)
    refundedBeforePaid = await orderByKey(refundBeforePaidKey)
    assert.equal(refundedBeforePaid.payment_status, 'refunded')
    assert.equal(refundedBeforePaid.refund_amount_minor, refundBeforePaidOrder.amount_total_minor)
    assert.equal(refundedBeforePaid.fulfillment_status, 'cancelled')
    assert.equal((await reservationByOrder(refundBeforePaidOrder.id)).status, 'released')
    assert.equal((await reservationByOrder(replacementAfterRefund.body.order_id)).status, 'held')

    const failedCheckout = await checkout([{ id: firstId, quantity: 1 }], 'failed-payment-key')
    assert.equal(failedCheckout.response.status, 201)
    const failedOrder = await orderById(failedCheckout.body.order_id)
    const pending = await webhook(sessionEvent('checkout.session.completed', {
      id: failedOrder.id,
      checkoutSession: failedOrder.session_id,
      amount: failedOrder.amount_total_minor
    }, 'unpaid', 'pi_local_002'))
    assert.equal(pending.response.status, 200)
    assert.equal((await orderById(failedOrder.id)).payment_status, 'pending')
    const failure = await webhook(event('payment_intent.payment_failed', {
      object: 'payment_intent',
      id: 'pi_local_002',
      amount: failedOrder.amount_total_minor,
      currency: 'eur',
      metadata: { commerce_order_id: failedOrder.id }
    }))
    assert.equal(failure.response.status, 200)
    assert.equal((await orderById(failedOrder.id)).payment_status, 'failed')
    assert.equal((await buyerStatus(failedOrder.id, statusCookie(failedCheckout.setCookie).pair)).body.payment_status, 'failed')

    const mismatch = await webhook(event('checkout.session.completed', {
      object: 'checkout.session',
      id: orderA.session_id,
      client_reference_id: orderA.id,
      metadata: { commerce_order_id: orderA.id },
      payment_status: 'paid',
      amount_total: orderA.amount_total_minor + 1,
      currency: 'eur'
    }))
    assert.equal(mismatch.response.status, 503)
    assert.equal(mismatch.body.error, 'payment_event_mismatch')

    let outboxDrain = await admin('outbox/dispatch', 'POST')
    assert.equal(outboxDrain.response.status, 200)
    assert.ok(outboxDrain.body.failed >= 1)
    assert.ok(outboxDrain.body.pending >= 1)
    const failedNotice = await queryD1(databaseName, "SELECT payload_json, last_error FROM outbox WHERE status = 'pending' AND last_error = 'notifier_unavailable' LIMIT 1", workspace)
    assert.equal(failedNotice.length, 1)
    assert.doesNotMatch(JSON.stringify(failedNotice), /buyer@example\.invalid|Synthetic Recipient|Synthetic Way|address_line1/)
    await runWrangler(['d1', 'execute', databaseName, '--local', '--command', "UPDATE outbox SET next_attempt_at = 0 WHERE status = 'pending'"], workspace)
    outboxDrain = await admin('outbox/dispatch', 'POST')
    assert.equal(outboxDrain.response.status, 200)
    assert.equal(outboxDrain.body.failed, 0)
    assert.ok(outboxDrain.body.pending > 0)

    stage('held refund, failed payment and outbox retry')
    const unauthorizedOrders = await fetch(`${origin}/api/commerce/admin/orders`)
    assert.equal(unauthorizedOrders.status, 401)
    const unauthorizedExport = await fetch(`${origin}/api/commerce/admin/export.csv`)
    assert.equal(unauthorizedExport.status, 401)
    const operationCreatedAt = 1700000000
    const operationExpiry = Math.floor(Date.now() / 1000) + 86400
    const operationSnapshot = (id, key, createdAt) => JSON.stringify({
      orderId: id,
      idempotencyKey: key,
      catalogRelease: 'a'.repeat(64),
      currency: 'eur',
      stockMode: 'made_to_order',
      createdAt,
      totalMinor: 1234,
      items: [{ sku: 'OPS-001', productId: firstId, name: 'Export fixture', quantity: 1, unitAmountMinor: 1234, lineTotalMinor: 1234 }]
    })
    const operationsOrderSql = (id, key, createdAt, status = 'expired', sessionId = null, updatedAt = createdAt) => {
      const snapshot = operationSnapshot(id, key, createdAt)
      const idempotencyStatus = sessionId ? 'ready' : 'creating'
      const checkoutUrl = sessionId ? `https://checkout.stripe.com/c/pay/${sessionId}` : null
      return [
        `INSERT INTO commerce_idempotency (idempotency_key, request_hash, order_id, snapshot_json, status, session_id, checkout_url, created_at, updated_at, expires_at) VALUES (${sqlString(key)}, ${sqlString(`hash-${key}`)}, ${sqlString(id)}, ${sqlString(snapshot)}, ${sqlString(idempotencyStatus)}, ${sessionId ? sqlString(sessionId) : 'NULL'}, ${checkoutUrl ? sqlString(checkoutUrl) : 'NULL'}, ${createdAt}, ${updatedAt}, ${operationExpiry});`,
        `INSERT INTO orders (id, session_id, idempotency_key, catalog_release, currency, amount_total_minor, snapshot_json, payment_status, fulfillment_status, reservation_state, created_at, updated_at, expires_at) VALUES (${sqlString(id)}, ${sessionId ? sqlString(sessionId) : 'NULL'}, ${sqlString(key)}, '${'a'.repeat(64)}', 'eur', 1234, ${sqlString(snapshot)}, ${sqlString(status)}, 'awaiting_payment', 'unreserved', ${createdAt}, ${updatedAt}, ${operationExpiry});`
      ].join('\n')
    }
    const operationOrders = Array.from({ length: 130 }, (_, index) => {
      const sequence = String(index + 1).padStart(12, '0')
      return {
        id: `aaaaaaaa-aaaa-4aaa-8aaa-${sequence}`,
        key: `operations-fixture-${index + 1}`
      }
    })
    const operationSeedPath = resolve(workspace, 'operations-orders.sql')
    writeFileSync(operationSeedPath, operationOrders.map(order => operationsOrderSql(order.id, order.key, operationCreatedAt)).join('\n'))
    await runWrangler(['d1', 'execute', databaseName, '--local', '--file', operationSeedPath], workspace)
    await runWrangler(['d1', 'execute', databaseName, '--local', '--command', `INSERT INTO order_delivery_details (order_id, source, buyer_name, buyer_email, recipient_name, address_line1, locality, postal_code, country_code, updated_at) VALUES ('${operationOrders[0].id}', 'stripe_checkout', 'Synthetic export buyer', 'buyer-export@example.invalid', 'Synthetic recipient', '2 Export Street', 'Fixture City', '11111', 'ES', ${Math.floor(Date.now() / 1000)})`], workspace)

    const firstPage = await admin('orders?payment_status=expired&limit=100')
    assert.equal(firstPage.response.status, 200)
    assert.equal(firstPage.body.orders.length, 100)
    assert.ok(firstPage.body.next_cursor)
    const [cursorCreatedAt, cursorOrderId] = firstPage.body.next_cursor.split(':')
    const nextBeforeChange = (await queryD1(databaseName, `
      SELECT id FROM orders WHERE payment_status = 'expired'
        AND (created_at < ${Number(cursorCreatedAt)} OR (created_at = ${Number(cursorCreatedAt)} AND id < ${sqlString(cursorOrderId)}))
      ORDER BY created_at DESC, id DESC LIMIT 1
    `, workspace))[0]
    assert.ok(nextBeforeChange)
    const changedUpdatedAt = Math.floor(Date.now() / 1000) + 100
    await runWrangler(['d1', 'execute', databaseName, '--local', '--command', `UPDATE orders SET updated_at = ${changedUpdatedAt} WHERE id = '${nextBeforeChange.id}'`], workspace)
    const lateOrderId = '00000000-0000-4000-8000-000000000001'
    assert.ok(lateOrderId < cursorOrderId)
    const lateOrderPath = resolve(workspace, 'operations-late-order.sql')
    writeFileSync(lateOrderPath, operationsOrderSql(lateOrderId, 'operations-late-order', Number(cursorCreatedAt), 'expired', null, changedUpdatedAt))
    await runWrangler(['d1', 'execute', databaseName, '--local', '--file', lateOrderPath], workspace)
    const secondPage = await admin(`orders?payment_status=expired&limit=100&cursor=${encodeURIComponent(firstPage.body.next_cursor)}`)
    assert.equal(secondPage.response.status, 200)
    assert.ok(secondPage.body.orders.some(order => order.id === nextBeforeChange.id && order.updated_at === changedUpdatedAt))
    assert.ok(secondPage.body.orders.some(order => order.id === lateOrderId))
    assert.equal(new Set([...firstPage.body.orders, ...secondPage.body.orders].map(order => order.id)).size, firstPage.body.orders.length + secondPage.body.orders.length)

    const exportedIds = new Set()
    let exportCursor = null
    let exportedBuyerDetails = false
    let concurrentExportOrder = null
    let concurrentExportUpdate = false
    do {
      const exportUrl = `export.csv?limit=100${exportCursor ? `&cursor=${encodeURIComponent(exportCursor)}` : ''}`
      const exportPage = await admin(exportUrl)
      assert.equal(exportPage.response.status, 200)
      exportedBuyerDetails ||= exportPage.body.includes('buyer-export@example.invalid')
      for (const line of exportPage.body.split('\r\n')) {
        const match = line.match(/^"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})",/i)
        if (match) exportedIds.add(match[1])
        if (concurrentExportOrder && line.startsWith(`"${concurrentExportOrder.id}",`) && line.includes(`,"${concurrentExportOrder.updatedAt}",`)) concurrentExportUpdate = true
      }
      exportCursor = exportPage.response.headers.get('x-next-cursor') || null
      if (exportCursor && !concurrentExportOrder) {
        const [cursorCreatedAt, cursorOrderId] = exportCursor.split(':')
        const nextOrder = (await queryD1(databaseName, `
          SELECT id FROM orders WHERE created_at < ${Number(cursorCreatedAt)}
            OR (created_at = ${Number(cursorCreatedAt)} AND id < ${sqlString(cursorOrderId)})
          ORDER BY created_at DESC, id DESC LIMIT 1
        `, workspace))[0]
        assert.ok(nextOrder)
        const updatedAt = Math.floor(Date.now() / 1000) + 300
        await runWrangler(['d1', 'execute', databaseName, '--local', '--command', `UPDATE orders SET updated_at = ${updatedAt} WHERE id = '${nextOrder.id}'`], workspace)
        const lateExportId = '00000000-0000-4000-8000-000000000002'
        assert.ok(lateExportId < cursorOrderId)
        const lateExportPath = resolve(workspace, 'operations-export-late-order.sql')
        writeFileSync(lateExportPath, operationsOrderSql(lateExportId, 'operations-export-late-order', Number(cursorCreatedAt), 'expired', null, updatedAt))
        await runWrangler(['d1', 'execute', databaseName, '--local', '--file', lateExportPath], workspace)
        concurrentExportOrder = { id: nextOrder.id, updatedAt, lateOrderId: lateExportId }
      }
    } while (exportCursor)
    assert.ok(exportedBuyerDetails)
    assert.ok(exportedIds.size > 100)
    assert.ok(operationOrders.every(order => exportedIds.has(order.id)))
    assert.ok(exportedIds.has(lateOrderId))
    assert.ok(exportedIds.has(legacyOrderId))
    assert.ok(concurrentExportOrder)
    assert.ok(exportedIds.has(concurrentExportOrder.id))
    assert.ok(exportedIds.has(concurrentExportOrder.lateOrderId))
    assert.ok(concurrentExportUpdate)

    await runWrangler(['d1', 'execute', databaseName, '--local', '--command', "UPDATE orders SET payment_status = 'expired' WHERE payment_status IN ('pending', 'failed')"], workspace)
    const rotationCreatedAt = Math.floor(Date.now() / 1000) - 60
    const rotatingOrders = Array.from({ length: 75 }, (_, index) => {
      const sequence = String(index + 1).padStart(12, '0')
      const id = `bbbbbbbb-bbbb-4bbb-8bbb-${sequence}`
      const sessionId = `cs_test_rotate${String(index + 1).padStart(3, '0')}`
      return { id, sessionId }
    })
    const rotatingSeedPath = resolve(workspace, 'reconcile-rotation.sql')
    writeFileSync(rotatingSeedPath, rotatingOrders.map((order, index) => operationsOrderSql(order.id, `rotation-fixture-${index + 1}`, rotationCreatedAt, 'pending', order.sessionId)).join('\n'))
    await runWrangler(['d1', 'execute', databaseName, '--local', '--file', rotatingSeedPath], workspace)
    await runWrangler(['d1', 'execute', databaseName, '--local', '--command', "UPDATE commerce_operation_cursors SET cursor_created_at = 0, cursor_id = '' WHERE operation = 'orders'"], workspace)
    for (let page = 0; page < 3; page++) {
      const result = await admin('reconcile', 'POST')
      assert.equal(result.response.status, 503)
      assert.equal(result.body.checked, 25)
      assert.equal(result.body.failed, 25)
      const cursor = (await queryD1(databaseName, "SELECT cursor_id FROM commerce_operation_cursors WHERE operation = 'orders'", workspace))[0].cursor_id
      assert.equal(cursor, rotatingOrders[(page + 1) * 25 - 1].id)
    }
    const concurrentReconciles = await Promise.all([1, 2].map(() => admin('reconcile', 'POST', undefined, { 'x-test-synchronize-cursor-read': 'true' })))
    assert.equal(concurrentReconciles.reduce((total, result) => total + result.body.checked, 0), 25)
    assert.equal(concurrentReconciles.reduce((total, result) => total + result.body.skipped_concurrent, 0), 1)
    assert.ok(concurrentReconciles.every(result => result.response.headers.get('x-test-synchronized-cursor-reads') === '2'))
    const wrappedCursor = (await queryD1(databaseName, "SELECT cursor_id FROM commerce_operation_cursors WHERE operation = 'orders'", workspace))[0].cursor_id
    assert.equal(wrappedCursor, rotatingOrders[24].id)
    for (const cursorIndex of [49, 74]) {
      const result = await admin('reconcile', 'POST')
      assert.equal(result.body.checked, 25)
      const cursor = (await queryD1(databaseName, "SELECT cursor_id FROM commerce_operation_cursors WHERE operation = 'orders'", workspace))[0].cursor_id
      assert.equal(cursor, rotatingOrders[cursorIndex].id)
    }

    stage('operations pagination, export and concurrent reconciliation')
    const exportPath = resolve(workspace, 'commerce-export.sql')
    await runWrangler(['d1', 'export', databaseName, '--local', '--output', exportPath], workspace)
    const dump = readFileSync(exportPath, 'utf8')
    assert.match(dump, /CREATE TABLE orders/i)
    assert.match(dump, new RegExp(orderA.id))
    assert.match(dump, /CREATE TABLE stock_reservations/i)
    assert.match(dump, /CREATE TABLE order_delivery_details/i)
    assert.match(dump, /CREATE TABLE commerce_operation_cursors/i)
    assert.match(dump, /CREATE TRIGGER orders_snapshot_immutable/i)
    assert.match(dump, /CREATE INDEX/i)
    const restoreConfigPath = resolve(workspace, 'wrangler.restore.toml')
    writeFileSync(restoreConfigPath, config.replace(`database_name = "${databaseName}"`, 'database_name = "commerce-restored"'))
    const restoreStatePath = resolve(workspace, 'restored-d1-state')
    await runWrangler(['--config', restoreConfigPath, 'd1', 'execute', 'commerce-restored', '--local', '--persist-to', restoreStatePath, '--file', exportPath], workspace)
    const restoredCountsOutput = await runWrangler(['--config', restoreConfigPath, 'd1', 'execute', 'commerce-restored', '--local', '--persist-to', restoreStatePath, '--json', '--command', 'SELECT COUNT(*) AS orders FROM orders; SELECT COUNT(*) AS delivery_records FROM order_delivery_details'], workspace)
    const restoredCounts = JSON.parse(restoredCountsOutput).flatMap(result => result.results || [])
    assert.ok(restoredCounts[0].orders > 100)
    assert.ok(restoredCounts[1].delivery_records >= 1)
    const restoreTables = [
      ['commerce_idempotency', 'idempotency_key'],
      ['orders', 'id'],
      ['order_status_capabilities', 'capability_hash'],
      ['inventory', 'product_id'],
      ['stock_reservations', 'order_id, product_id'],
      ['rate_limits', 'client_key'],
      ['webhook_events', 'event_id'],
      ['outbox', 'event_key'],
      ['order_delivery_details', 'order_id'],
      ['commerce_operation_cursors', 'operation']
    ]
    const tableStateSql = restoreTables.map(([table, orderBy]) => `SELECT * FROM ${table} ORDER BY ${orderBy}`).join('; ')
    const sourceRowsOutput = await runWrangler(['d1', 'execute', databaseName, '--local', '--json', '--command', tableStateSql], workspace)
    const restoredRowsOutput = await runWrangler(['--config', restoreConfigPath, 'd1', 'execute', 'commerce-restored', '--local', '--persist-to', restoreStatePath, '--json', '--command', tableStateSql], workspace)
    const sourceRows = JSON.parse(sourceRowsOutput).flatMap(result => result.results || [])
    const restoredRows = JSON.parse(restoredRowsOutput).flatMap(result => result.results || [])
    assert.deepEqual(restoredRows, sourceRows, 'restored table rows and states')
    const restoreCommand = ['--config', restoreConfigPath, 'd1', 'execute', 'commerce-restored', '--local', '--persist-to', restoreStatePath]
    await assert.rejects(runWrangler([...restoreCommand, '--command', `UPDATE orders SET snapshot_json = '{}' WHERE id = '${orderA.id}'`], workspace), /order_snapshot_immutable/)
    await assert.rejects(runWrangler([...restoreCommand, '--command', `INSERT INTO order_delivery_details (order_id, source, updated_at) VALUES ('${operationOrders[1].id}', 'invalid_source', 1)`], workspace), /CHECK constraint/)
    await assert.rejects(runWrangler([...restoreCommand, '--command', 'INSERT INTO order_delivery_details (order_id, source, updated_at) VALUES (\'ffffffff-ffff-4fff-8fff-ffffffffffff\', \'stripe_checkout\', 1)'], workspace), /FOREIGN KEY constraint/)
    stage('SQL restore, row equality and immutable snapshot constraints')
  } finally {
    await stopPages(server)
    rmSync(workspace, { recursive: true, force: true })
    stage('cleanup')
  }
})
