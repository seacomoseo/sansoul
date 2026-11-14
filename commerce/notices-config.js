import { TIME_ZONES } from './invoice.js'
import { LOCALES } from './messages.js'

// Build-time validation of `order_notices` and `invoice` in data/commerce.yml.
// Output goes into the catalog; neither key present means today's behavior.

function plain (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function text (value, max, error) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || Array.from(value).some(char => char.charCodeAt(0) < 32 && char !== '\n')) throw new Error(error)
  return value.trim()
}

function bool (value, fallback, error) {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') throw new Error(error)
  return value
}

function language (value, error, allowed = ['es', 'en']) {
  if (value === undefined) return 'es'
  if (!allowed.includes(value)) throw new Error(error)
  return value
}

function only (value, keys, error) {
  if (!plain(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error(error)
}

export function compileInvoice (source) {
  if (source === undefined || source === null) return null
  const error = 'data/commerce.yml: invalid_invoice'
  only(source, ['enabled', 'language', 'timezone', 'seller', 'series', 'payment_text', 'exempt_note', 'footer', 'item_label', 'shipping_label', 'simplified'], error)
  if (typeof source.enabled !== 'boolean') throw new Error(error)
  if (!source.enabled) return null
  const seller = source.seller
  only(seller, ['name', 'tax_id', 'address', 'email', 'phone'], error)
  if (!Array.isArray(seller.address) || seller.address.length < 1 || seller.address.length > 4) throw new Error(error)
  const series = source.series ?? {}
  only(series, ['prefix', 'year', 'digits', 'start', 'credit_prefix'], error)
  const prefix = series.prefix === undefined ? 'F' : series.prefix
  if (typeof prefix !== 'string' || !/^[A-Za-z0-9]{1,12}$/.test(prefix)) throw new Error(error)
  const creditPrefix = series.credit_prefix === undefined ? `R${prefix}` : series.credit_prefix
  if (typeof creditPrefix !== 'string' || !/^[A-Za-z0-9]{1,12}$/.test(creditPrefix) || creditPrefix === prefix) throw new Error(error)
  const digits = series.digits === undefined ? 4 : series.digits
  const start = series.start === undefined ? 1 : series.start
  if (!Number.isSafeInteger(digits) || digits < 1 || digits > 8 || !Number.isSafeInteger(start) || start < 1 || start > 999999999) throw new Error(error)
  const timezone = source.timezone === undefined ? 'Europe/Madrid' : source.timezone
  if (!TIME_ZONES.includes(timezone)) throw new Error(`${error}_timezone_one_of_${TIME_ZONES.join('|')}`)
  const compiled = {
    language: language(source.language, error),
    timezone,
    seller: {
      name: text(seller.name, 120, error),
      taxId: text(seller.tax_id, 40, error),
      address: seller.address.map(line => text(line, 120, error)),
      ...(seller.email === undefined ? {} : { email: text(seller.email, 120, error) }),
      ...(seller.phone === undefined ? {} : { phone: text(seller.phone, 40, error) })
    },
    series: { prefix, creditPrefix, year: bool(series.year, true, error), digits, start },
    itemLabel: source.item_label === undefined ? '{name}' : text(source.item_label, 120, error)
  }
  // A buyer without tax ID gets «FACTURA SIMPLIFICADA»; on by default only for Spanish invoices.
  compiled.simplified = bool(source.simplified, compiled.language === 'es', error)
  // Absent: the default text of the language. false/null/'' : print nothing.
  if (Object.hasOwn(source, 'payment_text')) {
    compiled.paymentText = source.payment_text === false || source.payment_text === null || source.payment_text === '' ? null : text(source.payment_text, 120, error)
  }
  if (source.exempt_note !== undefined) compiled.exemptNote = text(source.exempt_note, 300, error)
  if (source.footer !== undefined) compiled.footer = text(source.footer, 600, error)
  if (source.shipping_label !== undefined) compiled.shippingLabel = text(source.shipping_label, 60, error)
  return compiled
}

const TEMPLATE_KINDS = Object.freeze({
  buyer_paid: ['subject', 'intro', 'outro'],
  buyer_invoice: ['subject', 'intro', 'outro'],
  buyer_shipped: ['subject', 'intro', 'outro'],
  merchant_paid: ['subject', 'intro']
})

function escapeHtml (value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

// Small Markdown subset for author texts: paragraphs, line breaks, **bold**, *em* and
// [links](https://…). Output passes the forms sanitizer again when sent.
export function markdownToHtml (source) {
  const inline = line => escapeHtml(line)
    .replace(/\[([^\]\n]{1,200})\]\(((?:https?:\/\/|mailto:)[^)\s"]{1,500})\)/g, (match, label, href) => `<a href="${href}">${label}</a>`)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
  return source.trim().split(/\n\s*\n/).map(block => `<p>${block.split('\n').map(inline).join('<br>')}</p>`).join('')
}

// Plain-text twin of a template: links become "label (url)", emphasis is dropped.
function markdownToText (source) {
  return source.trim()
    .replace(/\[([^\]\n]{1,200})\]\(((?:https?:\/\/|mailto:)[^)\s"]{1,500})\)/g, '$1 ($2)')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
}

// A template text: one string for every language, or a map language → string.
function localized (value, max, error, html) {
  const entries = typeof value === 'string' ? [['*', value]] : plain(value) ? Object.entries(value) : null
  if (!entries || !entries.length || entries.some(([key]) => key !== '*' && !LOCALES.includes(key))) throw new Error(error)
  return Object.fromEntries(entries.map(([key, item]) => {
    const checked = text(item, max, error)
    return [key, html ? { text: markdownToText(checked), html: markdownToHtml(checked) } : checked]
  }))
}

function compileTemplates (source, error) {
  if (source === undefined) return null
  if (!plain(source) || Object.keys(source).some(key => !Object.hasOwn(TEMPLATE_KINDS, key))) throw new Error(`${error}_templates`)
  const compiled = {}
  for (const [kind, parts] of Object.entries(source)) {
    only(parts, TEMPLATE_KINDS[kind], `${error}_templates`)
    compiled[kind] = {}
    for (const [part, value] of Object.entries(parts)) compiled[kind][part] = localized(value, part === 'subject' ? 150 : 2000, `${error}_templates`, part !== 'subject')
  }
  return compiled
}

function choice (value, allowed, fallback, error) {
  if (value === undefined) return fallback
  if (!allowed.includes(value)) throw new Error(error)
  return value
}

// 14.3 keys (merchant_details, buyer_confirmation, boolean buyer_invoice) keep
// working; mixing an old key with its replacement is a build error.
export function compileNotices (source, invoice) {
  if (source === undefined || source === null) return null
  const error = 'data/commerce.yml: invalid_order_notices'
  only(source, ['enabled', 'language', 'merchant', 'merchant_details', 'merchant_invoice', 'merchant_language', 'buyer', 'buyer_confirmation', 'buyer_invoice', 'buyer_shipped', 'templates'], error)
  if (typeof source.enabled !== 'boolean') throw new Error(error)
  if (!source.enabled) return null
  if (source.merchant !== undefined && source.merchant_details !== undefined) throw new Error('data/commerce.yml: order_notices_merchant_and_merchant_details')
  if (source.buyer !== undefined && source.buyer_confirmation !== undefined) throw new Error('data/commerce.yml: order_notices_buyer_and_buyer_confirmation')
  const withInvoice = invoice !== null
  const merchant = source.merchant_details === undefined
    ? choice(source.merchant, ['full', 'summary', 'none'], 'full', error)
    : bool(source.merchant_details, true, error) ? 'full' : 'summary'
  const buyer = source.buyer_confirmation === undefined
    ? choice(source.buyer, ['own', 'stripe', 'none'], 'own', error)
    : bool(source.buyer_confirmation, true, error) ? 'own' : 'none'
  const buyerInvoice = typeof source.buyer_invoice === 'boolean'
    ? (source.buyer_invoice ? 'always' : 'never')
    : choice(source.buyer_invoice, ['always', 'on_request', 'never'], withInvoice && buyer !== 'none' ? 'on_request' : 'never', error)
  const notices = {
    language: language(source.language, error, LOCALES),
    merchant,
    merchantLanguage: language(source.merchant_language, error),
    merchantInvoice: bool(source.merchant_invoice, withInvoice && merchant !== 'none', error),
    buyer,
    buyerInvoice
  }
  // Only when on, so catalogs of existing projects keep their exact shape.
  if (bool(source.buyer_shipped, false, error)) notices.buyerShipped = true
  const templates = compileTemplates(source.templates, error)
  if (templates) notices.templates = templates
  if ((notices.merchantInvoice || notices.buyerInvoice !== 'never') && !withInvoice) throw new Error('data/commerce.yml: order_notices_invoice_requires_invoice')
  if (notices.merchantInvoice && merchant === 'none') throw new Error('data/commerce.yml: merchant_invoice_requires_merchant_notice')
  // With Stripe's receipt the invoice goes in its own short email; with no
  // confirmation at all (buyer: none) there is nothing to attach it to.
  if (notices.buyerInvoice !== 'never' && buyer === 'none') throw new Error('data/commerce.yml: buyer_invoice_requires_buyer_confirmation')
  return notices
}
