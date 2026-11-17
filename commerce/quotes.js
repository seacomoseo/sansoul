// Proformas (14.11): the merchant answers a cart quote request (core/forms, enricher
// commerce_quote) from the orders panel. She completes shipping, discount, delivery
// time and a note; the Worker computes the totals, draws a «FACTURA PROFORMA» PDF
// (own yearly sequence, never the invoice series) and mails it from the shop's Gmail
// with a payment link. The link opens a page of this Worker; its button creates a
// Stripe Checkout Session for the exact total at that moment (sessions last 24 h,
// the link does not). A paid attempt is an ordinary order: webhook, invoice in the
// shop series, notices and panel as for the cart. A bank transfer is marked paid by
// the merchant and becomes the same kind of order.
// No Intl here (Workers Free CPU): amounts and dates are formatted by hand.
import { sha256Hex } from './catalog.js'
import { CommerceError, errorResponse, isSameOrigin, jsonResponse, readJsonBody, requireDatabase } from './http.js'
import { verifiedProxy } from '../edge/proxy.js'
import { isCheckoutAuthorized, requireCheckoutAuthorization } from './approval.js'
import { consumeRateLimit } from './checkout.js'
import { applyPaymentState, expirePendingCheckouts, paymentStatements, persistCheckoutSession } from './orders.js'
import { createPaymentProvider } from './provider.js'
import { buyerStatusCookie, resolveBuyerStatusCapability } from './status.js'
import { CHECKOUT_RECOVERY_TTL_SECONDS, STRIPE_IDEMPOTENCY_RETRY_TTL_SECONDS } from './expiry.js'
import { POSTAL_CODE_FORMATS, normalizePostalCode } from './totals.js'
import { countryName, displayDate, formatMoney, groupTaxes, labelsFor, localDate, regionName, renderDocumentPdf } from './invoice.js'
import { createGmailProvider } from '../forms/providers/gmail.js'
import { validAddress } from '../forms/mime.js'
import { stripeRequest } from '../payments/stripe.js'

const QUOTE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const PRODUCT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SUBMISSION_ID = /^[A-Za-z0-9-]{16,64}$/
const COUNTRY = /^[A-Z]{2}$/
export const QUOTE_TOKEN = /^[A-Za-z0-9_-]{43}$/
// Amounts stay far below 2^53 / 10^4, so tax arithmetic is exact with Numbers.
const MAX_AMOUNT = 100000000
const MAX_LINES = 50
const MAX_QUANTITY = 999
// Stripe's smallest charge in EUR/USD/GBP is 0.50; smaller proformas go by transfer.
const MIN_CARD_MINOR = 50
const DAY = 86400

const TEXT = Object.freeze({
  es: {
    title: 'FACTURA PROFORMA',
    number: 'Nº',
    date: 'Fecha',
    validUntil: 'Válida hasta',
    delivery: 'Plazo de envío',
    shipping: 'Envío',
    discount: 'Descuento',
    card: 'Pago con tarjeta: con el enlace del correo que acompaña a esta proforma.',
    transfer: (iban, holder, reference) => `Transferencia bancaria: IBAN ${iban}${holder ? ` (titular: ${holder})` : ''}. Concepto: ${reference}.`,
    notInvoice: 'Este documento no es una factura. La factura se emite al recibir el pago.',
    subject: (reference, site) => `Tu presupuesto ${reference} · ${site}`,
    greeting: name => name ? `Hola, ${name}:` : 'Hola:',
    intro: 'Te enviamos el presupuesto que nos pediste. Va también en el PDF adjunto (factura proforma).',
    product: 'Producto',
    quantity: 'Cant.',
    amount: 'Importe',
    subtotal: 'Subtotal',
    total: 'Total',
    taxIncluded: 'IVA incluido',
    tax: 'IVA',
    exempt: 'Sin IVA',
    payCard: total => `Pagar ${total} con tarjeta`,
    payCardText: 'Para pagar con tarjeta, abre este enlace:',
    payTransfer: 'O por transferencia bancaria:',
    payTransferAlone: 'Puedes pagar por transferencia bancaria:',
    transferLines: (iban, holder, reference) => [`IBAN: ${iban}`, ...(holder ? [`Titular: ${holder}`] : []), `Concepto: ${reference}`],
    transferAfter: 'Cuando la recibamos te confirmamos el pedido.',
    noPayment: 'Responde a este correo y te decimos cómo pagar.',
    reply: 'Si quieres cambiar algo, responde a este correo.',
    page: {
      title: reference => `Presupuesto ${reference}`,
      pay: total => `Pagar ${total} con tarjeta`,
      secure: 'El pago se hace en la página segura de Stripe.',
      invalid: 'Este enlace no es válido o se ha sustituido por uno más reciente. Usa el del último correo que te enviamos.',
      paid: 'Este presupuesto ya está pagado. ¡Gracias!',
      cancelled: 'Este presupuesto ya no está disponible. Responde a nuestro correo si quieres retomarlo.',
      draft: 'Estamos actualizando este presupuesto. Te llegará uno nuevo por correo.',
      expired: date => `Este presupuesto caducó el ${date}. Responde a nuestro correo y te lo renovamos.`,
      cardOff: 'El pago con tarjeta no está disponible ahora mismo.',
      retry: 'No hemos podido abrir el pago. Vuelve a intentarlo en un momento.',
      home: 'Ir a la web'
    }
  },
  en: {
    title: 'PRO FORMA INVOICE',
    number: 'No.',
    date: 'Date',
    validUntil: 'Valid until',
    delivery: 'Delivery time',
    shipping: 'Shipping',
    discount: 'Discount',
    card: 'Card payment: with the link in the email that came with this pro forma.',
    transfer: (iban, holder, reference) => `Bank transfer: IBAN ${iban}${holder ? ` (holder: ${holder})` : ''}. Reference: ${reference}.`,
    notInvoice: 'This document is not an invoice. The invoice is issued once the payment arrives.',
    subject: (reference, site) => `Your quote ${reference} · ${site}`,
    greeting: name => name ? `Hello ${name},` : 'Hello,',
    intro: 'Here is the quote you asked for. It is also attached as a PDF (pro forma invoice).',
    product: 'Product',
    quantity: 'Qty',
    amount: 'Amount',
    subtotal: 'Subtotal',
    total: 'Total',
    taxIncluded: 'VAT included',
    tax: 'VAT',
    exempt: 'No VAT',
    payCard: total => `Pay ${total} by card`,
    payCardText: 'To pay by card, open this link:',
    payTransfer: 'Or by bank transfer:',
    payTransferAlone: 'You can pay by bank transfer:',
    transferLines: (iban, holder, reference) => [`IBAN: ${iban}`, ...(holder ? [`Holder: ${holder}`] : []), `Reference: ${reference}`],
    transferAfter: 'We will confirm the order once it arrives.',
    noPayment: 'Reply to this email and we will tell you how to pay.',
    reply: 'If you want to change anything, reply to this email.',
    page: {
      title: reference => `Quote ${reference}`,
      pay: total => `Pay ${total} by card`,
      secure: 'Payment happens on the secure Stripe page.',
      invalid: 'This link is not valid or has been replaced by a newer one. Use the one in our latest email.',
      paid: 'This quote is already paid. Thank you!',
      cancelled: 'This quote is no longer available. Reply to our email if you want to pick it up again.',
      draft: 'We are updating this quote. You will get a new one by email.',
      expired: date => `This quote expired on ${date}. Reply to our email and we will renew it.`,
      cardOff: 'Card payment is not available right now.',
      retry: 'We could not open the payment. Please try again in a moment.',
      home: 'Go to the website'
    }
  }
})

function textFor (language) {
  return TEXT[language] || TEXT.en
}

function object (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function escapeHtml (value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

// Trimmed text without control characters (line breaks only where `multiline`).
function cleanText (value, max, { required = false, multiline = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new CommerceError('invalid_quote')
    return ''
  }
  if (typeof value !== 'string') throw new CommerceError('invalid_quote')
  const text = value.replace(/\r\n?/g, '\n').trim()
  if (text.length > max || Array.from(text).some(char => {
    const code = char.charCodeAt(0)
    return (code < 32 && !(multiline && char === '\n')) || code === 127
  })) throw new CommerceError('invalid_quote')
  if (required && !text) throw new CommerceError('invalid_quote')
  return text
}

function amount (value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_AMOUNT) throw new CommerceError('invalid_quote')
  return value
}

function roundHalfUp (numerator, denominator) {
  return Math.floor((2 * numerator + denominator) / (2 * denominator))
}

// Same rounding as totals.js: half-up per amount, tax inside inclusive prices.
function split (value, tax) {
  if (tax.mode === 'exempt' || value === 0) return { net: value, tax: 0, total: value, added: 0 }
  if (tax.mode === 'inclusive') {
    const included = roundHalfUp(value * tax.rateBps, 10000 + tax.rateBps)
    return { net: value - included, tax: included, total: value, added: 0 }
  }
  const added = roundHalfUp(value * tax.rateBps, 10000)
  return { net: value, tax: added, total: value + added, added }
}

// The shop's tax for the destination country, or its first (home) country.
export function standardTax (catalog, country) {
  const destinations = catalog?.checkout?.totalsPolicy?.destinations || {}
  const rule = destinations[country] || Object.values(destinations)[0]
  return rule?.tax ? { mode: rule.tax.mode, rateBps: rule.tax.rateBps } : { mode: 'inclusive', rateBps: 0 }
}

/**
 * Validate what the panel sends. Customer address fields are optional for card
 * payments (Stripe collects the address) and required to mark a transfer paid.
 */
export function normalizeQuoteInput (value, catalog) {
  const keys = ['submission_id', 'language', 'customer', 'lines', 'shipping_minor', 'discount', 'tax', 'delivery', 'note', 'validity_days', 'invoice_requested']
  if (!object(value) || Object.keys(value).some(key => !keys.includes(key))) throw new CommerceError('invalid_quote')
  const submissionId = value.submission_id === undefined || value.submission_id === null || value.submission_id === '' ? null : value.submission_id
  if (submissionId !== null && (typeof submissionId !== 'string' || !SUBMISSION_ID.test(submissionId))) throw new CommerceError('invalid_quote')
  const language = value.language === undefined ? (catalog?.invoice?.language || 'es') : value.language
  if (!['es', 'en'].includes(language)) throw new CommerceError('invalid_quote')

  const c = value.customer
  const customerKeys = ['name', 'email', 'phone', 'business_name', 'tax_id', 'line1', 'line2', 'locality', 'region', 'postal_code', 'country']
  if (!object(c) || Object.keys(c).some(key => !customerKeys.includes(key))) throw new CommerceError('invalid_quote')
  const email = cleanText(c.email, 254, { required: true }).toLowerCase()
  if (!validAddress(email)) throw new CommerceError('invalid_quote_email')
  const country = typeof c.country === 'string' ? c.country.trim().toUpperCase() : ''
  if (!COUNTRY.test(country)) throw new CommerceError('invalid_quote_country')
  const rawPostal = cleanText(c.postal_code, 16)
  const customer = {
    name: cleanText(c.name, 120, { required: true }),
    email,
    phone: cleanText(c.phone, 32),
    businessName: cleanText(c.business_name, 200),
    taxId: cleanText(c.tax_id, 40),
    line1: cleanText(c.line1, 200),
    line2: cleanText(c.line2, 200),
    locality: cleanText(c.locality, 100),
    region: cleanText(c.region, 100),
    postalCode: rawPostal ? (normalizePostalCode(country, rawPostal) ?? rawPostal.toUpperCase()) : '',
    country
  }

  if (!Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > MAX_LINES) throw new CommerceError('invalid_quote_lines')
  const products = new Map((catalog?.products || []).map(product => [product.id.toLowerCase(), product]))
  const lines = value.lines.map(line => {
    if (!object(line) || Object.keys(line).some(key => !['product_id', 'description', 'quantity', 'unit_minor'].includes(key))) throw new CommerceError('invalid_quote_lines')
    let product = null
    if (line.product_id !== undefined && line.product_id !== null && line.product_id !== '') {
      if (typeof line.product_id !== 'string' || !PRODUCT_ID.test(line.product_id)) throw new CommerceError('invalid_quote_lines')
      product = products.get(line.product_id.toLowerCase()) || null
    }
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) throw new CommerceError('invalid_quote_lines')
    return {
      productId: product ? product.id : null,
      sku: product ? product.sku : null,
      description: cleanText(line.description, 200, { required: true }),
      quantity: line.quantity,
      unitMinor: amount(line.unit_minor)
    }
  })

  let discount = null
  if (value.discount !== undefined && value.discount !== null) {
    const d = value.discount
    if (!object(d) || Object.keys(d).length !== 2 || !['amount', 'percent'].includes(d.type) || !Number.isSafeInteger(d.value) || d.value < 0) throw new CommerceError('invalid_quote_discount')
    // Percent in basis points (1000 = 10 %).
    if (d.type === 'percent' && d.value > 10000) throw new CommerceError('invalid_quote_discount')
    if (d.value > 0) discount = { type: d.type, value: d.type === 'amount' ? amount(d.value) : d.value }
  }
  if (!['standard', 'exempt'].includes(value.tax ?? 'standard')) throw new CommerceError('invalid_quote')
  const validityDays = value.validity_days === undefined ? (catalog?.quotes?.validityDays || 15) : value.validity_days
  if (!Number.isSafeInteger(validityDays) || validityDays < 1 || validityDays > 90) throw new CommerceError('invalid_quote')
  if (value.invoice_requested !== undefined && typeof value.invoice_requested !== 'boolean') throw new CommerceError('invalid_quote')
  return {
    submissionId,
    language,
    customer,
    lines,
    shippingMinor: amount(value.shipping_minor ?? 0),
    discount,
    tax: value.tax ?? 'standard',
    delivery: cleanText(value.delivery, 200),
    note: cleanText(value.note, 1000, { multiline: true }),
    validityDays,
    invoiceRequested: value.invoice_requested === true
  }
}

/**
 * Totals of a proforma. One tax for the whole document: the shop's rate for the
 * destination, or exempt (e.g. Canarias). Inclusive prices keep the entered amounts
 * as totals; exclusive ones add the tax. The discount applies to the products.
 */
export function computeQuote (input, catalog) {
  const tax = input.tax === 'exempt' ? { mode: 'exempt', rateBps: 0 } : standardTax(catalog, input.customer.country)
  const lines = input.lines.map(line => {
    const totalMinor = line.unitMinor * line.quantity
    if (totalMinor > MAX_AMOUNT) throw new CommerceError('quote_total_too_large')
    const parts = split(totalMinor, tax)
    return { ...line, totalMinor, netMinor: parts.net, taxMinor: parts.tax, grossMinor: parts.total }
  })
  const subtotalMinor = lines.reduce((total, line) => total + line.totalMinor, 0)
  if (subtotalMinor > MAX_AMOUNT) throw new CommerceError('quote_total_too_large')
  let discount = null
  if (input.discount) {
    const value = input.discount.type === 'amount' ? Math.min(input.discount.value, subtotalMinor) : roundHalfUp(subtotalMinor * input.discount.value, 10000)
    if (value > 0) {
      const parts = split(value, tax)
      discount = { type: input.discount.type, value: input.discount.value, totalMinor: value, netMinor: parts.net, taxMinor: parts.tax, grossMinor: parts.total }
    }
  }
  const shippingParts = split(input.shippingMinor, tax)
  const shipping = input.shippingMinor > 0 ? { totalMinor: input.shippingMinor, netMinor: shippingParts.net, taxMinor: shippingParts.tax, grossMinor: shippingParts.total } : null
  const sum = key => lines.reduce((total, line) => total + line[key], 0) - (discount?.[key] || 0) + (shipping?.[key] || 0)
  const totalMinor = sum('grossMinor')
  if (totalMinor < 0) throw new CommerceError('invalid_quote_discount')
  if (totalMinor > MAX_AMOUNT) throw new CommerceError('quote_total_too_large')
  return {
    version: 1,
    language: input.language,
    currency: catalog.currency,
    minorUnit: catalog.minorUnit,
    customer: input.customer,
    lines: lines.map(({ grossMinor, ...line }) => line),
    discount: discount ? (({ grossMinor, ...rest }) => rest)(discount) : null,
    shipping: shipping ? (({ grossMinor, ...rest }) => rest)(shipping) : null,
    tax,
    subtotalMinor,
    netMinor: sum('netMinor'),
    taxMinor: sum('taxMinor'),
    totalMinor,
    delivery: input.delivery,
    note: input.note,
    validityDays: input.validityDays,
    invoiceRequested: input.invoiceRequested,
    submissionId: input.submissionId
  }
}

export function quoteReference (row) {
  return `P-${row.year}-${String(row.number).padStart(4, '0')}`
}

function money (data, minor) {
  return formatMoney(minor, data.currency, data.minorUnit, data.language)
}

function discountLabel (t, data) {
  if (data.discount?.type !== 'percent') return t.discount
  return `${t.discount} (${String(data.discount.value / 100).replace('.', data.language === 'es' ? ',' : '.')} %)`
}

function shippingLabel (t, catalog) {
  return catalog?.invoice?.shippingLabel || t.shipping
}

// Order totals in the shape notices, invoices and the panel already read.
export function quoteTotals (data) {
  const tax = data.tax
  const merchandiseNet = data.lines.reduce((total, line) => total + line.netMinor, 0)
  const merchandiseTax = data.lines.reduce((total, line) => total + line.taxMinor, 0)
  const country = data.customer.country
  const added = tax.mode === 'exclusive' ? data.taxMinor : 0
  return {
    schemaVersion: 2,
    policyVersion: 'quote',
    // Card payments ship to the quoted country; a country without a known postal
    // format accepts any code (the merchant priced that destination herself).
    destination: { country, excludedPostalPrefixes: [], ...(Object.hasOwn(POSTAL_CODE_FORMATS, country) ? {} : { anyPostalCode: true }) },
    currency: data.currency,
    minorUnit: data.minorUnit,
    subtotalMinor: data.subtotalMinor,
    merchandiseNetMinor: merchandiseNet,
    merchandiseTaxMinor: merchandiseTax,
    merchandiseTotalMinor: merchandiseNet + merchandiseTax,
    discountMinor: data.discount?.totalMinor || 0,
    discountNetMinor: data.discount?.netMinor || 0,
    discountTaxMinor: data.discount?.taxMinor || 0,
    discountTax: { mode: tax.mode, rateBps: tax.rateBps },
    shippingBaseMinor: data.shipping?.totalMinor || 0,
    shippingNetMinor: data.shipping?.netMinor || 0,
    shippingTaxMinor: data.shipping?.taxMinor || 0,
    shippingTax: { mode: tax.mode, rateBps: tax.rateBps },
    shippingTotalMinor: (data.shipping?.netMinor || 0) + (data.shipping?.taxMinor || 0),
    taxMinor: data.taxMinor,
    addedTaxMinor: added,
    netMinor: data.netMinor,
    totalMinor: data.totalMinor,
    lines: data.lines.map(line => ({
      productId: line.productId,
      sku: line.sku,
      quantity: line.quantity,
      taxMode: tax.mode,
      taxRateBps: tax.rateBps,
      netMinor: line.netMinor,
      taxMinor: line.taxMinor,
      totalMinor: line.netMinor + line.taxMinor
    }))
  }
}

// Snapshot of an order made from a proforma (card attempt or transfer).
export function quoteOrderSnapshot ({ row, data, catalog, orderId, key, now, method, paymentText = null }) {
  const totals = quoteTotals(data)
  return {
    orderId,
    idempotencyKey: key,
    catalogRelease: catalog.release || 'quote',
    currency: data.currency,
    minorUnit: data.minorUnit,
    locale: data.language,
    // Not 'finite': a proforma never holds stock reservations.
    stockMode: 'quote',
    createdAt: now,
    items: data.lines.map(line => ({
      productId: line.productId,
      sku: line.sku,
      name: line.description,
      quantity: line.quantity,
      unitAmountMinor: line.unitMinor,
      lineTotalMinor: line.totalMinor,
      weightGrams: null
    })),
    subtotalMinor: data.subtotalMinor,
    quote: { id: row.id, reference: quoteReference(row), version: row.version },
    ...(data.invoiceRequested ? { invoiceRequested: true } : {}),
    paymentMethod: method,
    ...(paymentText ? { paymentText } : {}),
    totals,
    totalMinor: totals.totalMinor
  }
}

function customerAddress (customer, language) {
  return [
    customer.line1,
    customer.line2,
    [customer.postalCode, customer.locality].filter(Boolean).join(' '),
    regionName(customer.country, customer.region),
    customer.country ? countryName(customer.country, language) : null
  ].filter(Boolean)
}

// Payment options offered by a proforma when it is sent.
export function paymentOptions (catalog, env, data) {
  return {
    card: isCheckoutAuthorized(catalog, env) && data.totalMinor >= MIN_CARD_MINOR,
    transfer: catalog?.quotes?.transfer || null
  }
}

export function renderProformaPdf ({ row, data, catalog, issuedAt, options }) {
  const t = textFor(data.language)
  const labels = labelsFor(data.language)
  const invoice = catalog.invoice
  const reference = quoteReference(row)
  const tax = data.tax
  const entry = item => ({ ...item, taxMode: tax.mode, taxRateBps: tax.rateBps })
  const lines = data.lines.map(line => entry({ description: line.description, quantity: line.quantity, unitMinor: line.unitMinor, totalMinor: line.totalMinor, netMinor: line.netMinor, taxMinor: line.taxMinor }))
  const discount = data.discount ? entry({ description: discountLabel(t, data), totalMinor: -data.discount.totalMinor, netMinor: -data.discount.netMinor, taxMinor: -data.discount.taxMinor }) : null
  const shipping = data.shipping ? entry({ description: shippingLabel(t, catalog), totalMinor: data.shipping.totalMinor, netMinor: data.shipping.netMinor, taxMinor: data.shipping.taxMinor }) : null
  const date = localDate(issuedAt, invoice.timezone)
  const validUntil = localDate(issuedAt + data.validityDays * DAY, invoice.timezone)
  const transfer = options.transfer
  return renderDocumentPdf({
    data: {
      language: data.language,
      currency: data.currency,
      minorUnit: data.minorUnit,
      seller: invoice.seller,
      customer: { name: data.customer.businessName || data.customer.name, address: customerAddress(data.customer, data.language), ...(data.customer.taxId ? { taxId: data.customer.taxId } : {}) },
      lines,
      discount,
      shipping,
      taxes: groupTaxes(discount ? [...lines, discount] : lines, shipping),
      totalMinor: data.totalMinor
    },
    title: t.title,
    number: reference,
    headerLines: [`${t.number} ${reference}`, `${t.date}: ${displayDate(date)}`, `${t.validUntil}: ${displayDate(validUntil)}`],
    created: new Date(issuedAt * 1000),
    notes: [
      data.delivery && `${t.delivery}: ${data.delivery}`,
      options.card && t.card,
      transfer && t.transfer(transfer.iban, transfer.holder || invoice.seller.name, reference),
      tax.mode === 'inclusive' ? labels.inclusive : tax.mode === 'exclusive' ? labels.exclusive : null,
      tax.mode === 'exempt' ? invoice.exemptNote : null,
      data.note,
      catalog.quotes?.note,
      t.notInvoice
    ]
  })
}

function siteName (catalog) {
  try {
    return new URL(catalog?.origin).host || 'SanSoul'
  } catch {
    return 'SanSoul'
  }
}

const CELL = 'padding:6px 10px;border-bottom:1px solid #e5e5e5;vertical-align:top'
const TABLE = 'border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;margin:0 0 16px'
const PARAGRAPH = 'font-family:Arial,sans-serif;font-size:14px'

function summaryRows (t, data, catalog) {
  const rows = data.lines.map(line => [line.description, String(line.quantity), money(data, line.totalMinor)])
  const foot = []
  if (data.discount || data.shipping) foot.push([t.subtotal, money(data, data.subtotalMinor)])
  if (data.discount) foot.push([discountLabel(t, data), money(data, -data.discount.totalMinor)])
  if (data.shipping) foot.push([shippingLabel(t, catalog), money(data, data.shipping.totalMinor)])
  if (data.tax.mode === 'exclusive') foot.push([t.tax, money(data, data.taxMinor)])
  foot.push([t.total, money(data, data.totalMinor), true])
  if (data.tax.mode === 'inclusive' && data.taxMinor > 0) foot.push([t.taxIncluded, money(data, data.taxMinor)])
  if (data.tax.mode === 'exempt') foot.push([t.exempt, ''])
  return { rows, foot }
}

export function proformaMessage ({ row, data, catalog, link, options }) {
  const t = textFor(data.language)
  const site = siteName(catalog)
  const reference = quoteReference(row)
  const { rows, foot } = summaryRows(t, data, catalog)
  const total = money(data, data.totalMinor)
  const transfer = options.transfer
  const holder = transfer ? transfer.holder || catalog.invoice?.seller?.name : null
  const table = `<table cellpadding="0" cellspacing="0" style="${TABLE}">` +
    `<thead><tr>${[t.product, t.quantity, t.amount].map((cell, i) => `<th style="${CELL};background:#f4f4f4;text-align:${i ? 'right' : 'left'}">${escapeHtml(cell)}</th>`).join('')}</tr></thead><tbody>` +
    rows.map(cells => `<tr>${cells.map((cell, i) => `<td style="${CELL};text-align:${i ? 'right;white-space:nowrap' : 'left'}">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('') +
    foot.map(([label, value, strong]) => `<tr><td colspan="2" style="${CELL};text-align:right${strong ? ';font-weight:bold' : ''}">${escapeHtml(label)}</td><td style="${CELL};text-align:right;white-space:nowrap${strong ? ';font-weight:bold' : ''}">${escapeHtml(value)}</td></tr>`).join('') +
    '</tbody></table>'
  const details = [
    data.delivery && [t.delivery, data.delivery],
    [t.validUntil, displayDate(localDate((row.sent_at ?? Math.floor(Date.now() / 1000)) + data.validityDays * DAY, catalog.invoice.timezone))]
  ].filter(Boolean)
  const button = options.card ? `<p style="margin:20px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:15px;font-weight:bold">${escapeHtml(t.payCard(total))}</a></p>` : ''
  const transferLines = transfer ? t.transferLines(transfer.iban, holder, reference) : []
  const html = `<div style="${PARAGRAPH}"><p>${escapeHtml(t.greeting(data.customer.name))}</p><p>${escapeHtml(t.intro)}</p></div>` +
    table +
    `<p style="${PARAGRAPH}">${details.map(([key, value]) => `<strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}`).join('<br>')}</p>` +
    button +
    (transfer ? `<p style="${PARAGRAPH}">${escapeHtml(options.card ? t.payTransfer : t.payTransferAlone)}<br>${transferLines.map(escapeHtml).join('<br>')}<br>${escapeHtml(t.transferAfter)}</p>` : '') +
    (!options.card && !transfer ? `<p style="${PARAGRAPH}">${escapeHtml(t.noPayment)}</p>` : '') +
    (data.note ? `<p style="${PARAGRAPH}">${escapeHtml(data.note).replace(/\n/g, '<br>')}</p>` : '') +
    `<p style="${PARAGRAPH}">${escapeHtml(t.reply)}</p>`
  const text = [
    t.greeting(data.customer.name), '', t.intro, '',
    ...rows.map(([name, quantity, value]) => `- ${quantity} × ${name} — ${value}`),
    ...foot.map(([label, value]) => value ? `${label}: ${value}` : label), '',
    ...details.map(([key, value]) => `${key}: ${value}`), '',
    ...(options.card ? [t.payCardText, link, ''] : []),
    ...(transfer ? [options.card ? t.payTransfer : t.payTransferAlone, ...transferLines, t.transferAfter, ''] : []),
    ...(!options.card && !transfer ? [t.noPayment, ''] : []),
    ...(data.note ? [data.note, ''] : []),
    t.reply, ''
  ].join('\n')
  return { subject: t.subject(reference, site), text, html }
}

// ---------------------------------------------------------------------------
// Panel (orders admin, GitHub person): list, save, preview, send, transfer, cancel.

const QUOTE_COLUMNS = `q.id, q.submission_id, q.year, q.number, q.version, q.status, q.data_json, q.currency, q.total_minor,
  q.order_id, q.payment_method, q.sent_at, q.valid_until, q.paid_at, q.created_at, q.updated_at`

function publicQuote (row) {
  return {
    id: row.id,
    reference: quoteReference(row),
    submission_id: row.submission_id,
    version: row.version,
    status: row.status,
    data: JSON.parse(row.data_json),
    currency: row.currency,
    total_minor: row.total_minor,
    order_id: row.order_id,
    order_payment_status: row.order_payment_status ?? null,
    payment_method: row.payment_method,
    sent_at: row.sent_at,
    valid_until: row.valid_until,
    paid_at: row.paid_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  }
}

async function loadQuote (db, id) {
  if (!QUOTE_ID.test(id || '')) throw new CommerceError('quote_not_found', 404)
  const row = await db.prepare(`SELECT ${QUOTE_COLUMNS}, o.payment_status AS order_payment_status FROM quotes q LEFT JOIN orders o ON o.id = q.order_id WHERE q.id = ?`).bind(id).first()
  if (!row) throw new CommerceError('quote_not_found', 404)
  return row
}

function requireQuotes (catalog) {
  if (!catalog?.quotes) throw new CommerceError('quotes_disabled', 404)
  if (!catalog.invoice) throw new CommerceError('invoice_not_configured', 409)
}

// Everything the editor needs besides the quotes themselves.
function setup (catalog, env) {
  const language = catalog.invoice?.language || 'es'
  const destinations = catalog.checkout?.totalsPolicy?.destinations || {}
  return {
    currency: catalog.currency,
    minor_unit: catalog.minorUnit,
    language,
    validity_days: catalog.quotes.validityDays,
    card: isCheckoutAuthorized(catalog, env),
    transfer: Boolean(catalog.quotes.transfer),
    exempt_note: catalog.invoice?.exemptNote || null,
    countries: Object.keys(destinations),
    excluded_postal_prefixes: Object.fromEntries(Object.entries(destinations).map(([country, rule]) => [country, rule.excludedPostalPrefixes || []])),
    tax: standardTax(catalog, Object.keys(destinations)[0]),
    shipping_applies: catalog.checkout?.shippingPolicy !== 'not_applicable',
    products: (catalog.products || []).filter(product => product.active).map(product => ({
      id: product.id,
      sku: product.sku,
      name: product.names[language] || product.names.es || Object.values(product.names)[0],
      price_minor: product.quote ? null : product.priceMinor,
      weight_grams: product.weightGrams ?? null
    }))
  }
}

// Cart quote requests stored by core/forms (same Worker, FORMS_DB). `form` comes
// from the forms summary (quote_forms); only that form's submissions are read.
async function listRequests (env, form) {
  if (!form || !env.FORMS_DB) return []
  if (typeof form !== 'string' || form.length > 300) throw new CommerceError('invalid_form')
  const rows = (await env.FORMS_DB.prepare('SELECT id, fields, created_at FROM forms_submissions WHERE form_key = ? ORDER BY created_at DESC LIMIT 100').bind(form).all()).results || []
  return rows.map(row => {
    let fields = []
    try {
      fields = JSON.parse(row.fields)
    } catch {}
    return { id: row.id, fields: Array.isArray(fields) ? fields : [], created_at: row.created_at }
  })
}

async function listQuotes (db, env, catalog, url) {
  const rows = (await db.prepare(`SELECT ${QUOTE_COLUMNS}, o.payment_status AS order_payment_status FROM quotes q LEFT JOIN orders o ON o.id = q.order_id ORDER BY q.created_at DESC LIMIT 100`).all()).results || []
  return jsonResponse({ setup: setup(catalog, env), quotes: rows.map(publicQuote), requests: await listRequests(env, url.searchParams.get('form')) })
}

async function saveQuote (request, db, catalog, now) {
  const { value } = await readJsonBody(request, 32768)
  if (!object(value)) throw new CommerceError('invalid_quote')
  const { id, ...rest } = value
  const data = computeQuote(normalizeQuoteInput(rest, catalog), catalog)
  if (id !== undefined && id !== null) {
    const row = await loadQuote(db, id)
    if (!['draft', 'sent'].includes(row.status)) throw new CommerceError('quote_locked', 409)
    // An edited proforma goes back to draft: its link stops paying until it is sent again.
    const result = await db.prepare(`
      UPDATE quotes SET data_json = ?, total_minor = ?, status = 'draft', token_hash = NULL, updated_at = ?
      WHERE id = ? AND status IN ('draft', 'sent') AND updated_at = ?
    `).bind(JSON.stringify(data), data.totalMinor, now, row.id, row.updated_at).run()
    if (!result.meta?.changes) throw new CommerceError('quote_changed', 409)
    return jsonResponse({ quote: publicQuote(await loadQuote(db, row.id)) })
  }
  const quoteId = crypto.randomUUID()
  const year = Number(localDate(now, catalog.invoice.timezone).slice(0, 4))
  try {
    await db.prepare(`
      INSERT INTO quotes (id, submission_id, year, number, version, status, data_json, currency, total_minor, created_at, updated_at)
      SELECT ?, ?, ?, COALESCE((SELECT MAX(number) FROM quotes WHERE year = ?), 0) + 1, 0, 'draft', ?, ?, ?, ?, ?
    `).bind(quoteId, data.submissionId, year, year, JSON.stringify(data), data.currency, data.totalMinor, now, now).run()
  } catch (error) {
    if (/UNIQUE/i.test(String(error?.message)) && data.submissionId) throw new CommerceError('quote_exists', 409)
    throw error
  }
  return jsonResponse({ quote: publicQuote(await loadQuote(db, quoteId)) }, 201)
}

function proformaResponse (row, catalog, env, now) {
  const data = JSON.parse(row.data_json)
  const bytes = renderProformaPdf({ row, data, catalog, issuedAt: row.sent_at ?? now, options: paymentOptions(catalog, env, data) })
  return new Response(bytes, {
    headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${quoteReference(row)}.pdf"`, 'cache-control': 'no-store' }
  })
}

function randomToken () {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const providers = new Map()
function mailer (fetch) {
  if (!providers.has(fetch)) providers.set(fetch, createGmailProvider({ fetch }))
  return providers.get(fetch)
}

function merchantAddress (env) {
  const first = (env.COMMERCE_NOTIFY_TO || '').split(',').map(value => value.trim()).find(Boolean)
  return first && validAddress(first) ? first : null
}

// Best effort: an open Checkout Session of a superseded attempt stops accepting payments.
async function expireOpenSession (db, env, orderId) {
  if (!orderId) return
  try {
    const order = await db.prepare("SELECT session_id FROM orders WHERE id = ? AND payment_status = 'pending' AND session_id IS NOT NULL").bind(orderId).first()
    if (order?.session_id && env.COMMERCE_PROVIDER === 'stripe') await stripeRequest(env, `/checkout/sessions/${encodeURIComponent(order.session_id)}/expire`, { method: 'POST' })
  } catch {}
}

// The mail goes first; the row changes only after Gmail accepted it. Each send has
// a new link: links of earlier sends stop working.
async function sendQuote (db, env, catalog, row, now, fetch) {
  if (!['draft', 'sent'].includes(row.status)) throw new CommerceError('quote_locked', 409)
  const data = JSON.parse(row.data_json)
  const token = randomToken()
  const sent = { ...row, version: row.version + 1, sent_at: now }
  const options = paymentOptions(catalog, env, data)
  const link = `${catalog.origin}/api/commerce/quote/${token}`
  const gmail = mailer(fetch)
  const authority = await gmail.authority(env, { account: env.COMMERCE_NOTIFY_ACCOUNT || '' })
  const message = proformaMessage({ row: sent, data, catalog, link, options })
  const replyTo = merchantAddress(env)
  await gmail.send({
    env,
    authority,
    signal: AbortSignal.timeout(20000),
    beforeSend: async () => {},
    message: {
      fromName: catalog.invoice.seller.name,
      to: [data.customer.email],
      ...(replyTo ? { replyTo } : {}),
      ...message,
      messageId: `quote-${row.id}-${sent.version}`,
      attachments: [{ name: `${quoteReference(row)}.pdf`, type: 'application/pdf', bytes: renderProformaPdf({ row: sent, data, catalog, issuedAt: now, options }) }]
    }
  })
  await expireOpenSession(db, env, row.order_id)
  await db.prepare(`
    UPDATE quotes SET version = ?, status = 'sent', token_hash = ?, sent_at = ?, valid_until = ?, updated_at = ?
    WHERE id = ? AND version = ? AND status IN ('draft', 'sent')
  `).bind(sent.version, await sha256Hex(token), now, now + data.validityDays * DAY, now, row.id, row.version).run()
  return jsonResponse({ quote: publicQuote(await loadQuote(db, row.id)), card: options.card, transfer: Boolean(options.transfer) })
}

// Bank transfer received: the proforma becomes a paid order (invoice, notices, panel).
async function markTransfer (db, env, catalog, row, now) {
  if (!['draft', 'sent'].includes(row.status)) throw new CommerceError('quote_locked', 409)
  const data = JSON.parse(row.data_json)
  const c = data.customer
  if (catalog.checkout?.shippingPolicy !== 'not_applicable' && (!c.line1 || !c.locality || !c.postalCode)) throw new CommerceError('quote_address_required', 409)
  if (c.postalCode && Object.hasOwn(POSTAL_CODE_FORMATS, c.country) && !normalizePostalCode(c.country, c.postalCode)) throw new CommerceError('invalid_postal_code', 409)
  const orderId = crypto.randomUUID()
  const key = `quote-${orderId}`
  const t = labelsFor(data.language)
  const snapshot = quoteOrderSnapshot({ row, data, catalog, orderId, key, now, method: 'transfer', paymentText: catalog.quotes?.transfer?.paymentText || t.paidTransfer })
  const json = JSON.stringify(snapshot)
  const order = { id: orderId, snapshot_json: json }
  // Delivery details reuse the only source the schema knows; snapshot.paymentMethod
  // tells a transfer apart.
  const details = {
    buyerName: c.name,
    buyerEmail: c.email,
    buyerPhone: c.phone || null,
    recipientName: c.name,
    line1: c.line1 || null,
    line2: c.line2 || null,
    city: c.locality || null,
    state: c.region || null,
    postalCode: c.postalCode || null,
    countryCode: c.country,
    businessName: c.businessName || null,
    taxId: c.taxId || null,
    taxIdType: null,
    recipientPhone: null,
    deliveryNotes: null
  }
  await expireOpenSession(db, env, row.order_id)
  await db.batch([
    db.prepare(`
      INSERT INTO commerce_idempotency (idempotency_key, request_hash, order_id, snapshot_json, status, created_at, updated_at, expires_at)
      SELECT ?, 'quote-transfer', ?, ?, 'creating', ?, ?, ? WHERE EXISTS (SELECT 1 FROM quotes WHERE id = ? AND status IN ('draft', 'sent'))
    `).bind(key, orderId, json, now, now, now, row.id),
    db.prepare(`
      INSERT INTO orders (id, idempotency_key, catalog_release, currency, amount_total_minor, snapshot_json, payment_status, fulfillment_status, reservation_state, created_at, updated_at, expires_at)
      SELECT ?, ?, ?, ?, ?, ?, 'pending', 'awaiting_payment', 'unreserved', ?, ?, ? WHERE EXISTS (SELECT 1 FROM commerce_idempotency WHERE idempotency_key = ?)
    `).bind(orderId, key, snapshot.catalogRelease, snapshot.currency, snapshot.totalMinor, json, now, now, now, key),
    ...paymentStatements(db, order, { state: 'paid', deliveryDetails: details }, now)
  ])
  const paid = await loadQuote(db, row.id)
  if (paid.status !== 'paid' || paid.order_id !== orderId) throw new CommerceError('quote_changed', 409)
  return jsonResponse({ quote: publicQuote(paid), order_id: orderId })
}

async function cancelQuote (db, env, row, now) {
  if (!['draft', 'sent'].includes(row.status)) throw new CommerceError('quote_locked', 409)
  await expireOpenSession(db, env, row.order_id)
  await db.prepare("UPDATE quotes SET status = 'cancelled', token_hash = NULL, updated_at = ? WHERE id = ? AND status IN ('draft', 'sent')").bind(now, row.id).run()
  return jsonResponse({ quote: publicQuote(await loadQuote(db, row.id)) })
}

// Routes under /api/commerce/admin/quotes, already authorized by handleAdmin.
export async function handleQuotesAdmin ({ request, env, catalog, db, path, url, now, fetch = (...args) => globalThis.fetch(...args) }) {
  requireQuotes(catalog)
  const rest = path.replace(/^\/api\/commerce\/admin\/quotes\/?/, '')
  if (!rest && request.method === 'GET') return await listQuotes(db, env, catalog, url)
  if (!rest && request.method === 'POST') return await saveQuote(request, db, catalog, now)
  const match = rest.match(/^([0-9a-f-]{36})\/(proforma\.pdf|send|transfer|cancel)$/)
  if (!match) throw new CommerceError('not_found', 404)
  const row = await loadQuote(db, match[1])
  if (match[2] === 'proforma.pdf' && request.method === 'GET') return proformaResponse(row, catalog, env, now)
  if (request.method !== 'POST') throw new CommerceError('method_not_allowed', 405)
  if (match[2] === 'send') return await sendQuote(db, env, catalog, row, now, fetch)
  if (match[2] === 'transfer') return await markTransfer(db, env, catalog, row, now)
  return await cancelQuote(db, env, row, now)
}

// ---------------------------------------------------------------------------
// Customer link: GET shows the proforma and the pay button (mail scanners only
// follow GET, so they never create sessions); POST /pay opens Stripe Checkout.

function page ({ language, title, body, status = 200, catalog }) {
  const t = textFor(language).page
  const html = `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>` +
    '<style>body{margin:0;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1a1a;background:#f6f6f4}main{max-width:560px;margin:0 auto;padding:32px 16px}h1{font-size:1.4rem;margin:0 0 16px}table{width:100%;border-collapse:collapse;margin:16px 0;background:#fff}td{padding:8px 10px;border-bottom:1px solid #e5e5e5;vertical-align:top}td.n{text-align:right;white-space:nowrap}tr.t td{font-weight:700}button{font:inherit;font-weight:700;padding:12px 20px;border:0;background:#111;color:#fff;cursor:pointer;width:100%}p.m{color:#555;font-size:.9rem}a{color:inherit}</style>' +
    `</head><body><main><h1>${escapeHtml(title)}</h1>${body}<p class="m"><a href="${escapeHtml(catalog?.origin || '/')}">${escapeHtml(t.home)}</a></p></main></body></html>`
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-robots-tag': 'noindex',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://checkout.stripe.com; base-uri 'none'; frame-ancestors 'none'"
    }
  })
}

function messagePage (catalog, language, text, status = 200, title = null) {
  return page({ catalog, language, title: title || siteName(catalog), body: `<p>${escapeHtml(text)}</p>`, status })
}

async function quoteByToken (db, token) {
  return db.prepare(`SELECT ${QUOTE_COLUMNS}, o.payment_status AS order_payment_status FROM quotes q LEFT JOIN orders o ON o.id = q.order_id WHERE q.token_hash = ?`).bind(await sha256Hex(token)).first()
}

// null when the proforma can be paid now, else the page that explains why not.
function unavailable (catalog, row, now) {
  const fallback = catalog?.invoice?.language || 'es'
  if (!row) return messagePage(catalog, fallback, textFor(fallback).page.invalid, 404)
  const data = JSON.parse(row.data_json)
  const t = textFor(data.language).page
  if (row.status === 'paid' || ['paid', 'partially_refunded', 'refunded'].includes(row.order_payment_status)) return messagePage(catalog, data.language, t.paid)
  if (row.status === 'cancelled') return messagePage(catalog, data.language, t.cancelled, 410)
  if (row.status !== 'sent') return messagePage(catalog, data.language, t.draft, 409)
  if (!row.valid_until || row.valid_until <= now) return messagePage(catalog, data.language, t.expired(displayDate(localDate(row.valid_until || now, catalog.invoice.timezone))), 410)
  return null
}

function quotePage (catalog, env, row, notice = null) {
  const data = JSON.parse(row.data_json)
  const t = textFor(data.language)
  const options = paymentOptions(catalog, env, data)
  const { rows, foot } = summaryRows(t, data, catalog)
  const reference = quoteReference(row)
  const transfer = options.transfer
  const body = (notice ? `<p><strong>${escapeHtml(notice)}</strong></p>` : '') +
    `<table>${rows.map(([name, quantity, value]) => `<tr><td>${escapeHtml(`${quantity} × ${name}`)}</td><td class="n">${escapeHtml(value)}</td></tr>`).join('')}` +
    foot.map(([label, value, strong]) => `<tr${strong ? ' class="t"' : ''}><td>${escapeHtml(label)}</td><td class="n">${escapeHtml(value)}</td></tr>`).join('') + '</table>' +
    (data.delivery ? `<p>${escapeHtml(t.delivery)}: ${escapeHtml(data.delivery)}</p>` : '') +
    (options.card
      ? `<form method="post" action="${escapeHtml(`${catalog.origin}/api/commerce/quote/${row.token}/pay`)}"><button type="submit">${escapeHtml(t.page.pay(money(data, data.totalMinor)))}</button></form><p class="m">${escapeHtml(t.page.secure)}</p>`
      : `<p>${escapeHtml(t.page.cardOff)}</p>`) +
    (transfer ? `<p>${escapeHtml(options.card ? t.payTransfer : t.payTransferAlone)}<br>${t.transferLines(transfer.iban, transfer.holder || catalog.invoice.seller.name, reference).map(escapeHtml).join('<br>')}</p>` : '') +
    (!options.card && !transfer ? `<p>${escapeHtml(t.noPayment)}</p>` : '')
  return page({ catalog, language: data.language, title: t.page.title(reference), body })
}

async function payQuote (request, env, catalog, token, now) {
  const db = requireDatabase(env)
  await consumeRateLimit(db, request, env, now)
  await expirePendingCheckouts(db, now)
  const row = await quoteByToken(db, token)
  const blocked = unavailable(catalog, row, now)
  if (blocked) return blocked
  row.token = token
  const data = JSON.parse(row.data_json)
  if (!paymentOptions(catalog, env, data).card) return quotePage(catalog, env, row)
  requireCheckoutAuthorization(catalog, env)

  // The latest attempt is reused while it is pending for this version of the proforma.
  let attempt = row.order_id
    ? await db.prepare(`
        SELECT o.id, o.payment_status, o.snapshot_json, i.idempotency_key, i.status, i.checkout_url, i.expires_at
        FROM orders o JOIN commerce_idempotency i ON i.order_id = o.id WHERE o.id = ?
      `).bind(row.order_id).first()
    : null
  if (attempt) {
    const snapshot = JSON.parse(attempt.snapshot_json)
    if (attempt.payment_status !== 'pending' || snapshot.quote?.version !== row.version || snapshot.paymentMethod !== 'card') attempt = null
  }
  let snapshot
  let key
  if (attempt) {
    snapshot = JSON.parse(attempt.snapshot_json)
    key = attempt.idempotency_key
    if (attempt.status === 'ready' && attempt.checkout_url && attempt.expires_at > now + 60) {
      const capability = await resolveBuyerStatusCapability(db, request, attempt.id, key, now)
      return new Response(null, { status: 303, headers: { location: attempt.checkout_url, 'referrer-policy': 'no-referrer', 'cache-control': 'no-store', ...(capability ? { 'set-cookie': buyerStatusCookie(attempt.id, capability.token, capability.stored.expires_at, now) } : {}) } })
    }
  } else {
    const orderId = crypto.randomUUID()
    key = `quote-${orderId}`
    snapshot = quoteOrderSnapshot({ row, data, catalog, orderId, key, now, method: 'card' })
    const json = JSON.stringify(snapshot)
    await db.batch([
      db.prepare(`
        INSERT INTO commerce_idempotency (idempotency_key, request_hash, order_id, snapshot_json, status, created_at, updated_at, expires_at)
        SELECT ?, 'quote-card', ?, ?, 'creating', ?, ?, ? WHERE EXISTS (SELECT 1 FROM quotes WHERE id = ? AND status = 'sent' AND version = ?)
      `).bind(key, orderId, json, now, now, now + STRIPE_IDEMPOTENCY_RETRY_TTL_SECONDS, row.id, row.version),
      db.prepare(`
        INSERT INTO orders (id, idempotency_key, catalog_release, currency, amount_total_minor, snapshot_json, payment_status, fulfillment_status, reservation_state, created_at, updated_at, expires_at)
        SELECT ?, ?, ?, ?, ?, ?, 'pending', 'awaiting_payment', 'unreserved', ?, ?, ? WHERE EXISTS (SELECT 1 FROM commerce_idempotency WHERE idempotency_key = ?)
      `).bind(orderId, key, snapshot.catalogRelease, snapshot.currency, snapshot.totalMinor, json, now, now, now + CHECKOUT_RECOVERY_TTL_SECONDS, key),
      db.prepare("UPDATE quotes SET order_id = ?, updated_at = ? WHERE id = ? AND status = 'sent' AND version = ? AND EXISTS (SELECT 1 FROM orders WHERE id = ?)").bind(orderId, now, row.id, row.version, orderId)
    ])
    const created = await db.prepare('SELECT id FROM orders WHERE id = ?').bind(orderId).first()
    if (!created) throw new CommerceError('quote_changed', 409)
  }
  const capability = await resolveBuyerStatusCapability(db, request, snapshot.orderId, key, now, true)
  const session = await createPaymentProvider(env).createCheckoutSession({ catalog, snapshot, providerIdempotencyKey: snapshot.orderId })
  const persistedAt = Math.floor(Date.now() / 1000)
  const expired = await persistCheckoutSession(db, key, snapshot, session, env, persistedAt)
  if (expired) {
    const order = await db.prepare('SELECT id, snapshot_json FROM orders WHERE id = ?').bind(snapshot.orderId).first()
    if (order) await applyPaymentState(db, order, { state: 'expired', sessionId: session.id }, persistedAt)
    return quotePage(catalog, env, row, textFor(data.language).page.retry)
  }
  return new Response(null, {
    status: 303,
    headers: {
      location: session.url,
      'referrer-policy': 'no-referrer',
      'cache-control': 'no-store',
      ...(capability ? { 'set-cookie': buyerStatusCookie(snapshot.orderId, capability.token, capability.stored.expires_at, persistedAt) } : {})
    }
  })
}

// /api/commerce/quote/<token> (GET) and /api/commerce/quote/<token>/pay (POST).
export async function handleQuoteLink (request, env, catalog, token, pay) {
  const language = catalog?.invoice?.language || 'es'
  try {
    if (!catalog?.quotes || !catalog.invoice || !QUOTE_TOKEN.test(token)) return messagePage(catalog, language, textFor(language).page.invalid, 404)
    const now = Math.floor(Date.now() / 1000)
    if (pay) {
      if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } })
      if (!isSameOrigin(request, catalog.origin, await verifiedProxy(request, env))) throw new CommerceError('origin_not_allowed', 403)
      return await payQuote(request, env, catalog, token, now)
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { allow: 'GET' } })
    const row = await quoteByToken(requireDatabase(env), token)
    const blocked = unavailable(catalog, row, now)
    if (blocked) return blocked
    row.token = token
    return quotePage(catalog, env, row)
  } catch (error) {
    if (error instanceof CommerceError && error.status < 500 && error.code !== 'rate_limited') return errorResponse(error)
    return messagePage(catalog, language, textFor(language).page.retry, error?.status === 429 ? 429 : 503)
  }
}
