import { buildOrderSnapshot, MAX_ORDER_MINOR, normalizeCart } from './catalog.js'
import { CommerceError, errorResponse, isSameOrigin, jsonResponse, methodNotAllowed, readJsonBody, requireEnabledCatalog } from './http.js'
import { verifiedProxy } from '../edge/proxy.js'
import { requireCheckoutAuthorization } from './approval.js'
import { assertTotalsPolicy, calculateOrderTotals, normalizeDestination, publicQuote } from './totals.js'

const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
// Any well-formed v4 UUID works: quotes never persist and their snapshot is discarded.
const QUOTE_ORDER_ID = '00000000-0000-4000-8000-000000000000'

function object (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys (value, keys) {
  return object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}

// The browser sends only product IDs, quantities and a destination; checkout also
// echoes the quote it displayed so a changed price or policy is never charged silently.
export function normalizeCommerceRequest (payload, { withQuote }) {
  if (!exactKeys(payload, withQuote ? ['items', 'destination', 'quote'] : ['items', 'destination'])) throw new CommerceError('invalid_cart')
  const items = normalizeCart({ items: payload.items })
  const destination = normalizeDestination(payload.destination)
  if (!withQuote) return { items, destination }
  const quote = payload.quote
  if (!exactKeys(quote, ['policy_version', 'total_minor']) || typeof quote.policy_version !== 'string' || !VERSION.test(quote.policy_version) ||
    !Number.isSafeInteger(quote.total_minor) || quote.total_minor < 0 || quote.total_minor > MAX_ORDER_MINOR) throw new CommerceError('invalid_quote')
  return { items, destination, quote: { policy_version: quote.policy_version, total_minor: quote.total_minor } }
}

export function requireTotalsPolicy (catalog) {
  const policy = catalog?.checkout?.totalsPolicy
  if (!policy) throw new CommerceError('totals_policy_unavailable', 503)
  assertTotalsPolicy(policy)
  if (policy.currency !== catalog.currency || policy.minorUnit !== catalog.minorUnit) throw new CommerceError('totals_currency_mismatch', 503)
  return policy
}

export function quoteOrder (catalog, items, destination, orderId = QUOTE_ORDER_ID, createdAt = Math.floor(Date.now() / 1000)) {
  const policy = requireTotalsPolicy(catalog)
  const snapshot = buildOrderSnapshot(catalog, items, orderId, 'es', createdAt)
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
