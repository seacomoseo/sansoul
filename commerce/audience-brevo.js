// Brevo sync for the audience module: contacts API only (no sending quota used).
// Consent lives in D1; Brevo mirrors it. Errors carry codes only, never data.
import { CommerceError, jsonResponse } from './http.js'

const API = 'https://api.brevo.com/v3'
export const AUDIENCE_SYNC = 'audience.sync'
export const AUDIENCE_UNSUBSCRIBE = 'audience.unsubscribe'
const UNSUBSCRIBE_EVENTS = new Set(['unsubscribe', 'unsubscribed', 'spam', 'complaint'])

export function brevoConfigured (env, catalog) {
  return Boolean(env.BREVO_API_KEY && catalog?.audience?.brevoListId)
}

async function brevo (fetch, env, path, body) {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  })
  if (response.ok) return
  // 400 "already in list"/"not in list" are idempotent outcomes; auth and quota are not.
  const detail = await response.json().catch(() => ({}))
  if (response.status === 400 && /already|not exist|not in/i.test(detail?.message || '')) return
  const error = new Error('brevo_error')
  error.code = response.status === 401 || response.status === 403 ? 'brevo_auth' : response.status === 429 ? 'brevo_quota' : 'brevo_error'
  throw error
}

// Outbox handler. A missing key or list is a no-op so a project can enable audience first.
export async function syncAudienceEvent ({ env, db, item, catalog, fetch = (...args) => globalThis.fetch(...args) }) {
  if (!brevoConfigured(env, catalog)) return
  const order = await db.prepare('SELECT d.buyer_email AS email FROM order_delivery_details d WHERE d.order_id = ?').bind(item.order_id).first()
  const email = item.event_type === AUDIENCE_UNSUBSCRIBE
    ? (JSON.parse(item.payload_json).email || '')
    : String(order?.email || '').trim().toLowerCase()
  if (!email) return
  const contact = await db.prepare('SELECT * FROM contacts WHERE email = ?').bind(email).first()
  if (!contact) return
  const listId = catalog.audience.brevoListId
  if (item.event_type === AUDIENCE_UNSUBSCRIBE) {
    if (!contact.unsubscribed_at) return
    await brevo(fetch, env, `/contacts/lists/${listId}/contacts/remove`, { emails: [email] })
    return
  }
  // Re-check at delivery time: a later unsubscribe must never be undone by a late sync.
  if (!contact.consent_promotions || contact.unsubscribed_at) return
  await brevo(fetch, env, '/contacts', {
    email,
    updateEnabled: true,
    listIds: [listId],
    attributes: {
      NOMBRE: contact.name || '',
      IDIOMA: contact.locale || '',
      ORIGEN: contact.source,
      FECHA_CONSENTIMIENTO: new Date(contact.consent_at * 1000).toISOString(),
      VERSION_CONSENTIMIENTO: contact.consent_version || ''
    }
  })
}

export function enqueueUnsubscribe (db, contact, now) {
  const eventKey = `${contact.consent_ref}:${AUDIENCE_UNSUBSCRIBE}:${now}`
  return db.prepare(`
    INSERT OR IGNORE INTO outbox (event_key, order_id, event_type, payload_json, status, attempts, next_attempt_at, created_at, updated_at)
    SELECT ?, id, ?, ?, 'pending', 0, ?, ?, ? FROM orders WHERE id = ?
  `).bind(eventKey, AUDIENCE_UNSUBSCRIBE, JSON.stringify({ eventKey, orderId: contact.consent_ref, eventType: AUDIENCE_UNSUBSCRIBE, email: contact.email }), now, now, now, contact.consent_ref)
}

function sameSecret (a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Brevo marketing webhook (unsubscribed / spam). Secret travels in `?s=` (Brevo cannot sign).
export async function handleBrevoWebhook (request, env, catalog) {
  if (!catalog?.audience || !env.BREVO_WEBHOOK_SECRET || request.method !== 'POST') throw new CommerceError('not_found', 404)
  if (!sameSecret(new URL(request.url).searchParams.get('s') || '', env.BREVO_WEBHOOK_SECRET)) throw new CommerceError('forbidden', 403)
  const body = await request.json().catch(() => null)
  const event = String(body?.event || '').toLowerCase()
  const email = String(body?.email || '').trim().toLowerCase()
  if (!UNSUBSCRIBE_EVENTS.has(event) || !email || email.length > 320) return jsonResponse({ ignored: true })
  const now = Math.floor(Date.now() / 1000)
  await env.COMMERCE_DB.prepare('UPDATE contacts SET unsubscribed_at = ?, updated_at = ? WHERE email = ? AND unsubscribed_at IS NULL').bind(now, now, email).run()
  return jsonResponse({ ok: true })
}
