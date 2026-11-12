import { sha256Hex } from './catalog.js'
import { applyPaymentState, expirePendingCheckouts, persistCheckoutSession } from './orders.js'
import { CommerceError, errorResponse, isSameOrigin, jsonResponse, methodNotAllowed, readJsonBody, requireDatabase, requireEnabledCatalog } from './http.js'
import { clientIp, verifiedProxy } from '../edge/proxy.js'
import { hmacSha256Hex } from '../payments/signature.js'
import { createPaymentProvider } from './provider.js'
import { buyerStatusCookie, resolveBuyerStatusCapability } from './status.js'
import { requireCheckoutAuthorization } from './approval.js'
import { CHECKOUT_RECOVERY_TTL_SECONDS, STRIPE_IDEMPOTENCY_RETRY_TTL_SECONDS } from './expiry.js'
import { normalizeCommerceRequest, quoteMatches, quoteOrder } from './quote.js'
import { publicQuote } from './totals.js'

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/
const RATE_LIMIT = 20
const RATE_WINDOW_SECONDS = 600

async function consumeRateLimit (db, request, env, now) {
  const salt = env.COMMERCE_RATE_LIMIT_SALT
  const ip = await clientIp(request, env)
  if (typeof salt !== 'string' || salt.length < 32 || (!ip && env.COMMERCE_ENV !== 'test')) throw new CommerceError('rate_limit_unavailable', 503)
  const clientKey = await hmacSha256Hex(ip || 'local-test', salt)
  const windowStart = Math.floor(now / RATE_WINDOW_SECONDS) * RATE_WINDOW_SECONDS
  await db.prepare(`
    INSERT INTO rate_limits (client_key, window_start, request_count, updated_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(client_key) DO UPDATE SET
      window_start = CASE WHEN rate_limits.window_start < excluded.window_start THEN excluded.window_start ELSE rate_limits.window_start END,
      request_count = CASE WHEN rate_limits.window_start < excluded.window_start THEN 1 ELSE rate_limits.request_count + 1 END,
      updated_at = excluded.updated_at
    WHERE rate_limits.window_start <= excluded.window_start
  `).bind(clientKey, windowStart, now).run()
  const row = await db.prepare('SELECT request_count FROM rate_limits WHERE client_key = ?').bind(clientKey).first()
  if (!row || row.request_count > RATE_LIMIT) throw new CommerceError('rate_limited', 429)
}

function readIdempotencyKey (request) {
  const key = request.headers.get('idempotency-key')
  if (!IDEMPOTENCY_KEY.test(key || '')) throw new CommerceError('idempotency_key_required')
  return key
}

async function readRecord (db, key) {
  // The order's payment state rides along so a replay never hands out a dead session URL.
  return db.prepare(`
    SELECT i.*, o.payment_status AS order_payment_status
    FROM commerce_idempotency i LEFT JOIN orders o ON o.id = i.order_id WHERE i.idempotency_key = ?
  `).bind(key).first()
}

function storedSnapshot (record) {
  try {
    const snapshot = JSON.parse(record.snapshot_json)
    if (!snapshot || !snapshot.orderId || !Array.isArray(snapshot.items) || !Number.isSafeInteger(snapshot.totalMinor)) throw new Error('bad snapshot')
    if (!snapshot.totals || snapshot.totals.totalMinor !== snapshot.totalMinor || !snapshot.totals.destination?.country) throw new Error('bad totals')
    return snapshot
  } catch {
    throw new CommerceError('order_snapshot_unavailable', 503)
  }
}

async function createRecord (db, key, requestHash, snapshot, now) {
  await db.prepare(`
    INSERT INTO commerce_idempotency (
      idempotency_key, request_hash, order_id, snapshot_json, status, created_at, updated_at, expires_at
    ) VALUES (?, ?, ?, ?, 'creating', ?, ?, ?)
    ON CONFLICT(idempotency_key) DO NOTHING
  `).bind(key, requestHash, snapshot.orderId, JSON.stringify(snapshot), now, now, snapshot.createdAt + STRIPE_IDEMPOTENCY_RETRY_TTL_SECONDS).run()
  const record = await readRecord(db, key)
  if (!record) throw new CommerceError('idempotency_unavailable', 503)
  if (record.request_hash !== requestHash) throw new CommerceError('idempotency_conflict', 409)
  return record
}

async function ensureOrder (db, catalog, snapshot) {
  const createdAt = snapshot.createdAt
  const reservationExpiry = createdAt + CHECKOUT_RECOVERY_TTL_SECONDS
  const statements = [db.prepare(`
    INSERT INTO orders (
      id, idempotency_key, catalog_release, currency, amount_total_minor, snapshot_json,
      payment_status, fulfillment_status, reservation_state, created_at, updated_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 'awaiting_payment', 'unreserved', ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).bind(snapshot.orderId, snapshot.idempotencyKey, snapshot.catalogRelease, snapshot.currency, snapshot.totalMinor, JSON.stringify(snapshot), createdAt, createdAt, reservationExpiry)]
  statements.push(db.prepare(`
    UPDATE orders SET reservation_state = 'reserved'
    WHERE id = ? AND reservation_state = 'unreserved'
  `).bind(snapshot.orderId))
  if (snapshot.stockMode === 'finite') {
    for (const item of snapshot.items) {
      statements.push(db.prepare(`
        INSERT INTO stock_reservations (order_id, product_id, quantity, status, expires_at, created_at, updated_at)
        SELECT ?, ?, ?, 'held', ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM stock_reservations WHERE order_id = ? AND product_id = ?
        )
      `).bind(snapshot.orderId, item.productId, item.quantity, reservationExpiry, createdAt, createdAt, snapshot.orderId, item.productId))
    }
  }
  try {
    await db.batch(statements)
  } catch (error) {
    const message = String(error?.message || '')
    if (message.includes('insufficient_stock')) throw new CommerceError('out_of_stock', 409)
    if (message.includes('inventory_not_configured')) throw new CommerceError('inventory_unavailable', 503)
    throw new CommerceError('order_persistence_failed', 503)
  }
}

export async function handleCheckout (request, env, catalog) {
  let buyerCookie
  try {
    if (request.method !== 'POST') return methodNotAllowed(['POST'])
    requireEnabledCatalog(catalog)
    if (!isSameOrigin(request, catalog.origin, await verifiedProxy(request, env))) throw new CommerceError('origin_not_allowed', 403)
    requireCheckoutAuthorization(catalog, env)
    const db = requireDatabase(env)
    const provider = createPaymentProvider(env)
    const { value } = await readJsonBody(request)
    const { items: cart, destination, quote, options } = normalizeCommerceRequest(value, { withQuote: true })
    const key = readIdempotencyKey(request)
    // Country and displayed quote are part of the request identity: changing either
    // requires a new key, while identical retries replay the stored order. The postal
    // code is left out so this pre-payment hash cannot be brute-forced back to it.
    // Options join the hash only when present, so older storefronts keep their identity.
    const requestHash = await sha256Hex(JSON.stringify({ items: cart, country: destination.country, quote, ...(Object.keys(options).length ? { options } : {}) }))
    const now = Math.floor(Date.now() / 1000)
    await consumeRateLimit(db, request, env, now)
    await expirePendingCheckouts(db, now)

    let record = await readRecord(db, key)
    let allowBuyerCapabilityCreation = false
    if (record && record.request_hash !== requestHash) throw new CommerceError('idempotency_conflict', 409)
    if (record?.expires_at <= now) throw new CommerceError('checkout_expired', 409)
    // Stripe can end a session early (expired webhook, manual expiry): no replay URL then.
    if (record?.order_payment_status && record.order_payment_status !== 'pending') throw new CommerceError('checkout_expired', 409)
    if (record?.status === 'ready' && record.checkout_url) {
      const snapshot = storedSnapshot(record)
      if (snapshot.orderId !== record.order_id || snapshot.idempotencyKey !== key) throw new CommerceError('order_snapshot_unavailable', 503)
      const capability = await resolveBuyerStatusCapability(db, request, snapshot.orderId, key, now)
      if (capability) buyerCookie = buyerStatusCookie(snapshot.orderId, capability.token, capability.stored.expires_at, now)
      return jsonResponse({ order_id: record.order_id, checkout_url: record.checkout_url, catalog_release: snapshot.catalogRelease }, 200, {
        ...(buyerCookie ? { 'set-cookie': buyerCookie } : {}),
        'referrer-policy': 'no-referrer'
      })
    }

    let snapshot
    if (record) {
      snapshot = storedSnapshot(record)
    } else {
      allowBuyerCapabilityCreation = true
      if (catalog.termsRequired && !options.termsAccepted) throw new CommerceError('terms_required', 400)
      const quoted = quoteOrder(catalog, cart, destination, crypto.randomUUID(), now, options.locale || 'es')
      if (!quoteMatches(quoted.totals, quote)) return jsonResponse({ error: 'quote_changed', quote: publicQuote(quoted.totals) }, 409)
      snapshot = quoted.snapshot
      if (options.locale) snapshot.locale = options.locale
      // Only meaningful when the shop invoices; ignored otherwise.
      if (options.invoiceRequested && catalog.invoice) snapshot.invoiceRequested = true
      // Proof of acceptance: the terms version in force and when the box was checked.
      if (catalog.termsRequired) snapshot.terms = { version: catalog.checkout.legalVersion, acceptedAt: now }
      // Audience: recorded for the contact registry; a consent is only what the buyer checked.
      if (catalog.audience && (options.audienceConsent || catalog.audience.customers)) {
        snapshot.audience = { consent: Boolean(options.audienceConsent), version: catalog.audience.version }
      }
      snapshot.totals = quoted.totals
      snapshot.totalMinor = quoted.totals.totalMinor
      snapshot.idempotencyKey = key
      record = await createRecord(db, key, requestHash, snapshot, now)
      snapshot = storedSnapshot(record)
    }
    if (snapshot.orderId !== record.order_id || snapshot.idempotencyKey !== key) throw new CommerceError('order_snapshot_unavailable', 503)
    const existingOrder = await db.prepare('SELECT payment_status FROM orders WHERE id = ?').bind(snapshot.orderId).first()
    if (existingOrder && existingOrder.payment_status !== 'pending') throw new CommerceError('checkout_expired', 409)
    await ensureOrder(db, catalog, snapshot)
    const capability = await resolveBuyerStatusCapability(db, request, snapshot.orderId, key, now, allowBuyerCapabilityCreation)
    if (capability) buyerCookie = buyerStatusCookie(snapshot.orderId, capability.token, capability.stored.expires_at, now)
    const session = await provider.createCheckoutSession({
      catalog,
      snapshot,
      providerIdempotencyKey: snapshot.orderId,
      testFailOnce: env.COMMERCE_ENV === 'test' && key.startsWith('test-timeout-once-'),
      testTimeoutAfterCreateOnce: env.COMMERCE_ENV === 'test' && key.startsWith('test-timeout-after-create-once-'),
      testReturnExpired: env.COMMERCE_ENV === 'test' && key.startsWith('test-session-expired-')
    })
    const persistedAt = Math.floor(Date.now() / 1000)
    const expired = await persistCheckoutSession(db, key, snapshot, session, env, persistedAt)
    if (expired) {
      const order = await db.prepare('SELECT id, snapshot_json FROM orders WHERE id = ?').bind(snapshot.orderId).first()
      if (!order) throw new CommerceError('order_not_found', 404)
      await applyPaymentState(db, order, { state: 'expired', sessionId: session.id }, persistedAt)
      throw new CommerceError('checkout_expired', 409)
    }
    return jsonResponse({ order_id: snapshot.orderId, checkout_url: session.url, catalog_release: snapshot.catalogRelease }, 201, {
      ...(buyerCookie ? { 'set-cookie': buyerCookie } : {}),
      'referrer-policy': 'no-referrer'
    })
  } catch (error) {
    const response = errorResponse(error)
    if (buyerCookie) {
      response.headers.set('set-cookie', buyerCookie)
      response.headers.set('referrer-policy', 'no-referrer')
    }
    return response
  }
}
