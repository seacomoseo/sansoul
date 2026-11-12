import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { handleCheckout } from '../../checkout.js'
import { handleQuote } from '../../quote.js'
import { handleWebhook } from '../../webhook.js'
import { makeStripeSignature } from '../../signature.js'
import { SYNTHETIC_TEST_FIXTURE } from '../../approval.js'

// Real SQLite + original migrations; synthetic merchant policy, products and addresses.
const ORIGIN = 'https://shop.example'
const firstId = '11111111-1111-4111-8111-111111111111'
const secondId = '22222222-2222-4222-8222-222222222222'
const MADRID = { country: 'ES', postalCode: '28001' }
const WEBHOOK_SECRET = 'whsec_totals_fixture'

function database () {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const name of ['0001_commerce.sql', '0002_buyer_status.sql', '0003_provider_session_expiry.sql', '0004_operations_and_delivery.sql', '0005_outbox_indexes.sql', '0006_bounded_maintenance.sql', '0007_invoices.sql', '0008_buyer_tax_and_delivery_notes.sql']) {
    sqlite.exec(readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'))
  }
  const db = {
    sqlite,
    prepare (sql) {
      const statement = sqlite.prepare(sql)
      let args = []
      return {
        bind (...values) { args = values; return this },
        async first () { return statement.get(...args) || null },
        async all () { return { results: statement.all(...args) } },
        async run () { return { meta: statement.run(...args) } }
      }
    },
    async batch (statements) {
      sqlite.exec('BEGIN')
      try {
        const result = []
        for (const statement of statements) result.push(await statement.run())
        sqlite.exec('COMMIT')
        return result
      } catch (error) { sqlite.exec('ROLLBACK'); throw error }
    }
  }
  return db
}

function catalog (overrides = {}) {
  return {
    schemaVersion: 2,
    enabled: true,
    functionsEnabled: true,
    checkout: {
      approved: false,
      legalVersion: null,
      destinationCountries: ['ES'],
      taxPolicy: 'calculated',
      shippingPolicy: 'flat_rate',
      totalsPolicy: {
        schemaVersion: 2,
        version: 'fixture-2026-11',
        currency: 'eur',
        minorUnit: 2,
        destinations: {
          ES: { tax: { mode: 'inclusive', rateBps: 2100 }, shipping: { amountMinor: 1205, tax: { mode: 'inclusive', rateBps: 2100 } }, excludedPostalPrefixes: ['35', '38', '51', '52'] }
        }
      }
    },
    release: 'b'.repeat(64),
    origin: ORIGIN,
    currency: 'eur',
    minorUnit: 2,
    stockMode: 'made_to_order',
    products: [
      { id: firstId, sku: 'SKU-001', active: true, quote: false, priceMinor: 1050, weightGrams: 500, names: { es: 'Modelo A' } },
      { id: secondId, sku: 'SKU-002', active: true, quote: false, priceMinor: 2500, weightGrams: null, names: { es: 'Modelo B' } }
    ],
    ...overrides
  }
}

function environment (db, overrides = {}) {
  return {
    COMMERCE_ENV: 'test',
    COMMERCE_PROVIDER: 'fake',
    COMMERCE_TEST_FIXTURE: SYNTHETIC_TEST_FIXTURE,
    COMMERCE_TEST_ORIGIN: ORIGIN,
    COMMERCE_RATE_LIMIT_SALT: 's'.repeat(32),
    FAKE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    COMMERCE_DB: db,
    ...overrides
  }
}

function post (path, body, { key, origin = ORIGIN } = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, ...(key ? { 'idempotency-key': key } : {}) },
    body: JSON.stringify(body)
  })
}

const items = [{ id: firstId, quantity: 1 }]

async function quote (env, cat, body = { items, destination: MADRID }) {
  const response = await handleQuote(post('/api/commerce/quote', body), env, cat)
  return { status: response.status, body: await response.json() }
}

async function checkout (env, cat, key, body) {
  const response = await handleCheckout(post('/api/commerce/checkout', body, { key }), env, cat)
  return { status: response.status, body: await response.json() }
}

async function sendWebhook (env, event) {
  const raw = JSON.stringify(event)
  const signature = await makeStripeSignature(raw, WEBHOOK_SECRET)
  const response = await handleWebhook(new Request(`${ORIGIN}/api/commerce/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    body: raw
  }), env)
  return { status: response.status, body: await response.json() }
}

let eventCounter = 0
function sessionEvent (order, { type = 'checkout.session.completed', paymentStatus = 'paid', address, legacyShape = false } = {}) {
  const shipping = address ? { name: 'Cliente Prueba', address: { line1: 'Calle Falsa 1', city: 'Ciudad', country: address.country, postal_code: address.postalCode } } : null
  const object = {
    object: 'checkout.session',
    id: order.session_id,
    client_reference_id: order.id,
    metadata: { commerce_order_id: order.id },
    payment_status: paymentStatus,
    payment_intent: `pi_fixture${order.id.slice(0, 8)}`,
    amount_total: order.amount_total_minor,
    currency: 'eur',
    customer_details: { email: 'cliente@example.invalid', name: 'Cliente Prueba' },
    ...(shipping ? (legacyShape ? { shipping_details: shipping } : { collected_information: { shipping_details: shipping } }) : {})
  }
  return { id: `evt_totals${++eventCounter}`, type, created: Math.floor(Date.now() / 1000), livemode: false, data: { object } }
}

function intentSucceeded (order) {
  return {
    id: `evt_totals${++eventCounter}`,
    type: 'payment_intent.succeeded',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: { object: { object: 'payment_intent', id: `pi_fixture${order.id.slice(0, 8)}`, amount: order.amount_total_minor, amount_received: order.amount_total_minor, currency: 'eur', metadata: { commerce_order_id: order.id } } }
  }
}

async function paidOrder (env, cat, key, destination = MADRID) {
  const quoted = await quote(env, cat, { items, destination })
  const created = await checkout(env, cat, key, { items, destination, quote: { policy_version: quoted.body.quote.policy_version, total_minor: quoted.body.quote.total_minor } })
  assert.equal(created.status, 201)
  return env.COMMERCE_DB.sqlite.prepare('SELECT * FROM orders WHERE id = ?').get(created.body.order_id)
}

const orderRow = (db, id) => ({ ...db.sqlite.prepare('SELECT payment_status, fulfillment_status FROM orders WHERE id = ?').get(id) })
const outboxTypes = (db, id) => db.sqlite.prepare('SELECT event_type FROM outbox WHERE order_id = ? ORDER BY event_type').all(id).map(row => row.event_type)

test('quote endpoint computes server totals and rejects excluded zones, bad input, cross-origin and closed gates', async () => {
  const db = database()
  const env = environment(db)
  const cat = catalog()
  const madrid = await quote(env, cat)
  assert.equal(madrid.status, 200)
  // 10,50 € IVA incl. + 12,05 € envío IVA incl. = 22,55 €; IVA = 182 + 209 céntimos.
  assert.deepEqual(madrid.body.quote, { policy_version: 'fixture-2026-11', country: 'ES', currency: 'eur', subtotal_minor: 1050, shipping_minor: 1205, tax_minor: 391, added_tax_minor: 0, total_minor: 2255 })

  for (const postalCode of ['35001', '38001', '51001', '52001']) {
    const excluded = await quote(env, cat, { items, destination: { country: 'ES', postalCode } })
    assert.equal(excluded.status, 409)
    assert.equal(excluded.body.error, 'destination_quote_required')
  }
  assert.equal((await quote(env, cat, { items, destination: { country: 'ES', postalCode: '99999' } })).body.error, 'invalid_postal_code')
  assert.equal((await quote(env, cat, { items, destination: { country: 'FR', postalCode: '75001' } })).body.error, 'destination_not_supported')
  assert.equal((await quote(env, cat, { items })).body.error, 'invalid_cart')
  assert.equal((await quote(env, cat, { items, destination: MADRID, totalMinor: 1 })).body.error, 'invalid_cart')

  const crossOrigin = await handleQuote(post('/api/commerce/quote', { items, destination: MADRID }, { origin: 'https://evil.example' }), env, cat)
  assert.equal(crossOrigin.status, 403)
  const live = await quote(environment(db, { COMMERCE_ENV: 'live', COMMERCE_PROVIDER: 'stripe', COMMERCE_CHECKOUT_APPROVED: 'true' }), { ...cat, checkout: { ...cat.checkout, approved: true, legalVersion: 'terms-v1' } })
  assert.equal(live.status, 503)
  assert.equal(live.body.error, 'checkout_not_approved')
  const noPolicy = await quote(env, { ...cat, checkout: { ...cat.checkout, totalsPolicy: undefined } })
  assert.equal(noPolicy.body.error, 'totals_policy_unavailable')
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 0)
})

test('checkout charges exactly the displayed server quote and persists the breakdown immutably', async () => {
  const db = database()
  const env = environment(db)
  const cat = catalog()
  const shown = (await quote(env, cat)).body.quote
  const body = { items, destination: MADRID, quote: { policy_version: shown.policy_version, total_minor: shown.total_minor } }
  const created = await checkout(env, cat, 'totals-key-0001', body)
  assert.equal(created.status, 201)
  const order = db.sqlite.prepare('SELECT * FROM orders WHERE id = ?').get(created.body.order_id)
  assert.equal(order.amount_total_minor, 2255)
  const snapshot = JSON.parse(order.snapshot_json)
  assert.equal(snapshot.totalMinor, 2255)
  assert.equal(snapshot.totals.totalMinor, 2255)
  assert.equal(snapshot.totals.shippingTotalMinor, 1205)
  assert.deepEqual(snapshot.totals.destination, { country: 'ES', excludedPostalPrefixes: ['35', '38', '51', '52'] })
  assert.doesNotMatch(order.snapshot_json, /28001/, 'postal code is not stored before payment')

  const replay = await checkout(env, cat, 'totals-key-0001', body)
  assert.equal(replay.status, 200)
  assert.equal(replay.body.order_id, created.body.order_id)
  // Another eligible postal code yields the same quote: the retry replays the same order
  // (the collected address is re-checked by the webhook gate), never a second charge.
  const moved = await checkout(env, cat, 'totals-key-0001', { ...body, destination: { country: 'ES', postalCode: '08001' } })
  assert.equal(moved.status, 200)
  assert.equal(moved.body.order_id, created.body.order_id)
  const requoted = await checkout(env, cat, 'totals-key-0001', { ...body, quote: { ...body.quote, total_minor: 2254 } })
  assert.equal(requoted.status, 409)
  assert.equal(requoted.body.error, 'idempotency_conflict')
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 1)
})

test('tampered or stale quotes are never charged: 409 with a fresh quote and no order', async () => {
  const db = database()
  const env = environment(db)
  const cat = catalog()
  for (const [key, staleQuote] of [
    ['tamper-key-0001', { policy_version: 'fixture-2026-11', total_minor: 1 }],
    ['tamper-key-0002', { policy_version: 'fixture-2026-10', total_minor: 2255 }]
  ]) {
    const result = await checkout(env, cat, key, { items, destination: MADRID, quote: staleQuote })
    assert.equal(result.status, 409)
    assert.equal(result.body.error, 'quote_changed')
    assert.equal(result.body.quote.total_minor, 2255)
  }
  const changedPolicy = catalog()
  changedPolicy.checkout.totalsPolicy.destinations.ES.shipping.amountMinor = 1500
  const result = await checkout(env, changedPolicy, 'tamper-key-0003', { items, destination: MADRID, quote: { policy_version: 'fixture-2026-11', total_minor: 2255 } })
  assert.equal(result.body.error, 'quote_changed')
  assert.equal(result.body.quote.total_minor, 2550)
  for (const malformed of [{ items, destination: MADRID }, { items, destination: MADRID, quote: { total_minor: 2255 } }, { items, destination: MADRID, quote: { policy_version: 'fixture-2026-11', total_minor: '2255' } }]) {
    assert.equal((await checkout(env, cat, 'tamper-key-0004', malformed)).status, 400)
  }
  const excluded = await checkout(env, cat, 'tamper-key-0005', { items, destination: { country: 'ES', postalCode: '38001' }, quote: { policy_version: 'fixture-2026-11', total_minor: 2255 } })
  assert.equal(excluded.body.error, 'destination_quote_required')
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 0)
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM commerce_idempotency').get().n, 0)
})

test('paid order with an eligible address in either Stripe API shape becomes ready and notifies payment', async () => {
  for (const legacyShape of [false, true]) {
    const db = database()
    const env = environment(db)
    const order = await paidOrder(env, catalog(), `ready-key-000${legacyShape ? 1 : 2}`)
    const result = await sendWebhook(env, sessionEvent(order, { address: { country: 'ES', postalCode: '07001' }, legacyShape }))
    assert.equal(result.status, 200)
    assert.deepEqual(orderRow(db, order.id), { payment_status: 'paid', fulfillment_status: 'ready' })
    assert.deepEqual(outboxTypes(db, order.id), ['payment.paid'])
    assert.equal(db.sqlite.prepare('SELECT postal_code FROM order_delivery_details WHERE order_id = ?').get(order.id).postal_code, '07001')
  }
})

test('paid order collected outside the quoted zone is held for review, not fulfilled', async () => {
  const cases = [
    ['canarias', { address: { country: 'ES', postalCode: '35001' } }],
    ['ceuta-spaced', { address: { country: 'ES', postalCode: '51 001' } }],
    ['other-country', { address: { country: 'PT', postalCode: '1000-001' } }]
  ]
  for (const [name, options] of cases) {
    const db = database()
    const env = environment(db)
    const order = await paidOrder(env, catalog(), `hold-key-${name}`)
    const result = await sendWebhook(env, sessionEvent(order, options))
    assert.equal(result.status, 200, name)
    assert.deepEqual(orderRow(db, order.id), { payment_status: 'paid', fulfillment_status: 'inventory_exception' }, name)
    // One specific event per hold: no generic payment.inventory_exception duplicate, no payment.paid.
    assert.deepEqual(outboxTypes(db, order.id), ['payment.destination_review'], name)
  }
})

test('a paid completion without address records payment but is not fulfillable until an address arrives', async () => {
  const db = database()
  const env = environment(db)
  const order = await paidOrder(env, catalog(), 'hold-key-missing-address')
  assert.equal((await sendWebhook(env, sessionEvent(order, {}))).status, 200)
  assert.deepEqual(orderRow(db, order.id), { payment_status: 'paid', fulfillment_status: 'awaiting_payment' })
  assert.deepEqual(outboxTypes(db, order.id), ['payment.awaiting_address'])
})

test('postal variants and invalid formats cannot slip past the zone check', async () => {
  for (const [name, postalCode, expected] of [
    ['nbsp-canarias', '3 5001', 'inventory_exception'],
    ['hyphen-melilla', '52-001', 'inventory_exception'],
    ['invalid-province', '00000', 'inventory_exception'],
    ['letters', 'ABCDE', 'inventory_exception'],
    ['spaced-madrid', ' 28 001 ', 'ready']
  ]) {
    const db = database()
    const env = environment(db)
    const order = await paidOrder(env, catalog(), `postal-key-${name}`)
    await sendWebhook(env, sessionEvent(order, { address: { country: 'ES', postalCode } }))
    assert.equal(orderRow(db, order.id).fulfillment_status, expected, name)
  }
})

test('payment before address never makes an order fulfillable early (review regression)', async () => {
  const db = database()
  const env = environment(db)

  // payment_intent.succeeded first: paid, but not ready and no payment.paid yet.
  const bad = await paidOrder(env, catalog(), 'order-key-late-bad')
  await sendWebhook(env, intentSucceeded(bad))
  assert.deepEqual(orderRow(db, bad.id), { payment_status: 'paid', fulfillment_status: 'awaiting_payment' })
  assert.deepEqual(outboxTypes(db, bad.id), ['payment.awaiting_address'])
  await sendWebhook(env, sessionEvent(bad, { address: { country: 'ES', postalCode: '38400' } }))
  assert.deepEqual(orderRow(db, bad.id), { payment_status: 'paid', fulfillment_status: 'inventory_exception' })
  assert.ok(outboxTypes(db, bad.id).includes('payment.destination_review'))
  assert.ok(!outboxTypes(db, bad.id).includes('payment.paid'))

  const good = await paidOrder(env, catalog(), 'order-key-late-good')
  await sendWebhook(env, intentSucceeded(good))
  assert.equal(orderRow(db, good.id).fulfillment_status, 'awaiting_payment')
  await sendWebhook(env, sessionEvent(good, { address: { country: 'ES', postalCode: '28001' } }))
  assert.deepEqual(orderRow(db, good.id), { payment_status: 'paid', fulfillment_status: 'ready' })
  assert.deepEqual(outboxTypes(db, good.id), ['payment.awaiting_address', 'payment.paid'])

  // Async payment: address arrives with an unpaid completion, payment later without address.
  const asyncBad = await paidOrder(env, catalog(), 'order-key-async-bad')
  await sendWebhook(env, sessionEvent(asyncBad, { paymentStatus: 'unpaid', address: { country: 'ES', postalCode: '52001' } }))
  assert.deepEqual(orderRow(db, asyncBad.id), { payment_status: 'pending', fulfillment_status: 'awaiting_payment' })
  await sendWebhook(env, intentSucceeded(asyncBad))
  assert.deepEqual(orderRow(db, asyncBad.id), { payment_status: 'paid', fulfillment_status: 'inventory_exception' })
  assert.ok(!outboxTypes(db, asyncBad.id).includes('payment.paid'))

  const asyncGood = await paidOrder(env, catalog(), 'order-key-async-good')
  await sendWebhook(env, sessionEvent(asyncGood, { paymentStatus: 'unpaid', address: { country: 'ES', postalCode: '07001' } }))
  await sendWebhook(env, intentSucceeded(asyncGood))
  assert.deepEqual(orderRow(db, asyncGood.id), { payment_status: 'paid', fulfillment_status: 'ready' })
  assert.deepEqual(outboxTypes(db, asyncGood.id), ['payment.paid'])
})

test('request identity does not contain the postal code', async () => {
  const db = database()
  const env = environment(db)
  await paidOrder(env, catalog(), 'privacy-key-0001')
  const record = db.sqlite.prepare('SELECT request_hash, snapshot_json FROM commerce_idempotency').get()
  const { createHash } = await import('node:crypto')
  const quoteBody = { policy_version: 'fixture-2026-11', total_minor: 2255 }
  const withPostal = createHash('sha256').update(JSON.stringify({ items, destination: MADRID, quote: quoteBody })).digest('hex')
  const expected = createHash('sha256').update(JSON.stringify({ items, country: 'ES', quote: quoteBody })).digest('hex')
  assert.equal(record.request_hash, expected)
  assert.notEqual(record.request_hash, withPostal)
  assert.doesNotMatch(record.snapshot_json, /28001/)
})

test('14.4: purchase language and invoice request reach the snapshot; company and delivery fields reach D1', async () => {
  const db = database()
  const env = environment(db)
  const cat = { ...catalog(), invoice: { seller: { name: 'Titular' } }, products: catalog().products.map(product => ({ ...product, names: { es: product.names.es, en: `${product.names.es} (en)` } })) }
  const quoted = await quote(env, cat, { items, destination: MADRID })
  const body = { items, destination: MADRID, quote: { policy_version: quoted.body.quote.policy_version, total_minor: quoted.body.quote.total_minor } }
  assert.equal((await checkout(env, cat, 'v144-key-bad', { ...body, invoice_requested: 'yes' })).body.error, 'invalid_cart')
  const created = await checkout(env, cat, 'v144-key-0001', { ...body, locale: 'en', invoice_requested: true })
  assert.equal(created.status, 201)
  const order = db.sqlite.prepare('SELECT * FROM orders WHERE id = ?').get(created.body.order_id)
  const snapshot = JSON.parse(order.snapshot_json)
  assert.equal(snapshot.locale, 'en')
  assert.equal(snapshot.invoiceRequested, true)
  assert.equal(snapshot.items[0].name, 'Modelo A (en)')
  // Same key, different choices: a different request.
  assert.equal((await checkout(env, cat, 'v144-key-0001', body)).status, 409)

  const event = sessionEvent(order, { address: { country: 'ES', postalCode: '28001' } })
  event.data.object.customer_details = { ...event.data.object.customer_details, business_name: 'Empresa Ficticia SL', tax_ids: [{ type: 'es_cif', value: 'B00000000' }] }
  event.data.object.custom_fields = [
    { key: 'recipientphone', type: 'text', text: { value: '+34 600 000 000' } },
    { key: 'deliverynotes', type: 'text', text: { value: 'Portal verde,\nllamar al timbre 2' } },
    { key: 'other', type: 'text', text: { value: 'ignored' } }
  ]
  assert.equal((await sendWebhook(env, event)).status, 200)
  const details = db.sqlite.prepare('SELECT buyer_business_name, buyer_tax_id, buyer_tax_id_type, recipient_phone, delivery_notes FROM order_delivery_details WHERE order_id = ?').get(order.id)
  assert.deepEqual({ ...details }, { buyer_business_name: 'Empresa Ficticia SL', buyer_tax_id: 'B00000000', buyer_tax_id_type: 'es_cif', recipient_phone: '+34 600 000 000', delivery_notes: 'Portal verde, llamar al timbre 2' })
})
