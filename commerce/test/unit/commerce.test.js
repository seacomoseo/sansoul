import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertCatalog, buildOrderSnapshot, normalizeCart, priceToMinor, sha256Hex } from '../../catalog.js'
import { isCheckoutAuthorized, SYNTHETIC_TEST_FIXTURE } from '../../approval.js'
import { buildCatalog } from '../../scripts/build-catalog.js'
import { handleAdmin } from '../../admin.js'
import { handleCheckout } from '../../checkout.js'
import { paymentStatements } from '../../orders.js'
import { createPaymentProvider, getWebhookSecret } from '../../provider.js'
import { createBuyerStatusCapability, handleOrderStatus } from '../../status.js'
import { handleWebhook } from '../../webhook.js'
import { makeStripeSignature, verifyStripeSignature } from '../../signature.js'
import { STRIPE_SESSION_MAX_TTL_SECONDS, STRIPE_SESSION_MIN_TTL_SECONDS } from '../../expiry.js'

const firstId = '11111111-1111-4111-8111-111111111111'
const secondId = '22222222-2222-4222-8222-222222222222'
const orderId = '33333333-3333-4333-8333-333333333333'
const stripeOrderId = '66666666-6666-4666-8666-666666666666'
const stripeSessionId = 'cs_test_expected123'
const webhookEventId = 'evt_fixture123'
const stripeEnv = {
  COMMERCE_ENV: 'test',
  COMMERCE_PROVIDER: 'stripe',
  COMMERCE_TEST_FIXTURE: 'stripe-http-mock',
  STRIPE_SECRET_KEY: 'sk_test_unit_fixture',
  STRIPE_WEBHOOK_SECRET: 'whsec_unit_fixture'
}
const catalog = {
  schemaVersion: 2,
  enabled: true,
  checkout: { approved: false, legalVersion: null, destinationCountries: [], taxPolicy: null, shippingPolicy: null },
  release: 'a'.repeat(64),
  origin: 'https://shop.example',
  currency: 'eur',
  minorUnit: 2,
  stockMode: 'made_to_order',
  products: [
    { id: firstId, sku: 'SKU-001', active: true, quote: false, priceMinor: 1050, names: { es: 'Modelo A' } },
    { id: secondId, sku: 'SKU-002', active: true, quote: false, priceMinor: 250, names: { es: 'Modelo B' } },
    { id: '44444444-4444-4444-8444-444444444444', sku: 'SKU-003', active: true, quote: true, priceMinor: null, names: { es: 'Presupuesto' } },
    { id: '55555555-5555-4555-8555-555555555555', sku: 'SKU-004', active: false, quote: false, priceMinor: 500, names: { es: 'Retirado' } }
  ]
}

test('converts decimal content prices to exact minor units', () => {
  assert.equal(priceToMinor('40', 2), 4000)
  assert.equal(priceToMinor('10.5', 2), 1050)
  assert.equal(priceToMinor('1.234', 3), 1234)
  assert.equal(priceToMinor('125', 0), 125)
  assert.throws(() => priceToMinor('1.001', 2), /invalid_price_precision/)
  assert.throws(() => priceToMinor('-1', 2), /invalid_price/)
})

test('accepts only product IDs and bounded quantities from the browser', () => {
  assert.deepEqual(normalizeCart({ items: [{ id: secondId, quantity: 1 }, { id: firstId, quantity: 2 }] }), [
    { id: firstId, quantity: 2 },
    { id: secondId, quantity: 1 }
  ])
  assert.throws(() => normalizeCart({ items: [{ id: firstId, quantity: 1, price: 1 }] }), /invalid_cart_item/)
  assert.throws(() => normalizeCart({ items: [{ id: 'product-name', quantity: 1 }] }), /invalid_product_id/)
  assert.throws(() => normalizeCart({ items: [{ id: firstId, quantity: 0 }] }), /invalid_quantity/)
  assert.throws(() => normalizeCart({ items: [{ id: firstId, quantity: 11 }] }), /invalid_quantity/)
  assert.throws(() => normalizeCart({ items: [{ id: firstId, quantity: 1 }, { id: firstId, quantity: 1 }] }), /invalid_product_id/)
})

test('snapshots current catalog prices and refuses retired or quote-only products', () => {
  const cart = normalizeCart({ items: [{ id: firstId, quantity: 2 }, { id: secondId, quantity: 1 }] })
  const snapshot = buildOrderSnapshot(catalog, cart, orderId)
  assert.equal(snapshot.subtotalMinor, 2350)
  assert.equal(snapshot.items[0].lineTotalMinor, 2100)
  assert.equal(snapshot.items[0].sku, 'SKU-001')
  assert.equal(snapshot.catalogRelease, catalog.release)
  assert.throws(() => buildOrderSnapshot(catalog, normalizeCart({ items: [{ id: '55555555-5555-4555-8555-555555555555', quantity: 1 }] }), orderId), /product_unavailable/)
  assert.throws(() => buildOrderSnapshot(catalog, normalizeCart({ items: [{ id: '44444444-4444-4444-8444-444444444444', quantity: 1 }] }), orderId), /quote_only/)
})

test('rejects duplicate stable IDs and SKUs in the build-time catalog', () => {
  assert.throws(() => assertCatalog({ ...catalog, products: [...catalog.products, { ...catalog.products[0], id: '66666666-6666-4666-8666-666666666666' }] }), /duplicate_catalog_identity/)
})

test('webhook event claim guards every payment, reservation and outbox statement', () => {
  const db = {
    prepare (sql) {
      return {
        sql,
        args: [],
        bind (...args) {
          this.args = args
          return this
        }
      }
    }
  }
  const order = { id: orderId, snapshot_json: JSON.stringify({ stockMode: 'finite' }) }
  const targets = [
    { state: 'paid', paymentIntentId: 'pi_fixture123' },
    { state: 'failed', paymentIntentId: 'pi_fixture123' },
    { state: 'expired', paymentIntentId: null },
    { state: 'refund', refundAmount: 500, paymentIntentId: 'pi_fixture123' }
  ]

  for (const target of targets) {
    const statements = paymentStatements(db, order, target, 100, webhookEventId)
    assert.ok(statements.length > 1)
    for (const statement of statements) {
      assert.match(statement.sql, /webhook_events WHERE event_id = \? AND status = 'processed' AND processed_at = -1/)
      assert.equal(statement.args.at(-1), webhookEventId)
    }
  }
})

function buildCatalogFixture (config, product = '---\ntitle: Fixture product\ncommerce_id: 11111111-1111-4111-8111-111111111111\nsku: TEST-001\ncommerce_active: true\nprice: 10.00\n---\n') {
  const root = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'commerce-catalog-'))
  try {
    mkdirSync(join(root, 'functions/api/commerce'), { recursive: true })
    mkdirSync(join(root, 'core'), { recursive: true })
    mkdirSync(join(root, 'content/product'), { recursive: true })
    writeFileSync(join(root, 'functions/api/commerce/checkout.js'), '')
    writeFileSync(join(root, 'core/package.json'), JSON.stringify({ version: '7.0.0' }))
    if (product !== null) writeFileSync(join(root, 'content/product/test.es.md'), product)
    if (config !== null) {
      mkdirSync(join(root, 'data'), { recursive: true })
      writeFileSync(join(root, 'data/commerce.yml'), config)
    }
    const catalog = buildCatalog(root)
    const routes = JSON.parse(readFileSync(join(root, 'public/_routes.json'), 'utf8'))
    const manifest = readFileSync(join(root, 'functions/_commerce/catalog.generated.js'), 'utf8')
    return { catalog, routes, manifest }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('catalog, Functions routing and checkout approval are independent and fail closed', () => {
  const noCommerceProduct = '---\ntitle: Ordinary product\nprice: 10.00\n---\n'
  const missing = buildCatalogFixture(null, noCommerceProduct)
  const disabled = buildCatalogFixture('enabled: false\n', noCommerceProduct)
  for (const fixture of [missing, disabled]) {
    assert.equal(fixture.catalog.enabled, false)
    assert.equal(fixture.catalog.functionsEnabled, false)
    assert.deepEqual(fixture.routes, { version: 1, include: ['/'], exclude: ['/'] })
    assert.doesNotMatch(fixture.manifest, /STRIPE|COMMERCE_ADMIN|@/i)
  }
  assert.equal(missing.catalog.enabled, false)
  assert.deepEqual(missing.catalog.checkout, { approved: false, legalVersion: null, destinationCountries: [], taxPolicy: null, shippingPolicy: null })

  const falseApproval = buildCatalogFixture('enabled: true\norigin: "https://shop.example"\ncurrency: eur\nstock_mode: made_to_order\ncheckout_approved: false\n')
  assert.equal(falseApproval.catalog.enabled, true)
  assert.equal(falseApproval.catalog.functionsEnabled, true)
  assert.equal(falseApproval.catalog.checkout.approved, false)
  assert.deepEqual(falseApproval.routes, { version: 1, include: ['/api/commerce/*'], exclude: [] })

  const pausedWithOrders = buildCatalogFixture('enabled: false\nfunctions_enabled: true\n')
  assert.equal(pausedWithOrders.catalog.enabled, false)
  assert.equal(pausedWithOrders.catalog.functionsEnabled, true)
  assert.deepEqual(pausedWithOrders.catalog.products, [])
  assert.deepEqual(pausedWithOrders.routes, { version: 1, include: ['/api/commerce/*'], exclude: [] })

  const catalogWithoutFunctions = buildCatalogFixture('enabled: true\nfunctions_enabled: false\norigin: "https://shop.example"\ncurrency: eur\nstock_mode: made_to_order\n')
  assert.equal(catalogWithoutFunctions.catalog.enabled, true)
  assert.equal(catalogWithoutFunctions.catalog.functionsEnabled, false)
  assert.deepEqual(catalogWithoutFunctions.routes, { version: 1, include: ['/'], exclude: ['/'] })

  const backendExample = buildCatalogFixture(readFileSync(new URL('../../../_examples/commerce-backend/data/commerce.yml', import.meta.url), 'utf8'), null)
  assert.equal(backendExample.catalog.enabled, true)
  assert.equal(backendExample.catalog.functionsEnabled, true)
  assert.equal(backendExample.catalog.checkout.approved, false)
  assert.deepEqual(backendExample.catalog.products, [])
  assert.deepEqual(backendExample.routes, { version: 1, include: ['/api/commerce/*'], exclude: [] })

  const approvalBase = 'enabled: true\norigin: "https://shop.example"\ncurrency: eur\nstock_mode: made_to_order\ncheckout_approved: true\ncheckout_legal_version: terms-v1\ncheckout_destination_countries:\n  - ES\ncheckout_tax_policy: calculated\ncheckout_shipping_policy: flat_rate\n'
  assert.throws(() => buildCatalogFixture(approvalBase), /checkout_approval_details_required/)
  const completeApproval = buildCatalogFixture(approvalBase + 'totals_policy:\n  version: fixture-v1\n  destinations:\n    ES:\n      tax: { mode: inclusive, rate_percent: 21 }\n      excluded_postal_prefixes: [\'35\', \'38\', \'51\', \'52\']\n      shipping: { amount: 12.05, tax: { mode: inclusive, rate_percent: 21 } }\n')
  assert.equal(completeApproval.catalog.checkout.approved, true)
  assert.deepEqual(completeApproval.catalog.checkout.destinationCountries, ['ES'])
  assert.deepEqual(completeApproval.catalog.checkout.totalsPolicy.destinations.ES.shipping, { amountMinor: 1205, tax: { mode: 'inclusive', rateBps: 2100 } })
  assert.deepEqual(completeApproval.catalog.checkout.totalsPolicy.destinations.ES.tax, { mode: 'inclusive', rateBps: 2100 })
  // Live needs every gate the TEST purchase passed plus keys of its own mode; any missing piece keeps it closed.
  assert.equal(isCheckoutAuthorized(completeApproval.catalog, { ...stripeEnv, COMMERCE_CHECKOUT_APPROVED: 'true' }), true)
  const liveEnv = { ...stripeEnv, COMMERCE_ENV: 'live', STRIPE_SECRET_KEY: 'rk_live_unit_fixture', COMMERCE_CHECKOUT_APPROVED: 'true' }
  // Shipped goods keep buyer addresses: live also needs the erasure deadline.
  assert.equal(isCheckoutAuthorized(completeApproval.catalog, liveEnv), false)
  const retained = buildCatalogFixture(approvalBase + 'delivery_retention_days: 1095\ntotals_policy:\n  version: fixture-v1\n  destinations:\n    ES:\n      tax: { mode: inclusive, rate_percent: 21 }\n      excluded_postal_prefixes: [\'35\', \'38\', \'51\', \'52\']\n      shipping: { amount: 12.05, tax: { mode: inclusive, rate_percent: 21 } }\n')
  assert.equal(retained.catalog.checkout.deliveryRetentionDays, 1095)
  for (const bad of ['0', '29', '3651', '"3 años"', '365.5']) {
    assert.throws(() => buildCatalogFixture(approvalBase.replace('checkout_approved: true', 'checkout_approved: false') + `delivery_retention_days: ${bad}\n`), /invalid_delivery_retention_days/, bad)
  }
  assert.equal(isCheckoutAuthorized(retained.catalog, liveEnv), true)
  assert.equal(isCheckoutAuthorized(retained.catalog, { ...liveEnv, STRIPE_SECRET_KEY: 'sk_test_unit_fixture' }), false)
  assert.equal(isCheckoutAuthorized(retained.catalog, { ...liveEnv, STRIPE_SECRET_KEY: undefined }), false)
  assert.equal(isCheckoutAuthorized(retained.catalog, { ...liveEnv, STRIPE_WEBHOOK_SECRET: undefined }), false)
  assert.equal(isCheckoutAuthorized(retained.catalog, { ...liveEnv, COMMERCE_CHECKOUT_APPROVED: undefined }), false)
  assert.equal(isCheckoutAuthorized({ ...retained.catalog, checkout: { ...retained.catalog.checkout, approved: false } }, liveEnv), false)
  assert.equal(isCheckoutAuthorized(retained.catalog, { ...stripeEnv, STRIPE_SECRET_KEY: 'sk_live_unit_fixture', COMMERCE_CHECKOUT_APPROVED: 'true' }), false)
  assert.equal(isCheckoutAuthorized(completeApproval.catalog, { ...stripeEnv, COMMERCE_CHECKOUT_APPROVED: 'false' }), false)
  assert.equal(isCheckoutAuthorized({ ...completeApproval.catalog, checkout: { ...completeApproval.catalog.checkout, totalsPolicy: undefined } }, { ...stripeEnv, COMMERCE_CHECKOUT_APPROVED: 'true' }), false)
  assert.equal(isCheckoutAuthorized({ ...completeApproval.catalog, checkout: { ...completeApproval.catalog.checkout, destinationCountries: ['ES', 'FR'] } }, { ...stripeEnv, COMMERCE_CHECKOUT_APPROVED: 'true' }), false)
  assert.throws(() => buildCatalogFixture(approvalBase.replace('  - ES\n', '  - FR\n') + 'totals_policy:\n  version: fixture-v1\n  destinations:\n    ES:\n      tax: { mode: inclusive, rate_percent: 21 }\n      excluded_postal_prefixes: [\'35\', \'38\', \'51\', \'52\']\n      shipping: { amount: 12.05, tax: { mode: inclusive, rate_percent: 21 } }\n'), /destination_countries_must_match_totals_policy/)
  assert.throws(() => buildCatalogFixture(approvalBase + 'totals_policy:\n  version: fixture-v1\n  destinations:\n    ES:\n      tax: { mode: inclusive, rate_percent: 21 }\n      excluded_postal_prefixes: [\'35\', \'38\', \'51\', \'52\']\n      shipping: { amount: 12.05, tax: { mode: inclusive, rate_percent: 21 } }\n'.replace('rate_percent: 21 } }', 'rate_percent: 21 }, max_weight: 2 }')), /invalid_totals_policy/)

  // Display notes: string or per-language map; anything else fails the build.
  const plain = 'enabled: true\norigin: "https://shop.example"\ncurrency: eur\nstock_mode: made_to_order\n'
  assert.equal(buildCatalogFixture(plain + 'notes:\n  product: "IVA incluido."\n  cart:\n    es: "Envío 12,05 €"\n').catalog.enabled, true)
  for (const bad of ['notes: "x"\n', 'notes:\n  footer: "x"\n', 'notes:\n  cart: ""\n', 'notes:\n  cart: 3\n']) {
    assert.throws(() => buildCatalogFixture(plain + bad), /invalid_notes/, bad)
  }

  const multilineProduct = buildCatalogFixture('enabled: true\norigin: "https://shop.example"\ncurrency: eur\nstock_mode: made_to_order\n', '---\ntitle: >-\n  Fixture\n  product\ncommerce_id: 11111111-1111-4111-8111-111111111111\nsku: TEST-001\ncommerce_active: true\ncommerce_quote: false\nprice: 10.00\n---\n')
  assert.equal(multilineProduct.catalog.products[0].names.es, 'Fixture product')
  assert.equal(multilineProduct.catalog.products[0].priceMinor, 1000)
  assert.throws(() => buildCatalogFixture('enabled: true\norigin: "https://shop.example"\ncurrency: eur\nstock_mode: made_to_order\n', '---\ntitle: Fixture\ncommerce_id: 11111111-1111-4111-8111-111111111111\nsku: TEST-001\ncommerce_active: true\nprice: 0.10000000000000001\n---\n'), /invalid_price_precision/)
  assert.throws(() => buildCatalogFixture('enabled: true\norigin: "https://shop.example"\ncurrency: eur\nstock_mode: made_to_order\n', '---\ntitle: Fixture\ncommerce_id: 11111111-1111-4111-8111-111111111111\nsku: test-001\ncommerce_active: true\nprice: 10.00\n---\n'), /commerce_id_and_unique_sku_required/)
  const uppercaseId = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'
  const preservedId = buildCatalogFixture('enabled: true\norigin: "https://shop.example"\ncurrency: eur\nstock_mode: made_to_order\n', `---\ntitle: Fixture\ncommerce_id: ${uppercaseId}\nsku: TEST-001\ncommerce_active: true\nprice: 10.00\n---\n`)
  assert.equal(preservedId.catalog.products[0].id, uppercaseId)

  for (const [config, error] of [
    ['enabled: false\ncheckout_approved: "true"\n', /checkout_approved_must_be_boolean/],
    ['enabled: false\nfunctions_enabled: "true"\n', /functions_enabled_must_be_boolean/],
    ['enabled: false\nenabled: true\n', /invalid_yaml/],
    ['enabled: false\ncheckout_destination_countries:\n  - ES\n  malformed\n', /invalid_yaml/],
    ['enabled: "false"\n', /enabled_must_be_boolean/],
    ['enabled: null\n', /enabled_must_be_boolean/],
    ['enabled: false\ncheckout_destination_countries: not-an-array\n', /invalid_checkout_destination_countries/],
    ['enabled: true\norigin: "https://shop.example"\ncurrency: eur\nstock_mode: made_to_order\ncheckout_approved: true\n', /checkout_approval_details_required/],
    ['enabled: true\norigin: "https://shop.example"\ncurrency: eur\nstock_mode: made_to_order\ncheckout_approved: true\ncheckout_legal_version: terms-v1\ncheckout_destination_countries: ["ES", "ES"]\ncheckout_tax_policy: calculated\ncheckout_shipping_policy: flat_rate\n', /invalid_checkout_destination_countries/]
  ]) assert.throws(() => buildCatalogFixture(config), error)
})

test('browser parameters cannot authorize checkout and disarmed idempotency replays are not returned', async () => {
  let databaseReads = 0
  const key = 'status-idempotency-001'
  const now = Math.floor(Date.now() / 1000)
  const existingRecord = {
    idempotency_key: key,
    request_hash: await sha256Hex(JSON.stringify([{ id: firstId, quantity: 1 }])),
    order_id: orderId,
    snapshot_json: JSON.stringify({ orderId, idempotencyKey: key, catalogRelease: 'a'.repeat(64), createdAt: now, items: [], totalMinor: 1000 }),
    status: 'ready',
    checkout_url: 'https://checkout.stripe.com/c/pay/existing-session',
    expires_at: now + 1800
  }
  const env = {
    ...stripeEnv,
    COMMERCE_CHECKOUT_APPROVED: 'true',
    COMMERCE_DB: {
      prepare (sql) {
        databaseReads++
        return { bind () { return this }, async first () { return sql.includes('commerce_idempotency') ? existingRecord : null } }
      },
      async batch () {}
    }
  }
  const replayRequest = new Request('https://shop.example/api/commerce/checkout?COMMERCE_ENV=live&checkout_approved=true', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://shop.example', 'idempotency-key': key },
    body: JSON.stringify({ items: [{ id: firstId, quantity: 1 }] })
  })
  const replay = await handleCheckout(replayRequest, env, catalog)
  assert.equal(replay.status, 503)
  assert.deepEqual(await replay.json(), { error: 'checkout_not_approved' })
  assert.equal(databaseReads, 0)

  const browserRequest = new Request('https://shop.example/api/commerce/checkout?checkout_approved=true&COMMERCE_ENV=live', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://shop.example', 'idempotency-key': key },
    body: JSON.stringify({ items: [{ id: firstId, quantity: 1 }], checkout_approved: true, COMMERCE_ENV: 'live' })
  })
  const browserAttempt = await handleCheckout(browserRequest, env, catalog)
  assert.equal(browserAttempt.status, 503)
  assert.deepEqual(await browserAttempt.json(), { error: 'checkout_not_approved' })
  assert.equal(databaseReads, 0)
  assert.equal(isCheckoutAuthorized({ ...catalog, checkout: { ...catalog.checkout, approved: 'true' } }, env), false)
  assert.equal(isCheckoutAuthorized({ ...catalog, checkout: { approved: true } }, env), false)
  assert.equal(isCheckoutAuthorized({ ...catalog, checkout: { ...catalog.checkout, approved: true } }, { ...env, COMMERCE_CHECKOUT_APPROVED: 'TRUE' }), false)
})

test('fake checkout is rejected live and only a labeled test fixture can create synthetic sessions', async () => {
  const liveFakeEnv = { COMMERCE_ENV: 'live', COMMERCE_PROVIDER: 'fake', COMMERCE_TEST_FIXTURE: SYNTHETIC_TEST_FIXTURE, FAKE_WEBHOOK_SECRET: 'whsec_fixture' }
  assert.throws(() => createPaymentProvider(liveFakeEnv), /payment_provider_invalid/)
  assert.throws(() => getWebhookSecret(liveFakeEnv), /payment_provider_invalid/)

  const fakeEnv = { COMMERCE_ENV: 'test', COMMERCE_PROVIDER: 'fake', COMMERCE_TEST_FIXTURE: SYNTHETIC_TEST_FIXTURE, COMMERCE_TEST_ORIGIN: 'https://shop.example', FAKE_WEBHOOK_SECRET: 'whsec_fixture' }
  assert.equal(isCheckoutAuthorized(catalog, fakeEnv), true)
  const provider = createPaymentProvider(fakeEnv)
  const session = await provider.createCheckoutSession({ snapshot: checkoutSnapshot(), providerIdempotencyKey: 'fixture-idempotency-key', catalog: { origin: 'https://shop.example' } })
  assert.equal(provider.name, 'fake-test-only')
  assert.match(session.url, /^https:\/\/shop\.example\/__test\/checkout\//)
  assert.ok(session.expiresAt >= session.createdAt + STRIPE_SESSION_MIN_TTL_SECONDS)
  assert.throws(() => createPaymentProvider({ ...fakeEnv, COMMERCE_TEST_FIXTURE: undefined }), /payment_provider_invalid/)
})

test('verifies the untouched webhook payload, timestamp tolerance and HMAC', async () => {
  const raw = '{"id":"evt_test","data":{"object":{}}}'
  const secret = 'whsec_test_only'
  const now = Date.now()
  const signature = await makeStripeSignature(raw, secret, Math.floor(now / 1000))
  assert.equal(await verifyStripeSignature(raw, signature, secret, now), true)
  assert.equal(await verifyStripeSignature(`${raw} `, signature, secret, now), false)
  assert.equal(await verifyStripeSignature(raw, signature, 'wrong_secret', now), false)
  assert.equal(await verifyStripeSignature(raw, await makeStripeSignature(raw, secret, 1), secret, now), false)
  assert.equal(await verifyStripeSignature(raw, 't=no,v1=bad', secret, now), false)
})

function stripePayload (overrides = {}) {
  const created = overrides.created ?? Math.floor(Date.now() / 1000)
  return {
    id: stripeSessionId,
    object: 'checkout.session',
    created,
    expires_at: overrides.expires_at ?? created + STRIPE_SESSION_MAX_TTL_SECONDS,
    url: null,
    status: 'complete',
    payment_status: 'paid',
    amount_total: 1000,
    currency: 'eur',
    livemode: false,
    payment_intent: 'pi_expected123',
    client_reference_id: stripeOrderId,
    metadata: { commerce_order_id: stripeOrderId },
    ...overrides
  }
}

async function withStripeResponse (payload, run, inspect) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (_url, options) => {
    inspect?.(options)
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    return await run()
  } finally {
    globalThis.fetch = originalFetch
  }
}

function checkoutSnapshot (totals = {}) {
  return {
    orderId: stripeOrderId,
    createdAt: Math.floor(Date.now() / 1000) - 3600,
    currency: 'eur',
    totalMinor: 1000,
    items: [],
    totals: { totalMinor: 1000, currency: 'eur', destination: { country: 'ES', excludedPostalPrefixes: [] }, addedTaxMinor: 0, shippingBaseMinor: 0, ...totals }
  }
}

async function createStripeSession (payload, inspect) {
  return withStripeResponse(payload, () => createPaymentProvider(stripeEnv).createCheckoutSession({
    snapshot: checkoutSnapshot(),
    providerIdempotencyKey: stripeOrderId,
    catalog: { origin: 'https://shop.example' }
  }), inspect)
}

test('Stripe idempotency contention is a retryable 409, other rejections stay 502', async () => {
  const originalFetch = globalThis.fetch
  try {
    for (const [status, code, http] of [[409, 'checkout_in_progress', 409], [400, 'payment_provider_rejected', 502]]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ error: { type: 'idempotency_error' } }), { status })
      await assert.rejects(createPaymentProvider(stripeEnv).createCheckoutSession({ snapshot: checkoutSnapshot(), providerIdempotencyKey: stripeOrderId, catalog: { origin: 'https://shop.example' } }),
        error => error.code === code && error.status === http)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})

for (const [status, paymentStatus] of [['complete', 'paid'], ['expired', 'unpaid']]) {
  test(`Stripe retrieval accepts ${status} sessions with nullable URL`, async () => {
    await withStripeResponse(stripePayload({ status, payment_status: paymentStatus, url: null }), async () => {
      const session = await createPaymentProvider(stripeEnv).retrieveCheckoutSession(stripeSessionId)
      assert.equal(session.id, stripeSessionId)
      assert.equal(session.url, null)
      assert.equal(session.currency, 'eur')
      assert.equal(session.livemode, false)
    })
  })
}

test('Stripe retrieval rejects a response for a different session ID', async () => {
  await withStripeResponse(stripePayload({ id: 'cs_test_other123' }), async () => {
    await assert.rejects(() => createPaymentProvider(stripeEnv).retrieveCheckoutSession(stripeSessionId), /payment_provider_invalid_response/)
  })
})

test('Stripe checkout creation requires a safe Stripe URL and matching order identity, amount, currency and mode', async () => {
  const created = stripePayload({
    status: 'open',
    payment_status: 'unpaid',
    url: 'https://checkout.stripe.com/c/pay/cs_test_expected123',
    payment_intent: null
  })
  const session = await createStripeSession(created)
  assert.equal(session.url, created.url)

  let requestOptions
  await createStripeSession(created, options => { requestOptions = options })
  const successUrl = new URLSearchParams(requestOptions.body).get('success_url')
  assert.equal(successUrl, `https://shop.example/?commerce=success&order_id=${stripeOrderId}`)
  assert.equal(new URL(successUrl).searchParams.has('session_id'), false)

  for (const [name, override] of [
    ['amount', { amount_total: 999 }],
    ['currency', { currency: 'usd' }],
    ['livemode', { livemode: true }],
    ['ID mode', { id: 'cs_live_other123' }],
    ['client reference ID', { client_reference_id: '77777777-7777-4777-8777-777777777777' }],
    ['metadata order ID', { metadata: { commerce_order_id: '77777777-7777-4777-8777-777777777777' } }],
    ['checkout URL', { url: 'https://checkout.stripe.com.evil.example/session' }],
    ['non-HTTPS checkout URL', { url: 'http://checkout.stripe.com/session' }]
  ]) {
    await assert.rejects(() => createStripeSession({ ...created, ...override }), /payment_provider_invalid_response/, name)
  }
})

test('Stripe Checkout collects delivery only for the quoted country and itemizes tax and shipping', async () => {
  const payload = stripePayload({
    status: 'open',
    payment_status: 'unpaid',
    url: 'https://checkout.stripe.com/c/pay/cs_test_expected123',
    payment_intent: null
  })
  let form
  await withStripeResponse(payload, () => createPaymentProvider(stripeEnv).createCheckoutSession({
    snapshot: checkoutSnapshot(),
    providerIdempotencyKey: stripeOrderId,
    catalog: { origin: 'https://shop.example', checkout: { shippingPolicy: 'calculated', destinationCountries: ['ES', 'FR'] } }
  }), options => { form = new URLSearchParams(options.body) })
  assert.equal(form.get('shipping_address_collection[allowed_countries][0]'), 'ES')
  assert.equal(form.has('shipping_address_collection[allowed_countries][1]'), false)
  assert.equal(form.has('shipping_options[0][shipping_rate_data][type]'), false)
  assert.equal(form.has('line_items[0][price_data][unit_amount]'), false)

  const itemized = checkoutSnapshot({ totalMinor: 1000, addedTaxMinor: 105, shippingBaseMinor: 395 })
  itemized.items = [{ productId: firstId, sku: 'SKU-001', name: 'Modelo A', quantity: 1, unitAmountMinor: 500, lineTotalMinor: 500 }]
  await withStripeResponse(payload, () => createPaymentProvider(stripeEnv).createCheckoutSession({
    snapshot: itemized,
    providerIdempotencyKey: stripeOrderId,
    catalog: { origin: 'https://shop.example' }
  }), options => {
    const body = new URLSearchParams(options.body)
    assert.equal(body.get('line_items[0][price_data][unit_amount]'), '500')
    assert.equal(body.get('line_items[1][price_data][unit_amount]'), '105')
    assert.equal(body.get('line_items[1][price_data][product_data][name]'), 'IVA')
    assert.equal(body.get('shipping_options[0][shipping_rate_data][type]'), 'fixed_amount')
    assert.equal(body.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '395')
    assert.equal(body.get('shipping_options[0][shipping_rate_data][fixed_amount][currency]'), 'eur')
    assert.equal(body.has('locale'), false)
  })

  // The purchase language drives Stripe's page and the engine's own line labels.
  await withStripeResponse(payload, () => createPaymentProvider(stripeEnv).createCheckoutSession({
    snapshot: { ...itemized, locale: 'de' },
    providerIdempotencyKey: stripeOrderId,
    catalog: { origin: 'https://shop.example' }
  }), options => {
    const body = new URLSearchParams(options.body)
    assert.equal(body.get('locale'), 'de')
    assert.equal(body.get('line_items[1][price_data][product_data][name]'), 'MwSt.')
    assert.equal(body.get('shipping_options[0][shipping_rate_data][display_name]'), 'Versand')
  })

  for (const broken of [{ ...checkoutSnapshot(), totals: undefined }, checkoutSnapshot({ totalMinor: 999 }), checkoutSnapshot({ destination: { country: 'es' } })]) {
    await assert.rejects(() => createPaymentProvider(stripeEnv).createCheckoutSession({ snapshot: broken, providerIdempotencyKey: stripeOrderId, catalog: { origin: 'https://shop.example' } }), /order_totals_unavailable/)
  }
})

test('Stripe default expiry is valid from real creation and retries keep the exact request after delay', async () => {
  const originalNow = Date.now
  let requestTime = 1_800_000_000
  Date.now = () => requestTime * 1000
  const payload = stripePayload({
    created: requestTime,
    expires_at: requestTime + STRIPE_SESSION_MAX_TTL_SECONDS,
    status: 'open',
    payment_status: 'unpaid',
    url: 'https://checkout.stripe.com/c/pay/cs_test_expected123',
    payment_intent: null
  })
  const requests = []
  try {
    const sessions = await withStripeResponse(payload, async () => {
      const provider = createPaymentProvider(stripeEnv)
      const args = {
        snapshot: checkoutSnapshot(),
        providerIdempotencyKey: stripeOrderId,
        catalog: { origin: 'https://shop.example' }
      }
      const first = await provider.createCheckoutSession(args)
      requestTime += 35 * 60
      const retry = await provider.createCheckoutSession(args)
      return [first, retry]
    }, options => {
      const params = new URLSearchParams(options.body)
      assert.equal(params.has('expires_at'), false)
      assert.equal(payload.expires_at - payload.created, STRIPE_SESSION_MAX_TTL_SECONDS)
      assert.ok(payload.expires_at - requestTime >= STRIPE_SESSION_MIN_TTL_SECONDS)
      requests.push({ body: options.body.toString(), key: options.headers['idempotency-key'], requestTime })
    })
    assert.equal(requests.length, 2)
    assert.ok(requests[1].requestTime - requests[0].requestTime >= STRIPE_SESSION_MIN_TTL_SECONDS)
    assert.equal(requests[0].body, requests[1].body)
    assert.equal(requests[0].key, `commerce_${stripeOrderId}`)
    assert.equal(requests[1].key, requests[0].key)
    assert.equal(sessions[0].expiresAt, payload.expires_at)
    assert.equal(sessions[1].expiresAt, payload.expires_at)
  } finally {
    Date.now = originalNow
  }
})

test('Stripe rejects session expirations outside the documented 30-minute to 24-hour window', async () => {
  const created = stripePayload({
    status: 'open',
    payment_status: 'unpaid',
    url: 'https://checkout.stripe.com/c/pay/cs_test_expected123',
    payment_intent: null
  })
  await assert.rejects(() => createStripeSession({ ...created, expires_at: created.created + STRIPE_SESSION_MIN_TTL_SECONDS - 1 }), /payment_provider_invalid_response/)
  await assert.rejects(() => createStripeSession({ ...created, expires_at: created.created + STRIPE_SESSION_MAX_TTL_SECONDS + 1 }), /payment_provider_invalid_response/)
})

test('Stripe idempotent replay can recover an already-expired session without extending it', async () => {
  const expired = stripePayload({ status: 'expired', payment_status: 'unpaid', url: null })
  const session = await createStripeSession(expired)
  assert.equal(session.sessionStatus, 'expired')
  assert.equal(session.url, null)
  assert.equal(session.expiresAt, expired.expires_at)
})

function reconciliationEnvironment () {
  // Execute actual SQL, including index hints, keyset wrap and revision CAS.
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const name of ['0001_commerce.sql', '0002_buyer_status.sql', '0003_provider_session_expiry.sql', '0004_operations_and_delivery.sql', '0005_outbox_indexes.sql', '0006_bounded_maintenance.sql']) {
    sqlite.exec(readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'))
  }
  const snapshot = JSON.stringify({ stockMode: 'made_to_order' })
  sqlite.prepare(`INSERT INTO commerce_idempotency
    (idempotency_key, request_hash, order_id, snapshot_json, status, created_at, updated_at, expires_at)
    VALUES (?, 'fixture-hash', ?, ?, 'creating', 1, 1, 2000000000)`)
    .run(stripeOrderId, stripeOrderId, snapshot)
  sqlite.prepare(`INSERT INTO orders
    (id, idempotency_key, session_id, payment_intent_id, catalog_release, currency, amount_total_minor,
      snapshot_json, payment_status, fulfillment_status, created_at, updated_at, expires_at)
    VALUES (?, ?, ?, 'pi_expected123', 'fixture-release', 'eur', 1000, ?, 'pending', 'awaiting_payment', 1, 1, 2000000000)`)
    .run(stripeOrderId, stripeOrderId, stripeSessionId, snapshot)
  let batches = 0
  const db = {
    prepare (sql) {
      const statement = sqlite.prepare(sql)
      let values = []
      return {
        sql,
        bind (...args) { values = args; return this },
        async all () { return { results: statement.all(...values) } },
        async first () { return statement.get(...values) || null },
        async run () { return { meta: statement.run(...values) } }
      }
    },
    async batch (statements) {
      sqlite.exec('BEGIN')
      try {
        const results = []
        for (const statement of statements) results.push(await statement.run())
        sqlite.exec('COMMIT')
        if (statements.some(statement => statement.sql.includes('payment_intent_id = COALESCE'))) batches++
        return results
      } catch (error) { sqlite.exec('ROLLBACK'); throw error }
    }
  }
  return {
    sqlite,
    get batches () { return batches },
    env: { ...stripeEnv, COMMERCE_ADMIN_TOKEN: 'unit-test-admin-token-0123456789ABCDEF', COMMERCE_DB: db }
  }
}

async function reconcileStripeSession (payload) {
  const fixture = reconciliationEnvironment()
  try {
    const response = await withStripeResponse(payload, () => handleAdmin(new Request('https://shop.example/api/commerce/admin/reconcile', {
      method: 'POST',
      headers: { authorization: `Bearer ${fixture.env.COMMERCE_ADMIN_TOKEN}` }
    }), fixture.env, {}))
    const order = fixture.sqlite.prepare('SELECT payment_status FROM orders WHERE id = ?').get(stripeOrderId)
    return { response, batches: fixture.batches, paymentStatus: order.payment_status }
  } finally { fixture.sqlite.close() }
}

for (const [status, paymentStatus] of [['complete', 'paid'], ['expired', 'unpaid']]) {
  test(`reconciliation accepts ${status} sessions with URL null and persists matching state`, async () => {
    const result = await reconcileStripeSession(stripePayload({ status, payment_status: paymentStatus, url: null }))
    assert.equal(result.response.status, 200)
    assert.equal(result.batches, 1)
    assert.equal(result.paymentStatus, status === 'complete' ? 'paid' : 'expired')
  })
}

test('reconciliation rejects missing or mismatched Stripe order, amount, currency, mode and intent identity', async () => {
  for (const [name, override] of [
    ['ID', { id: 'cs_test_other123' }],
    ['amount', { amount_total: 999 }],
    ['currency', { currency: 'usd' }],
    ['livemode', { livemode: true }],
    ['ID mode', { id: 'cs_live_other123' }],
    ['client reference ID', { client_reference_id: '77777777-7777-4777-8777-777777777777' }],
    ['metadata order ID', { metadata: { commerce_order_id: '77777777-7777-4777-8777-777777777777' } }],
    ['missing metadata', { metadata: {} }],
    ['payment intent ID', { payment_intent: 'pi_other123' }]
  ]) {
    const result = await reconcileStripeSession(stripePayload(override))
    assert.ok(result.response.status >= 500, `${name} mismatch should fail reconciliation`)
    assert.equal(result.batches, 0, `${name} mismatch must not persist state`)
    assert.equal(result.paymentStatus, 'pending', `${name} mismatch must leave payment unchanged`)
  }
})

const statusOrderId = '77777777-7777-4777-8777-777777777777'
const statusSessionId = 'cs_test_status123'

function statusEnvironment (orderId, capabilityHash, initialStatus = 'pending') {
  const order = {
    id: orderId,
    session_id: statusSessionId,
    payment_intent_id: null,
    amount_total_minor: 1000,
    currency: 'eur',
    payment_status: initialStatus,
    fulfillment_status: 'awaiting_payment',
    snapshot_json: JSON.stringify({ stockMode: 'made_to_order' })
  }
  let paymentStatus = initialStatus
  const db = {
    prepare (sql) {
      let values = []
      return {
        bind (...args) { values = args; return this },
        async first () {
          if (sql.includes('FROM order_status_capabilities')) {
            return values[0] === orderId && values[1] === capabilityHash
              ? { id: orderId, payment_status: paymentStatus }
              : null
          }
          if (sql.includes('SELECT status FROM webhook_events')) return null
          if (sql.includes('SELECT * FROM orders WHERE id = ?') && values[0] === orderId) return { ...order, payment_status: paymentStatus }
          return null
        },
        async run () { return { meta: { changes: 1 } } }
      }
    },
    async batch () { paymentStatus = 'paid' }
  }
  return {
    env: { ...stripeEnv, COMMERCE_PROVIDER: 'fake', COMMERCE_TEST_FIXTURE: SYNTHETIC_TEST_FIXTURE, FAKE_WEBHOOK_SECRET: 'whsec_status_unit', COMMERCE_DB: db },
    get paymentStatus () { return paymentStatus }
  }
}

function statusRequest (orderId, cookie) {
  return new Request(`https://shop.example/api/commerce/status/${orderId}`, {
    headers: cookie ? { cookie } : {}
  })
}

test('buyer status capability is an opaque 256-bit random token', async () => {
  const capability = await createBuyerStatusCapability()
  const another = await createBuyerStatusCapability()
  assert.match(capability.token, /^[a-f0-9]{64}$/)
  assert.equal(capability.hash, await sha256Hex(capability.token))
  assert.notEqual(capability.token, another.token)
})

test('buyer status requires matching capability and returns no order internals', async () => {
  const capability = await createBuyerStatusCapability()
  const fixture = statusEnvironment(statusOrderId, capability.hash, 'paid')
  const cookieName = `__Secure-commerce-status-${statusOrderId}`
  const validCookie = `${cookieName}=${capability.token}`

  assert.equal((await handleOrderStatus(statusRequest(statusOrderId), fixture.env)).status, 404)
  const altered = `${capability.token[0] === '0' ? '1' : '0'}${capability.token.slice(1)}`
  assert.equal((await handleOrderStatus(statusRequest(statusOrderId, `${cookieName}=${altered}`), fixture.env)).status, 404)
  const rebound = `__Secure-commerce-status-${secondId}=${capability.token}`
  assert.equal((await handleOrderStatus(statusRequest(secondId, rebound), fixture.env)).status, 404)

  const response = await handleOrderStatus(statusRequest(statusOrderId, validCookie), fixture.env)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { order_id: statusOrderId, payment_status: 'paid' })
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
})

test('existing buyer status and webhooks remain available when checkout creation is disabled', async () => {
  const capability = await createBuyerStatusCapability()
  const fixture = statusEnvironment(statusOrderId, capability.hash)
  const checkout = await handleCheckout(new Request('https://shop.example/api/commerce/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://shop.example', 'idempotency-key': 'status-idempotency-001' },
    body: JSON.stringify({ items: [{ id: firstId, quantity: 1 }] })
  }), fixture.env, { ...catalog, enabled: false })
  assert.equal(checkout.status, 404)

  const cookie = `__Secure-commerce-status-${statusOrderId}=${capability.token}`
  const pending = await handleOrderStatus(statusRequest(statusOrderId, cookie), fixture.env)
  assert.deepEqual(await pending.json(), { order_id: statusOrderId, payment_status: 'pending' })

  const event = {
    id: 'evt_statuspaid',
    type: 'checkout.session.completed',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: {
      object: {
        object: 'checkout.session',
        id: statusSessionId,
        client_reference_id: statusOrderId,
        metadata: { commerce_order_id: statusOrderId },
        payment_intent: 'pi_status123',
        payment_status: 'paid',
        amount_total: 1000,
        currency: 'eur'
      }
    }
  }
  const raw = JSON.stringify(event)
  const signature = await makeStripeSignature(raw, fixture.env.FAKE_WEBHOOK_SECRET)
  const webhook = await handleWebhook(new Request('https://shop.example/api/commerce/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    body: raw
  }), fixture.env)
  assert.equal(webhook.status, 200)
  assert.equal(fixture.paymentStatus, 'paid')
  const paid = await handleOrderStatus(statusRequest(statusOrderId, cookie), fixture.env)
  assert.deepEqual(await paid.json(), { order_id: statusOrderId, payment_status: 'paid' })
})
