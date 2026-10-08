import { CommerceError } from './http.js'

export const SYNTHETIC_TEST_FIXTURE = 'synthetic-commerce-test'

const LEGAL_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const COUNTRY = /^[A-Z]{2}$/
export const CHECKOUT_TAX_POLICIES = Object.freeze(['included', 'calculated', 'not_applicable'])
export const CHECKOUT_SHIPPING_POLICIES = Object.freeze(['included', 'flat_rate', 'calculated', 'not_applicable'])
const CHECKOUT_TOTALS_SUPPORTED = false // ponytail: keep physical orders blocked until verified tax/shipping totals are implemented

export function isValidCheckoutLegalVersion (value) {
  return typeof value === 'string' && LEGAL_VERSION.test(value)
}

export function isValidDestinationCountries (countries) {
  return Array.isArray(countries) &&
    countries.every(country => typeof country === 'string' && COUNTRY.test(country)) &&
    new Set(countries).size === countries.length
}

export function hasCompleteCommercialApproval (checkout) {
  return checkout?.approved === true &&
    isValidCheckoutLegalVersion(checkout.legalVersion) &&
    isValidDestinationCountries(checkout.destinationCountries) && checkout.destinationCountries.length > 0 &&
    CHECKOUT_TAX_POLICIES.includes(checkout.taxPolicy) &&
    CHECKOUT_SHIPPING_POLICIES.includes(checkout.shippingPolicy)
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
  return CHECKOUT_TOTALS_SUPPORTED
}

export function requireCheckoutAuthorization (catalog, env) {
  if (!isCheckoutAuthorized(catalog, env)) throw new CommerceError('checkout_not_approved', 503)
}
