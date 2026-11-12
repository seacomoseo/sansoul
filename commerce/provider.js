import { CommerceError } from './http.js'
import { sha256Hex } from './catalog.js'
import { isSyntheticTestFixture } from './approval.js'
import { STRIPE_SESSION_MAX_TTL_SECONDS } from './expiry.js'
import { parseCheckoutSession, requireStripeEnvironment, SESSION_ID, stripeRequest } from '../payments/stripe.js'
import { paymentPageText, supportedLocale } from './messages.js'

export function getWebhookSecret (env) {
  if (env.COMMERCE_PROVIDER === 'fake') {
    if (!isSyntheticTestFixture(env)) throw new CommerceError('payment_provider_invalid', 503)
    if (typeof env.FAKE_WEBHOOK_SECRET !== 'string' || env.FAKE_WEBHOOK_SECRET.length < 8) throw new CommerceError('webhook_configuration_missing', 503)
    return env.FAKE_WEBHOOK_SECRET
  }
  requireStripeEnvironment(env)
  return env.STRIPE_WEBHOOK_SECRET
}

export function createPaymentProvider (env) {
  const provider = env.COMMERCE_PROVIDER || 'stripe'
  if (provider === 'fake') {
    if (!isSyntheticTestFixture(env)) throw new CommerceError('payment_provider_invalid', 503)
    return createFakeProvider(env)
  }
  if (provider !== 'stripe') throw new CommerceError('payment_provider_invalid', 503)
  requireStripeEnvironment(env)
  return {
    name: 'stripe',
    async createCheckoutSession ({ snapshot, providerIdempotencyKey, catalog }) {
      const totals = snapshot.totals
      if (!totals || totals.totalMinor !== snapshot.totalMinor || totals.currency !== snapshot.currency || !/^[A-Z]{2}$/.test(totals.destination?.country || '')) throw new CommerceError('order_totals_unavailable', 503)
      const form = new URLSearchParams()
      // Orders without a purchase language (older storefronts) keep Stripe's browser
      // detection and the Spanish line labels of 14.3.
      const locale = supportedLocale(snapshot.locale)
      const labels = paymentPageText(locale || 'es')
      form.set('mode', 'payment')
      if (locale) form.set('locale', locale)
      form.set('client_reference_id', snapshot.orderId)
      form.set('metadata[commerce_order_id]', snapshot.orderId)
      form.set('metadata[purpose]', 'order')
      form.set('payment_intent_data[metadata][commerce_order_id]', snapshot.orderId)
      form.set('payment_intent_data[metadata][purpose]', 'order')
      form.set('success_url', `${catalog.origin}/?commerce=success&order_id=${encodeURIComponent(snapshot.orderId)}`)
      // order_id lets the storefront confirm (with the buyer's status cookie) that nothing was charged.
      form.set('cancel_url', `${catalog.origin}/?commerce=cancel&order_id=${encodeURIComponent(snapshot.orderId)}`)
      // Only the quoted country can be entered; postal zones are re-checked by the webhook.
      if (catalog.checkout?.shippingPolicy !== 'not_applicable') form.set('shipping_address_collection[allowed_countries][0]', totals.destination.country)
      // Let Stripe's 24-hour default start at real session creation; retries keep identical parameters.
      snapshot.items.forEach((item, index) => {
        const prefix = `line_items[${index}]`
        form.set(`${prefix}[price_data][currency]`, snapshot.currency)
        form.set(`${prefix}[price_data][unit_amount]`, String(item.unitAmountMinor))
        form.set(`${prefix}[price_data][product_data][name]`, item.name)
        form.set(`${prefix}[price_data][product_data][metadata][sku]`, item.sku)
        form.set(`${prefix}[quantity]`, String(item.quantity))
      })
      // Line prices + shipping base + tax added on exclusive prices = totals.totalMinor.
      if (totals.addedTaxMinor > 0) {
        const prefix = `line_items[${snapshot.items.length}]`
        form.set(`${prefix}[price_data][currency]`, snapshot.currency)
        form.set(`${prefix}[price_data][unit_amount]`, String(totals.addedTaxMinor))
        form.set(`${prefix}[price_data][product_data][name]`, labels.tax)
        form.set(`${prefix}[quantity]`, '1')
      }
      // Company buyers give their tax ID and name on Stripe's page (no Customer is
      // created); delivery extras are optional custom fields labelled in the
      // purchase language. Keys must match webhook.js.
      if (catalog.taxIdCollection) form.set('tax_id_collection[enabled]', 'true')
      ;(catalog.checkoutFields || []).forEach((field, index) => {
        const prefix = `custom_fields[${index}]`
        const recipientPhone = field === 'recipient_phone'
        form.set(`${prefix}[key]`, recipientPhone ? 'recipientphone' : 'deliverynotes')
        form.set(`${prefix}[label][type]`, 'custom')
        form.set(`${prefix}[label][custom]`, recipientPhone ? labels.recipientPhone : labels.deliveryNotes)
        form.set(`${prefix}[type]`, 'text')
        form.set(`${prefix}[optional]`, 'true')
        form.set(`${prefix}[text][maximum_length]`, recipientPhone ? '40' : '255')
      })
      if (totals.shippingBaseMinor > 0) {
        form.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount')
        form.set('shipping_options[0][shipping_rate_data][display_name]', labels.shipping)
        form.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(totals.shippingBaseMinor))
        form.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', snapshot.currency)
      }
      const payload = await stripeRequest(env, '/checkout/sessions', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'idempotency-key': `commerce_${providerIdempotencyKey}`
        },
        body: form
      })
      const session = parseCheckoutSession(payload, true)
      if (!['open', 'expired'].includes(session.sessionStatus)) throw new CommerceError('payment_provider_invalid_response', 502)
      if (session.amountTotal !== snapshot.totalMinor || session.currency !== snapshot.currency || session.livemode !== (env.COMMERCE_ENV === 'live') || session.clientReferenceId !== snapshot.orderId || session.commerceOrderId !== snapshot.orderId) throw new CommerceError('payment_provider_invalid_response', 502)
      return session
    },
    async retrieveCheckoutSession (sessionId) {
      if (!SESSION_ID.test(sessionId || '')) throw new CommerceError('invalid_session_id')
      const payload = await stripeRequest(env, `/checkout/sessions/${encodeURIComponent(sessionId)}`)
      const session = parseCheckoutSession(payload)
      if (session.id !== sessionId) throw new CommerceError('payment_provider_invalid_response', 502)
      return session
    }
  }
}

const fakeSessions = new Map()
const failedFakeCreateKeys = new Set()
const failedFakeTimeoutKeys = new Set()

function createFakeProvider (env) {
  return {
    name: 'fake-test-only',
    async createCheckoutSession ({ snapshot, providerIdempotencyKey, catalog, testFailOnce, testTimeoutAfterCreateOnce, testReturnExpired }) {
      if (testFailOnce && !failedFakeCreateKeys.has(providerIdempotencyKey)) {
        failedFakeCreateKeys.add(providerIdempotencyKey)
        throw new CommerceError('payment_provider_unavailable', 502)
      }
      const digest = await sha256Hex(providerIdempotencyKey)
      let session = fakeSessions.get(providerIdempotencyKey)
      if (!session) {
        const createdAt = Math.floor(Date.now() / 1000)
        session = {
          id: `cs_test_${digest.slice(0, 24)}`,
          url: `${catalog.origin}/__test/checkout/${digest.slice(0, 24)}`,
          paymentStatus: 'unpaid',
          sessionStatus: 'open',
          createdAt,
          expiresAt: createdAt + STRIPE_SESSION_MAX_TTL_SECONDS,
          paymentIntentId: null,
          clientReferenceId: snapshot.orderId,
          commerceOrderId: snapshot.orderId,
          amountTotal: snapshot.totalMinor,
          currency: snapshot.currency,
          livemode: false
        }
        fakeSessions.set(providerIdempotencyKey, session)
      }
      if (testTimeoutAfterCreateOnce && !failedFakeTimeoutKeys.has(providerIdempotencyKey)) {
        failedFakeTimeoutKeys.add(providerIdempotencyKey)
        throw new CommerceError('payment_provider_unavailable', 502)
      }
      if (testReturnExpired) return { ...session, url: null, sessionStatus: 'expired', expiresAt: Math.floor(Date.now() / 1000) - 1 }
      if (session.expiresAt <= Math.floor(Date.now() / 1000)) return { ...session, url: null, sessionStatus: 'expired' }
      return session
    },
    async retrieveCheckoutSession (sessionId) {
      if (!SESSION_ID.test(sessionId || '')) throw new CommerceError('invalid_session_id')
      const session = Array.from(fakeSessions.values()).find(candidate => candidate.id === sessionId)
      if (session) {
        if (session.expiresAt <= Math.floor(Date.now() / 1000)) return { ...session, url: null, sessionStatus: 'expired' }
        return session
      }
      return {
        id: sessionId,
        url: `${catalogOrigin(env)}/__test/checkout/${sessionId.slice('cs_test_'.length)}`,
        paymentStatus: 'unpaid',
        sessionStatus: 'open',
        createdAt: null,
        expiresAt: null,
        paymentIntentId: null,
        clientReferenceId: null,
        commerceOrderId: null,
        amountTotal: null,
        currency: null,
        livemode: false
      }
    }
  }
}

function catalogOrigin (env) {
  return env.COMMERCE_TEST_ORIGIN || 'http://127.0.0.1:8788'
}
