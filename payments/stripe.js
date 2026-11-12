import { PaymentError } from './errors.js'

// Stripe adapter shared by every payment consumer: key checks, API requests and
// Checkout Session validation. Consumers build their own session parameters and
// validate amounts against their own records.

// Stripe's bounds for a Checkout Session lifetime.
export const STRIPE_SESSION_MIN_TTL_SECONDS = 30 * 60
export const STRIPE_SESSION_MAX_TTL_SECONDS = 24 * 60 * 60
const STRIPE_API = 'https://api.stripe.com/v1'
export const SESSION_ID = /^cs_(?:(?:test|live)_)?[A-Za-z0-9]+$/

export function requireStripeEnvironment (env) {
  const environment = env.COMMERCE_ENV
  const secret = env.STRIPE_SECRET_KEY
  if (!['test', 'live'].includes(environment) || typeof secret !== 'string') throw new PaymentError('payment_configuration_missing', 503)
  // Restricted keys (rk_) are preferred: they carry only the permissions checkout needs.
  if (environment === 'test' && !/^(?:sk|rk)_test_/.test(secret)) throw new PaymentError('payment_configuration_invalid', 503)
  if (environment === 'live' && !/^(?:sk|rk)_live_/.test(secret)) throw new PaymentError('payment_configuration_invalid', 503)
  if (!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) throw new PaymentError('webhook_configuration_missing', 503)
  return secret
}

export async function stripeRequest (env, path, options = {}) {
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
    throw new PaymentError('payment_provider_unavailable', 502)
  }
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new PaymentError('payment_provider_invalid_response', 502)
  }
  // 409: another request with the same idempotency key is still in flight at
  // Stripe. Retrying with the same key replays the stored session.
  if (response.status === 409) throw new PaymentError('checkout_in_progress', 409)
  if (!response.ok) throw new PaymentError('payment_provider_rejected', 502)
  return payload
}

export function parseCheckoutSession (payload, requireCheckoutUrl = false) {
  if (!payload || !SESSION_ID.test(payload.id || '') || !['open', 'complete', 'expired'].includes(payload.status) || !['paid', 'unpaid', 'no_payment_required'].includes(payload.payment_status)) throw new PaymentError('payment_provider_invalid_response', 502)
  if (!Number.isSafeInteger(payload.amount_total) || payload.amount_total < 0 || !/^[a-z]{3}$/.test(payload.currency || '')) throw new PaymentError('payment_provider_invalid_response', 502)
  if (!Number.isSafeInteger(payload.created) || !Number.isSafeInteger(payload.expires_at) || payload.expires_at - payload.created < STRIPE_SESSION_MIN_TTL_SECONDS || payload.expires_at - payload.created > STRIPE_SESSION_MAX_TTL_SECONDS) throw new PaymentError('payment_provider_invalid_response', 502)
  if (payload.livemode !== undefined && typeof payload.livemode !== 'boolean') throw new PaymentError('payment_provider_invalid_response', 502)
  const idLivemode = payload.id.startsWith('cs_live_') ? true : payload.id.startsWith('cs_test_') ? false : null
  if (idLivemode !== null && typeof payload.livemode === 'boolean' && payload.livemode !== idLivemode) throw new PaymentError('payment_provider_invalid_response', 502)
  if (requireCheckoutUrl && !['open', 'expired'].includes(payload.status)) throw new PaymentError('payment_provider_invalid_response', 502)
  if (requireCheckoutUrl && payload.status === 'open' && typeof payload.url !== 'string') throw new PaymentError('payment_provider_invalid_response', 502)
  if (!requireCheckoutUrl && payload.url !== null && typeof payload.url !== 'string') throw new PaymentError('payment_provider_invalid_response', 502)
  let checkoutUrl = null
  if (typeof payload.url === 'string') {
    try {
      checkoutUrl = new URL(payload.url)
    } catch {
      throw new PaymentError('payment_provider_invalid_response', 502)
    }
    if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.stripe.com' || checkoutUrl.username || checkoutUrl.password || checkoutUrl.port) throw new PaymentError('payment_provider_invalid_response', 502)
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
