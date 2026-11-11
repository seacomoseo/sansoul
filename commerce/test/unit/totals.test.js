import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateOrderTotals, isEligibleDestination, normalizeDestination, publicQuote } from '../../totals.js'
import { MAX_ORDER_MINOR } from '../../catalog.js'
import { isCheckoutAuthorized } from '../../approval.js'

// All rates, destinations and prices below are synthetic, not merchant policy.
const copy = value => JSON.parse(JSON.stringify(value))
const tax = (mode = 'inclusive', rateBps = 2100) => ({ mode, rateBps })
const MADRID = { country: 'ES', postalCode: '28001' }
const firstId = '11111111-1111-4111-8111-111111111111'

function policy () {
  return {
    schemaVersion: 2,
    version: 'synthetic-v2',
    currency: 'eur',
    minorUnit: 2,
    destinations: {
      ES: { tax: tax(), shipping: { amountMinor: 605, tax: tax() }, excludedPostalPrefixes: ['35', '38', '51', '52'] }
    }
  }
}

function snapshot (amount = 1210, quantity = 1, weightGrams = null) {
  return {
    currency: 'eur',
    minorUnit: 2,
    subtotalMinor: amount * quantity,
    items: [{ productId: firstId, sku: 'TEST-001', quantity, unitAmountMinor: amount, lineTotalMinor: amount * quantity, weightGrams }]
  }
}

function invalid (change, code = 'invalid_totals_policy') {
  const p = policy()
  change(p)
  assert.throws(() => calculateOrderTotals(snapshot(), p, MADRID), error => error.code === code)
}

// What the payment provider is asked to charge: line prices + shipping base + added tax.
function providerCharge (s, result) {
  return s.items.reduce((sum, item) => sum + item.lineTotalMinor, 0) + result.shippingBaseMinor + result.addedTaxMinor
}

test('inclusive tax extracts tax without adding it again; shipping has its own breakdown', () => {
  const result = calculateOrderTotals(snapshot(), policy(), MADRID)
  assert.equal(result.schemaVersion, 2)
  assert.equal(result.policyVersion, 'synthetic-v2')
  assert.deepEqual(result.destination, { country: 'ES', excludedPostalPrefixes: ['35', '38', '51', '52'] })
  assert.equal(result.subtotalMinor, 1210)
  assert.equal(result.merchandiseNetMinor, 1000)
  assert.equal(result.merchandiseTaxMinor, 210)
  assert.equal(result.shippingBaseMinor, 605)
  assert.equal(result.shippingNetMinor, 500)
  assert.equal(result.shippingTaxMinor, 105)
  assert.equal(result.shippingTotalMinor, 605)
  assert.equal(result.taxMinor, 315)
  assert.equal(result.addedTaxMinor, 0)
  assert.equal(result.netMinor, 1500)
  assert.equal(result.totalMinor, 1815)
  assert.equal(result.lines[0].totalMinor, 1210)
  assert.equal(providerCharge(snapshot(), result), result.totalMinor)
})

test('exclusive tax adds only the authored rate, including separately taxed shipping', () => {
  const p = policy()
  p.destinations.ES = { ...p.destinations.ES, tax: tax('exclusive'), shipping: { amountMinor: 500, tax: tax('exclusive') } }
  const s = snapshot(1000, 2)
  const result = calculateOrderTotals(s, p, MADRID)
  assert.equal(result.subtotalMinor, 2000)
  assert.equal(result.merchandiseNetMinor, 2000)
  assert.equal(result.merchandiseTaxMinor, 420)
  assert.equal(result.shippingTotalMinor, 605)
  assert.equal(result.addedTaxMinor, 525)
  assert.equal(result.totalMinor, 3025)
  assert.equal(providerCharge(s, result), result.totalMinor)
})

test('exemption and zero shipping require explicit zero values', () => {
  const p = policy()
  p.destinations.ES = { ...p.destinations.ES, tax: tax('exempt', 0), shipping: { amountMinor: 0, tax: tax('exempt', 0) } }
  const result = calculateOrderTotals(snapshot(), p, MADRID)
  assert.equal(result.totalMinor, 1210)
  assert.equal(result.taxMinor, 0)
  assert.equal(result.shippingTotalMinor, 0)
  invalid(p => { p.destinations.ES.tax = tax('exempt', 1) })
  invalid(p => { delete p.destinations.ES.shipping.amountMinor })
})

test('rounding is half-up once per extended line, not once per unit', () => {
  const p = policy()
  p.destinations.ES = { ...p.destinations.ES, tax: tax('exclusive', 5000), shipping: { amountMinor: 0, tax: tax('exempt', 0) } }
  const result = calculateOrderTotals(snapshot(1, 3), p, MADRID)
  assert.equal(result.merchandiseTaxMinor, 2)
  assert.equal(result.totalMinor, 5)
  p.destinations.ES.tax = tax('inclusive', 10000)
  assert.equal(calculateOrderTotals(snapshot(1), p, MADRID).merchandiseTaxMinor, 1)
})

test('postal zones: excluded prefixes go to quote, malformed codes are rejected, Baleares stays eligible', () => {
  const p = policy()
  for (const postalCode of ['35001', '38400', '51001', '52001']) {
    assert.throws(() => calculateOrderTotals(snapshot(), p, { country: 'ES', postalCode }), error => error.code === 'destination_quote_required' && error.status === 409)
  }
  for (const postalCode of ['07001', '08001', '28001', '50001', ' 28 001 ']) {
    assert.equal(calculateOrderTotals(snapshot(), p, { country: 'ES', postalCode }).totalMinor, 1815)
  }
  for (const postalCode of ['00000', '53001', '99999', '2800', '280011', 'ABCDE', '', null, 28001]) {
    assert.throws(() => calculateOrderTotals(snapshot(), p, { country: 'ES', postalCode }), error => error.code === 'invalid_postal_code')
  }
  const zone = { country: 'ES', excludedPostalPrefixes: p.destinations.ES.excludedPostalPrefixes }
  assert.equal(isEligibleDestination(zone, 'ES', '35001'), false)
  assert.equal(isEligibleDestination(zone, 'ES', '07001'), true)
  assert.equal(isEligibleDestination(zone, 'FR', '07001'), false)
  assert.equal(isEligibleDestination(null, 'ES', '28001'), false)
})

test('destination input is exact, normalized server-side and never trusted for unknown countries', () => {
  assert.deepEqual(normalizeDestination({ country: ' es ', postalCode: '28-001' }), { country: 'ES', postalCode: '28001' })
  for (const value of [null, 'ES', {}, { country: 'ES' }, { country: 'ES', postalCode: '28001', zone: 'peninsula' }, { country: 'ESP', postalCode: '28001' }]) {
    assert.throws(() => normalizeDestination(value), error => error.code === 'invalid_destination')
  }
  assert.throws(() => normalizeDestination({ country: 'US', postalCode: '10001' }), error => error.code === 'destination_not_supported')
  const p = policy()
  assert.throws(() => calculateOrderTotals(snapshot(), p, { country: 'FR', postalCode: '75001' }), error => error.code === 'destination_not_supported')
  assert.throws(() => calculateOrderTotals(snapshot(), p, 'ES'), error => error.code === 'invalid_destination')
})

test('flat shipping limits: unknown weight never counts as light; heavy or many units go to quote', () => {
  const p = policy()
  p.destinations.ES.shipping.maxWeightGrams = 2000
  assert.throws(() => calculateOrderTotals(snapshot(), p, MADRID), error => error.code === 'shipping_quote_required' && error.status === 409)
  assert.equal(calculateOrderTotals(snapshot(1210, 2, 1000), p, MADRID).shippingTotalMinor, 605)
  assert.throws(() => calculateOrderTotals(snapshot(1210, 3, 1000), p, MADRID), error => error.code === 'shipping_quote_required')
  delete p.destinations.ES.shipping.maxWeightGrams
  p.destinations.ES.shipping.maxUnits = 1
  assert.equal(calculateOrderTotals(snapshot(1210, 1), p, MADRID).totalMinor, 1815)
  assert.throws(() => calculateOrderTotals(snapshot(1210, 2), p, MADRID), error => error.code === 'shipping_quote_required')
  invalid(p => { p.destinations.ES.shipping.maxUnits = 0 })
  invalid(p => { p.destinations.ES.shipping.maxWeightGrams = 2.5 })
  const s = snapshot(1210, 1, 0)
  assert.throws(() => calculateOrderTotals(s, policy(), MADRID), error => error.code === 'invalid_totals_snapshot')
})

test('country-specific and per-SKU rules are explicit with no geographic fallback', () => {
  const p = policy()
  p.destinations.PT = { tax: tax('exclusive', 1000), shipping: { amountMinor: 700, tax: tax('exempt', 0) }, excludedPostalPrefixes: ['9'] }
  p.destinations.ES.taxBySku = { 'TEST-001': tax('inclusive', 1000) }
  assert.equal(calculateOrderTotals(snapshot(1100), p, MADRID).merchandiseTaxMinor, 100)
  assert.equal(calculateOrderTotals(snapshot(1000), p, { country: 'PT', postalCode: '1000-001' }).totalMinor, 1800)
  assert.throws(() => calculateOrderTotals(snapshot(1000), p, { country: 'PT', postalCode: '9000-001' }), error => error.code === 'destination_quote_required')
  for (const destination of [{ country: 'FR', postalCode: '75001' }, { country: 'DE', postalCode: '10115' }]) {
    assert.throws(() => calculateOrderTotals(snapshot(), p, destination), error => error.code === 'destination_not_supported')
  }
})

test('mixed lines reconcile exactly and preserve line order and SKU identity', () => {
  const p = policy()
  p.destinations.ES.taxBySku = { 'TEST-002': tax('exclusive', 1000) }
  const s = snapshot()
  s.items.push({ productId: '22222222-2222-4222-8222-222222222222', sku: 'TEST-002', quantity: 2, unitAmountMinor: 1000, lineTotalMinor: 2000, weightGrams: null })
  s.subtotalMinor = 3210
  const result = calculateOrderTotals(s, p, MADRID)
  assert.deepEqual(result.lines.map(line => line.sku), ['TEST-001', 'TEST-002'])
  assert.equal(result.totalMinor, 4015)
  assert.equal(result.addedTaxMinor, 200)
  assert.equal(result.lines.reduce((sum, line) => sum + line.totalMinor, 0) + result.shippingTotalMinor, result.totalMinor)
  assert.equal(result.netMinor + result.taxMinor, result.totalMinor)
  assert.equal(providerCharge(s, result), result.totalMinor)
})

test('policy is required and exact: no unsupported strategies, typos or incomplete rules', () => {
  for (const p of [null, undefined, {}, [], 'included']) {
    assert.throws(() => calculateOrderTotals(snapshot(), p, MADRID), error => error.code === 'invalid_totals_policy')
  }
  invalid(p => { p.schemaVersion = 1 })
  invalid(p => { p.version = '' })
  invalid(p => { p.destinations = {} })
  invalid(p => { p.destinations.es = p.destinations.ES })
  invalid(p => { p.destinations.US = copy(p.destinations.ES) })
  invalid(p => { p.destinations.ES.tax.mode = 'calculated' })
  invalid(p => { p.destinations.ES.tax.rateBps = '2100' })
  invalid(p => { p.destinations.ES.tax.rateBps = -1 })
  invalid(p => { p.destinations.ES.tax.rateBps = 10001 })
  invalid(p => { p.destinations.ES.tax.rateBps = 0.5 })
  invalid(p => { p.destinations.ES.shipping.amountMinor = -1 })
  invalid(p => { p.destinations.ES.shipping.amountMinor = 1.5 })
  invalid(p => { p.destinations.ES.shipping.freeAboveMinor = 500 })
  invalid(p => { delete p.destinations.ES.excludedPostalPrefixes })
  invalid(p => { p.destinations.ES.excludedPostalPrefixes = [35] })
  invalid(p => { p.destinations.ES.excludedPostalPrefixes = ['35', '35'] })
  invalid(p => { p.destinations.ES.excludedPostalPrefixes = ['3a'] })
  invalid(p => { p.destination = 'ES' })
  invalid(p => { p.destinations.ES.taxBySku = { 'bad sku': tax() } })
  invalid(p => { p.destinations.ES.taxBySku = null })
})

test('invalid unselected destination also fails instead of partially accepting policy', () => {
  invalid(p => { p.destinations.FR = { tax: tax(), shipping: {}, excludedPostalPrefixes: [] } })
})

test('currency and minor unit mismatches fail closed', () => {
  invalid(p => { p.currency = 'usd' }, 'totals_currency_mismatch')
  invalid(p => { p.minorUnit = 0 }, 'totals_currency_mismatch')
  invalid(p => { p.currency = 'EUR' })
  invalid(p => { p.minorUnit = 4 })
})

test('snapshot integrity is checked: empty, duplicate, invalid quantity and inconsistent amounts', () => {
  const mutations = [
    s => { s.items = [] },
    s => { s.items.push(copy(s.items[0])); s.subtotalMinor *= 2 },
    s => { s.items[0].quantity = 0 },
    s => { s.items[0].quantity = 11 },
    s => { s.items[0].quantity = 1.5 },
    s => { s.items[0].unitAmountMinor = -1 },
    s => { s.items[0].unitAmountMinor = '1210' },
    s => { s.items[0].lineTotalMinor++ },
    s => { s.subtotalMinor++ },
    s => { s.items[0].productId = 'invalid' },
    s => { s.items[0].sku = 'invalid sku' },
    s => { s.items[0].weightGrams = '500' }
  ]
  for (const change of mutations) {
    const s = snapshot()
    change(s)
    assert.throws(() => calculateOrderTotals(s, policy(), MADRID), error => error.code === 'invalid_totals_snapshot')
  }
})

test('large exact tax arithmetic uses integer rational calculation and bounds the final total', () => {
  const p = policy()
  p.destinations.ES.shipping = { amountMinor: 0, tax: tax('exempt', 0) }
  const result = calculateOrderTotals(snapshot(MAX_ORDER_MINOR), p, MADRID)
  const expectedTax = Number((BigInt(MAX_ORDER_MINOR) * 2100n + 6050n) / 12100n)
  assert.equal(result.merchandiseTaxMinor, expectedTax)
  assert.equal(result.totalMinor, MAX_ORDER_MINOR)
  p.destinations.ES.tax = tax('exclusive')
  assert.throws(() => calculateOrderTotals(snapshot(MAX_ORDER_MINOR), p, MADRID), error => error.code === 'order_total_too_large')
  p.destinations.ES.tax = tax('exempt', 0)
  p.destinations.ES.shipping.amountMinor = 1
  assert.throws(() => calculateOrderTotals(snapshot(MAX_ORDER_MINOR), p, MADRID), error => error.code === 'order_total_too_large')
})

test('zero and three-decimal currencies use the same authored minor-unit contract', () => {
  for (const [currency, minorUnit] of [['jpy', 0], ['kwd', 3]]) {
    const p = policy()
    const s = snapshot()
    p.currency = s.currency = currency
    p.minorUnit = s.minorUnit = minorUnit
    assert.equal(calculateOrderTotals(s, p, MADRID).totalMinor, 1815)
  }
})

test('inputs are immutable and repeated calls are deterministic', () => {
  const p = policy()
  const s = snapshot()
  const before = JSON.stringify({ p, s })
  const a = calculateOrderTotals(s, p, MADRID)
  assert.deepEqual(a, calculateOrderTotals(s, p, MADRID))
  a.lines[0].sku = 'CHANGED'
  a.destination.excludedPostalPrefixes.push('28')
  assert.equal(JSON.stringify({ p, s }), before)
  assert.equal(calculateOrderTotals(s, p, MADRID).lines[0].sku, 'TEST-001')
})

test('public quote exposes amounts and policy version but never the postal code', () => {
  const quote = publicQuote(calculateOrderTotals(snapshot(), policy(), MADRID))
  assert.deepEqual(quote, {
    policy_version: 'synthetic-v2',
    country: 'ES',
    currency: 'eur',
    subtotal_minor: 1210,
    shipping_minor: 605,
    tax_minor: 315,
    added_tax_minor: 0,
    total_minor: 1815
  })
  assert.doesNotMatch(JSON.stringify(quote), /28001/)
})

test('calculator is not a checkout authorization: policy-less catalogs and foreign-mode keys stay closed', () => {
  calculateOrderTotals(snapshot(), policy(), MADRID)
  const checkout = { approved: true, legalVersion: 'fixture-v1', destinationCountries: ['ES'], taxPolicy: 'calculated', shippingPolicy: 'flat_rate' }
  const env = environment => ({ COMMERCE_ENV: environment, COMMERCE_PROVIDER: 'stripe', COMMERCE_CHECKOUT_APPROVED: 'true', STRIPE_SECRET_KEY: `rk_${environment}_fixture`, STRIPE_WEBHOOK_SECRET: 'whsec_fixture' })
  for (const environment of ['test', 'live']) {
    assert.equal(isCheckoutAuthorized({ enabled: true, checkout }, env(environment)), false)
  }
  const withPolicy = { enabled: true, checkout: { ...checkout, totalsPolicy: policy() } }
  assert.equal(isCheckoutAuthorized(withPolicy, env('test')), true)
  assert.equal(isCheckoutAuthorized(withPolicy, env('live')), false)
  const retained = { ...withPolicy, checkout: { ...withPolicy.checkout, deliveryRetentionDays: 1095 } }
  assert.equal(isCheckoutAuthorized(retained, env('live')), true)
  assert.equal(isCheckoutAuthorized(retained, { ...env('live'), STRIPE_SECRET_KEY: 'rk_test_fixture' }), false)
  assert.equal(isCheckoutAuthorized({ ...withPolicy, enabled: false }, env('test')), false)
})
