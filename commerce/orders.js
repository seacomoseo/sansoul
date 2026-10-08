// The claim marker is visible only inside the atomic D1 batch before finalization.
import { CommerceError } from './http.js'

export const WEBHOOK_CLAIMED_AT = -1
const SESSION_ID = /^cs_(?:(?:test|live)_)?[A-Za-z0-9]+$/

function inventoryExceptionOutbox (db, now, orderId = null, eventGuard = '', eventArgs = []) {
  return db.prepare(`
    INSERT OR IGNORE INTO outbox (event_key, order_id, event_type, payload_json, status, attempts, next_attempt_at, created_at, updated_at)
    SELECT orders.id || ':payment.inventory_exception', orders.id, 'payment.inventory_exception',
      json_object(
        'eventKey', orders.id || ':payment.inventory_exception',
        'orderId', orders.id,
        'eventType', 'payment.inventory_exception'
      ), 'pending', 0, ?, ?, ?
    FROM orders
    WHERE payment_status IN ('paid', 'partially_refunded') AND fulfillment_status = 'inventory_exception'
      ${orderId ? 'AND orders.id = ?' : ''}${eventGuard}
  `).bind(now, now, now, ...(orderId ? [orderId] : []), ...eventArgs)
}

export function paymentStatements (db, order, target, now, eventId = null) {
  const refundAmount = target.state === 'refund' ? target.refundAmount : null
  const paymentIntentId = typeof target.paymentIntentId === 'string' && /^pi_[A-Za-z0-9]+$/.test(target.paymentIntentId) ? target.paymentIntentId : null
  const sessionId = typeof target.sessionId === 'string' && /^cs_(?:(?:test|live)_)?[A-Za-z0-9]+$/.test(target.sessionId) ? target.sessionId : null
  const stockMode = JSON.parse(order.snapshot_json).stockMode
  const eventGuard = eventId
    ? ` AND EXISTS (SELECT 1 FROM webhook_events WHERE event_id = ? AND status = 'processed' AND processed_at = ${WEBHOOK_CLAIMED_AT})`
    : ''
  const eventArgs = eventId ? [eventId] : []
  const statements = [db.prepare(`
    UPDATE orders SET
      session_id = COALESCE(session_id, ?),
      payment_intent_id = COALESCE(payment_intent_id, ?),
      refund_amount_minor = CASE WHEN ? IS NULL THEN refund_amount_minor ELSE MAX(refund_amount_minor, ?) END,
      payment_status = CASE
        WHEN ? = 'refund' THEN CASE WHEN MAX(refund_amount_minor, ?) >= amount_total_minor THEN 'refunded' ELSE 'partially_refunded' END
        WHEN ? = 'paid' THEN CASE WHEN payment_status IN ('refunded', 'partially_refunded') THEN payment_status ELSE 'paid' END
        WHEN ? = 'failed' THEN CASE WHEN payment_status = 'pending' THEN 'failed' ELSE payment_status END
        WHEN ? = 'expired' THEN CASE WHEN payment_status = 'pending' THEN 'expired' ELSE payment_status END
        ELSE payment_status
      END,
      fulfillment_status = CASE
        WHEN ? = 'refund' AND MAX(refund_amount_minor, ?) >= amount_total_minor AND fulfillment_status IN ('awaiting_payment', 'ready', 'inventory_exception') THEN 'cancelled'
        WHEN payment_status = 'partially_refunded' AND fulfillment_status IN ('awaiting_payment', 'ready') THEN 'inventory_exception'
        WHEN ? = 'refund' AND MAX(refund_amount_minor, ?) < amount_total_minor AND fulfillment_status IN ('awaiting_payment', 'ready') THEN 'inventory_exception'
        WHEN ? = 'paid' AND payment_status NOT IN ('refunded', 'partially_refunded') AND fulfillment_status = 'awaiting_payment' THEN
          CASE WHEN ? = 0 OR (
            SELECT COUNT(*) FROM stock_reservations
            WHERE order_id = orders.id AND status = 'held'
          ) = json_array_length(json_extract(orders.snapshot_json, '$.items')) THEN 'ready' ELSE 'inventory_exception' END
        ELSE fulfillment_status
      END,
      updated_at = ?
    WHERE id = ?${eventGuard}
  `).bind(sessionId, paymentIntentId, refundAmount, refundAmount, target.state, refundAmount, target.state, target.state, target.state, target.state, refundAmount, target.state, refundAmount, target.state, stockMode === 'finite' ? 1 : 0, now, order.id, ...eventArgs)]

  if (target.deliveryDetails) {
    const details = target.deliveryDetails
    statements.push(db.prepare(`
      INSERT INTO order_delivery_details (
        order_id, source, buyer_name, buyer_email, buyer_phone, recipient_name,
        address_line1, address_line2, locality, administrative_area, postal_code, country_code, updated_at
      )
      SELECT ?, 'stripe_checkout', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      FROM orders WHERE id = ?${eventGuard}
      ON CONFLICT(order_id) DO UPDATE SET
        buyer_name = COALESCE(excluded.buyer_name, order_delivery_details.buyer_name),
        buyer_email = COALESCE(excluded.buyer_email, order_delivery_details.buyer_email),
        buyer_phone = COALESCE(excluded.buyer_phone, order_delivery_details.buyer_phone),
        recipient_name = COALESCE(excluded.recipient_name, order_delivery_details.recipient_name),
        address_line1 = COALESCE(excluded.address_line1, order_delivery_details.address_line1),
        address_line2 = COALESCE(excluded.address_line2, order_delivery_details.address_line2),
        locality = COALESCE(excluded.locality, order_delivery_details.locality),
        administrative_area = COALESCE(excluded.administrative_area, order_delivery_details.administrative_area),
        postal_code = COALESCE(excluded.postal_code, order_delivery_details.postal_code),
        country_code = COALESCE(excluded.country_code, order_delivery_details.country_code),
        updated_at = excluded.updated_at
    `).bind(order.id, details.buyerName, details.buyerEmail, details.buyerPhone, details.recipientName, details.line1, details.line2, details.city, details.state, details.postalCode, details.countryCode, now, order.id, ...eventArgs))
  }

  if (sessionId) {
    statements.push(db.prepare(`
      UPDATE order_status_capabilities SET session_id = COALESCE(session_id, ?), updated_at = ?
      WHERE order_id = ? AND (session_id IS NULL OR session_id = ?)${eventGuard}
    `).bind(sessionId, now, order.id, sessionId, ...eventArgs))
  }

  if (target.state === 'paid') {
    const eventKey = `${order.id}:payment.paid`
    statements.push(db.prepare(`
      UPDATE stock_reservations SET status = 'committed', updated_at = ?
      WHERE order_id = ? AND status = 'held'
        AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND payment_status = 'paid' AND fulfillment_status = 'ready')
        ${eventGuard}
    `).bind(now, order.id, order.id, ...eventArgs))
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO outbox (event_key, order_id, event_type, payload_json, status, attempts, next_attempt_at, created_at, updated_at)
      SELECT ?, id, 'payment.paid', ?, 'pending', 0, ?, ?, ?
      FROM orders WHERE id = ? AND payment_status = 'paid' AND fulfillment_status = 'ready'${eventGuard}
    `).bind(eventKey, JSON.stringify({ eventKey, orderId: order.id, eventType: 'payment.paid' }), now, now, now, order.id, ...eventArgs))
  } else if (target.state === 'failed' || target.state === 'expired') {
    statements.push(db.prepare(`
      UPDATE stock_reservations SET status = ?, updated_at = ?
      WHERE order_id = ? AND status = 'held'
        AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND payment_status = ?)
        ${eventGuard}
    `).bind(target.state === 'expired' ? 'expired' : 'released', now, order.id, order.id, target.state, ...eventArgs))
  } else if (target.state === 'refund') {
    const eventKey = `${order.id}:payment.refund:${refundAmount}`
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO outbox (event_key, order_id, event_type, payload_json, status, attempts, next_attempt_at, created_at, updated_at)
      SELECT ?, id,
        CASE WHEN refund_amount_minor >= amount_total_minor THEN 'payment.refunded' ELSE 'payment.partially_refunded' END,
        json_object(
          'eventKey', ?,
          'orderId', id,
          'eventType', CASE WHEN refund_amount_minor >= amount_total_minor THEN 'payment.refunded' ELSE 'payment.partially_refunded' END,
          'refundAmountMinor', refund_amount_minor
        ), 'pending', 0, ?, ?, ?
      FROM orders WHERE id = ? AND refund_amount_minor = ?${eventGuard}
    `).bind(eventKey, eventKey, now, now, now, order.id, refundAmount, ...eventArgs))
    statements.push(db.prepare(`
      UPDATE stock_reservations SET status = 'released', updated_at = ?
      WHERE order_id = ? AND status = 'held'
        AND EXISTS (
          SELECT 1 FROM orders
          WHERE id = ? AND payment_status = 'refunded' AND refund_amount_minor >= amount_total_minor
        )
        ${eventGuard}
    `).bind(now, order.id, order.id, ...eventArgs))
  }
  statements.push(inventoryExceptionOutbox(db, now, order.id, eventGuard, eventArgs))
  return statements
}

export async function applyPaymentState (db, order, target, now = Math.floor(Date.now() / 1000)) {
  await db.batch(paymentStatements(db, order, target, now))
}

export async function persistCheckoutSession (db, key, snapshot, session, env, now) {
  const expired = session.sessionStatus === 'expired' || session.expiresAt <= now
  if (!SESSION_ID.test(session.id || '') || !Number.isSafeInteger(session.expiresAt) || (!expired && (session.sessionStatus !== 'open' || typeof session.url !== 'string' || !session.url)) || session.amountTotal !== snapshot.totalMinor || session.currency !== snapshot.currency || session.livemode !== (env.COMMERCE_ENV === 'live') || session.clientReferenceId !== snapshot.orderId || session.commerceOrderId !== snapshot.orderId) throw new CommerceError('payment_session_mismatch', 502)
  const status = expired ? 'creating' : 'ready'
  const checkoutUrl = expired ? null : session.url
  await db.batch([
    db.prepare(`
      UPDATE commerce_idempotency
      SET status = ?, session_id = ?, checkout_url = ?, updated_at = ?, expires_at = ?
      WHERE idempotency_key = ? AND order_id = ? AND (session_id IS NULL OR session_id = ?)
    `).bind(status, session.id, checkoutUrl, now, session.expiresAt, key, snapshot.orderId, session.id),
    db.prepare(`
      UPDATE orders SET session_id = ?, payment_intent_id = COALESCE(?, payment_intent_id), updated_at = ?, expires_at = ?
      WHERE id = ? AND (session_id IS NULL OR session_id = ?)
    `).bind(session.id, session.paymentIntentId, now, session.expiresAt, snapshot.orderId, session.id),
    db.prepare(`
      UPDATE order_status_capabilities SET session_id = ?, updated_at = ?
      WHERE order_id = ? AND idempotency_key = ? AND (session_id IS NULL OR session_id = ?)
    `).bind(session.id, now, snapshot.orderId, key, session.id),
    db.prepare(`
      UPDATE stock_reservations SET expires_at = ?, updated_at = ?
      WHERE order_id = ? AND status = 'held'
    `).bind(session.expiresAt, now, snapshot.orderId)
  ])
  const row = await db.prepare('SELECT * FROM commerce_idempotency WHERE idempotency_key = ?').bind(key).first()
  if (row?.order_id !== snapshot.orderId || row?.session_id !== session.id || row?.checkout_url !== checkoutUrl || row?.status !== status || row?.expires_at !== session.expiresAt) throw new CommerceError('checkout_persistence_failed', 503)
  const order = await db.prepare('SELECT id, session_id, amount_total_minor, currency, expires_at FROM orders WHERE id = ?').bind(snapshot.orderId).first()
  if (order?.id !== snapshot.orderId || order.session_id !== session.id || order.amount_total_minor !== session.amountTotal || order.currency !== session.currency || order.expires_at !== session.expiresAt) throw new CommerceError('checkout_persistence_failed', 503)
  const capability = await db.prepare('SELECT order_id, idempotency_key, session_id FROM order_status_capabilities WHERE order_id = ?').bind(snapshot.orderId).first()
  if (capability?.order_id !== snapshot.orderId || capability.idempotency_key !== key || capability.session_id !== session.id) throw new CommerceError('checkout_persistence_failed', 503)
  return expired
}

export async function expirePendingCheckouts (db, now = Math.floor(Date.now() / 1000)) {
  const partial = await db.prepare(`
    SELECT 1 FROM orders
    WHERE payment_status = 'partially_refunded' AND fulfillment_status IN ('awaiting_payment', 'ready')
    LIMIT 1
  `).first()
  if (partial) {
    await db.batch([
      db.prepare(`
        UPDATE orders SET fulfillment_status = 'inventory_exception', updated_at = ?
        WHERE payment_status = 'partially_refunded' AND fulfillment_status IN ('awaiting_payment', 'ready')
      `).bind(now),
      inventoryExceptionOutbox(db, now)
    ])
  }

  const due = await db.prepare(`
    SELECT 1 FROM orders WHERE payment_status = 'pending' AND expires_at <= ?
    UNION ALL
    SELECT 1 FROM stock_reservations WHERE status = 'held' AND expires_at <= ?
    LIMIT 1
  `).bind(now, now).first()
  if (!due) return

  await db.batch([
    db.prepare(`
      UPDATE stock_reservations SET status = 'expired', updated_at = ?
      WHERE status = 'held' AND EXISTS (
        SELECT 1 FROM orders
        WHERE id = stock_reservations.order_id AND payment_status = 'pending'
          AND (orders.expires_at <= ? OR stock_reservations.expires_at <= ?)
      )
    `).bind(now, now, now),
    db.prepare(`
      UPDATE orders SET payment_status = 'expired', updated_at = ?
      WHERE payment_status = 'pending' AND (
        expires_at <= ? OR EXISTS (
          SELECT 1 FROM stock_reservations
          WHERE order_id = orders.id AND status = 'expired'
        )
      )
    `).bind(now, now)
  ])
}
