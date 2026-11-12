import { buildOrderSnapshot, MAX_ORDER_MINOR, normalizeCart } from './catalog.js'
import { CommerceError, errorResponse, isSameOrigin, jsonResponse, methodNotAllowed, readJsonBody, requireEnabledCatalog } from './http.js'
import { verifiedProxy } from '../edge/proxy.js'
import { requireCheckoutAuthorization } from './approval.js'
import { assertTotalsPolicy, calculateOrderTotals, normalizeDestination, publicQuote } from './totals.js'
import { supportedLocale } from './messages.js'

const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
// Any well-formed v4 UUID works: quotes never persist and their snapshot is discarded.
const QUOTE_ORDER_ID = '00000000-0000-4000-8000-000000000000'

function object (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys (value, keys) {
  return object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}

// Optional checkout keys: the page language and the buyer's choices. None is personal
// data; older storefronts simply omit them.
const CHECKOUT_OPTIONS = ['locale', 'invoice_requested']

// The browser sends only product IDs, quantities and a destination; checkout also
// echoes the quote it displayed so a changed price or policy is never charged silently.
export function normalizeCommerceRequest (payload, { withQuote }) {
  const required = withQuote ? ['items', 'destination', 'quote'] : ['items', 'destination']
  const allowed = withQuote ? [...required, ...CHECKOUT_OPTIONS] : required
  if (!object(payload) || !required.every(key => Object.hasOwn(payload, key)) || Object.keys(payload).some(key => !allowed.includes(key))) throw new CommerceError('invalid_cart')
  const items = normalizeCart({ items: payload.items })
  const destination = normalizeDestination(payload.destination)
  if (!withQuote) return { items, destination }
  const quote = payload.quote
  if (!exactKeys(quote, ['policy_version', 'total_minor']) || typeof quote.policy_version !== 'string' || !VERSION.test(quote.policy_version) ||
    !Number.isSafeInteger(quote.total_minor) || quote.total_minor < 0 || quote.total_minor > MAX_ORDER_MINOR) throw new CommerceError('invalid_quote')
  const options = {}
  if (payload.locale !== undefined) {
    // Unknown languages are not an error: the order falls back to the project default.
    const locale = supportedLocale(payload.locale)
    if (locale) options.locale = locale
  }
  if (payload.invoice_requested !== undefined) {
    if (typeof payload.invoice_requested !== 'boolean') throw new CommerceError('invalid_cart')
    if (payload.invoice_requested) options.invoiceRequested = true
  }
  return { items, destination, quote: { policy_version: quote.policy_version, total_minor: quote.total_minor }, options }
}

export function requireTotalsPolicy (catalog) {
  const policy = catalog?.checkout?.totalsPolicy
  if (!policy) throw new CommerceError('totals_policy_unavailable', 503)
  assertTotalsPolicy(policy)
  if (policy.currency !== catalog.currency || policy.minorUnit !== catalog.minorUnit) throw new CommerceError('totals_currency_mismatch', 503)
  return policy
}

export function quoteOrder (catalog, items, destination, orderId = QUOTE_ORDER_ID, createdAt = Math.floor(Date.now() / 1000), locale = 'es') {
  const policy = requireTotalsPolicy(catalog)
  const snapshot = buildOrderSnapshot(catalog, items, orderId, locale, createdAt)
  const totals = calculateOrderTotals(snapshot, policy, destination)
  return { snapshot, totals }
}

export function quoteMatches (totals, quote) {
  return totals.policyVersion === quote.policy_version && totals.totalMinor === quote.total_minor
}

export async function handleQuote (request, env, catalog) {
  try {
    if (request.method !== 'POST') return methodNotAllowed(['POST'])
    requireEnabledCatalog(catalog)
    if (!isSameOrigin(request, catalog.origin, await verifiedProxy(request, env))) throw new CommerceError('origin_not_allowed', 403)
    requireCheckoutAuthorization(catalog, env)
    const { value } = await readJsonBody(request, 4096)
    const { items, destination } = normalizeCommerceRequest(value, { withQuote: false })
    const { totals } = quoteOrder(catalog, items, destination)
    return jsonResponse({ quote: publicQuote(totals) })
  } catch (error) {
    return errorResponse(error)
  }
}
