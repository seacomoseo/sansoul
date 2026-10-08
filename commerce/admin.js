import { applyPaymentState, expirePendingCheckouts, persistCheckoutSession } from './orders.js'
import { CommerceError, errorResponse, jsonResponse, methodNotAllowed, readJsonBody, requireDatabase } from './http.js'
import { createPaymentProvider } from './provider.js'
import { hmacSha256Hex } from './signature.js'
import { isCheckoutAuthorized, isSyntheticTestFixture } from './approval.js'
import { replayUnmatchedWebhook } from './webhook.js'

const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function authorized (request, env) {
  const expected = env.COMMERCE_ADMIN_TOKEN
  const supplied = request.headers.get('authorization')?.match(/^Bearer ([\x21-\x7e]{1,256})$/)?.[1]
  if (typeof expected !== 'string' || expected.length < 32) throw new CommerceError('admin_configuration_missing', 503)
  if (!supplied) throw new CommerceError('unauthorized', 401)
  const left = await hmacSha256Hex(expected, 'commerce-admin-token-check')
  const right = await hmacSha256Hex(supplied, 'commerce-admin-token-check')
  let mismatch = 0
  for (let index = 0; index < left.length; index++) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
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
    'sku', 'product_id', 'product_name', 'quantity', 'unit_amount_minor', 'line_total_minor'
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
    if (items.length === 0) rows.push([...base, '', '', '', '', '', ''])
    for (const item of items) {
      rows.push([...base, item.sku, item.productId, item.name, item.quantity, item.unitAmountMinor, item.lineTotalMinor])
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
      d.address_line1, d.address_line2, d.locality, d.administrative_area, d.postal_code, d.country_code
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
    ...rest
  } = order
  return {
    ...rest,
    snapshot: JSON.parse(order.snapshot_json),
    snapshot_json: undefined,
    delivery: source
      ? { source, buyer: { name, email, phone }, shipping: { recipient, line1, line2, locality, administrative_area: administrativeArea, postal_code: postalCode, country_code: countryCode } }
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

async function rotateCandidates (db, operation, selectSql, whereSql, timeColumn, idColumn, now) {
  const cursor = await db.prepare(`
    SELECT cursor_created_at, cursor_id FROM commerce_operation_cursors WHERE operation = ?
  `).bind(operation).first()
  if (!cursor) throw new CommerceError('operation_cursor_missing', 503)
  const select = async (direction, limit) => {
    const operator = direction === 'after' ? '>' : '<'
    const rows = await db.prepare(`
      ${selectSql} ${whereSql}
        AND (${timeColumn} ${operator} ? OR (${timeColumn} = ? AND ${idColumn} ${operator} ?))
      ORDER BY ${timeColumn} ASC, ${idColumn} ASC LIMIT ?
    `).bind(cursor.cursor_created_at, cursor.cursor_created_at, cursor.cursor_id, limit).all()
    return rows.results || []
  }
  const rows = await select('after', 25)
  if (rows.length < 25) rows.push(...await select('before', 25 - rows.length))
  if (rows.length === 0) {
    const reset = await db.prepare(`
      UPDATE commerce_operation_cursors SET cursor_created_at = 0, cursor_id = '', updated_at = ?
      WHERE operation = ? AND cursor_created_at = ? AND cursor_id = ?
    `).bind(now, operation, cursor.cursor_created_at, cursor.cursor_id).run()
    return { rows: [], contended: !reset.meta?.changes }
  }
  const last = rows.at(-1)
  const advanced = await db.prepare(`
    UPDATE commerce_operation_cursors SET cursor_created_at = ?, cursor_id = ?, updated_at = ?
    WHERE operation = ? AND cursor_created_at = ? AND cursor_id = ?
  `).bind(last.cursor_created_at, last.cursor_id, now, operation, cursor.cursor_created_at, cursor.cursor_id).run()
  return { rows: advanced.meta?.changes ? rows : [], contended: !advanced.meta?.changes }
}

async function reconcile (db, env, catalog, now) {
  await expirePendingCheckouts(db, now)
  const orderPage = await rotateCandidates(
    db,
    'orders',
    `SELECT o.*, i.idempotency_key AS recovery_key, i.status AS recovery_status,
      i.snapshot_json AS recovery_snapshot_json, i.expires_at AS recovery_expires_at,
      o.created_at AS cursor_created_at, o.id AS cursor_id
      FROM orders o LEFT JOIN commerce_idempotency i ON i.order_id = o.id`,
    'WHERE o.payment_status IN (\'pending\', \'failed\') AND (o.session_id IS NOT NULL OR i.status = \'creating\')',
    'o.created_at',
    'o.id',
    now
  )
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

  const unmatchedPage = await rotateCandidates(
    db,
    'unmatched_webhooks',
    'SELECT e.*, e.received_at AS cursor_created_at, e.event_id AS cursor_id FROM webhook_events e',
    'WHERE e.status = \'unmatched\' AND e.recovery_json IS NOT NULL',
    'e.received_at',
    'e.event_id',
    now
  )
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

async function notifierSend (env, item, attempts) {
  if (isSyntheticTestFixture(env)) {
    if (env.COMMERCE_FAKE_EMAIL_FAIL_FIRST === 'true' && attempts === 1) throw new Error('notifier_unavailable')
    return
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

async function dispatchOutbox (db, env, now) {
  await db.prepare(`
    UPDATE outbox SET status = 'pending', claimed_at = NULL, next_attempt_at = ?
    WHERE status = 'processing' AND claimed_at < ?
  `).bind(now, now - 300).run()
  const rows = await db.prepare(`
    SELECT event_key, order_id, event_type, payload_json, attempts
    FROM outbox WHERE status = 'pending' AND next_attempt_at <= ?
    ORDER BY created_at LIMIT 20
  `).bind(now).all()
  let delivered = 0
  let failed = 0
  for (const item of rows.results || []) {
    const claim = await db.prepare(`
      UPDATE outbox SET status = 'processing', attempts = attempts + 1, claimed_at = ?, updated_at = ?
      WHERE event_key = ? AND status = 'pending' AND next_attempt_at <= ?
    `).bind(now, now, item.event_key, now).run()
    if (!claim.meta?.changes) continue
    const attempts = item.attempts + 1
    try {
      await notifierSend(env, item, attempts)
      await db.prepare(`
        UPDATE outbox SET status = 'delivered', claimed_at = NULL, last_error = NULL, updated_at = ?
        WHERE event_key = ? AND status = 'processing'
      `).bind(now, item.event_key).run()
      delivered++
    } catch {
      const delay = Math.min(30 * (2 ** Math.min(attempts - 1, 7)), 3600)
      await db.prepare(`
        UPDATE outbox SET status = 'pending', claimed_at = NULL, next_attempt_at = ?, last_error = 'notifier_unavailable', updated_at = ?
        WHERE event_key = ? AND status = 'processing'
      `).bind(now + delay, now, item.event_key).run()
      failed++
    }
  }
  const pending = await db.prepare("SELECT COUNT(*) AS count FROM outbox WHERE status != 'delivered'").first()
  return jsonResponse({ attempted: delivered + failed, delivered, failed, pending: pending?.count || 0 })
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
    if (path === '/api/commerce/admin/reconcile' && request.method === 'POST') return await reconcile(db, env, catalog, now)
    if (path === '/api/commerce/admin/outbox/dispatch' && request.method === 'POST') return await dispatchOutbox(db, env, now)

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
