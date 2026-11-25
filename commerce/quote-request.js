// Quote request from the cart (data/commerce.yml `cart_quote: true`). The request is
// an ordinary Worker form (core/forms): stored in D1, listed in the panel and
// delivered by the forms outbox. This enricher runs inside the forms Worker before
// the submission is stored: it turns the cart the browser sent (product IDs and
// quantities only) into authoritative lines from the catalog, and explains why the
// order needs a quote, so the merchant can price shipping without opening the site.
// No Intl here (Workers Free CPU): amounts and weights are formatted by hand.
import { MAX_ITEMS, MAX_QUANTITY } from './catalog.js'
import { formatMoney } from './invoice.js'

const PRODUCT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const COUNTRY = /^[A-Z]{2}$/
// Product page paths from the storefront: same-site, relative, no scheme or host.
const PATH = /^\/(?!\/)[\w\-./%~]{0,300}$/
export const QUOTE_REQUEST_TYPE = 'commerce_quote'

const TEXT = Object.freeze({
  es: {
    product: 'Producto',
    sku: 'Ref.',
    quantity: 'Uds.',
    unit: 'Precio',
    line: 'Importe',
    weight: 'Peso',
    size: 'Caja (cm)',
    panel: 'Preparar la proforma en el panel',
    subtotal: 'Subtotal de productos',
    units: 'Unidades',
    totalWeight: 'Peso total',
    reasonsTitle: 'Por qué necesita presupuesto',
    reason: 'Motivo del presupuesto',
    cartTitle: 'Carrito',
    onRequest: 'A consultar',
    unavailable: 'Producto no disponible',
    unknownWeight: 'sin peso',
    quoteOnly: name => `Producto con precio a consultar: ${name}`,
    missing: id => `Producto que ya no está en el catálogo (${id})`,
    destination: 'Destino sin tarifa de envío fija',
    postal: (code, country) => `Código postal ${code} (${country}) fuera de la tarifa de envío fija`,
    tooManyUnits: (units, max) => `${units} unidades (envío fijo hasta ${max})`,
    tooHeavy: (weight, max) => `Peso total ${weight} (envío fijo hasta ${max})`,
    weightUnknown: names => `Sin peso registrado: ${names}`,
    none: 'Ninguno según la tarifa: lo pide el cliente'
  },
  en: {
    product: 'Product',
    sku: 'SKU',
    quantity: 'Qty',
    unit: 'Price',
    line: 'Amount',
    weight: 'Weight',
    size: 'Box (cm)',
    panel: 'Prepare the pro forma in the panel',
    subtotal: 'Products subtotal',
    units: 'Units',
    totalWeight: 'Total weight',
    reasonsTitle: 'Why it needs a quote',
    reason: 'Quote reason',
    cartTitle: 'Cart',
    onRequest: 'On request',
    unavailable: 'Product unavailable',
    unknownWeight: 'no weight',
    quoteOnly: name => `Price on request: ${name}`,
    missing: id => `Product no longer in the catalog (${id})`,
    destination: 'Destination without a flat shipping rate',
    postal: (code, country) => `Postal code ${code} (${country}) outside the flat shipping rate`,
    tooManyUnits: (units, max) => `${units} units (flat shipping up to ${max})`,
    tooHeavy: (weight, max) => `Total weight ${weight} (flat shipping up to ${max})`,
    weightUnknown: names => `No weight recorded: ${names}`,
    none: 'None by the rates: the customer asked for it'
  }
})

function object (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function escapeHtml (value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

// 1250 → "1,25 kg"; under one kilo, grams.
export function formatWeight (grams, language = 'es') {
  const comma = language !== 'en'
  if (grams < 1000) return `${grams} g`
  const kilos = (Math.round(grams / 10) / 100).toFixed(2).replace(/\.?0+$/, '')
  return `${comma ? kilos.replace('.', ',') : kilos} kg`
}

// The browser sends {items: [{id, quantity, path}], country, postalCode}; anything
// else is not a cart built by core/assets/js/commerce.js.
export function parseQuoteCart (value) {
  let cart
  try {
    cart = JSON.parse(value)
  } catch {
    return null
  }
  if (!object(cart) || !Array.isArray(cart.items) || cart.items.length < 1 || cart.items.length > MAX_ITEMS) return null
  if (Object.keys(cart).some(key => !['items', 'country', 'postalCode'].includes(key))) return null
  const seen = new Set()
  const items = []
  for (const item of cart.items) {
    if (!object(item) || Object.keys(item).some(key => !['id', 'quantity', 'path'].includes(key))) return null
    if (typeof item.id !== 'string' || !PRODUCT_ID.test(item.id) || seen.has(item.id.toLowerCase())) return null
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY) return null
    if (item.path !== undefined && (typeof item.path !== 'string' || !PATH.test(item.path) || item.path.includes('..'))) return null
    seen.add(item.id.toLowerCase())
    items.push({ id: item.id.toLowerCase(), quantity: item.quantity, path: item.path || '' })
  }
  const country = typeof cart.country === 'string' && COUNTRY.test(cart.country) ? cart.country : null
  const postalCode = typeof cart.postalCode === 'string' ? cart.postalCode.replace(/\s+/g, '').toUpperCase().slice(0, 16) : ''
  return { items, country, postalCode }
}

// Every reason that applies, not just the first one the checkout would hit.
function quoteReasons ({ policy, lines, cart, text, language }) {
  const reasons = []
  for (const line of lines) {
    if (!line.product) reasons.push(text.missing(line.id))
    else if (line.product.quote) reasons.push(text.quoteOnly(line.name))
  }
  const destinations = object(policy?.destinations) ? policy.destinations : {}
  const codes = Object.keys(destinations)
  let rule = null
  if (cart.country && Object.hasOwn(destinations, cart.country)) {
    rule = destinations[cart.country]
    const postal = cart.postalCode
    if (postal && Array.isArray(rule.excludedPostalPrefixes) && rule.excludedPostalPrefixes.some(prefix => postal.startsWith(prefix))) {
      reasons.push(text.postal(postal, cart.country))
    }
  } else if (codes.length) {
    reasons.push(text.destination)
    // A single-country shop still knows its parcel limits.
    if (codes.length === 1) rule = destinations[codes[0]]
  }
  const shipping = object(rule?.shipping) ? rule.shipping : {}
  const priced = lines.filter(line => line.product)
  const units = priced.reduce((total, line) => total + line.quantity, 0)
  if (Number.isSafeInteger(shipping.maxUnits) && units > shipping.maxUnits) reasons.push(text.tooManyUnits(units, shipping.maxUnits))
  if (Number.isSafeInteger(shipping.maxWeightGrams)) {
    const unknown = priced.filter(line => !Number.isSafeInteger(line.weightGrams))
    const grams = priced.reduce((total, line) => total + (line.weightGrams || 0) * line.quantity, 0)
    if (unknown.length) reasons.push(text.weightUnknown(unknown.map(line => line.name).join(', ')))
    else if (grams > shipping.maxWeightGrams) reasons.push(text.tooHeavy(formatWeight(grams, language), formatWeight(shipping.maxWeightGrams, language)))
  }
  return reasons.length ? reasons : [text.none]
}

const CELL = 'padding:6px 10px;border-bottom:1px solid #e5e5e5;vertical-align:top'
const TABLE = 'border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;margin:0 0 16px'
const TITLE = 'font-family:Arial,sans-serif;font-size:15px;margin:0 0 6px'

function linesTable ({ head, rows, right, foot }) {
  const align = index => right.includes(index) ? ';text-align:right;white-space:nowrap' : ';text-align:left'
  return `<table cellpadding="0" cellspacing="0" style="${TABLE}">` +
    `<thead><tr>${head.map((cell, i) => `<th style="${CELL}${align(i)};background:#f4f4f4">${escapeHtml(cell)}</th>`).join('')}</tr></thead>` +
    `<tbody>${rows.map(row => `<tr>${row.map((cell, i) => `<td style="${CELL}${align(i)}">${cell.html ?? escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}` +
    foot.map(([label, value]) => `<tr><td colspan="${head.length - 1}" style="${CELL};text-align:right;font-weight:bold">${escapeHtml(label)}</td><td style="${CELL};text-align:right;white-space:nowrap;font-weight:bold">${escapeHtml(value)}</td></tr>`).join('') +
    '</tbody></table>'
}

/**
 * Returns `(context) => result` for createFormsWorker({ enrichers }).
 * context: { spec, fields, site, submissionId }. spec.enrich.cart names the hidden cart field.
 * result: { error } or { fields, owner, visitor, hide } where `fields` replace the
 * submitted ones (the cart JSON becomes a readable summary plus the reason), `owner`
 * and `visitor` are { html, text } blocks for the notice and the confirmation, and
 * `hide` lists the fields the notice already shows in its own block.
 */
export function createQuoteRequestEnricher (catalog) {
  const products = new Map((catalog?.products || []).map(product => [product.id.toLowerCase(), product]))
  const currency = catalog?.currency || 'eur'
  const minorUnit = Number.isInteger(catalog?.minorUnit) ? catalog.minorUnit : 2
  const policy = catalog?.checkout?.totalsPolicy || null

  // With the orders panel and proformas on, the notice links straight to this request.
  const panel = Boolean(catalog?.adminRepo && catalog?.quotes)

  return ({ spec, fields, site, submissionId }) => {
    if (!catalog?.enabled) return { error: 'commerce_disabled' }
    const cartField = spec?.enrich?.cart
    const raw = fields.find(([name]) => name === cartField)?.[1]
    const cart = typeof raw === 'string' ? parseQuoteCart(raw) : null
    if (!cart) return { error: 'invalid_cart' }
    const language = TEXT[spec.lang] ? spec.lang : 'en'
    const text = TEXT[language]
    const money = minor => formatMoney(minor, currency, minorUnit, language)

    const lines = cart.items.map(item => {
      const product = products.get(item.id)
      const usable = product && product.active
      const name = usable ? (product.names[language] || product.names.es || Object.values(product.names)[0]) : text.unavailable
      const unitMinor = usable && !product.quote ? product.priceMinor : null
      return {
        id: item.id,
        product: usable ? product : null,
        name,
        sku: usable ? product.sku : '',
        quantity: item.quantity,
        unitMinor,
        lineMinor: unitMinor === null ? null : unitMinor * item.quantity,
        weightGrams: usable && Number.isSafeInteger(product.weightGrams) ? product.weightGrams : null,
        size: usable && Array.isArray(product.dimensionsCm) ? product.dimensionsCm.map(value => String(value).replace('.', language === 'es' ? ',' : '.')).join(' × ') : '',
        url: usable && item.path && site ? `https://${site}${item.path}` : ''
      }
    })
    const subtotalMinor = lines.reduce((total, line) => total + (line.lineMinor || 0), 0)
    const complete = lines.every(line => line.lineMinor !== null)
    const units = lines.filter(line => line.product).reduce((total, line) => total + line.quantity, 0)
    const grams = lines.reduce((total, line) => total + (line.weightGrams || 0) * line.quantity, 0)
    const weighed = lines.filter(line => line.product).every(line => line.weightGrams !== null)
    const reasons = quoteReasons({ policy, lines, cart, text, language })
    const price = line => line.unitMinor === null ? text.onRequest : money(line.unitMinor)
    const amount = line => line.lineMinor === null ? text.onRequest : money(line.lineMinor)
    const subtotal = `${money(subtotalMinor)}${complete ? '' : ` + ${text.onRequest.toLowerCase()}`}`
    const weightTotal = grams ? `${formatWeight(grams, language)}${weighed ? '' : ` + ${text.unknownWeight}`}` : '—'

    // Stored fields: readable in the panel and in exports, no markup or links.
    const summary = [
      ...lines.map(line => `${line.quantity} × ${line.name}${line.sku ? ` (${line.sku})` : ''} · ${price(line)} = ${amount(line)}`),
      `${text.subtotal}: ${subtotal}`,
      `${text.units}: ${units} · ${text.totalWeight}: ${weightTotal}`
    ].join('\n')
    const reasonText = reasons.join('\n')
    const enriched = fields.map(([name, value]) => name === cartField ? [name, summary] : [name, value])
    enriched.push([text.reason, reasonText])

    const sized = lines.some(line => line.size)
    const panelUrl = panel && site && submissionId ? `https://${site}/admin/orders/#quote=${encodeURIComponent(submissionId)}` : ''
    const ownerRows = lines.map(line => [
      line.url ? { html: `<a href="${escapeHtml(line.url)}">${escapeHtml(line.name)}</a>` } : line.name,
      line.sku || '—',
      String(line.quantity),
      price(line),
      amount(line),
      ...(sized ? [line.size || '—'] : []),
      line.weightGrams === null ? '—' : formatWeight(line.weightGrams * line.quantity, language)
    ])
    const ownerHtml = (panelUrl ? `<p style="margin:0 0 16px"><a href="${escapeHtml(panelUrl)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:bold">${escapeHtml(text.panel)}</a></p>` : '') +
      `<p style="${TITLE}"><strong>${escapeHtml(text.cartTitle)}</strong></p>` +
      linesTable({
        head: [text.product, text.sku, text.quantity, text.unit, text.line, ...(sized ? [text.size] : []), text.weight],
        rows: ownerRows,
        right: [2, 3, 4, 5, 6],
        foot: [[text.subtotal, subtotal], [text.units, String(units)], [text.totalWeight, weightTotal]]
      }) +
      `<p style="${TITLE}"><strong>${escapeHtml(text.reasonsTitle)}</strong></p>` +
      `<ul style="font-family:Arial,sans-serif;font-size:14px;margin:0 0 16px;padding-left:20px">${reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>`
    const ownerText = [
      ...(panelUrl ? [`${text.panel}: ${panelUrl}`, ''] : []),
      `${text.cartTitle}:`,
      ...lines.map(line => `- ${line.quantity} × ${line.name}${line.sku ? ` (${line.sku})` : ''} · ${price(line)} = ${amount(line)}${line.weightGrams === null ? '' : ` · ${formatWeight(line.weightGrams * line.quantity, language)}`}${line.size ? ` · ${text.size}: ${line.size}` : ''}${line.url ? `\n  ${line.url}` : ''}`),
      `${text.subtotal}: ${subtotal}`,
      `${text.units}: ${units} · ${text.totalWeight}: ${weightTotal}`,
      '',
      `${text.reasonsTitle}:`,
      ...reasons.map(reason => `- ${reason}`)
    ].join('\n')

    // The visitor sees what they asked for, without SKUs, weights or rate details.
    const visitorHtml = linesTable({
      head: [text.product, text.quantity, text.unit, text.line],
      rows: lines.map(line => [line.name, String(line.quantity), price(line), amount(line)]),
      right: [1, 2, 3],
      foot: [[text.subtotal, subtotal]]
    })
    const visitorText = [
      ...lines.map(line => `- ${line.quantity} × ${line.name} · ${price(line)} = ${amount(line)}`),
      `${text.subtotal}: ${subtotal}`
    ].join('\n')

    return {
      fields: enriched,
      owner: { html: ownerHtml, text: ownerText },
      visitor: { html: visitorHtml, text: visitorText },
      hide: [cartField, text.reason]
    }
  }
}
