import { createGmailProvider } from '../forms/providers/gmail.js'
import { validAddress } from '../forms/mime.js'

// Merchant order notices through the forms Gmail provider (FORMS_GMAIL_CREDENTIALS,
// FORMS_GMAIL_DEFAULT or COMMERCE_NOTIFY_ACCOUNT) to COMMERCE_NOTIFY_TO. The body
// carries order, items, totals and the destination postal code only: buyer
// contact and street address stay in D1 and in the payment provider's dashboard,
// so no personal data lands in the sending mailbox.
const SUBJECTS = Object.freeze({
  'payment.paid': 'Nuevo pedido pagado',
  'payment.awaiting_address': 'Pedido pagado sin dirección de envío',
  'payment.destination_review': 'Pedido pagado: revisar el destino',
  'payment.inventory_exception': 'Pedido pagado: revisar existencias',
  'payment.partially_refunded': 'Reembolso parcial de un pedido',
  'payment.refunded': 'Pedido reembolsado'
})

const providers = new Map()

function provider (fetch) {
  if (!providers.has(fetch)) providers.set(fetch, createGmailProvider({ fetch }))
  return providers.get(fetch)
}

export function hasMailNotifier (env) {
  return typeof env.COMMERCE_NOTIFY_TO === 'string' && env.COMMERCE_NOTIFY_TO.split(',').map(value => value.trim()).filter(Boolean).every(validAddress)
}

function money (minor, currency, minorUnit = 2) {
  if (!Number.isSafeInteger(minor)) return '—'
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: currency.toUpperCase() }).format(minor / 10 ** minorUnit)
  } catch {
    return `${(minor / 10 ** minorUnit).toFixed(minorUnit)} ${currency.toUpperCase()}`
  }
}

function escapeHtml (value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

export function renderOrderNotice ({ item, order, site }) {
  const subject = `${SUBJECTS[item.event_type] || `Aviso de pedido (${item.event_type})`} · ${site}`
  if (!order) {
    const text = `${subject}\n\nPedido ${item.order_id}: no se encontró en la base de datos. Revísalo en el panel de pagos.\n`
    return { subject, text, html: `<p>${escapeHtml(text)}</p>` }
  }
  const snapshot = JSON.parse(order.snapshot_json)
  const totals = snapshot.totals || {}
  const currency = order.currency || snapshot.currency || 'eur'
  const unit = snapshot.minorUnit ?? 2
  const lines = (snapshot.items || []).map(line => `- ${line.quantity} × ${line.name || line.sku} (${line.sku}) — ${money(line.lineTotalMinor, currency, unit)}`)
  const destination = [order.postal_code && `CP ${order.postal_code}`, order.country_code || totals.destination?.country].filter(Boolean).join(' · ')
  const rows = [
    ['Pedido', order.id],
    ['Pago', order.payment_intent_id || order.session_id || '—'],
    ['Estado', `${order.payment_status} / ${order.fulfillment_status}`],
    ['Destino', destination || 'pendiente'],
    ['Subtotal', money(totals.subtotalMinor ?? snapshot.subtotalMinor, currency, unit)],
    ['Envío', money(totals.shippingTotalMinor, currency, unit)],
    ['Impuestos', money(totals.taxMinor, currency, unit)],
    ['Total', money(order.amount_total_minor, currency, unit)],
    ...(order.refund_amount_minor ? [['Reembolsado', money(order.refund_amount_minor, currency, unit)]] : [])
  ]
  const note = 'Nombre, contacto y dirección del comprador: panel de Stripe → Pagos (busca el identificador de pago).'
  const text = [subject, '', ...rows.map(([key, value]) => `${key}: ${value}`), '', 'Artículos:', ...lines, '', note, ''].join('\n')
  const html = `<p><strong>${escapeHtml(subject)}</strong></p><table>${rows.map(([key, value]) => `<tr><th align="left">${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}</table>` +
    `<p>Artículos:</p><ul>${lines.map(line => `<li>${escapeHtml(line.slice(2))}</li>`).join('')}</ul><p>${escapeHtml(note)}</p>`
  return { subject, text, html }
}

// Throws on any failure so the outbox reschedules with backoff (at-least-once).
export async function sendOrderNotice ({ env, db, item, site, fetch = (...args) => globalThis.fetch(...args) }) {
  if (!hasMailNotifier(env)) throw new Error('notifier_unavailable')
  const order = await db.prepare(`
    SELECT o.id, o.session_id, o.payment_intent_id, o.currency, o.amount_total_minor, o.snapshot_json,
      o.payment_status, o.fulfillment_status, o.refund_amount_minor, d.postal_code, d.country_code
    FROM orders o LEFT JOIN order_delivery_details d ON d.order_id = o.id WHERE o.id = ?
  `).bind(item.order_id).first()
  const gmail = provider(fetch)
  const authority = await gmail.authority(env, { account: env.COMMERCE_NOTIFY_ACCOUNT || '' })
  const { subject, text, html } = renderOrderNotice({ item, order, site })
  await gmail.send({
    env,
    authority,
    signal: AbortSignal.timeout(15000),
    beforeSend: async () => {},
    message: {
      fromName: site,
      to: env.COMMERCE_NOTIFY_TO.split(',').map(value => value.trim()).filter(Boolean),
      subject,
      text,
      html,
      messageId: `commerce-${item.event_key}`.replace(/[^A-Za-z0-9.-]/g, '-')
    }
  })
}
