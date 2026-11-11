import { CommerceError } from './http.js'
import { assertTotalsPolicy } from './totals.js'

export const SYNTHETIC_TEST_FIXTURE = 'synthetic-commerce-test'

const LEGAL_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const COUNTRY = /^[A-Z]{2}$/
export const CHECKOUT_TAX_POLICIES = Object.freeze(['included', 'calculated', 'not_applicable'])
export const CHECKOUT_SHIPPING_POLICIES = Object.freeze(['included', 'flat_rate', 'calculated', 'not_applicable'])
// Server-calculated totals passed a real Stripe TEST purchase (3DNAU, 2026-11) and
// live opens with the same gates: env approval, complete catalog approval and keys
// of the matching mode. Removing an entry here closes that mode in code.
const TOTALS_VERIFIED_ENVIRONMENTS = Object.freeze(['test', 'live'])
const STRIPE_KEY_BY_ENVIRONMENT = Object.freeze({ test: /^(?:sk|rk)_test_/, live: /^(?:sk|rk)_live_/ })

export function isValidCheckoutLegalVersion (value) {
  return typeof value === 'string' && LEGAL_VERSION.test(value)
}

export function isValidDestinationCountries (countries) {
  return Array.isArray(countries) &&
    countries.every(country => typeof country === 'string' && COUNTRY.test(country)) &&
    new Set(countries).size === countries.length
}

export function hasValidTotalsPolicy (checkout) {
  try {
    assertTotalsPolicy(checkout?.totalsPolicy)
  } catch {
    return false
  }
  const policyCountries = Object.keys(checkout.totalsPolicy.destinations).sort()
  const countries = Array.isArray(checkout.destinationCountries) ? [...checkout.destinationCountries].sort() : []
  return policyCountries.length === countries.length && policyCountries.every((country, index) => country === countries[index])
}

export function hasCompleteCommercialApproval (checkout) {
  return checkout?.approved === true &&
    isValidCheckoutLegalVersion(checkout.legalVersion) &&
    isValidDestinationCountries(checkout.destinationCountries) && checkout.destinationCountries.length > 0 &&
    CHECKOUT_TAX_POLICIES.includes(checkout.taxPolicy) &&
    CHECKOUT_SHIPPING_POLICIES.includes(checkout.shippingPolicy) &&
    hasValidTotalsPolicy(checkout)
}

export function isSyntheticTestFixture (env) {
  return env?.COMMERCE_ENV === 'test' &&
    env.COMMERCE_PROVIDER === 'fake' &&
    env.COMMERCE_TEST_FIXTURE === SYNTHETIC_TEST_FIXTURE
}

export function isCheckoutAuthorized (catalog, env) {
  if (!catalog?.enabled) return false
  if (isSyntheticTestFixture(env)) return true
  if (env?.COMMERCE_PROVIDER !== 'stripe' || !['test', 'live'].includes(env.COMMERCE_ENV)) return false
  if (env.COMMERCE_CHECKOUT_APPROVED !== 'true' || !hasCompleteCommercialApproval(catalog.checkout)) return false
  // Fail before any order exists when the keys do not belong to the configured mode.
  if (!STRIPE_KEY_BY_ENVIRONMENT[env.COMMERCE_ENV].test(env.STRIPE_SECRET_KEY || '') || !env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) return false
  // Real orders keep buyer addresses: live opens only with a configured erasure deadline.
  if (env.COMMERCE_ENV === 'live' && catalog.checkout.shippingPolicy !== 'not_applicable' && !Number.isSafeInteger(catalog.checkout.deliveryRetentionDays)) return false
  return TOTALS_VERIFIED_ENVIRONMENTS.includes(env.COMMERCE_ENV)
}

export function requireCheckoutAuthorization (catalog, env) {
  if (!isCheckoutAuthorized(catalog, env)) throw new CommerceError('checkout_not_approved', 503)
}
