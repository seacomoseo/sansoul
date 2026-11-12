import { applyPaymentState, expirePendingCheckouts, persistCheckoutSession } from './orders.js'
import { CommerceError, errorResponse, jsonResponse, methodNotAllowed, readJsonBody, requireDatabase } from './http.js'
import { createPaymentProvider } from './provider.js'
import { rotateCandidates } from './maintenance.js'
// Admin tokens are compared as fixed-size SHA-256 digests; no HMAC key import
// or token-dependent early exit, and no credentials retained in module caches.
const tokenEncoder = new TextEncoder()
import { isCheckoutAuthorized, isSyntheticTestFixture } from './approval.js'
import { replayUnmatchedWebhook } from './webhook.js'
import { hasMailNotifier, loadOrder, sendOrderNotice } from './notifier.js'
import { InvoiceError, getOrIssueInvoice, invoiceFilename, paymentTime, renderInvoicePdf } from './invoice.js'

const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function authorized (request, env) {
  const expected = env.COMMERCE_ADMIN_TOKEN
  const supplied = request.headers.get('authorization')?.match(/^Bearer ([\x21-\x7e]{1,256})$/)?.[1]
  if (typeof expected !== 'string' || expected.length < 32) throw new CommerceError('admin_configuration_missing', 503)
  if (!supplied) throw new CommerceError('unauthorized', 401)
  const left = new Uint8Array(await crypto.subtle.digest('SHA-256', tokenEncoder.encode(expected)))
  const right = new Uint8Array(await crypto.subtle.digest('SHA-256', tokenEncoder.encode(supplied)))
  let mismatch = 0
  for (let index = 0; index < left.length; index++) mismatch |= left[index] ^ right[index]
  return mismatch === 0
}

function csvCell (value) {
  let text = String(value ?? '')
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

function csvResponse (orders, nextCursor) {
  const rows = [[
    'order_id', 'session_id', 'payment_intent_id', 'catalog_release', 'currency', 'amount_total_minor',
    'refund_amount_minor', 'payment_status', 'fulfillment_status', 'created_at', 'updated_at', 'expires_at',
    'snapshot_json', 'buyer_name', 'buyer_email', 'buyer_phone', 'recipient_name', 'address_line1',
    'address_line2', 'locality', 'administrative_area', 'postal_code', 'country_code',
    'sku', 'product_id', 'product_name', 'quantity', 'unit_amount_minor', 'line_total_minor',
    // 14.4, appended so existing column positions do not move.
    'buyer_business_name', 'buyer_tax_id', 'buyer_tax_id_type', 'recipient_phone', 'delivery_notes', 'invoice_requested', 'locale'
  ]]
  for (const order of orders) {
    const base = [
      order.id, order.session_id, order.payment_intent_id, order.catalog_release, order.currency,
      order.amount_total_minor, order.refund_amount_minor, order.payment_status, order.fulfillment_status,
      order.created_at, order.updated_at, order.expires_at, order.snapshot_json,
      order.buyer_name, order.buyer_email, order.buyer_phone, order.recipient_name,
      order.address_line1, order.address_line2, order.locality, order.administrative_area,
      order.postal_code, order.country_code
    ]
    const snapshot = JSON.parse(order.snapshot_json)
    const items = Array.isArray(snapshot?.items) ? snapshot.items : []
    const extra = [order.buyer_business_name, order.buyer_tax_id, order.buyer_tax_id_type, order.recipient_phone, order.delivery_notes, snapshot?.invoiceRequested ? 1 : 0, snapshot?.locale || '']
    if (items.length === 0) rows.push([...base, '', '', '', '', '', '', ...extra])
    for (const item of items) {
      rows.push([...base, item.sku, item.productId, item.name, item.quantity, item.unitAmountMinor, item.lineTotalMinor, ...extra])
    }
  }
  const csv = rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="commerce-orders.csv"',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-next-cursor': nextCursor || ''
    }
  })
}

async function listOrders (db, url, defaultLimit = 50) {
  const limitText = url.searchParams.get('limit') || String(defaultLimit)
  const limit = Number(limitText)
  if (!/^\d{1,3}$/.test(limitText) || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new CommerceError('invalid_limit')
  const paymentStatus = url.searchParams.get('payment_status')
  const fulfillmentStatus = url.searchParams.get('fulfillment_status')
  const validPayments = ['pending', 'paid', 'failed', 'expired', 'partially_refunded', 'refunded']
  const validFulfillment = ['awaiting_payment', 'ready', 'manufacturing', 'shipped', 'cancelled', 'inventory_exception']
  if (paymentStatus && !validPayments.includes(paymentStatus)) throw new CommerceError('invalid_payment_status')
  if (fulfillmentStatus && !validFulfillment.includes(fulfillmentStatus)) throw new CommerceError('invalid_fulfillment_status')
  const cursorText = url.searchParams.get('cursor')
  let cursor = null
  if (cursorText) {
    const match = cursorText.match(/^(\d{1,12}):([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i)
    if (!match || !Number.isSafeInteger(Number(match[1]))) throw new CommerceError('invalid_cursor')
    cursor = { createdAt: Number(match[1]), id: match[2] }
  }
  const rows = await db.prepare(`
    SELECT o.id, o.session_id, o.payment_intent_id, o.catalog_release, o.currency, o.amount_total_minor,
      o.snapshot_json, o.payment_status, o.fulfillment_status, o.refund_amount_minor, o.created_at, o.updated_at, o.expires_at,
      d.source AS delivery_source, d.buyer_name, d.buyer_email, d.buyer_phone, d.recipient_name,
      d.address_line1, d.address_line2, d.locality, d.administrative_area, d.postal_code, d.country_code,
      d.buyer_business_name, d.buyer_tax_id, d.buyer_tax_id_type, d.recipient_phone, d.delivery_notes
    FROM orders o LEFT JOIN order_delivery_details d ON d.order_id = o.id
    WHERE (? IS NULL OR o.payment_status = ?) AND (? IS NULL OR o.fulfillment_status = ?)
      AND (? IS NULL OR o.created_at < ? OR (o.created_at = ? AND o.id < ?))
    ORDER BY o.created_at DESC, o.id DESC LIMIT ?
  `).bind(paymentStatus, paymentStatus, fulfillmentStatus, fulfillmentStatus, cursor?.createdAt ?? null, cursor?.createdAt ?? null, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1).all()
  const result = rows.results || []
  const hasMore = result.length > limit
  const orders = result.slice(0, limit)
  const last = orders.at(-1)
  return { orders, nextCursor: hasMore && last ? `${last.created_at}:${last.id}` : null }
}

function adminOrder (order) {
  const {
    delivery_source: source,
    buyer_name: name,
    buyer_email: email,
    buyer_phone: phone,
    recipient_name: recipient,
    address_line1: line1,
    address_line2: line2,
    locality,
    administrative_area: administrativeArea,
    postal_code: postalCode,
    country_code: countryCode,
    buyer_business_name: businessName,
    buyer_tax_id: taxId,
    buyer_tax_id_type: taxIdType,
    recipient_phone: recipientPhone,
    delivery_notes: notes,
    ...rest
  } = order
  return {
    ...rest,
    snapshot: JSON.parse(order.snapshot_json),
    snapshot_json: undefined,
    delivery: source
      ? {
          source,
          buyer: { name, email, phone, business_name: businessName ?? null, tax_id: taxId ?? null, tax_id_type: taxIdType ?? null },
          shipping: { recipient, line1, line2, locality, administrative_area: administrativeArea, postal_code: postalCode, country_code: countryCode, phone: recipientPhone ?? null, notes: notes ?? null }
        }
      : null
  }
}

async function transitionOrder (db, orderId, from, to, now) {
  if (to === 'shipped') {
    const delivery = await db.prepare(`
      SELECT order_id FROM order_delivery_details
      WHERE order_id = ? AND recipient_name IS NOT NULL AND address_line1 IS NOT NULL
        AND locality IS NOT NULL AND postal_code IS NOT NULL AND country_code IS NOT NULL
    `).bind(orderId).first()
    if (!delivery) throw new CommerceError('delivery_details_missing', 409)
  }
  const result = await db.prepare(`
    UPDATE orders SET fulfillment_status = ?, updated_at = ?
    WHERE id = ? AND payment_status = 'paid' AND fulfillment_status = ?
  `).bind(to, now, orderId, from).run()
  if (result.meta?.changes) return jsonResponse({ order_id: orderId, fulfillment_status: to })
  const order = await db.prepare('SELECT id FROM orders WHERE id = ?').bind(orderId).first()
  if (!order) throw new CommerceError('order_not_found', 404)
  throw new CommerceError('invalid_order_transition', 409)
}

async function cancelPartialRefund (db, orderId, now) {
  const eventKey = `${orderId}:fulfillment.partial_refund_cancelled`
  await db.batch([
    db.prepare(`
      UPDATE orders SET fulfillment_status = 'cancelled', updated_at = ?
      WHERE id = ? AND payment_status = 'partially_refunded' AND fulfillment_status = 'inventory_exception'
    `).bind(now, orderId),
    db.prepare(`
      INSERT OR IGNORE INTO outbox (event_key, order_id, event_type, payload_json, status, attempts, next_attempt_at, created_at, updated_at)
      SELECT ?, id, 'fulfillment.partial_refund_cancelled', ?, 'pending', 0, ?, ?, ?
      FROM orders
      WHERE id = ? AND payment_status = 'partially_refunded' AND fulfillment_status = 'cancelled'
        AND changes() > 0
    `).bind(eventKey, JSON.stringify({ eventKey, orderId, eventType: 'fulfillment.partial_refund_cancelled' }), now, now, now, orderId),
    db.prepare(`
      UPDATE stock_reservations SET status = 'released', updated_at = ?
      WHERE order_id = ? AND status = 'held' AND changes() > 0
    `).bind(now, orderId)
  ])

  const order = await db.prepare('SELECT payment_status, fulfillment_status FROM orders WHERE id = ?').bind(orderId).first()
  if (!order) throw new CommerceError('order_not_found', 404)
  if (order.payment_status === 'partially_refunded' && order.fulfillment_status === 'cancelled') {
    return jsonResponse({ order_id: orderId, fulfillment_status: 'cancelled' })
  }
  throw new CommerceError('invalid_order_transition', 409)
}

async function updateInventory (request, db, catalog, now) {
  if (!catalog.enabled || catalog.stockMode !== 'finite') throw new CommerceError('finite_inventory_disabled', 409)
  const { value } = await readJsonBody(request, 2048)
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2 || !ORDER_ID.test(value.product_id || '') || !Number.isSafeInteger(value.on_hand) || value.on_hand < 0) throw new CommerceError('invalid_inventory')
  if (!catalog.products.some(product => product.id === value.product_id)) throw new CommerceError('product_not_found', 404)
  try {
    await db.prepare(`
      INSERT INTO inventory (product_id, on_hand, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(product_id) DO UPDATE SET on_hand = excluded.on_hand, updated_at = excluded.updated_at
    `).bind(value.product_id, value.on_hand, now).run()
  } catch (error) {
    if (String(error?.message || '').includes('inventory_below_commitments')) throw new CommerceError('inventory_below_commitments', 409)
    throw new CommerceError('inventory_persistence_failed', 503)
  }
  return jsonResponse({ product_id: value.product_id, on_hand: value.on_hand })
}

export const RECONCILE_BATCH_SIZE = 1

async function reconcile (db, env, catalog, now, operation) {
  if (operation === 'expiration') {
    const page = await expirePendingCheckouts(db, now)
    return jsonResponse({ operation, checked: page.rows.length, has_more: page.hasMore, skipped_concurrent: Number(page.contended) })
  }
  const emptyPage = { rows: [], contended: false, hasMore: false }
  const orderPage = operation === 'orders' ? await rotateCandidates(
    db,
    'orders',
    `SELECT o.*, i.idempotency_key AS recovery_key, i.status AS recovery_status,
      i.snapshot_json AS recovery_snapshot_json, i.expires_at AS recovery_expires_at,
      o.created_at AS cursor_created_at, o.id AS cursor_id
      FROM orders o INDEXED BY orders_maintenance_rotation LEFT JOIN commerce_idempotency i ON i.order_id = o.id`,
    'WHERE o.payment_status IN (\'pending\', \'failed\', \'partially_refunded\') AND o.payment_status IN (\'pending\', \'failed\') AND (o.session_id IS NOT NULL OR i.status = \'creating\')',
    'o.created_at',
    'o.id',
    now
  ) : emptyPage
  let provider
  const getProvider = () => (provider ||= createPaymentProvider(env))
  let updated = 0
  let recoveredSessions = 0
  let deferred = 0
  let failed = 0
  for (const selected of orderPage.rows) {
    const order = await db.prepare('SELECT * FROM orders WHERE id = ? AND payment_status IN (\'pending\', \'failed\')').bind(selected.id).first()
    if (!order) continue
    if (!order.session_id) {
      const idempotency = await db.prepare('SELECT * FROM commerce_idempotency WHERE order_id = ?').bind(order.id).first()
      if (!idempotency || idempotency.status !== 'creating' || idempotency.expires_at <= now || !isCheckoutAuthorized(catalog, env)) {
        deferred++
        continue
      }
      try {
        const snapshot = JSON.parse(idempotency.snapshot_json)
        if (snapshot.orderId !== order.id || snapshot.idempotencyKey !== idempotency.idempotency_key) throw new Error('order_snapshot_unavailable')
        const session = await getProvider().createCheckoutSession({ catalog, snapshot, providerIdempotencyKey: order.id })
        const expired = await persistCheckoutSession(db, idempotency.idempotency_key, snapshot, session, env, now)
        if (expired) {
          const persistedOrder = await db.prepare('SELECT id, snapshot_json FROM orders WHERE id = ?').bind(order.id).first()
          await applyPaymentState(db, persistedOrder, { state: 'expired', sessionId: session.id, paymentIntentId: session.paymentIntentId }, now)
          updated++
        } else recoveredSessions++
      } catch {
        failed++
      }
      continue
    }
    try {
      const session = await getProvider().retrieveCheckoutSession(order.session_id)
      if (session.id !== order.session_id || session.amountTotal !== order.amount_total_minor || session.currency !== order.currency || session.livemode !== (env.COMMERCE_ENV === 'live') || session.clientReferenceId !== order.id || session.commerceOrderId !== order.id || (order.payment_intent_id && session.paymentIntentId !== order.payment_intent_id)) throw new CommerceError('payment_reconciliation_mismatch', 503)
      let target
      if (session.paymentStatus === 'paid') target = { state: 'paid', sessionId: session.id, paymentIntentId: session.paymentIntentId }
      else if (session.sessionStatus === 'expired') target = { state: 'expired', sessionId: session.id, paymentIntentId: session.paymentIntentId }
      else if (session.sessionStatus === 'complete') target = { state: 'pending', sessionId: session.id, paymentIntentId: session.paymentIntentId }
      if (target) {
        await applyPaymentState(db, order, target, now)
        updated++
      }
    } catch {
      failed++
    }
  }

  const unmatchedPage = operation === 'unmatched_webhooks' ? await rotateCandidates(
    db,
    'unmatched_webhooks',
    'SELECT e.*, e.received_at AS cursor_created_at, e.event_id AS cursor_id FROM webhook_events e INDEXED BY webhook_unmatched_rotation',
    'WHERE e.status = \'unmatched\' AND e.recovery_json IS NOT NULL',
    'e.received_at',
    'e.event_id',
    now
  ) : emptyPage
  let unmatchedRecovered = 0
  for (const event of unmatchedPage.rows) {
    try {
      if (await replayUnmatchedWebhook(db, event, now)) unmatchedRecovered++
      else deferred++
    } catch {
      failed++
    }
  }
  return jsonResponse({
    operation,
    has_more: orderPage.hasMore || unmatchedPage.hasMore,
    checked: orderPage.rows.length,
    updated,
    recovered_sessions: recoveredSessions,
    deferred,
    failed,
    unmatched_checked: unmatchedPage.rows.length,
    unmatched_recovered: unmatchedRecovered,
    skipped_concurrent: Number(orderPage.contended) + Number(unmatchedPage.contended)
  }, failed ? 503 : 200)
}

async function notifierSend (env, item, attempts, db, options) {
  if (isSyntheticTestFixture(env)) {
    if (env.COMMERCE_FAKE_EMAIL_FAIL_FIRST === 'true' && attempts === 1) throw new Error('notifier_unavailable')
    return
  }
  // A service binding wins; otherwise mail the merchant through the forms Gmail provider.
  if ((!env.COMMERCE_NOTIFIER || typeof env.COMMERCE_NOTIFIER.fetch !== 'function') && hasMailNotifier(env)) {
    return await sendOrderNotice({ env, db, item, site: options.site, catalog: options.catalog, fetch: options.fetch })
  }
  if (!env.COMMERCE_NOTIFIER || typeof env.COMMERCE_NOTIFIER.fetch !== 'function') throw new Error('notifier_unavailable')
  const response = await env.COMMERCE_NOTIFIER.fetch('https://commerce-notifier/outbox', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: item.payload_json,
    signal: AbortSignal.timeout(5000)
  })
  if (!response.ok) throw new Error('notifier_unavailable')
}

// One notification per call. Stale recovery selects one lease and CAS resets it.
const OUTBOX_DISPATCH_LIMIT = 1

async function dispatchOutbox (db, env, now, options = {}) {
  const stale = await db.prepare(`
    SELECT event_key, claimed_at FROM outbox INDEXED BY outbox_expired_claims
    WHERE status = 'processing' AND claimed_at < ?
    ORDER BY claimed_at, event_key LIMIT 1
  `).bind(now - 300).first()
  if (stale) {
    await db.prepare(`
      UPDATE outbox SET status = 'pending', claimed_at = NULL, next_attempt_at = ?, updated_at = ?
      WHERE event_key = ? AND status = 'processing' AND claimed_at = ? AND claimed_at < ?
    `).bind(now, now, stale.event_key, stale.claimed_at, now - 300).run()
  }
  const rows = await db.prepare(`
    SELECT event_key, order_id, event_type, payload_json, attempts
    FROM outbox INDEXED BY outbox_due_notifications WHERE status = 'pending' AND next_attempt_at <= ?
    ORDER BY next_attempt_at, event_key LIMIT 2
  `).bind(now).all()
  let delivered = 0
  let failed = 0
  for (const item of (rows.results || []).slice(0, OUTBOX_DISPATCH_LIMIT)) {
    const claim = await db.prepare(`
      UPDATE outbox SET status = 'processing', attempts = attempts + 1, claimed_at = ?, updated_at = ?
      WHERE event_key = ? AND status = 'pending' AND attempts = ? AND next_attempt_at <= ?
    `).bind(now, now, item.event_key, item.attempts, now).run()
    if (!claim.meta?.changes) continue
    const attempts = item.attempts + 1
    try {
      await notifierSend(env, item, attempts, db, options)
      const ack = await db.prepare(`
        UPDATE outbox SET status = 'delivered', claimed_at = NULL, last_error = NULL, updated_at = ?
        WHERE event_key = ? AND status = 'processing' AND claimed_at = ? AND attempts = ?
      `).bind(now, item.event_key, now, attempts).run()
      if (!ack.meta?.changes) throw new Error('outbox_claim_lost')
      delivered++
    } catch (error) {
      const delay = Math.min(30 * (2 ** Math.min(attempts - 1, 7)), 3600)
      // Provider codes only (e.g. gmail_grant_invalid); never messages with data.
      const code = /^[a-z0-9_]{1,64}$/.test(error?.code || '') ? error.code : 'notifier_unavailable'
      await db.prepare(`
        UPDATE outbox SET status = 'pending', claimed_at = NULL, next_attempt_at = ?, last_error = ?, updated_at = ?
        WHERE event_key = ? AND status = 'processing' AND claimed_at = ? AND attempts = ?
      `).bind(now + delay, code, now, item.event_key, now, attempts).run()
      failed++
    }
  }
  // Bounded presence probe, not an exact count; includes delayed/fresh leases.
  const remaining = await db.prepare("SELECT event_key FROM outbox INDEXED BY outbox_undelivered WHERE status != 'delivered' LIMIT 1").first()
  return jsonResponse({ attempted: delivered + failed, delivered, failed, has_more: !!remaining })
}

// Pull consumer protocol for notifiers that cannot be a Worker service binding (e.g. the
// operator's mail relay on a host without open ports). Same at-least-once semantics as
// dispatchOutbox: claim one due item with a lease, deliver, then ack (delivered) or nack
// (rescheduled with backoff). A lost ack leaves the lease to expire and the item is resent;
// receivers deduplicate by event_key.
const OUTBOX_LEASE_SECONDS = 300

async function claimOutbox (db, now) {
  const stale = await db.prepare(`
    SELECT event_key, claimed_at FROM outbox INDEXED BY outbox_expired_claims
    WHERE status = 'processing' AND claimed_at < ?
    ORDER BY claimed_at, event_key LIMIT 1
  `).bind(now - OUTBOX_LEASE_SECONDS).first()
  if (stale) {
    await db.prepare(`
      UPDATE outbox SET status = 'pending', claimed_at = NULL, next_attempt_at = ?, updated_at = ?
      WHERE event_key = ? AND status = 'processing' AND claimed_at = ? AND claimed_at < ?
    `).bind(now, now, stale.event_key, stale.claimed_at, now - OUTBOX_LEASE_SECONDS).run()
  }
  const item = await db.prepare(`
    SELECT event_key, order_id, event_type, payload_json, attempts
    FROM outbox INDEXED BY outbox_due_notifications WHERE status = 'pending' AND next_attempt_at <= ?
    ORDER BY next_attempt_at, event_key LIMIT 1
  `).bind(now).first()
  if (!item) return jsonResponse({ item: null })
  const claim = await db.prepare(`
    UPDATE outbox SET status = 'processing', attempts = attempts + 1, claimed_at = ?, updated_at = ?
    WHERE event_key = ? AND status = 'pending' AND attempts = ? AND next_attempt_at <= ?
  `).bind(now, now, item.event_key, item.attempts, now).run()
  if (!claim.meta?.changes) return jsonResponse({ item: null, contended: true })
  const order = await db.prepare(`
    SELECT o.id, o.session_id, o.payment_intent_id, o.catalog_release, o.currency, o.amount_total_minor,
      o.snapshot_json, o.payment_status, o.fulfillment_status, o.refund_amount_minor, o.created_at, o.updated_at, o.expires_at,
      d.source AS delivery_source, d.buyer_name, d.buyer_email, d.buyer_phone, d.recipient_name,
      d.address_line1, d.address_line2, d.locality, d.administrative_area, d.postal_code, d.country_code,
      d.buyer_business_name, d.buyer_tax_id, d.buyer_tax_id_type, d.recipient_phone, d.delivery_notes
    FROM orders o LEFT JOIN order_delivery_details d ON d.order_id = o.id WHERE o.id = ?
  `).bind(item.order_id).first()
  return jsonResponse({
    item: {
      event_key: item.event_key,
      event_type: item.event_type,
      attempts: item.attempts + 1,
      claimed_at: now,
      payload: JSON.parse(item.payload_json),
      order: order ? adminOrder(order) : null
    }
  })
}

async function ackOutbox (request, db, now) {
  const { value } = await readJsonBody(request, 1024)
  const valid = value && typeof value === 'object' && typeof value.event_key === 'string' && value.event_key.length <= 200 &&
    Number.isSafeInteger(value.claimed_at) && Number.isSafeInteger(value.attempts) && value.attempts >= 1 &&
    typeof value.delivered === 'boolean'
  if (!valid) throw new CommerceError('invalid_ack', 400)
  const result = value.delivered
    ? await db.prepare(`
        UPDATE outbox SET status = 'delivered', claimed_at = NULL, last_error = NULL, updated_at = ?
        WHERE event_key = ? AND status = 'processing' AND claimed_at = ? AND attempts = ?
      `).bind(now, value.event_key, value.claimed_at, value.attempts).run()
    : await db.prepare(`
        UPDATE outbox SET status = 'pending', claimed_at = NULL, next_attempt_at = ?, last_error = 'notifier_unavailable', updated_at = ?
        WHERE event_key = ? AND status = 'processing' AND claimed_at = ? AND attempts = ?
      `).bind(now + Math.min(30 * (2 ** Math.min(value.attempts - 1, 7)), 3600), now, value.event_key, value.claimed_at, value.attempts).run()
  // acked=false: the lease was lost (expired and re-claimed); the receiver must rely on event_key dedupe.
  return jsonResponse({ acked: Boolean(result.meta?.changes) })
}

// The invoice of a paid order as a PDF; issues it (next number of the series) if it
// does not exist yet. Same idempotent path as the order notices.
async function invoicePdf (db, catalog, orderId) {
  if (!catalog?.invoice) throw new CommerceError('invoice_not_configured', 404)
  const order = await loadOrder(db, orderId)
  if (!order) throw new CommerceError('not_found', 404)
  let row
  try {
    row = await getOrIssueInvoice(db, { order, details: order, config: catalog.invoice, issuedAt: await paymentTime(db, order) })
  } catch (error) {
    if (error instanceof InvoiceError) throw new CommerceError(error.code, 409)
    throw error
  }
  return new Response(renderInvoicePdf(row), {
    headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${invoiceFilename(row)}"`, 'cache-control': 'no-store' }
  })
}

function siteName (catalog) {
  try {
    return new URL(catalog?.origin).host || 'SanSoul'
  } catch {
    return 'SanSoul'
  }
}

// Cron drain (project Worker `scheduled`): at most `limit` notices per tick, each
// with the same lease/backoff as the admin dispatch. Reconciliation stays manual.
export async function dispatchScheduledNotices (env, catalog, { limit = 3, fetch, now = () => Math.floor(Date.now() / 1000) } = {}) {
  if (!env.COMMERCE_DB) return { attempted: 0, delivered: 0, failed: 0, has_more: false }
  const summary = { attempted: 0, delivered: 0, failed: 0, has_more: false }
  for (let turn = 0; turn < limit; turn++) {
    const result = await (await dispatchOutbox(env.COMMERCE_DB, env, now(), { site: siteName(catalog), catalog, fetch })).json()
    summary.attempted += result.attempted
    summary.delivered += result.delivered
    summary.failed += result.failed
    summary.has_more = result.has_more
    if (!result.delivered) break
  }
  return summary
}

export async function handleAdmin (request, env, catalog) {
  try {
    const allowed = await authorized(request, env)
    if (!allowed) throw new CommerceError('unauthorized', 401)
    const db = requireDatabase(env)
    const url = new URL(request.url)
    const path = url.pathname.replace(/\/$/, '')
    const now = Math.floor(Date.now() / 1000)

    if (path === '/api/commerce/admin/orders' && request.method === 'GET') {
      const page = await listOrders(db, url)
      return jsonResponse({ orders: page.orders.map(adminOrder), next_cursor: page.nextCursor })
    }
    if (path === '/api/commerce/admin/export.csv' && request.method === 'GET') {
      const page = await listOrders(db, url, 100)
      return csvResponse(page.orders, page.nextCursor)
    }
    if (path === '/api/commerce/admin/inventory' && request.method === 'POST') return await updateInventory(request, db, catalog, now)
    if (path === '/api/commerce/admin/reconcile' && request.method === 'POST') {
      const operation = url.searchParams.get('operation') || 'orders'
      if (!['orders', 'expiration', 'unmatched_webhooks'].includes(operation)) throw new CommerceError('invalid_operation', 400)
      return await reconcile(db, env, catalog, now, operation)
    }
    if (path === '/api/commerce/admin/outbox/dispatch' && request.method === 'POST') return await dispatchOutbox(db, env, now, { site: siteName(catalog), catalog })
    if (path === '/api/commerce/admin/outbox/claim' && request.method === 'POST') return await claimOutbox(db, now)
    if (path === '/api/commerce/admin/outbox/ack' && request.method === 'POST') return await ackOutbox(request, db, now)

    const invoice = path.match(/^\/api\/commerce\/admin\/orders\/([0-9a-f-]+)\/invoice\.pdf$/i)
    if (invoice && request.method === 'GET' && ORDER_ID.test(invoice[1])) return await invoicePdf(db, catalog, invoice[1])

    const match = path.match(/^\/api\/commerce\/admin\/orders\/([0-9a-f-]+)\/(manufacture|ship|cancel-partial)$/i)
    if (match && request.method === 'POST' && ORDER_ID.test(match[1])) {
      const action = match[2].toLowerCase()
      if (action === 'cancel-partial') return await cancelPartialRefund(db, match[1], now)
      return await transitionOrder(db, match[1], action === 'manufacture' ? 'ready' : 'manufacturing', action === 'manufacture' ? 'manufacturing' : 'shipped', now)
    }
    if (path.startsWith('/api/commerce/admin/') && !['GET', 'POST'].includes(request.method)) return methodNotAllowed(['GET', 'POST'])
    throw new CommerceError('not_found', 404)
  } catch (error) {
    return errorResponse(error)
  }
}
