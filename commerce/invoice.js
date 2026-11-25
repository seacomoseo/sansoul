import { createPdf, wrapText } from './pdf.js'

// Invoices (facturas) and credit notes (rectificativas) generated in the Worker from
// the immutable order snapshot and the project's `invoice` configuration. Issued
// rows live in D1 `invoices` (migration 0007) with everything needed to redraw the
// PDF later; the number is assigned in the same INSERT that stores the row.

export class InvoiceError extends Error {
  constructor (code) {
    super(code)
    this.code = code
  }
}

const LABELS = Object.freeze({
  es: {
    invoice: 'FACTURA',
    creditNote: 'FACTURA RECTIFICATIVA',
    simplifiedInvoice: 'FACTURA SIMPLIFICADA',
    simplifiedCreditNote: 'FACTURA RECTIFICATIVA SIMPLIFICADA',
    number: 'Nº',
    date: 'Fecha',
    customer: 'CLIENTE',
    taxId: 'NIF',
    concept: 'Concepto',
    quantity: 'Cant.',
    price: 'Precio',
    amount: 'Importe',
    base: 'Base imponible',
    vat: 'IVA',
    exemptBase: 'Base exenta',
    total: 'TOTAL',
    payment: 'Forma de pago',
    inclusive: 'Precios con IVA incluido.',
    exclusive: 'Precios sin IVA.',
    rectifies: 'Rectifica la factura',
    shipping: 'Envío',
    discount: 'Descuento',
    paid: 'Pagado con tarjeta',
    paidTransfer: 'Pagado por transferencia bancaria'
  },
  en: {
    invoice: 'INVOICE',
    creditNote: 'CREDIT NOTE',
    simplifiedInvoice: 'SIMPLIFIED INVOICE',
    simplifiedCreditNote: 'SIMPLIFIED CREDIT NOTE',
    number: 'No.',
    date: 'Date',
    customer: 'CUSTOMER',
    taxId: 'Tax ID',
    concept: 'Description',
    quantity: 'Qty',
    price: 'Price',
    amount: 'Amount',
    base: 'Taxable amount',
    vat: 'VAT',
    exemptBase: 'Exempt amount',
    total: 'TOTAL',
    payment: 'Payment',
    inclusive: 'Prices include VAT.',
    exclusive: 'Prices exclude VAT.',
    rectifies: 'Corrects invoice',
    shipping: 'Shipping',
    discount: 'Discount',
    paid: 'Paid by card',
    paidTransfer: 'Paid by bank transfer'
  }
})

export function labelsFor (language) {
  return LABELS[language] || LABELS.es
}

// Document title: a buyer without tax ID gets a simplified invoice when the
// project enables it (`data.simplified`, set at issue time; older rows lack it).
function titleOf (labels, data, credit) {
  if (data.simplified && !data.customer?.taxId) return credit ? labels.simplifiedCreditNote : labels.simplifiedInvoice
  return credit ? labels.creditNote : labels.invoice
}

// No Intl anywhere on this path: constructing NumberFormat, DateTimeFormat or
// DisplayNames costs 7-50 ms of CPU on a cold isolate, which the Workers Free limit
// (10 ms per invocation) does not allow. Amounts, dates and country names are
// formatted by hand for the supported languages.
const SYMBOLS = Object.freeze({ EUR: '€', USD: '$', GBP: '£' })

export function formatMoney (minor, currency, minorUnit, language = 'es') {
  const negative = minor < 0
  const digits = String(Math.abs(minor)).padStart(minorUnit + 1, '0')
  const whole = digits.slice(0, digits.length - minorUnit)
  const fraction = minorUnit ? digits.slice(-minorUnit) : ''
  const spanish = language === 'es'
  // Comma decimals and the symbol after the amount; fr groups with a narrow space.
  const comma = spanish || ['de', 'fr', 'it', 'pt'].includes(language)
  const separator = language === 'fr' ? '\u202f' : comma ? '.' : ','
  // es-ES groups from five digits (1234,56 but 12.345,67); the rest from four.
  const grouped = !spanish || whole.length > 4 ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, separator) : whole
  const number = fraction ? `${grouped}${comma ? ',' : '.'}${fraction}` : grouped
  const code = currency.toUpperCase()
  const symbol = SYMBOLS[code]
  const sign = negative ? '-' : ''
  if (comma) return `${sign}${number}\u00a0${symbol || code}`
  return symbol ? `${sign}${symbol}${number}` : `${sign}${number}\u00a0${code}`
}

// Time zones with fixed rules (EU daylight saving: last Sunday of March to last
// Sunday of October, both at 01:00 UTC). Anything else is rejected at build time.
const EU_ZONES = Object.freeze({
  'Europe/Madrid': 1,
  'Europe/Paris': 1,
  'Europe/Berlin': 1,
  'Europe/Rome': 1,
  'Europe/Brussels': 1,
  'Europe/Amsterdam': 1,
  'Europe/Lisbon': 0,
  'Atlantic/Canary': 0,
  'Europe/London': 0,
  'Europe/Dublin': 0
})
const FIXED_ZONES = Object.freeze({ UTC: 0, 'America/Argentina/Buenos_Aires': -3, 'America/Bogota': -5, 'America/Lima': -5, 'America/Mexico_City': -6, 'America/Montevideo': -3 })
export const TIME_ZONES = Object.freeze([...Object.keys(EU_ZONES), ...Object.keys(FIXED_ZONES)])

function lastSunday (year, month) {
  return Date.UTC(year, month, 31 - new Date(Date.UTC(year, month, 31)).getUTCDay(), 1)
}

// Calendar date (YYYY-MM-DD) of a Unix time in a supported time zone.
export function localDate (seconds, timeZone) {
  const millis = seconds * 1000
  let offset = FIXED_ZONES[timeZone]
  if (offset === undefined) {
    const standard = EU_ZONES[timeZone]
    if (standard === undefined) throw new Error('unsupported_time_zone')
    const year = new Date(millis).getUTCFullYear()
    offset = standard + (millis >= lastSunday(year, 2) && millis < lastSunday(year, 9) ? 1 : 0)
  }
  return new Date(millis + offset * 3600000).toISOString().slice(0, 10)
}

export function displayDate (isoDate) {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

export function invoiceNumber (row, data = JSON.parse(row.data_json)) {
  return `${row.series}-${String(row.number).padStart(data.numberDigits || 4, '0')}`
}

const COUNTRIES = Object.freeze({
  es: { ES: 'España', FR: 'Francia', PT: 'Portugal', DE: 'Alemania', IT: 'Italia', GB: 'Reino Unido', IE: 'Irlanda', NL: 'Países Bajos', BE: 'Bélgica', AD: 'Andorra' },
  en: { ES: 'Spain', FR: 'France', PT: 'Portugal', DE: 'Germany', IT: 'Italy', GB: 'United Kingdom', IE: 'Ireland', NL: 'Netherlands', BE: 'Belgium', AD: 'Andorra' },
  de: { ES: 'Spanien', FR: 'Frankreich', PT: 'Portugal', DE: 'Deutschland', IT: 'Italien', GB: 'Vereinigtes Königreich', IE: 'Irland', NL: 'Niederlande', BE: 'Belgien', AD: 'Andorra' },
  fr: { ES: 'Espagne', FR: 'France', PT: 'Portugal', DE: 'Allemagne', IT: 'Italie', GB: 'Royaume-Uni', IE: 'Irlande', NL: 'Pays-Bas', BE: 'Belgique', AD: 'Andorre' },
  it: { ES: 'Spagna', FR: 'Francia', PT: 'Portogallo', DE: 'Germania', IT: 'Italia', GB: 'Regno Unito', IE: 'Irlanda', NL: 'Paesi Bassi', BE: 'Belgio', AD: 'Andorra' },
  pt: { ES: 'Espanha', FR: 'França', PT: 'Portugal', DE: 'Alemanha', IT: 'Itália', GB: 'Reino Unido', IE: 'Irlanda', NL: 'Países Baixos', BE: 'Bélgica', AD: 'Andorra' }
})

export function countryName (code, language) {
  return COUNTRIES[language]?.[code] || code
}

// Stripe returns the subdivision as its ISO 3166-2 suffix ("MU"); Spanish provinces
// read better by name on invoices and notices. Other countries keep the code.
const REGIONS = Object.freeze({
  ES: { A: 'Alicante', AB: 'Albacete', AL: 'Almería', AV: 'Ávila', B: 'Barcelona', BA: 'Badajoz', BI: 'Vizcaya', BU: 'Burgos', C: 'A Coruña', CA: 'Cádiz', CC: 'Cáceres', CE: 'Ceuta', CO: 'Córdoba', CR: 'Ciudad Real', CS: 'Castellón', CU: 'Cuenca', GC: 'Las Palmas', GI: 'Girona', GR: 'Granada', GU: 'Guadalajara', H: 'Huelva', HU: 'Huesca', J: 'Jaén', L: 'Lleida', LE: 'León', LO: 'La Rioja', LU: 'Lugo', M: 'Madrid', MA: 'Málaga', ML: 'Melilla', MU: 'Murcia', NA: 'Navarra', O: 'Asturias', OR: 'Ourense', P: 'Palencia', PM: 'Baleares', PO: 'Pontevedra', S: 'Cantabria', SA: 'Salamanca', SE: 'Sevilla', SG: 'Segovia', SO: 'Soria', SS: 'Guipúzcoa', T: 'Tarragona', TE: 'Teruel', TF: 'Santa Cruz de Tenerife', TO: 'Toledo', V: 'Valencia', VA: 'Valladolid', VI: 'Álava', Z: 'Zaragoza', ZA: 'Zamora' }
})

export function regionName (country, code) {
  return (code && REGIONS[country]?.[code]) || code || null
}

export function groupTaxes (lines, shipping) {
  const groups = new Map()
  for (const entry of [...lines, ...(shipping ? [shipping] : [])]) {
    const key = `${entry.taxMode}:${entry.taxRateBps}`
    const group = groups.get(key) || { mode: entry.taxMode, rateBps: entry.taxRateBps, baseMinor: 0, taxMinor: 0 }
    group.baseMinor += entry.netMinor
    group.taxMinor += entry.taxMinor
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => b.rateBps - a.rateBps)
}

// Pure: order snapshot (+ buyer details) + config -> the data stored with the invoice.
export function buildInvoiceData ({ order, details, config, issuedAt }) {
  if (!config?.seller) throw new InvoiceError('invoice_not_configured')
  let snapshot
  try {
    snapshot = JSON.parse(order.snapshot_json)
  } catch {
    throw new InvoiceError('invoice_snapshot_invalid')
  }
  const totals = snapshot.totals
  if (!totals || !Array.isArray(totals.lines) || !totals.shippingTax || !Number.isSafeInteger(totals.totalMinor)) throw new InvoiceError('invoice_totals_missing')
  if (totals.totalMinor !== order.amount_total_minor) throw new InvoiceError('invoice_total_mismatch')
  const labels = labelsFor(config.language)
  const byProduct = new Map(totals.lines.map(line => [line.productId, line]))
  // Proforma orders (14.11) may repeat a product or carry free lines: their tax
  // lines follow the items by position, and free lines print as written.
  const quote = Boolean(snapshot.quote)
  const lines = (snapshot.items || []).map((item, index) => {
    const tax = quote ? totals.lines[index] : byProduct.get(item.productId)
    if (!tax) throw new InvoiceError('invoice_totals_missing')
    return {
      description: quote && !item.productId ? item.name : config.itemLabel.replaceAll('{name}', item.name || item.sku).replaceAll('{sku}', item.sku || ''),
      quantity: item.quantity,
      unitMinor: item.unitAmountMinor,
      totalMinor: item.lineTotalMinor,
      netMinor: tax.netMinor,
      taxMinor: tax.taxMinor,
      taxMode: tax.taxMode,
      taxRateBps: tax.taxRateBps
    }
  })
  const shipping = totals.shippingBaseMinor > 0
    ? {
        description: config.shippingLabel || labels.shipping,
        totalMinor: totals.shippingBaseMinor,
        netMinor: totals.shippingNetMinor,
        taxMinor: totals.shippingTaxMinor,
        taxMode: totals.shippingTax.mode,
        taxRateBps: totals.shippingTax.rateBps
      }
    : null
  // A proforma discount is one negative line at the proforma's tax rate.
  const discount = totals.discountMinor > 0
    ? {
        description: labels.discount,
        totalMinor: -totals.discountMinor,
        netMinor: -totals.discountNetMinor,
        taxMinor: -totals.discountTaxMinor,
        taxMode: totals.discountTax.mode,
        taxRateBps: totals.discountTax.rateBps
      }
    : null
  const taxes = groupTaxes(discount ? [...lines, discount] : lines, shipping)
  const sum = taxes.reduce((total, group) => total + group.baseMinor + group.taxMinor, 0)
  if (sum !== totals.totalMinor) throw new InvoiceError('invoice_total_mismatch')
  const modes = new Set([...lines, ...(discount ? [discount] : []), ...(shipping ? [shipping] : [])].map(entry => entry.taxMode))
  // A company buyer (tax ID collected at checkout) is invoiced under its name and ID.
  const taxId = details?.buyer_tax_id || null
  const name = (taxId && details?.buyer_business_name) || details?.buyer_name || details?.recipient_name || details?.buyer_email || ''
  const address = [
    details?.address_line1,
    details?.address_line2,
    [details?.postal_code, details?.locality].filter(Boolean).join(' '),
    regionName(details?.country_code, details?.administrative_area),
    details?.country_code ? countryName(details.country_code, config.language) : null
  ].filter(Boolean)
  const hasPayment = config.paymentText !== null
  return {
    version: 1,
    language: config.language,
    numberDigits: config.series.digits,
    date: localDate(issuedAt, config.timezone),
    currency: totals.currency,
    minorUnit: totals.minorUnit,
    seller: config.seller,
    customer: { name, address, ...(taxId ? { taxId } : {}) },
    ...(config.simplified && !taxId ? { simplified: true } : {}),
    lines,
    ...(discount ? { discount } : {}),
    shipping,
    taxes,
    totalMinor: totals.totalMinor,
    pricesIncludeTax: modes.size === 1 && modes.has('inclusive') ? true : modes.size === 1 && modes.has('exclusive') ? false : null,
    // An order paid by transfer carries its own text, fixed when it was marked paid.
    paymentText: typeof snapshot.paymentText === 'string' ? snapshot.paymentText : hasPayment ? config.paymentText ?? labels.paid : null,
    exemptNote: modes.has('exempt') && config.exemptNote ? config.exemptNote : null,
    footer: config.footer || null
  }
}

// Full credit note for an issued invoice: every amount negated, own series.
export function buildCreditNoteData (invoiceRow, config, issuedAt) {
  const data = JSON.parse(invoiceRow.data_json)
  const negate = entry => ({ ...entry, unitMinor: entry.unitMinor === undefined ? undefined : -entry.unitMinor, totalMinor: -entry.totalMinor, netMinor: -entry.netMinor, taxMinor: -entry.taxMinor })
  return {
    ...data,
    numberDigits: config.series.digits,
    date: localDate(issuedAt, config.timezone),
    lines: data.lines.map(negate),
    ...(data.discount ? { discount: negate(data.discount) } : {}),
    shipping: data.shipping ? negate(data.shipping) : null,
    taxes: data.taxes.map(group => ({ ...group, baseMinor: -group.baseMinor, taxMinor: -group.taxMinor })),
    totalMinor: -data.totalMinor,
    rectifies: { number: invoiceNumber(invoiceRow, data), date: data.date }
  }
}

function seriesKey (config, date, kind) {
  const prefix = kind === 'credit_note' ? config.series.creditPrefix : config.series.prefix
  return config.series.year ? `${prefix}-${date.slice(0, 4)}` : prefix
}

// Idempotent per (order, kind, reference): a retry returns the stored row.
export async function issueInvoice (db, { orderId, data, config, issuedAt, kind = 'invoice', reference = 'order' }) {
  const series = seriesKey(config, data.date, kind)
  await db.prepare(`
    INSERT OR IGNORE INTO invoices (kind, order_id, reference, series, number, issued_at, total_minor, data_json)
    SELECT ?, ?, ?, ?, COALESCE((SELECT MAX(number) FROM invoices WHERE series = ?), ? - 1) + 1, ?, ?, ?
  `).bind(kind, orderId, reference, series, series, config.series.start, issuedAt, data.totalMinor, JSON.stringify(data)).run()
  const row = await db.prepare('SELECT id, kind, order_id, reference, series, number, issued_at, total_minor, data_json FROM invoices WHERE order_id = ? AND kind = ? AND reference = ?').bind(orderId, kind, reference).first()
  if (!row) throw new Error('invoice_issue_failed')
  return row
}

// The invoice of an order: the stored one, or a new one built from the order and
// the buyer details still on file. Data problems raise InvoiceError (the caller may
// degrade); anything else is a transient failure to retry.
export async function getOrIssueInvoice (db, { order, details, config, issuedAt }) {
  const existing = await db.prepare("SELECT id, kind, order_id, reference, series, number, issued_at, total_minor, data_json FROM invoices WHERE order_id = ? AND kind = 'invoice' AND reference = 'order'").bind(order.id).first()
  if (existing) return existing
  if (!['paid', 'partially_refunded', 'refunded'].includes(order.payment_status)) throw new InvoiceError('invoice_order_not_paid')
  const data = buildInvoiceData({ order, details, config, issuedAt })
  return issueInvoice(db, { orderId: order.id, data, config, issuedAt })
}

// When the order was paid: the creation time of its payment.paid outbox event,
// falling back to the last order update.
export async function paymentTime (db, order) {
  const event = await db.prepare('SELECT created_at FROM outbox WHERE event_key = ?').bind(`${order.id}:payment.paid`).first()
  return event?.created_at || order.updated_at
}

export function invoiceFilename (row) {
  return `${invoiceNumber(row).replace(/[^A-Za-z0-9._-]/g, '-')}.pdf`
}

const MARGIN = 50
const RIGHT = 595.28 - MARGIN
const BOTTOM = 780

// `branding` is the compiled invoice config: its optional logo and QR (14.21) are
// drawn at render time, so they are not part of the stored invoice data.
export function renderInvoicePdf (row, branding = null) {
  const data = JSON.parse(row.data_json)
  const labels = labelsFor(data.language)
  const number = invoiceNumber(row, data)
  const credit = row.kind === 'credit_note'
  return renderDocumentPdf({
    data,
    title: titleOf(labels, data, credit),
    number,
    headerLines: [`${labels.number} ${number}`, `${labels.date}: ${displayDate(data.date)}`, data.rectifies && `${labels.rectifies} ${data.rectifies.number} (${displayDate(data.rectifies.date)})`],
    created: new Date(row.issued_at * 1000),
    branding,
    notes: [
      data.paymentText && `${labels.payment}: ${data.paymentText}`,
      data.pricesIncludeTax === true ? labels.inclusive : data.pricesIncludeTax === false ? labels.exclusive : null,
      data.exemptNote,
      data.footer
    ]
  })
}

const LOGO_MAX_HEIGHT = 44
const LOGO_MAX_WIDTH = 170
const QR_SIZE = 66

// QR rows ('0101…') -> one filled path of horizontal runs, in module units.
function qrPath (rows) {
  const rects = []
  rows.forEach((row, y) => {
    for (const run of row.matchAll(/1+/g)) rects.push(`${run.index} ${y} ${run[0].length} 1 re`)
  })
  return `0 0 0 rg ${rects.join(' ')} f`
}

// Shared layout of invoices and proformas (14.11): seller and title header,
// customer block, lines (+ discount + shipping), tax breakdown, total and notes.
// With branding (14.21): the logo above the seller and the QR left of the totals.
export function renderDocumentPdf ({ data, title, number, headerLines, created, notes, branding = null }) {
  const labels = labelsFor(data.language)
  const money = minor => formatMoney(minor, data.currency, data.minorUnit, data.language)
  const pdf = createPdf({
    title: `${title} ${number}`,
    author: data.seller.name,
    created
  })
  let page = pdf.addPage()

  // Header: logo and seller on the left, document title and number on the right.
  let y = 62
  const logo = branding?.logo
  if (logo) {
    const height = Math.min(LOGO_MAX_HEIGHT, LOGO_MAX_WIDTH * logo.height / logo.width)
    const width = height * logo.width / logo.height
    page.vector(logo.ops, MARGIN, 40, width, height, { sourceWidth: logo.width, sourceHeight: logo.height })
    y = 40 + height + 22
  }
  page.text(data.seller.name, MARGIN, y, { size: 14, bold: true })
  const sellerLines = [...data.seller.address, data.seller.taxId && `${labels.taxId}: ${data.seller.taxId}`, data.seller.email, data.seller.phone].filter(Boolean)
  for (const line of sellerLines) {
    y += 13
    page.text(line, MARGIN, y, { size: 9, gray: 0.25 })
  }
  let titleY = 62
  page.text(title, RIGHT, titleY, { size: 18, bold: true, align: 'right' })
  for (const line of headerLines.filter(Boolean)) {
    titleY += 15
    page.text(line, RIGHT, titleY, { size: 10, align: 'right' })
  }
  y = Math.max(y, titleY) + 30

  // Customer block.
  page.rect(MARGIN, y - 11, RIGHT - MARGIN, 16, { gray: 0.92 })
  page.text(labels.customer, MARGIN + 5, y, { size: 9, bold: true })
  y += 17
  for (const line of [data.customer.name, ...data.customer.address, data.customer.taxId && `${labels.taxId}: ${data.customer.taxId}`].filter(Boolean)) {
    page.text(line, MARGIN + 5, y, { size: 10 })
    y += 13
  }
  y += 14

  // Lines table.
  const columns = { concept: MARGIN + 5, quantity: 350, price: 450, amount: RIGHT - 5 }
  const conceptWidth = columns.quantity - 40 - columns.concept
  const header = () => {
    page.rect(MARGIN, y - 11, RIGHT - MARGIN, 16, { gray: 0.92 })
    page.text(labels.concept, columns.concept, y, { size: 9, bold: true })
    page.text(labels.quantity, columns.quantity, y, { size: 9, bold: true, align: 'right' })
    page.text(labels.price, columns.price, y, { size: 9, bold: true, align: 'right' })
    page.text(labels.amount, columns.amount, y, { size: 9, bold: true, align: 'right' })
    y += 18
  }
  const newPage = () => {
    page = pdf.addPage()
    y = 62
  }
  header()
  const rows = [...data.lines, ...(data.discount ? [{ ...data.discount, quantity: null, unitMinor: null }] : []), ...(data.shipping ? [{ ...data.shipping, quantity: null, unitMinor: null }] : [])]
  for (const row of rows) {
    const wrapped = wrapText(row.description, 9.5, false, conceptWidth)
    const height = wrapped.length * 12 + 6
    if (y + height > BOTTOM) {
      newPage()
      header()
    }
    wrapped.forEach((line, index) => page.text(line, columns.concept, y + index * 12, { size: 9.5 }))
    if (row.quantity !== null) {
      page.text(String(row.quantity), columns.quantity, y, { size: 9.5, align: 'right' })
      page.text(money(row.unitMinor), columns.price, y, { size: 9.5, align: 'right' })
    }
    page.text(money(row.totalMinor), columns.amount, y, { size: 9.5, align: 'right' })
    y += height
    page.line(MARGIN, y - 8, RIGHT, y - 8, { width: 0.4, gray: 0.8 })
  }
  y += 6

  // Totals: tax breakdown by rate, then the grand total.
  const totalsRows = []
  for (const group of data.taxes) {
    if (group.mode === 'exempt') {
      totalsRows.push([labels.exemptBase, money(group.baseMinor)])
    } else {
      const rate = `${String(group.rateBps / 100).replace('.', data.language === 'es' ? ',' : '.')} %`
      totalsRows.push([`${labels.base} (${rate})`, money(group.baseMinor)], [`${labels.vat} ${rate}`, money(group.taxMinor)])
    }
  }
  const qr = branding?.qr
  if (y + Math.max(totalsRows.length * 14 + 40, qr ? QR_SIZE + 16 : 0) > BOTTOM) newPage()
  if (qr) {
    // Below the last row line with a quiet zone of at least four modules.
    const top = y + 2
    page.vector(qrPath(qr.modules), MARGIN, top, QR_SIZE, QR_SIZE, { sourceWidth: qr.modules.length, sourceHeight: qr.modules.length })
    page.text(qr.text.replace(/^https:\/\//, '').replace(/\/$/, ''), MARGIN + QR_SIZE / 2, top + QR_SIZE + 10, { size: 7.5, align: 'center', gray: 0.35 })
  }
  const totalsTop = y
  for (const [label, value] of totalsRows) {
    page.text(label, columns.price + 20, y, { size: 9.5, align: 'right' })
    page.text(value, columns.amount, y, { size: 9.5, align: 'right' })
    y += 14
  }
  page.line(columns.price - 70, y - 8, RIGHT, y - 8, { width: 0.8 })
  y += 8
  page.text(labels.total, columns.price + 20, y, { size: 12, bold: true, align: 'right' })
  page.text(money(data.totalMinor), columns.amount, y, { size: 12, bold: true, align: 'right' })
  y = Math.max(y + 30, qr ? totalsTop + QR_SIZE + 40 : 0)

  // Notes.
  for (const note of notes.filter(Boolean)) {
    const wrapped = wrapText(note, 9, false, RIGHT - MARGIN)
    if (y + wrapped.length * 12 > 800) newPage()
    for (const line of wrapped) {
      page.text(line, MARGIN, y, { size: 9, gray: 0.2 })
      y += 12
    }
    y += 4
  }
  return pdf.toBytes()
}
