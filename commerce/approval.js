import { CommerceError } from './http.js'
import { assertTotalsPolicy } from './totals.js'

export const SYNTHETIC_TEST_FIXTURE = 'synthetic-commerce-test'

const LEGAL_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const COUNTRY = /^[A-Z]{2}$/
export const CHECKOUT_TAX_POLICIES = Object.freeze(['included', 'calculated', 'not_applicable'])
export const CHECKOUT_SHIPPING_POLICIES = Object.freeze(['included', 'flat_rate', 'calculated', 'not_applicable'])
// Server-calculated totals are verified for Stripe TEST only. Live stays closed in
// code until a reviewed release changes this list; no config or env var opens it.
const TOTALS_VERIFIED_ENVIRONMENTS = Object.freeze(['test'])

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
  return TOTALS_VERIFIED_ENVIRONMENTS.includes(env.COMMERCE_ENV)
}

export function requireCheckoutAuthorization (catalog, env) {
  if (!isCheckoutAuthorized(catalog, env)) throw new CommerceError('checkout_not_approved', 503)
}
