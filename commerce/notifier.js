import { createGmailProvider } from '../forms/providers/gmail.js'
import { validAddress } from '../forms/mime.js'
import { sanitizeHtml } from '../forms/render.js'
import { InvoiceError, countryName, formatMoney, getOrIssueInvoice, invoiceFilename, paymentTime, renderInvoicePdf } from './invoice.js'
import { buyerText, supportedLocale } from './messages.js'

// Merchant order notices through the forms Gmail provider (FORMS_GMAIL_CREDENTIALS,
// FORMS_GMAIL_DEFAULT or COMMERCE_NOTIFY_ACCOUNT) to COMMERCE_NOTIFY_TO. By default
// the body carries order, items, totals and the destination postal code only: buyer
// contact and street address stay in D1 and in the payment provider's dashboard,
// so no personal data lands in the sending mailbox. With `order_notices` enabled in
// data/commerce.yml (catalog.notices) the project chooses: the merchant notice
// (`merchant`: full | summary | none, optional invoice), the buyer's confirmation
// (`buyer`: own | stripe | none) and whether the buyer gets the invoice
// (`buyer_invoice`: always | on_request | never). Buyer mails are their own outbox
// events, so a retry of one notice never resends another.
const MERCHANT = Object.freeze({
  es: {
    subjects: {
      'payment.paid': 'Nuevo pedido pagado',
      'payment.awaiting_address': 'Pedido pagado sin dirección de envío',
      'payment.destination_review': 'Pedido pagado: revisar el destino',
      'payment.inventory_exception': 'Pedido pagado: revisar existencias',
      'payment.partially_refunded': 'Reembolso parcial de un pedido',
      'payment.refunded': 'Pedido reembolsado'
    },
    explain: {
      'payment.paid': 'El pago se ha completado. Ya puedes preparar y enviar el pedido con los datos de abajo.',
      'payment.awaiting_address': 'El pago se ha completado pero aún no tenemos la dirección de envío. Consúltala en el panel de pagos antes de enviar.',
      'payment.destination_review': 'El pago se ha completado, pero el destino está fuera de la política de envío. Revísalo antes de preparar el pedido.',
      'payment.inventory_exception': 'El pago se ha completado, pero hay un problema de existencias. Revísalo antes de preparar el pedido.',
      'payment.partially_refunded': 'Se ha devuelto una parte del importe de este pedido.',
      'payment.refunded': 'Se ha devuelto el importe completo de este pedido.'
    },
    other: type => `Aviso de pedido (${type})`,
    missing: id => `Pedido ${id}: no se encontró en la base de datos. Revísalo en el panel de pagos.`,
    order: 'Pedido',
    payment: 'Pago',
    status: 'Estado',
    destination: 'Destino',
    postal: 'CP',
    pending: 'pendiente',
    subtotal: 'Subtotal',
    shipping: 'Envío',
    taxes: 'Impuestos',
    tax: 'IVA',
    taxIncluded: 'IVA incluido',
    total: 'Total',
    refunded: 'Reembolsado',
    items: 'Artículos:',
    colItem: 'Artículo',
    colQty: 'Cant.',
    colPrice: 'Precio',
    buyer: 'Comprador',
    name: 'Nombre',
    email: 'Correo',
    phone: 'Teléfono',
    company: 'Razón social',
    taxId: 'NIF',
    invoiceRequested: 'Factura',
    invoiceYes: 'La ha pedido',
    shipTo: 'Enviar a',
    recipientPhone: 'Teléfono de entrega',
    deliveryNotes: 'Indicaciones',
    noDetails: 'Sin datos de entrega guardados (aún no han llegado o ya se borraron). Consúltalos en el panel de pagos.',
    summaryNote: 'Nombre, contacto y dirección del comprador: panel de Stripe → Pagos (busca el identificador de pago).',
    invoiceAttached: 'Factura PDF adjunta.',
    invoiceFailed: code => `Factura no generada (${code}). Se puede obtener desde el panel de administración cuando se corrija.`
  },
  en: {
    subjects: {
      'payment.paid': 'New paid order',
      'payment.awaiting_address': 'Paid order without a shipping address',
      'payment.destination_review': 'Paid order: check the destination',
      'payment.inventory_exception': 'Paid order: check the stock',
      'payment.partially_refunded': 'Partial refund of an order',
      'payment.refunded': 'Order refunded'
    },
    explain: {
      'payment.paid': 'The payment is complete. You can prepare and ship the order with the details below.',
      'payment.awaiting_address': 'The payment is complete but the shipping address has not arrived yet. Check it in the payments dashboard before shipping.',
      'payment.destination_review': 'The payment is complete, but the destination is outside the shipping policy. Check it before preparing the order.',
      'payment.inventory_exception': 'The payment is complete, but there is a stock problem. Check it before preparing the order.',
      'payment.partially_refunded': 'Part of the amount of this order has been refunded.',
      'payment.refunded': 'The full amount of this order has been refunded.'
    },
    other: type => `Order notice (${type})`,
    missing: id => `Order ${id}: not found in the database. Check it in the payments dashboard.`,
    order: 'Order',
    payment: 'Payment',
    status: 'Status',
    destination: 'Destination',
    postal: 'Postcode',
    pending: 'pending',
    subtotal: 'Subtotal',
    shipping: 'Shipping',
    taxes: 'Taxes',
    tax: 'VAT',
    taxIncluded: 'VAT included',
    total: 'Total',
    refunded: 'Refunded',
    items: 'Items:',
    colItem: 'Item',
    colQty: 'Qty',
    colPrice: 'Price',
    buyer: 'Buyer',
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    company: 'Company',
    taxId: 'Tax ID',
    invoiceRequested: 'Invoice',
    invoiceYes: 'Requested',
    shipTo: 'Ship to',
    recipientPhone: 'Delivery phone',
    deliveryNotes: 'Delivery notes',
    noDetails: 'No delivery details on file (not arrived yet or already erased). Check them in the payments dashboard.',
    summaryNote: 'Buyer name, contact and address: Stripe dashboard → Payments (search for the payment ID).',
    invoiceAttached: 'Invoice PDF attached.',
    invoiceFailed: code => `Invoice not issued (${code}). It can be downloaded from the admin panel once fixed.`
  }
})

const providers = new Map()

function provider (fetch) {
  if (!providers.has(fetch)) providers.set(fetch, createGmailProvider({ fetch }))
  return providers.get(fetch)
}

export function hasMailNotifier (env) {
  return typeof env.COMMERCE_NOTIFY_TO === 'string' && env.COMMERCE_NOTIFY_TO.split(',').map(value => value.trim()).filter(Boolean).every(validAddress)
}

function money (minor, currency, minorUnit = 2, language = 'es') {
  return Number.isSafeInteger(minor) ? formatMoney(minor, currency, minorUnit, language) : '—'
}

function escapeHtml (value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

const CELL = 'padding:6px 10px;border-bottom:1px solid #e5e5e5;vertical-align:top'
const TABLE = 'border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;margin:0 0 16px'
const PARAGRAPH = 'font-family:Arial,sans-serif;font-size:14px'

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

function taxIncluded (totals, total) {
  return totals.subtotalMinor + totals.shippingTotalMinor === total
}

// Template text for `language`: its own entry, the one for every language ('*'),
// the project's default language, or null (engine text).
function pick (map, language, fallback) {
  if (!map) return null
  return map[language] ?? map['*'] ?? map[fallback] ?? null
}

// {site} {name} {order} {total}; values are escaped in HTML.
function fill (value, vars, html) {
  return value.replace(/\{(site|name|order|total)\}/g, (match, key) => html ? escapeHtml(vars[key] ?? '') : String(vars[key] ?? ''))
}

function template (catalog, kind, part, language, vars) {
  const value = pick(catalog?.notices?.templates?.[kind]?.[part], language, catalog?.notices?.language)
  if (value === null) return null
  if (typeof value === 'string') return fill(value, vars, false)
  return { text: fill(value.text, vars, false), html: sanitizeHtml(fill(value.html, vars, true)) }
}

// [recipient, one-line address] for the compact shipping tables.
function addressParts (order, language = 'es') {
  const [name, ...rest] = [order.recipient_name || order.buyer_name,
    order.address_line1,
    order.address_line2,
    [order.postal_code, order.locality].filter(Boolean).join(' '),
    order.administrative_area,
    order.country_code && countryName(order.country_code, language)].map((value, i) => i === 0 ? value || '' : value)
  return [name, rest.filter(Boolean).join(', ')]
}

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

export function renderOrderNotice ({ item, order, site, merchantDetails = false, invoiceNote = null, language = 'es', catalog = null }) {
  const m = MERCHANT[language] || MERCHANT.es
  const snapshot = order ? JSON.parse(order.snapshot_json) : null
  const currency = order?.currency || snapshot?.currency || 'eur'
  const unit = snapshot?.minorUnit ?? 2
  const vars = { site, name: order?.buyer_name || order?.recipient_name || '', order: item.order_id, total: order ? money(order.amount_total_minor, currency, unit, language) : '' }
  const custom = item.event_type === 'payment.paid' ? { subject: template(catalog, 'merchant_paid', 'subject', language, vars), intro: template(catalog, 'merchant_paid', 'intro', language, vars) } : {}
  const subject = custom.subject || `${m.subjects[item.event_type] || m.other(item.event_type)} · ${site}`
  if (!order) {
    const text = `${subject}\n\n${m.missing(item.order_id)}\n`
    return { subject, text, html: `<p>${escapeHtml(text)}</p>` }
  }
  const totals = snapshot.totals || {}
  const amount = minor => money(minor, currency, unit, language)
  const lines = (snapshot.items || []).map(line => `- ${line.quantity} × ${line.name || line.sku} (${line.sku}) — ${amount(line.lineTotalMinor)}`)
  const destination = [order.postal_code && `${m.postal} ${order.postal_code}`, order.country_code || totals.destination?.country].filter(Boolean).join(' · ')
  const rows = [
    [m.order, order.id],
    [m.payment, order.payment_intent_id || order.session_id || '—'],
    [m.status, `${order.payment_status} / ${order.fulfillment_status}`],
    [m.destination, destination || m.pending],
    [m.subtotal, amount(totals.subtotalMinor ?? snapshot.subtotalMinor)],
    [m.shipping, amount(totals.shippingTotalMinor)],
    [m.taxes, amount(totals.taxMinor)],
    [m.total, amount(order.amount_total_minor)],
    ...(order.refund_amount_minor ? [[m.refunded, amount(order.refund_amount_minor)]] : [])
  ]
  const buyer = [
    [m.name, order.buyer_name],
    [m.company, order.buyer_business_name],
    [m.taxId, order.buyer_tax_id],
    [m.email, order.buyer_email],
    [m.phone, order.buyer_phone],
    [m.invoiceRequested, snapshot.invoiceRequested ? m.invoiceYes : null]
  ].filter(([, value]) => value)
  const shipTo = addressLines(order)
  const [shipName, shipAddress] = addressParts(order)
  const delivery = [
    [m.recipientPhone, order.recipient_phone],
    [m.deliveryNotes, order.delivery_notes]
  ].filter(([, value]) => value)
  const blocks = []
  if (merchantDetails) {
    if (buyer.length || shipTo.length) {
      blocks.push({ title: m.buyer, rows: [...buyer, ...(shipTo.length ? [[m.shipTo, [shipName, shipAddress].filter(Boolean).join(', ')]] : []), ...delivery] })
    } else {
      blocks.push({ title: m.buyer, lines: [m.noDetails] })
    }
  }
  const note = merchantDetails ? invoiceNote : m.summaryNote
  const explain = custom.intro || (m.explain[item.event_type] ? { text: m.explain[item.event_type], html: escapeHtml(m.explain[item.event_type]) } : null)
  const text = [subject, ...(explain ? ['', explain.text] : []), '', ...rows.map(([key, value]) => `${key}: ${value}`), '', m.items, ...lines, '',
    ...blocks.flatMap(block => [`${block.title}:`, ...(block.rows ? block.rows.map(([key, value]) => `${key}: ${value}`) : block.lines), '']),
    ...(note ? [note, ''] : [])].join('\n')
  const foot = [
    [m.subtotal, amount(totals.subtotalMinor ?? snapshot.subtotalMinor)],
    [m.shipping, amount(totals.shippingTotalMinor)],
    [taxIncluded(totals, order.amount_total_minor) ? m.taxIncluded : m.tax, amount(totals.taxMinor)],
    ...(order.refund_amount_minor ? [[m.refunded, amount(order.refund_amount_minor)]] : []),
    [m.total, amount(order.amount_total_minor), true]
  ]
  const html = `<p style="font-family:Arial,sans-serif;font-size:16px;margin:0 0 6px"><strong>${escapeHtml(subject)}</strong></p>` +
    (explain ? (custom.intro ? `<div style="${PARAGRAPH};margin:0 0 16px">${explain.html}</div>` : `<p style="${PARAGRAPH};margin:0 0 16px">${explain.html}</p>`) : '') +
    keyValueTable(rows.slice(0, 4)) +
    htmlTable({
      head: [m.colItem, m.colQty, m.colPrice],
      rows: (snapshot.items || []).map(line => [`${line.name || line.sku} (${line.sku})`, String(line.quantity), amount(line.lineTotalMinor)]),
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
    d.locality, d.administrative_area, d.postal_code, d.country_code,
    d.buyer_business_name, d.buyer_tax_id, d.buyer_tax_id_type, d.recipient_phone, d.delivery_notes
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
async function invoiceAttachment (db, order, catalog, m = MERCHANT.es) {
  try {
    return { attachment: await attachInvoice(db, order, catalog), note: m.invoiceAttached }
  } catch (error) {
    if (!(error instanceof InvoiceError)) throw error
    return { attachment: null, note: m.invoiceFailed(error.code) }
  }
}

// The purchase language when the storefront sent one; otherwise the project's.
export function buyerLanguage (snapshot, notices) {
  return supportedLocale(snapshot?.locale) || notices?.language || 'es'
}

// Whether the buyer receives the invoice: always, never, or when they asked for it
// in the cart or identified a company with a tax ID at checkout.
export function buyerWantsInvoice (notices, snapshot, order) {
  if (!notices || notices.buyerInvoice === 'never') return false
  if (notices.buyerInvoice === 'always') return true
  return Boolean(snapshot?.invoiceRequested || order?.buyer_tax_id)
}

function buyerVars (order, site, language) {
  const snapshot = JSON.parse(order.snapshot_json)
  return { site, name: order.buyer_name || order.recipient_name || '', order: order.id, total: formatMoney(order.amount_total_minor, order.currency || snapshot.currency || 'eur', snapshot.minorUnit ?? 2, language) }
}

function paragraphs (custom, fallback) {
  return custom ? { text: custom.text, html: `<div style="${PARAGRAPH}">${custom.html}</div>` } : fallback
}

function buyerMessage ({ order, site, catalog, hasInvoice }) {
  const snapshot = JSON.parse(order.snapshot_json)
  const language = buyerLanguage(snapshot, catalog.notices)
  const t = buyerText(language)
  const vars = buyerVars(order, site, language)
  const totals = snapshot.totals || {}
  const currency = order.currency || snapshot.currency || 'eur'
  const unit = snapshot.minorUnit ?? 2
  const money = minor => formatMoney(minor, currency, unit, language)
  const lines = (snapshot.items || []).map(line => `- ${line.quantity} × ${line.name || line.sku} — ${money(line.lineTotalMinor)}`)
  if (totals.shippingBaseMinor > 0) lines.push(`- ${t.shipping} — ${money(totals.shippingBaseMinor)}`)
  const name = order.buyer_name || order.recipient_name || ''
  const address = addressLines(order, language)
  const [shipName, shipAddress] = addressParts(order, language)
  const delivery = [[t.phone, order.recipient_phone], [t.notes, order.delivery_notes]].filter(([, value]) => value)
  const intro = paragraphs(template(catalog, 'buyer_paid', 'intro', language, vars), null)
  const outro = paragraphs(template(catalog, 'buyer_paid', 'outro', language, vars), null)
  const text = [...(intro ? [intro.text] : [t.greeting(name), '', t.intro]), '', t.items, ...lines, `${t.total}: ${money(order.amount_total_minor)}`, '',
    ...(address.length ? [t.destination, ...address, ...delivery.map(([key, value]) => `${key}: ${value}`), ''] : []),
    ...(hasInvoice ? [t.invoice, ''] : []), ...(outro ? [outro.text] : [t.reply]), ''].join('\n')
  const items = snapshot.items || []
  const foot = [
    ...(totals.shippingTotalMinor > 0 ? [[t.subtotal, money(totals.subtotalMinor)]] : []),
    ...(totals.shippingTotalMinor > 0 ? [[t.shipping, money(totals.shippingTotalMinor)]] : []),
    ...(totals.taxMinor > 0 ? [[taxIncluded(totals, order.amount_total_minor) ? t.taxIncluded : t.tax, money(totals.taxMinor)]] : []),
    [t.total, money(order.amount_total_minor), true]
  ]
  const html = (intro ? intro.html : `<div style="${PARAGRAPH}"><p>${escapeHtml(t.greeting(name))}</p><p>${escapeHtml(t.intro)}</p></div>`) +
    htmlTable({ head: [t.colItem, t.colQty, t.colPrice], rows: items.map(line => [line.name || line.sku, String(line.quantity), money(line.lineTotalMinor)]), foot, right: [1, 2] }) +
    (address.length ? `<p style="font-family:Arial,sans-serif;font-size:14px;margin:0 0 6px"><strong>${escapeHtml(t.destination.replace(/\s*:$/, ''))}</strong></p>` + keyValueTable([[t.name, shipName], [t.address, shipAddress], ...delivery].filter(([, value]) => value)) : '') +
    (outro
      ? (hasInvoice ? `<div style="${PARAGRAPH}"><p>${escapeHtml(t.invoice)}</p></div>` : '') + outro.html
      : `<div style="${PARAGRAPH}">${hasInvoice ? `<p>${escapeHtml(t.invoice)}</p>` : ''}<p>${escapeHtml(t.reply)}</p></div>`)
  return { subject: template(catalog, 'buyer_paid', 'subject', language, vars) || t.subject(site), text, html }
}

// Short mail with only the invoice, for shops whose confirmation is Stripe's receipt.
function invoiceMessage ({ order, site, catalog }) {
  const snapshot = JSON.parse(order.snapshot_json)
  const language = buyerLanguage(snapshot, catalog.notices)
  const t = buyerText(language)
  const vars = buyerVars(order, site, language)
  const name = order.buyer_name || order.recipient_name || ''
  const intro = paragraphs(template(catalog, 'buyer_invoice', 'intro', language, vars), null)
  const outro = paragraphs(template(catalog, 'buyer_invoice', 'outro', language, vars), null)
  const text = [...(intro ? [intro.text] : [t.greeting(name), '', t.invoiceIntro]), '', outro ? outro.text : t.reply, ''].join('\n')
  const html = (intro ? intro.html : `<div style="${PARAGRAPH}"><p>${escapeHtml(t.greeting(name))}</p><p>${escapeHtml(t.invoiceIntro)}</p></div>`) +
    (outro ? outro.html : `<div style="${PARAGRAPH}"><p>${escapeHtml(t.reply)}</p></div>`)
  return { subject: template(catalog, 'buyer_invoice', 'subject', language, vars) || t.invoiceSubject(site), text, html }
}

// Mail sent when the merchant marks the order as shipped; `tracking` is a link or a code.
function shippedMessage ({ order, site, catalog, tracking }) {
  const snapshot = JSON.parse(order.snapshot_json)
  const language = buyerLanguage(snapshot, catalog.notices)
  const t = buyerText(language)
  const vars = buyerVars(order, site, language)
  const name = order.buyer_name || order.recipient_name || ''
  const intro = paragraphs(template(catalog, 'buyer_shipped', 'intro', language, vars), null)
  const outro = paragraphs(template(catalog, 'buyer_shipped', 'outro', language, vars), null)
  const link = tracking && /^https:\/\//i.test(tracking)
  const trackingHtml = tracking ? `<p style="font-family:Arial,sans-serif;font-size:14px;margin:0 0 12px"><strong>${escapeHtml(t.tracking)}:</strong> ${link ? `<a href="${escapeHtml(tracking)}">${escapeHtml(tracking)}</a>` : escapeHtml(tracking)}</p>` : ''
  const text = [...(intro ? [intro.text] : [t.greeting(name), '', t.shippedIntro]), ...(tracking ? ['', `${t.tracking}: ${tracking}`] : []), '', outro ? outro.text : t.reply, ''].join('\n')
  const html = (intro ? intro.html : `<div style="${PARAGRAPH}"><p>${escapeHtml(t.greeting(name))}</p><p>${escapeHtml(t.shippedIntro)}</p></div>`) + trackingHtml +
    (outro ? outro.html : `<div style="${PARAGRAPH}"><p>${escapeHtml(t.reply)}</p></div>`)
  return { subject: template(catalog, 'buyer_shipped', 'subject', language, vars) || t.shippedSubject(site), text, html }
}

const BUYER_CONFIRMATION = 'buyer.confirmation'
const BUYER_SHIPPED = 'buyer.shipped'
const BUYER_INVOICE = 'buyer.invoice'

// One buyer mail per paid order and kind, enqueued as its own outbox event so a retry
// of the merchant notice can never resend it (and vice versa). Idempotent by event key.
async function enqueueBuyerEvent (db, item, eventType) {
  const eventKey = `${item.order_id}:${eventType}`
  const now = Math.floor(Date.now() / 1000)
  await db.prepare(`
    INSERT OR IGNORE INTO outbox (event_key, order_id, event_type, payload_json, status, attempts, next_attempt_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', 0, 0, ?, ?)
  `).bind(eventKey, item.order_id, eventType, JSON.stringify({ eventKey, orderId: item.order_id, eventType }), now, now).run()
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
  const send = extra => gmail.send({ env, authority, signal: AbortSignal.timeout(15000), beforeSend: async () => {}, message: { ...message, ...extra } })

  if (item.event_type === BUYER_SHIPPED) {
    if (!notices?.buyerShipped || notices.buyer === 'none' || !order || !validAddress(order.buyer_email || '')) return
    let tracking = null
    try {
      tracking = JSON.parse(item.payload_json).tracking || null
    } catch {}
    await send({ fromName: catalog.invoice?.seller?.name || site, to: [order.buyer_email], replyTo: message.to[0], ...shippedMessage({ order, site, catalog, tracking }) })
    return
  }

  if (item.event_type === BUYER_CONFIRMATION || item.event_type === BUYER_INVOICE) {
    // Nothing to do without an address (never collected, or already erased by the
    // retention job) or once the project switched the mail off.
    if (!notices || !order || !validAddress(order.buyer_email || '')) return
    const snapshot = JSON.parse(order.snapshot_json)
    const wantsInvoice = buyerWantsInvoice(notices, snapshot, order)
    const buyer = { fromName: catalog.invoice?.seller?.name || site, to: [order.buyer_email], replyTo: message.to[0] }
    if (item.event_type === BUYER_CONFIRMATION) {
      if (notices.buyer !== 'own') return
      const invoice = wantsInvoice ? await invoiceAttachment(db, order, catalog) : { attachment: null }
      await send({ ...buyer, ...buyerMessage({ order, site, catalog, hasInvoice: Boolean(invoice.attachment) }), attachments: invoice.attachment ? [invoice.attachment] : [] })
      return
    }
    if (notices.buyer !== 'stripe' || !wantsInvoice) return
    // The mail exists only to carry the invoice: data problems skip it, the merchant
    // notice already reported the reason.
    const invoice = await invoiceAttachment(db, order, catalog)
    if (!invoice.attachment) return
    await send({ ...buyer, ...invoiceMessage({ order, site, catalog }), attachments: [invoice.attachment] })
    return
  }

  if (notices && item.event_type === 'payment.paid' && order) {
    if (notices.buyer === 'own') await enqueueBuyerEvent(db, item, BUYER_CONFIRMATION)
    if (notices.buyer === 'stripe' && buyerWantsInvoice(notices, JSON.parse(order.snapshot_json), order)) await enqueueBuyerEvent(db, item, BUYER_INVOICE)
  }
  if (notices?.merchant === 'none') return
  const language = notices?.merchantLanguage || 'es'
  const m = MERCHANT[language] || MERCHANT.es
  const full = notices?.merchant === 'full'
  const invoice = notices?.merchantInvoice && item.event_type === 'payment.paid' && order ? await invoiceAttachment(db, order, catalog, m) : { attachment: null, note: null }
  const rendered = renderOrderNotice({ item, order, site, merchantDetails: full, invoiceNote: invoice.note, language, catalog })
  await send({
    ...rendered,
    ...(full && validAddress(order?.buyer_email || '') ? { replyTo: order.buyer_email } : {}),
    attachments: invoice.attachment ? [invoice.attachment] : []
  })
}
