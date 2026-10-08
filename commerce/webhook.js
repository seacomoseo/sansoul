import { sha256Hex } from './catalog.js'
import { CommerceError, errorResponse, jsonResponse, methodNotAllowed, readJsonBody, requireDatabase } from './http.js'
import { getWebhookSecret } from './provider.js'
import { paymentStatements, WEBHOOK_CLAIMED_AT } from './orders.js'
import { verifyStripeSignature } from './signature.js'

const EVENT_ID = /^evt_[A-Za-z0-9]+$/
const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SESSION_ID = /^cs_(?:(?:test|live)_)?[A-Za-z0-9]+$/

function boundedText (value, maxLength) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  // Reject C0 and DEL characters after trimming.
  return text && text.length <= maxLength && !Array.from(text).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ? text : null
}

function deliveryDetails (object) {
  const customer = object.customer_details && typeof object.customer_details === 'object' ? object.customer_details : {}
  const shipping = object.shipping_details && typeof object.shipping_details === 'object' ? object.shipping_details : {}
  const address = shipping.address && typeof shipping.address === 'object' ? shipping.address : {}
  const email = boundedText(customer.email, 254)
  const details = {
    buyerName: boundedText(customer.name, 120),
    buyerEmail: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    buyerPhone: boundedText(customer.phone, 32),
    recipientName: boundedText(shipping.name, 120),
    line1: boundedText(address.line1, 200),
    line2: boundedText(address.line2, 200),
    city: boundedText(address.city, 100),
    state: boundedText(address.state, 100),
    postalCode: boundedText(address.postal_code, 32),
    countryCode: typeof address.country === 'string' && /^[A-Z]{2}$/.test(address.country) ? address.country : null
  }
  return Object.values(details).some(value => value !== null) ? details : null
}

function eventTarget (event) {
  const object = event.data.object
  const paymentIntentId = typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id || null
  switch (event.type) {
    case 'checkout.session.completed':
      return { state: object.payment_status === 'paid' ? 'paid' : 'pending', sessionId: object.id, paymentIntentId, deliveryDetails: deliveryDetails(object) }
    case 'checkout.session.async_payment_succeeded':
    case 'payment_intent.succeeded':
      return {
        state: 'paid',
        sessionId: object.object === 'checkout.session' ? object.id : null,
        paymentIntentId: object.id?.startsWith('pi_') ? object.id : paymentIntentId,
        ...(object.object === 'checkout.session' ? { deliveryDetails: deliveryDetails(object) } : {})
      }
    case 'checkout.session.async_payment_failed':
    case 'payment_intent.payment_failed':
      return { state: 'failed', sessionId: object.object === 'checkout.session' ? object.id : null, paymentIntentId: object.id?.startsWith('pi_') ? object.id : paymentIntentId }
    case 'checkout.session.expired':
      return { state: 'expired', sessionId: object.id, paymentIntentId }
    case 'charge.refunded': {
      if (!Number.isSafeInteger(object.amount_refunded) || object.amount_refunded < 0 || !Number.isSafeInteger(object.amount) || object.amount_refunded > object.amount) throw new CommerceError('invalid_refund_event')
      return { state: 'refund', refundAmount: object.amount_refunded, amount: object.amount, currency: object.currency, paymentIntentId }
    }
    default:
      return null
  }
}

async function findOrder (db, event, target) {
  const object = event.data.object
  const metadataOrderId = object.metadata?.commerce_order_id
  const clientReferenceId = object.client_reference_id
  if ((metadataOrderId != null && (typeof metadataOrderId !== 'string' || !ORDER_ID.test(metadataOrderId))) || (clientReferenceId != null && (typeof clientReferenceId !== 'string' || !ORDER_ID.test(clientReferenceId))) || (metadataOrderId && clientReferenceId && metadataOrderId !== clientReferenceId)) throw new CommerceError('payment_event_mismatch', 503)
  const orderId = metadataOrderId || clientReferenceId
  if (typeof orderId === 'string' && ORDER_ID.test(orderId)) {
    const order = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first()
    if (order) return order
  }
  if (typeof target.sessionId === 'string' && SESSION_ID.test(target.sessionId)) {
    const order = await db.prepare('SELECT * FROM orders WHERE session_id = ?').bind(target.sessionId).first()
    if (order) return order
  }
  const paymentIntentId = target.paymentIntentId || object.payment_intent
  if (typeof paymentIntentId === 'string' && /^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) {
    return db.prepare('SELECT * FROM orders WHERE payment_intent_id = ?').bind(paymentIntentId).first()
  }
  return null
}

function validateEventOrder (event, target, order) {
  const object = event.data.object
  const paymentIntentId = target.paymentIntentId || object.payment_intent
  const metadataOrderId = object.metadata?.commerce_order_id
  const clientReferenceId = object.client_reference_id
  if ((metadataOrderId != null && metadataOrderId !== order.id) || (clientReferenceId != null && clientReferenceId !== order.id)) throw new CommerceError('payment_event_mismatch', 503)
  if (event.type.startsWith('checkout.session.') && (metadataOrderId !== order.id || clientReferenceId !== order.id)) throw new CommerceError('payment_event_mismatch', 503)
  if (event.type.startsWith('payment_intent.') && metadataOrderId !== order.id) throw new CommerceError('payment_event_mismatch', 503)
  if (target.sessionId && order.session_id && target.sessionId !== order.session_id) throw new CommerceError('payment_event_mismatch', 503)
  if (paymentIntentId && order.payment_intent_id && paymentIntentId !== order.payment_intent_id) throw new CommerceError('payment_event_mismatch', 503)

  if (target.state === 'refund') {
    if (target.amount !== order.amount_total_minor || target.currency !== order.currency || target.refundAmount > order.amount_total_minor) throw new CommerceError('payment_event_mismatch', 503)
  } else if (event.type.startsWith('checkout.session.')) {
    if (object.amount_total !== order.amount_total_minor || object.currency !== order.currency) throw new CommerceError('payment_event_mismatch', 503)
  } else if (event.type.startsWith('payment_intent.')) {
    if (object.amount !== order.amount_total_minor || object.currency !== order.currency) throw new CommerceError('payment_event_mismatch', 503)
    if (target.state === 'paid' && object.amount_received !== order.amount_total_minor) throw new CommerceError('payment_event_mismatch', 503)
  }
}

function unmatchedRecovery (event, target) {
  const object = event.data.object
  return JSON.stringify({
    version: 1,
    target: {
      state: target.state,
      sessionId: target.sessionId || null,
      paymentIntentId: target.paymentIntentId || null,
      refundAmount: target.refundAmount ?? null,
      amount: target.amount ?? null,
      currency: target.currency || null
    },
    metadataOrderId: typeof object.metadata?.commerce_order_id === 'string' ? object.metadata.commerce_order_id : null,
    clientReferenceId: typeof object.client_reference_id === 'string' ? object.client_reference_id : null,
    amountTotal: Number.isSafeInteger(object.amount_total) ? object.amount_total : null,
    amountReceived: Number.isSafeInteger(object.amount_received) ? object.amount_received : null,
    amount: Number.isSafeInteger(object.amount) ? object.amount : null,
    currency: typeof object.currency === 'string' ? object.currency : null
  })
}

async function persistUnmatched (db, event, target, bodyHash, now) {
  await db.prepare(`
    INSERT INTO webhook_events (event_id, event_type, event_created, body_sha256, status, received_at, recovery_json)
    VALUES (?, ?, ?, ?, 'unmatched', ?, ?)
    ON CONFLICT(event_id) DO UPDATE SET
      event_type = excluded.event_type,
      event_created = excluded.event_created,
      body_sha256 = excluded.body_sha256,
      recovery_json = excluded.recovery_json,
      status = 'unmatched'
    WHERE webhook_events.status = 'unmatched'
  `).bind(event.id, event.type, event.created, bodyHash, now, unmatchedRecovery(event, target)).run()
}

async function applyEvent (db, event, bodyHash, order, target, now) {
  const eventStatus = target ? 'processed' : 'ignored'
  const statements = [db.prepare(`
    INSERT INTO webhook_events (event_id, event_type, event_created, body_sha256, status, received_at, processed_at)
    VALUES (?, ?, ?, ?, 'processed', ?, ${WEBHOOK_CLAIMED_AT})
    ON CONFLICT(event_id) DO UPDATE SET
      status = 'processed',
      processed_at = ${WEBHOOK_CLAIMED_AT}
    WHERE webhook_events.status = 'unmatched'
  `).bind(event.id, event.type, event.created, bodyHash, now)]
  if (target && order) statements.push(...paymentStatements(db, order, target, now, event.id))
  statements.push(db.prepare(`
    UPDATE webhook_events SET status = ?, processed_at = ?
    WHERE event_id = ? AND status = 'processed' AND processed_at = ${WEBHOOK_CLAIMED_AT}
  `).bind(eventStatus, now, event.id))
  const results = await db.batch(statements)
  return results?.[0]?.meta?.changes === 1
}

export async function replayUnmatchedWebhook (db, row, now = Math.floor(Date.now() / 1000)) {
  let recovery
  try {
    recovery = JSON.parse(row.recovery_json)
  } catch {
    return false
  }
  const target = recovery?.target
  if (recovery?.version !== 1 || !target || !['paid', 'pending', 'failed', 'expired', 'refund'].includes(target.state)) return false
  const object = {
    id: target.sessionId || target.paymentIntentId,
    client_reference_id: recovery.clientReferenceId,
    metadata: recovery.metadataOrderId ? { commerce_order_id: recovery.metadataOrderId } : {},
    payment_intent: target.paymentIntentId,
    payment_status: target.state === 'paid' ? 'paid' : 'unpaid',
    amount_total: recovery.amountTotal,
    amount_received: recovery.amountReceived,
    amount: target.amount ?? recovery.amount,
    amount_refunded: target.refundAmount,
    currency: target.currency || recovery.currency
  }
  const event = { id: row.event_id, type: row.event_type, created: row.event_created, data: { object } }
  const order = await findOrder(db, event, target)
  if (!order) return false
  validateEventOrder(event, target, order)
  return applyEvent(db, event, row.body_sha256, order, target, now)
}

export async function handleWebhook (request, env) {
  try {
    if (request.method !== 'POST') return methodNotAllowed(['POST'])
    const db = requireDatabase(env)
    const secret = getWebhookSecret(env)
    const { raw, value: event } = await readJsonBody(request, 65536)
    const signature = request.headers.get('stripe-signature')
    if (!await verifyStripeSignature(raw, signature, secret)) throw new CommerceError('invalid_signature', 400)
    if (!event || !EVENT_ID.test(event.id || '') || typeof event.type !== 'string' || event.type.length > 120 || !Number.isSafeInteger(event.created) || !event.data || !event.data.object || typeof event.data.object !== 'object' || Array.isArray(event.data.object)) throw new CommerceError('invalid_event')
    if (typeof event.livemode !== 'boolean' || event.livemode !== (env.COMMERCE_ENV === 'live')) throw new CommerceError('payment_event_mismatch', 503)

    const now = Math.floor(Date.now() / 1000)
    const bodyHash = await sha256Hex(raw)
    const existing = await db.prepare('SELECT status FROM webhook_events WHERE event_id = ?').bind(event.id).first()
    if (existing && existing.status !== 'unmatched') return jsonResponse({ received: true, duplicate: true })

    const target = eventTarget(event)
    if (!target) {
      const claimed = await applyEvent(db, event, bodyHash, null, null, now)
      return jsonResponse(claimed ? { received: true, ignored: true } : { received: true, duplicate: true })
    }
    const order = await findOrder(db, event, target)
    if (!order) {
      await persistUnmatched(db, event, target, bodyHash, now)
      return jsonResponse({ error: 'order_not_found' }, 503)
    }
    validateEventOrder(event, target, order)
    const claimed = await applyEvent(db, event, bodyHash, order, target, now)
    return jsonResponse(claimed ? { received: true } : { received: true, duplicate: true })
  } catch (error) {
    return errorResponse(error)
  }
}
