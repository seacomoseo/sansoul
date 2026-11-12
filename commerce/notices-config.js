import { TIME_ZONES } from './invoice.js'

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

function language (value, error) {
  if (value === undefined) return 'es'
  if (!['es', 'en'].includes(value)) throw new Error(error)
  return value
}

function only (value, keys, error) {
  if (!plain(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error(error)
}

export function compileInvoice (source) {
  if (source === undefined || source === null) return null
  const error = 'data/commerce.yml: invalid_invoice'
  only(source, ['enabled', 'language', 'timezone', 'seller', 'series', 'payment_text', 'exempt_note', 'footer', 'item_label', 'shipping_label'], error)
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
  // Absent: the default text of the language. false/null/'' : print nothing.
  if (Object.hasOwn(source, 'payment_text')) {
    compiled.paymentText = source.payment_text === false || source.payment_text === null || source.payment_text === '' ? null : text(source.payment_text, 120, error)
  }
  if (source.exempt_note !== undefined) compiled.exemptNote = text(source.exempt_note, 300, error)
  if (source.footer !== undefined) compiled.footer = text(source.footer, 600, error)
  if (source.shipping_label !== undefined) compiled.shippingLabel = text(source.shipping_label, 60, error)
  return compiled
}

export function compileNotices (source, invoice) {
  if (source === undefined || source === null) return null
  const error = 'data/commerce.yml: invalid_order_notices'
  only(source, ['enabled', 'language', 'merchant_details', 'merchant_invoice', 'buyer_confirmation', 'buyer_invoice'], error)
  if (typeof source.enabled !== 'boolean') throw new Error(error)
  if (!source.enabled) return null
  const withInvoice = invoice !== null
  const notices = {
    language: language(source.language, error),
    merchantDetails: bool(source.merchant_details, true, error),
    merchantInvoice: bool(source.merchant_invoice, withInvoice, error),
    buyerConfirmation: bool(source.buyer_confirmation, true, error),
    buyerInvoice: bool(source.buyer_invoice, withInvoice, error)
  }
  if ((notices.merchantInvoice || notices.buyerInvoice) && !withInvoice) throw new Error('data/commerce.yml: order_notices_invoice_requires_invoice')
  if (notices.buyerInvoice && !notices.buyerConfirmation) throw new Error('data/commerce.yml: buyer_invoice_requires_buyer_confirmation')
  return notices
}
