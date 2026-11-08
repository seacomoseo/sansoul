import { sha256Hex } from './catalog.js'
import { CommerceError, errorResponse, jsonResponse, methodNotAllowed, requireDatabase } from './http.js'

const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/
const PAYMENT_STATUSES = new Set(['pending', 'paid', 'failed', 'expired', 'partially_refunded', 'refunded'])
export const BUYER_STATUS_TTL_SECONDS = 90 * 24 * 60 * 60

export async function createBuyerStatusCapability () {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const token = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return { token, hash: await sha256Hex(token) }
}

export function buyerStatusCookie (orderId, token, expiresAt, now) {
  const maxAge = Math.max(0, Math.min(BUYER_STATUS_TTL_SECONDS, expiresAt - now))
  return `__Secure-commerce-status-${orderId}=${token}; Path=/api/commerce; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
}

export async function persistBuyerStatusCapability (db, orderId, idempotencyKey, capabilityHash, now) {
  if (!ORDER_ID.test(orderId || '') || !IDEMPOTENCY_KEY.test(idempotencyKey || '') || !/^[a-f0-9]{64}$/.test(capabilityHash || '')) throw new CommerceError('buyer_status_persistence_failed', 503)
  await db.prepare(`
    INSERT OR IGNORE INTO order_status_capabilities (
      capability_hash, order_id, idempotency_key, session_id, created_at, updated_at, expires_at
    )
    SELECT ?, orders.id, idempotency.idempotency_key, orders.session_id, ?, ?, ?
    FROM orders JOIN commerce_idempotency idempotency ON idempotency.idempotency_key = orders.idempotency_key
    WHERE orders.id = ? AND idempotency.idempotency_key = ? AND idempotency.order_id = orders.id
  `).bind(capabilityHash, now, now, now + BUYER_STATUS_TTL_SECONDS, orderId, idempotencyKey).run()
  const row = await db.prepare(`
    SELECT capabilities.capability_hash, capabilities.idempotency_key, capabilities.session_id,
      capabilities.expires_at, orders.session_id AS order_session_id
    FROM order_status_capabilities capabilities
    JOIN orders ON orders.id = capabilities.order_id AND orders.idempotency_key = capabilities.idempotency_key
    WHERE capabilities.order_id = ?
  `).bind(orderId).first()
  if (!row || row.idempotency_key !== idempotencyKey || row.session_id !== row.order_session_id || !Number.isSafeInteger(row.expires_at)) throw new CommerceError('buyer_status_persistence_failed', 503)
  if (row.capability_hash !== capabilityHash || row.expires_at <= now) return null
  return row
}

function readCapabilityCookie (request, orderId) {
  const header = request.headers.get('cookie') || ''
  if (header.length > 8192) return null
  const name = `__Secure-commerce-status-${orderId}`
  let token = null
  for (const part of header.split(';')) {
    const item = part.trim()
    if (!item.startsWith(`${name}=`)) continue
    if (token !== null) return null
    token = item.slice(name.length + 1)
  }
  return /^[a-f0-9]{64}$/.test(token || '') ? token : null
}

export async function resolveBuyerStatusCapability (db, request, orderId, idempotencyKey, now, allowCreate = false) {
  const suppliedToken = readCapabilityCookie(request, orderId)
  if (suppliedToken) {
    const suppliedHash = await sha256Hex(suppliedToken)
    const row = await db.prepare(`
      SELECT capabilities.capability_hash, capabilities.idempotency_key, capabilities.session_id,
        capabilities.expires_at, orders.session_id AS order_session_id
      FROM order_status_capabilities capabilities
      JOIN orders ON orders.id = capabilities.order_id AND orders.idempotency_key = capabilities.idempotency_key
      WHERE capabilities.order_id = ? AND capabilities.idempotency_key = ?
        AND capabilities.capability_hash = ? AND capabilities.expires_at > ?
        AND capabilities.session_id IS orders.session_id
    `).bind(orderId, idempotencyKey, suppliedHash, now).first()
    if (row) return { token: suppliedToken, hash: suppliedHash, stored: row }
  }

  if (!allowCreate) return null
  const capability = await createBuyerStatusCapability()
  const stored = await persistBuyerStatusCapability(db, orderId, idempotencyKey, capability.hash, now)
  return stored ? { ...capability, stored } : null
}

export async function handleOrderStatus (request, env) {
  try {
    if (request.method !== 'GET') return methodNotAllowed(['GET'])
    const match = new URL(request.url).pathname.match(/^\/api\/commerce\/status\/([0-9a-f-]{36})\/?$/i)
    const orderId = match?.[1].toLowerCase()
    if (!ORDER_ID.test(orderId || '')) throw new CommerceError('order_not_found', 404)
    const token = readCapabilityCookie(request, orderId)
    if (!token) throw new CommerceError('order_not_found', 404)
    const db = requireDatabase(env)
    const row = await db.prepare(`
      SELECT orders.id, orders.payment_status
      FROM order_status_capabilities capabilities
      JOIN orders ON orders.id = capabilities.order_id AND orders.idempotency_key = capabilities.idempotency_key
      WHERE capabilities.order_id = ? AND capabilities.capability_hash = ?
        AND capabilities.expires_at > ? AND capabilities.session_id IS orders.session_id
    `).bind(orderId, await sha256Hex(token), Math.floor(Date.now() / 1000)).first()
    if (!row) throw new CommerceError('order_not_found', 404)
    if (!PAYMENT_STATUSES.has(row.payment_status)) throw new CommerceError('order_status_unavailable', 503)
    return jsonResponse({ order_id: row.id, payment_status: row.payment_status }, 200, {
      'referrer-policy': 'no-referrer',
      'cross-origin-resource-policy': 'same-origin',
      vary: 'cookie'
    })
  } catch (error) {
    return errorResponse(error)
  }
}
