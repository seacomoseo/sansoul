import { createGmailProvider } from '../forms/providers/gmail.js'
import { validAddress } from '../forms/mime.js'
import { InvoiceError, countryName, formatMoney, getOrIssueInvoice, invoiceFilename, paymentTime, renderInvoicePdf } from './invoice.js'

// Merchant order notices through the forms Gmail provider (FORMS_GMAIL_CREDENTIALS,
// FORMS_GMAIL_DEFAULT or COMMERCE_NOTIFY_ACCOUNT) to COMMERCE_NOTIFY_TO. By default
// the body carries order, items, totals and the destination postal code only: buyer
// contact and street address stay in D1 and in the payment provider's dashboard,
// so no personal data lands in the sending mailbox. With `order_notices` enabled in
// data/commerce.yml (catalog.notices) the notice also carries the buyer's contact and
// delivery address, the invoice PDF is attached to the paid notice, and a
// confirmation (with the same invoice) goes to the buyer as its own outbox event.
const SUBJECTS = Object.freeze({
  'payment.paid': 'Nuevo pedido pagado',
  'payment.awaiting_address': 'Pedido pagado sin dirección de envío',
  'payment.destination_review': 'Pedido pagado: revisar el destino',
  'payment.inventory_exception': 'Pedido pagado: revisar existencias',
  'payment.partially_refunded': 'Reembolso parcial de un pedido',
  'payment.refunded': 'Pedido reembolsado'
})

const EXPLAIN = Object.freeze({
  'payment.paid': 'El pago se ha completado. Ya puedes preparar y enviar el pedido con los datos de abajo.',
  'payment.awaiting_address': 'El pago se ha completado pero aún no tenemos la dirección de envío. Consúltala en el panel de pagos antes de enviar.',
  'payment.destination_review': 'El pago se ha completado, pero el destino está fuera de la política de envío. Revísalo antes de preparar el pedido.',
  'payment.inventory_exception': 'El pago se ha completado, pero hay un problema de existencias. Revísalo antes de preparar el pedido.',
  'payment.partially_refunded': 'Se ha devuelto una parte del importe de este pedido.',
  'payment.refunded': 'Se ha devuelto el importe completo de este pedido.'
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
  return Number.isSafeInteger(minor) ? formatMoney(minor, currency, minorUnit, 'es') : '—'
}

function escapeHtml (value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

const CELL = 'padding:6px 10px;border-bottom:1px solid #e5e5e5;vertical-align:top'
const TABLE = 'border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;margin:0 0 16px'

// Email-safe HTML tables (inline styles only). `head`: header cells; `rows`: arrays of
// cells (numeric columns right-aligned via `right`); `foot`: [label, value, strong] rows
// whose label spans every column but the last.
function htmlTable ({ head = [], rows = [], foot = [], right = [] }) {
  const align = index => right.includes(index) ? ';text-align:right;white-space:nowrap' : ';text-align:left'
  const cols = Math.max(head.length, ...rows.map(row => row.length), 2)
  return `<table cellpadding="0" cellspacing="0" style="${TABLE}">` +
    (head.length ? `<thead><tr>${head.map((cell, i) => `<th style="${CELL}${align(i)};background:#f4f4f4">${escapeHtml(cell)}</th>`).join('')}</tr></thead>` : '') +
    `<tbody>${rows.map(row => `<tr>${row.map((cell, i) => `<td style="${CELL}${align(i)}">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}` +
    foot.map(([label, value, strong]) => `<tr><td colspan="${cols - 1}" style="${CELL};text-align:right${strong ? ';font-weight:bold' : ''}">${escapeHtml(label)}</td><td style="${CELL};text-align:right;white-space:nowrap${strong ? ';font-weight:bold' : ''}">${escapeHtml(value)}</td></tr>`).join('') +
    '</tbody></table>'
}

function keyValueTable (rows, title) {
  return (title ? `<p style="font-family:Arial,sans-serif;margin:0 0 6px"><strong>${escapeHtml(title)}</strong></p>` : '') +
    `<table cellpadding="0" cellspacing="0" style="${TABLE}">${rows.map(([key, value]) => `<tr><th style="${CELL};text-align:left;background:#f4f4f4">${escapeHtml(key)}</th><td style="${CELL}">${escapeHtml(value)}</td></tr>`).join('')}</table>`
}

function taxLabel (totals, total) {
  return totals.subtotalMinor + totals.shippingTotalMinor === total ? 'IVA incluido' : 'IVA'
}

const BUYER_EVENT = 'buyer.confirmation'

const BUYER_TEXT = Object.freeze({
  es: {
    subject: site => `Hemos recibido tu pedido · ${site}`,
    greeting: name => name ? `Hola ${name},` : 'Hola,',
    intro: 'Gracias por tu compra. Hemos recibido el pago de tu pedido.',
    items: 'Resumen del pedido:',
    shipping: 'Envío',
    subtotal: 'Subtotal',
    tax: 'IVA',
    taxIncluded: 'IVA incluido',
    colItem: 'Artículo',
    colQty: 'Cant.',
    colPrice: 'Precio',
    total: 'Total',
    destination: 'Dirección de envío:',
    invoice: 'Adjuntamos la factura en PDF.',
    reply: 'Si necesitas algo, responde a este correo.'
  },
  en: {
    subject: site => `We received your order · ${site}`,
    greeting: name => name ? `Hello ${name},` : 'Hello,',
    intro: 'Thank you for your purchase. We have received the payment for your order.',
    items: 'Order summary:',
    shipping: 'Shipping',
    subtotal: 'Subtotal',
    tax: 'VAT',
    taxIncluded: 'VAT included',
    colItem: 'Item',
    colQty: 'Qty',
    colPrice: 'Price',
    total: 'Total',
    destination: 'Shipping address:',
    invoice: 'The invoice is attached as a PDF.',
    reply: 'If you need anything, reply to this email.'
  }
})

function addressLines (order, language = 'es') {
  return [
    order.recipient_name || order.buyer_name,
    order.address_line1,
    order.address_line2,
    [order.postal_code, order.locality].filter(Boolean).join(' '),
    order.administrative_area,
    order.country_code && countryName(order.country_code, language)
  ].filter(Boolean)
}

export function renderOrderNotice ({ item, order, site, merchantDetails = false, invoiceNote = null }) {
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
  const buyer = [
    ['Nombre', order.buyer_name],
    ['Correo', order.buyer_email],
    ['Teléfono', order.buyer_phone]
  ].filter(([, value]) => value)
  const shipTo = addressLines(order)
  const blocks = []
  if (merchantDetails) {
    if (buyer.length || shipTo.length) {
      if (buyer.length) blocks.push({ title: 'Comprador', rows: buyer.map(([key, value]) => [key, value]) })
      if (shipTo.length) blocks.push({ title: 'Enviar a', lines: shipTo })
    } else {
      blocks.push({ title: 'Comprador', lines: ['Sin datos de entrega guardados (aún no han llegado o ya se borraron). Consúltalos en el panel de pagos.'] })
    }
  }
  const note = merchantDetails ? invoiceNote : 'Nombre, contacto y dirección del comprador: panel de Stripe → Pagos (busca el identificador de pago).'
  const text = [subject, ...(EXPLAIN[item.event_type] ? ['', EXPLAIN[item.event_type]] : []), '', ...rows.map(([key, value]) => `${key}: ${value}`), '', 'Artículos:', ...lines, '',
    ...blocks.flatMap(block => [`${block.title}:`, ...(block.rows ? block.rows.map(([key, value]) => `${key}: ${value}`) : block.lines), '']),
    ...(note ? [note, ''] : [])].join('\n')
  const foot = [
    ['Subtotal', money(totals.subtotalMinor ?? snapshot.subtotalMinor, currency, unit)],
    ['Envío', money(totals.shippingTotalMinor, currency, unit)],
    [taxLabel(totals, order.amount_total_minor), money(totals.taxMinor, currency, unit)],
    ...(order.refund_amount_minor ? [['Reembolsado', money(order.refund_amount_minor, currency, unit)]] : []),
    ['Total', money(order.amount_total_minor, currency, unit), true]
  ]
  const html = `<p style="font-family:Arial,sans-serif;font-size:16px;margin:0 0 6px"><strong>${escapeHtml(subject)}</strong></p>` +
    (EXPLAIN[item.event_type] ? `<p style="font-family:Arial,sans-serif;font-size:14px;margin:0 0 16px">${escapeHtml(EXPLAIN[item.event_type])}</p>` : '') +
    keyValueTable(rows.slice(0, 4)) +
    htmlTable({
      head: ['Artículo', 'Cant.', 'Precio'],
      rows: (snapshot.items || []).map(line => [`${line.name || line.sku} (${line.sku})`, String(line.quantity), money(line.lineTotalMinor, currency, unit)]),
      foot,
      right: [1, 2]
    }) +
    blocks.map(block => block.rows ? keyValueTable(block.rows, block.title) : htmlTable({ head: [block.title], rows: block.lines.map(line => [line]) })).join('') +
    (note ? `<p style="font-family:Arial,sans-serif;font-size:13px;color:#555">${escapeHtml(note)}</p>` : '')
  return { subject, text, html }
}

const ORDER_COLUMNS = `
  SELECT o.id, o.session_id, o.payment_intent_id, o.currency, o.amount_total_minor, o.snapshot_json,
    o.payment_status, o.fulfillment_status, o.refund_amount_minor, o.updated_at,
    d.buyer_name, d.buyer_email, d.buyer_phone, d.recipient_name, d.address_line1, d.address_line2,
    d.locality, d.administrative_area, d.postal_code, d.country_code
  FROM orders o LEFT JOIN order_delivery_details d ON d.order_id = o.id WHERE o.id = ?
`

export function loadOrder (db, orderId) {
  return db.prepare(ORDER_COLUMNS).bind(orderId).first()
}

async function attachInvoice (db, order, catalog) {
  const issuedAt = await paymentTime(db, order)
  const row = await getOrIssueInvoice(db, { order, details: order, config: catalog.invoice, issuedAt })
  return { name: invoiceFilename(row), type: 'application/pdf', bytes: renderInvoicePdf(row) }
}

// Invoice problems caused by the order data degrade the notice (it still goes out,
// with the reason); anything else is transient and propagates to the outbox retry.
async function invoiceAttachment (db, order, catalog) {
  try {
    return { attachment: await attachInvoice(db, order, catalog), note: 'Factura PDF adjunta.' }
  } catch (error) {
    if (!(error instanceof InvoiceError)) throw error
    return { attachment: null, note: `Factura no generada (${error.code}). Se puede obtener desde el panel de administración cuando se corrija.` }
  }
}

function buyerMessage ({ order, site, catalog, hasInvoice }) {
  const language = catalog.notices.language
  const t = BUYER_TEXT[language]
  const snapshot = JSON.parse(order.snapshot_json)
  const totals = snapshot.totals || {}
  const currency = order.currency || snapshot.currency || 'eur'
  const unit = snapshot.minorUnit ?? 2
  const money = minor => formatMoney(minor, currency, unit, language)
  const lines = (snapshot.items || []).map(line => `- ${line.quantity} × ${line.name || line.sku} — ${money(line.lineTotalMinor)}`)
  if (totals.shippingBaseMinor > 0) lines.push(`- ${t.shipping} — ${money(totals.shippingBaseMinor)}`)
  const name = order.buyer_name || order.recipient_name || ''
  const address = addressLines(order, language)
  const text = [t.greeting(name), '', t.intro, '', t.items, ...lines, `${t.total}: ${money(order.amount_total_minor)}`, '',
    ...(address.length ? [t.destination, ...address, ''] : []),
    ...(hasInvoice ? [t.invoice, ''] : []), t.reply, ''].join('\n')
  const items = snapshot.items || []
  const foot = [
    ...(totals.shippingTotalMinor > 0 ? [[t.subtotal, money(totals.subtotalMinor)]] : []),
    ...(totals.shippingTotalMinor > 0 ? [[t.shipping, money(totals.shippingTotalMinor)]] : []),
    ...(totals.taxMinor > 0 ? [[taxLabel(totals, order.amount_total_minor) === 'IVA incluido' ? t.taxIncluded : t.tax, money(totals.taxMinor)]] : []),
    [t.total, money(order.amount_total_minor), true]
  ]
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px"><p>${escapeHtml(t.greeting(name))}</p><p>${escapeHtml(t.intro)}</p></div>` +
    htmlTable({ head: [t.colItem, t.colQty, t.colPrice], rows: items.map(line => [line.name || line.sku, String(line.quantity), money(line.lineTotalMinor)]), foot, right: [1, 2] }) +
    (address.length ? htmlTable({ head: [t.destination.replace(/:$/, '')], rows: address.map(line => [line]) }) : '') +
    `<div style="font-family:Arial,sans-serif;font-size:14px">${hasInvoice ? `<p>${escapeHtml(t.invoice)}</p>` : ''}<p>${escapeHtml(t.reply)}</p></div>`
  return { subject: t.subject(site), text, html }
}

// One confirmation per paid order, enqueued as its own outbox event so a retry of the
// merchant notice can never resend it (and vice versa). Idempotent by event key.
async function enqueueBuyerConfirmation (db, item) {
  const eventKey = `${item.order_id}:${BUYER_EVENT}`
  const now = Math.floor(Date.now() / 1000)
  await db.prepare(`
    INSERT OR IGNORE INTO outbox (event_key, order_id, event_type, payload_json, status, attempts, next_attempt_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', 0, 0, ?, ?)
  `).bind(eventKey, item.order_id, BUYER_EVENT, JSON.stringify({ eventKey, orderId: item.order_id, eventType: BUYER_EVENT }), now, now).run()
}

// Throws on any failure so the outbox reschedules with backoff (at-least-once).
export async function sendOrderNotice ({ env, db, item, site, catalog, fetch = (...args) => globalThis.fetch(...args) }) {
  if (!hasMailNotifier(env)) throw new Error('notifier_unavailable')
  const notices = catalog?.notices || null
  const order = await loadOrder(db, item.order_id)
  const gmail = provider(fetch)
  const authority = await gmail.authority(env, { account: env.COMMERCE_NOTIFY_ACCOUNT || '' })
  const message = {
    fromName: site,
    to: env.COMMERCE_NOTIFY_TO.split(',').map(value => value.trim()).filter(Boolean),
    messageId: `commerce-${item.event_key}`.replace(/[^A-Za-z0-9.-]/g, '-')
  }

  if (item.event_type === BUYER_EVENT) {
    // Confirmation to the buyer, with the invoice if configured. Nothing to do
    // without an address (never collected, or already erased by the retention job).
    if (!notices?.buyerConfirmation || !order || !validAddress(order.buyer_email || '')) return
    const invoice = notices.buyerInvoice ? await invoiceAttachment(db, order, catalog) : { attachment: null }
    const rendered = buyerMessage({ order, site, catalog, hasInvoice: Boolean(invoice.attachment) })
    await gmail.send({
      env,
      authority,
      signal: AbortSignal.timeout(15000),
      beforeSend: async () => {},
      message: {
        ...message,
        fromName: catalog.invoice?.seller?.name || site,
        to: [order.buyer_email],
        replyTo: message.to[0],
        ...rendered,
        attachments: invoice.attachment ? [invoice.attachment] : []
      }
    })
    return
  }

  if (notices?.buyerConfirmation && item.event_type === 'payment.paid') await enqueueBuyerConfirmation(db, item)
  const invoice = notices?.merchantInvoice && item.event_type === 'payment.paid' && order ? await invoiceAttachment(db, order, catalog) : { attachment: null, note: null }
  const { subject, text, html } = renderOrderNotice({ item, order, site, merchantDetails: Boolean(notices?.merchantDetails), invoiceNote: invoice.note })
  await gmail.send({
    env,
    authority,
    signal: AbortSignal.timeout(15000),
    beforeSend: async () => {},
    message: {
      ...message,
      subject,
      text,
      html,
      ...(notices?.merchantDetails && validAddress(order?.buyer_email || '') ? { replyTo: order.buyer_email } : {}),
      attachments: invoice.attachment ? [invoice.attachment] : []
    }
  })
}
