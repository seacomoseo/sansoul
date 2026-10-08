import { CommerceError } from './http.js'
import { sha256Hex } from './catalog.js'
import { isSyntheticTestFixture } from './approval.js'
import { STRIPE_SESSION_MAX_TTL_SECONDS, STRIPE_SESSION_MIN_TTL_SECONDS } from './expiry.js'

const STRIPE_API = 'https://api.stripe.com/v1'
const SESSION_ID = /^cs_(?:(?:test|live)_)?[A-Za-z0-9]+$/

function requireStripeEnvironment (env) {
  const environment = env.COMMERCE_ENV
  const secret = env.STRIPE_SECRET_KEY
  if (!['test', 'live'].includes(environment) || typeof secret !== 'string') throw new CommerceError('payment_configuration_missing', 503)
  if (environment === 'test' && !secret.startsWith('sk_test_')) throw new CommerceError('payment_configuration_invalid', 503)
  if (environment === 'live' && !secret.startsWith('sk_live_')) throw new CommerceError('payment_configuration_invalid', 503)
  if (!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) throw new CommerceError('webhook_configuration_missing', 503)
  return secret
}

export function getWebhookSecret (env) {
  if (env.COMMERCE_PROVIDER === 'fake') {
    if (!isSyntheticTestFixture(env)) throw new CommerceError('payment_provider_invalid', 503)
    if (typeof env.FAKE_WEBHOOK_SECRET !== 'string' || env.FAKE_WEBHOOK_SECRET.length < 8) throw new CommerceError('webhook_configuration_missing', 503)
    return env.FAKE_WEBHOOK_SECRET
  }
  requireStripeEnvironment(env)
  return env.STRIPE_WEBHOOK_SECRET
}

async function stripeRequest (env, path, options = {}) {
  const secret = requireStripeEnvironment(env)
  let response
  try {
    response = await fetch(`${STRIPE_API}${path}`, {
      ...options,
      signal: AbortSignal.timeout(10000),
      headers: {
        authorization: `Bearer ${secret}`,
        ...(options.headers || {})
      }
    })
  } catch {
    throw new CommerceError('payment_provider_unavailable', 502)
  }
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new CommerceError('payment_provider_invalid_response', 502)
  }
  if (!response.ok) throw new CommerceError('payment_provider_rejected', 502)
  return payload
}

function stripeSession (payload, requireCheckoutUrl = false) {
  if (!payload || !SESSION_ID.test(payload.id || '') || !['open', 'complete', 'expired'].includes(payload.status) || !['paid', 'unpaid', 'no_payment_required'].includes(payload.payment_status)) throw new CommerceError('payment_provider_invalid_response', 502)
  if (!Number.isSafeInteger(payload.amount_total) || payload.amount_total < 0 || !/^[a-z]{3}$/.test(payload.currency || '')) throw new CommerceError('payment_provider_invalid_response', 502)
  if (!Number.isSafeInteger(payload.created) || !Number.isSafeInteger(payload.expires_at) || payload.expires_at - payload.created < STRIPE_SESSION_MIN_TTL_SECONDS || payload.expires_at - payload.created > STRIPE_SESSION_MAX_TTL_SECONDS) throw new CommerceError('payment_provider_invalid_response', 502)
  if (payload.livemode !== undefined && typeof payload.livemode !== 'boolean') throw new CommerceError('payment_provider_invalid_response', 502)
  const idLivemode = payload.id.startsWith('cs_live_') ? true : payload.id.startsWith('cs_test_') ? false : null
  if (idLivemode !== null && typeof payload.livemode === 'boolean' && payload.livemode !== idLivemode) throw new CommerceError('payment_provider_invalid_response', 502)
  if (requireCheckoutUrl && !['open', 'expired'].includes(payload.status)) throw new CommerceError('payment_provider_invalid_response', 502)
  if (requireCheckoutUrl && payload.status === 'open' && typeof payload.url !== 'string') throw new CommerceError('payment_provider_invalid_response', 502)
  if (!requireCheckoutUrl && payload.url !== null && typeof payload.url !== 'string') throw new CommerceError('payment_provider_invalid_response', 502)
  let checkoutUrl = null
  if (typeof payload.url === 'string') {
    try {
      checkoutUrl = new URL(payload.url)
    } catch {
      throw new CommerceError('payment_provider_invalid_response', 502)
    }
    if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.stripe.com' || checkoutUrl.username || checkoutUrl.password || checkoutUrl.port) throw new CommerceError('payment_provider_invalid_response', 502)
    checkoutUrl = checkoutUrl.toString()
  }
  return {
    id: payload.id,
    url: checkoutUrl,
    createdAt: payload.created,
    expiresAt: payload.expires_at,
    paymentStatus: payload.payment_status,
    sessionStatus: payload.status,
    paymentIntentId: typeof payload.payment_intent === 'string' ? payload.payment_intent : payload.payment_intent?.id || null,
    clientReferenceId: typeof payload.client_reference_id === 'string' ? payload.client_reference_id : null,
    commerceOrderId: typeof payload.metadata?.commerce_order_id === 'string' ? payload.metadata.commerce_order_id : null,
    amountTotal: payload.amount_total,
    currency: payload.currency,
    livemode: typeof payload.livemode === 'boolean' ? payload.livemode : null
  }
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
      const form = new URLSearchParams()
      form.set('mode', 'payment')
      form.set('client_reference_id', snapshot.orderId)
      form.set('metadata[commerce_order_id]', snapshot.orderId)
      form.set('payment_intent_data[metadata][commerce_order_id]', snapshot.orderId)
      form.set('success_url', `${catalog.origin}/?commerce=success&order_id=${encodeURIComponent(snapshot.orderId)}`)
      form.set('cancel_url', `${catalog.origin}/?commerce=cancel`)
      const countries = catalog.checkout?.destinationCountries
      if (catalog.checkout?.shippingPolicy !== 'not_applicable' && Array.isArray(countries)) {
        countries.forEach((country, index) => form.set(`shipping_address_collection[allowed_countries][${index}]`, country))
      }
      // Let Stripe's 24-hour default start at real session creation; retries keep identical parameters.
      snapshot.items.forEach((item, index) => {
        const prefix = `line_items[${index}]`
        form.set(`${prefix}[price_data][currency]`, snapshot.currency)
        form.set(`${prefix}[price_data][unit_amount]`, String(item.unitAmountMinor))
        form.set(`${prefix}[price_data][product_data][name]`, item.name)
        form.set(`${prefix}[price_data][product_data][metadata][sku]`, item.sku)
        form.set(`${prefix}[quantity]`, String(item.quantity))
      })
      const payload = await stripeRequest(env, '/checkout/sessions', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'idempotency-key': `commerce_${providerIdempotencyKey}`
        },
        body: form
      })
      const session = stripeSession(payload, true)
      if (!['open', 'expired'].includes(session.sessionStatus)) throw new CommerceError('payment_provider_invalid_response', 502)
      if (session.amountTotal !== snapshot.totalMinor || session.currency !== snapshot.currency || session.livemode !== (env.COMMERCE_ENV === 'live') || session.clientReferenceId !== snapshot.orderId || session.commerceOrderId !== snapshot.orderId) throw new CommerceError('payment_provider_invalid_response', 502)
      return session
    },
    async retrieveCheckoutSession (sessionId) {
      if (!SESSION_ID.test(sessionId || '')) throw new CommerceError('invalid_session_id')
      const payload = await stripeRequest(env, `/checkout/sessions/${encodeURIComponent(sessionId)}`)
      const session = stripeSession(payload)
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
