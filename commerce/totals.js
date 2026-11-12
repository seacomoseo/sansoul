import { MAX_ITEMS, MAX_ORDER_MINOR, MAX_QUANTITY } from './catalog.js'
import { CommerceError } from './http.js'

const COUNTRY = /^[A-Z]{2}$/
const SKU = /^[A-Z0-9][A-Z0-9_-]{2,63}$/
const PRODUCT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const PREFIX = /^[0-9]{1,5}$/
const SCALE = 10000n
const LIMIT = BigInt(MAX_ORDER_MINOR)
const MAX_WEIGHT_GRAMS = 1000000

// Only countries with a known postal-code format can be sold to: the zone of a
// destination is derived from its postal code, never from a browser label.
export const POSTAL_CODE_FORMATS = Object.freeze({
  ES: /^(?:0[1-9]|[1-4][0-9]|5[0-2])[0-9]{3}$/,
  FR: /^[0-9]{5}$/,
  PT: /^[1-9][0-9]{6}$/
})

// SQL predicates over an already-normalized postal code column; keep in sync with
// POSTAL_CODE_FORMATS. Used to evaluate stored delivery addresses atomically.
const POSTAL_CODE_SQL = Object.freeze({
  ES: column => `(length(${column}) = 5 AND ${column} GLOB '[0-9][0-9][0-9][0-9][0-9]' AND substr(${column}, 1, 2) BETWEEN '01' AND '52')`,
  FR: column => `(length(${column}) = 5 AND ${column} GLOB '[0-9][0-9][0-9][0-9][0-9]')`,
  PT: column => `(length(${column}) = 7 AND ${column} GLOB '[1-9][0-9][0-9][0-9][0-9][0-9][0-9]')`
})

export function postalCodeSql (country, column) {
  const format = POSTAL_CODE_SQL[country]
  return format ? format(column) : '0'
}

function object (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys (value, required, optional = []) {
  return object(value) && required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key))
}

function amount (value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_ORDER_MINOR
}

function positiveInteger (value, max) {
  return Number.isSafeInteger(value) && value >= 1 && value <= max
}

function validTax (value) {
  return exactKeys(value, ['mode', 'rateBps']) &&
    ['inclusive', 'exclusive', 'exempt'].includes(value.mode) &&
    Number.isSafeInteger(value.rateBps) && value.rateBps >= 0 && value.rateBps <= 10000 &&
    (value.mode !== 'exempt' || value.rateBps === 0)
}

function validShipping (value) {
  return exactKeys(value, ['amountMinor', 'tax'], ['maxWeightGrams', 'maxUnits']) &&
    amount(value.amountMinor) && validTax(value.tax) &&
    (!Object.hasOwn(value, 'maxWeightGrams') || positiveInteger(value.maxWeightGrams, MAX_WEIGHT_GRAMS)) &&
    (!Object.hasOwn(value, 'maxUnits') || positiveInteger(value.maxUnits, MAX_ITEMS * MAX_QUANTITY))
}

// The policy is merchant configuration compiled into the catalog release. It does
// not authorize checkout by itself and never infers merchant tax rules.
export function assertTotalsPolicy (policy) {
  const invalid = () => { throw new CommerceError('invalid_totals_policy', 503) }
  if (!exactKeys(policy, ['schemaVersion', 'version', 'currency', 'minorUnit', 'destinations'])) invalid()
  if (policy.schemaVersion !== 2 || typeof policy.version !== 'string' || !VERSION.test(policy.version)) invalid()
  if (typeof policy.currency !== 'string' || !/^[a-z]{3}$/.test(policy.currency)) invalid()
  if (!Number.isInteger(policy.minorUnit) || policy.minorUnit < 0 || policy.minorUnit > 3) invalid()
  if (!object(policy.destinations)) invalid()
  const destinations = Object.entries(policy.destinations)
  if (destinations.length < 1 || destinations.length > 250) invalid()
  for (const [country, rule] of destinations) {
    if (!COUNTRY.test(country) || !Object.hasOwn(POSTAL_CODE_FORMATS, country)) invalid()
    if (!exactKeys(rule, ['tax', 'shipping', 'excludedPostalPrefixes'], ['taxBySku'])) invalid()
    if (!validTax(rule.tax) || !validShipping(rule.shipping)) invalid()
    if (!Array.isArray(rule.excludedPostalPrefixes) || rule.excludedPostalPrefixes.length > 1000 ||
      !rule.excludedPostalPrefixes.every(prefix => typeof prefix === 'string' && PREFIX.test(prefix)) ||
      new Set(rule.excludedPostalPrefixes).size !== rule.excludedPostalPrefixes.length) invalid()
    if (Object.hasOwn(rule, 'taxBySku')) {
      if (!object(rule.taxBySku)) invalid()
      const overrides = Object.entries(rule.taxBySku)
      if (overrides.length > 10000 || overrides.some(([sku, tax]) => !SKU.test(sku) || !validTax(tax))) invalid()
    }
  }
  return policy
}

export function normalizePostalCode (country, value) {
  if (typeof value !== 'string' || value.length > 16) return null
  const postalCode = value.replace(/[\s-]/g, '').toUpperCase()
  const format = POSTAL_CODE_FORMATS[country]
  return format && format.test(postalCode) ? postalCode : null
}

// Same rule for the quoted destination and for the address the payment provider
// later collects. `destination` is { country, excludedPostalPrefixes } as stored in
// the order snapshot. False for another country, malformed codes or excluded zones
// (e.g. Canarias, Ceuta, Melilla when they go to quote).
export function isEligibleDestination (destination, country, postalCode) {
  if (!object(destination) || destination.country !== country || !Array.isArray(destination.excludedPostalPrefixes)) return false
  const normalized = normalizePostalCode(country, postalCode)
  return normalized !== null && !destination.excludedPostalPrefixes.some(prefix => normalized.startsWith(prefix))
}

export function normalizeDestination (value) {
  if (!exactKeys(value, ['country', 'postalCode'])) throw new CommerceError('invalid_destination')
  const country = typeof value.country === 'string' ? value.country.trim().toUpperCase() : ''
  if (!COUNTRY.test(country)) throw new CommerceError('invalid_destination')
  const postalCode = normalizePostalCode(country, value.postalCode)
  if (postalCode === null) throw new CommerceError(Object.hasOwn(POSTAL_CODE_FORMATS, country) ? 'invalid_postal_code' : 'destination_not_supported')
  return { country, postalCode }
}

function validateSnapshot (snapshot) {
  const invalid = () => { throw new CommerceError('invalid_totals_snapshot', 503) }
  if (!object(snapshot) || typeof snapshot.currency !== 'string' || !/^[a-z]{3}$/.test(snapshot.currency)) invalid()
  if (!Number.isInteger(snapshot.minorUnit) || snapshot.minorUnit < 0 || snapshot.minorUnit > 3) invalid()
  if (!amount(snapshot.subtotalMinor) || !Array.isArray(snapshot.items) || snapshot.items.length < 1 || snapshot.items.length > MAX_ITEMS) invalid()
  const ids = new Set()
  const skus = new Set()
  let sum = 0n
  for (const item of snapshot.items) {
    if (!object(item) || typeof item.productId !== 'string' || !PRODUCT_ID.test(item.productId) || typeof item.sku !== 'string' || !SKU.test(item.sku)) invalid()
    const canonicalId = item.productId.toLowerCase()
    if (ids.has(canonicalId) || skus.has(item.sku)) invalid()
    ids.add(canonicalId)
    skus.add(item.sku)
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY || !amount(item.unitAmountMinor) || !amount(item.lineTotalMinor)) invalid()
    if (item.weightGrams !== null && item.weightGrams !== undefined && !positiveInteger(item.weightGrams, MAX_WEIGHT_GRAMS)) invalid()
    const extended = BigInt(item.unitAmountMinor) * BigInt(item.quantity)
    if (extended !== BigInt(item.lineTotalMinor)) invalid()
    sum += extended
    if (sum > LIMIT) invalid()
  }
  if (sum !== BigInt(snapshot.subtotalMinor)) invalid()
}

function roundHalfUp (numerator, denominator) {
  return (numerator + denominator / 2n) / denominator
}

function splitAmount (value, tax) {
  const base = BigInt(value)
  const rate = BigInt(tax.rateBps)
  if (tax.mode === 'exempt') return { net: base, tax: 0n, total: base, added: 0n }
  if (tax.mode === 'inclusive') {
    const includedTax = roundHalfUp(base * rate, SCALE + rate)
    return { net: base - includedTax, tax: includedTax, total: base, added: 0n }
  }
  const addedTax = roundHalfUp(base * rate, SCALE)
  return { net: base, tax: addedTax, total: base + addedTax, added: addedTax }
}

// Flat shipping applies only while the order stays inside its declared limits;
// unknown weights never count as light. Anything else goes to a manual quote.
function requireFlatShippingEligible (snapshot, shipping) {
  if (Object.hasOwn(shipping, 'maxUnits')) {
    const units = snapshot.items.reduce((total, item) => total + item.quantity, 0)
    if (units > shipping.maxUnits) throw new CommerceError('shipping_quote_required', 409)
  }
  if (Object.hasOwn(shipping, 'maxWeightGrams')) {
    let grams = 0
    for (const item of snapshot.items) {
      if (!Number.isSafeInteger(item.weightGrams)) throw new CommerceError('shipping_quote_required', 409)
      grams += item.weightGrams * item.quantity
    }
    if (grams > shipping.maxWeightGrams) throw new CommerceError('shipping_quote_required', 409)
  }
}

/**
 * Calculate totals for authoritative snapshot lines and a server-validated
 * destination. Tax is rounded half-up per extended line and once for shipping.
 * `addedTaxMinor` is the tax charged on top of exclusive prices: the provider
 * receives line prices + shipping base + addedTaxMinor, which equals totalMinor.
 * This is not a jurisdictional tax engine and does not authorize payment.
 */
export function calculateOrderTotals (snapshot, policy, destination) {
  assertTotalsPolicy(policy)
  validateSnapshot(snapshot)
  if (snapshot.currency !== policy.currency || snapshot.minorUnit !== policy.minorUnit) throw new CommerceError('totals_currency_mismatch', 503)
  const { country, postalCode } = normalizeDestination(destination)
  if (!Object.hasOwn(policy.destinations, country)) throw new CommerceError('destination_not_supported')
  const rule = policy.destinations[country]
  const zone = { country, excludedPostalPrefixes: [...rule.excludedPostalPrefixes] }
  if (!isEligibleDestination(zone, country, postalCode)) throw new CommerceError('destination_quote_required', 409)
  requireFlatShippingEligible(snapshot, rule.shipping)
  let merchandiseNet = 0n
  let merchandiseTax = 0n
  let addedTax = 0n
  const lines = snapshot.items.map(item => {
    const tax = rule.taxBySku && Object.hasOwn(rule.taxBySku, item.sku) ? rule.taxBySku[item.sku] : rule.tax
    const split = splitAmount(item.lineTotalMinor, tax)
    merchandiseNet += split.net
    merchandiseTax += split.tax
    addedTax += split.added
    if (merchandiseNet + merchandiseTax > LIMIT) throw new CommerceError('order_total_too_large')
    return {
      productId: item.productId,
      sku: item.sku,
      quantity: item.quantity,
      taxMode: tax.mode,
      taxRateBps: tax.rateBps,
      netMinor: Number(split.net),
      taxMinor: Number(split.tax),
      totalMinor: Number(split.total)
    }
  })
  const shipping = splitAmount(rule.shipping.amountMinor, rule.shipping.tax)
  addedTax += shipping.added
  const total = merchandiseNet + merchandiseTax + shipping.total
  if (total > LIMIT) throw new CommerceError('order_total_too_large')
  if (BigInt(snapshot.subtotalMinor) + BigInt(rule.shipping.amountMinor) + addedTax !== total) throw new CommerceError('invalid_totals_snapshot', 503)
  return {
    schemaVersion: 2,
    policyVersion: policy.version,
    destination: zone,
    currency: snapshot.currency,
    minorUnit: snapshot.minorUnit,
    subtotalMinor: snapshot.subtotalMinor,
    merchandiseNetMinor: Number(merchandiseNet),
    merchandiseTaxMinor: Number(merchandiseTax),
    merchandiseTotalMinor: Number(merchandiseNet + merchandiseTax),
    shippingBaseMinor: rule.shipping.amountMinor,
    shippingNetMinor: Number(shipping.net),
    shippingTaxMinor: Number(shipping.tax),
    shippingTax: { mode: rule.shipping.tax.mode, rateBps: rule.shipping.tax.rateBps },
    shippingTotalMinor: Number(shipping.total),
    taxMinor: Number(merchandiseTax + shipping.tax),
    addedTaxMinor: Number(addedTax),
    netMinor: Number(merchandiseNet + shipping.net),
    totalMinor: Number(total),
    lines
  }
}

// Public, PII-free view for the browser: the destination postal code is not echoed.
export function publicQuote (totals) {
  return {
    policy_version: totals.policyVersion,
    country: totals.destination.country,
    currency: totals.currency,
    subtotal_minor: totals.subtotalMinor,
    shipping_minor: totals.shippingTotalMinor,
    tax_minor: totals.taxMinor,
    added_tax_minor: totals.addedTaxMinor,
    total_minor: totals.totalMinor
  }
}
