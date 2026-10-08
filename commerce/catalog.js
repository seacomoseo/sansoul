import { CommerceError } from './http.js'

const PRODUCT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SKU = /^[A-Z0-9][A-Z0-9_-]{2,63}$/

export const MAX_ITEMS = 10
export const MAX_QUANTITY = 10
export const MAX_ORDER_MINOR = 9000000000000

function object (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function assertCatalog (catalog) {
  if (!object(catalog) || catalog.schemaVersion !== 2) throw new Error('invalid_catalog')
  if (typeof catalog.enabled !== 'boolean') throw new Error('invalid_catalog')
  if (!object(catalog.checkout) || typeof catalog.checkout.approved !== 'boolean') throw new Error('invalid_catalog')
  if (!/^[a-f0-9]{64}$/.test(catalog.release || '')) throw new Error('invalid_catalog')
  if (!/^[a-z]{3}$/.test(catalog.currency || '')) throw new Error('invalid_catalog')
  if (!Number.isInteger(catalog.minorUnit) || catalog.minorUnit < 0 || catalog.minorUnit > 3) throw new Error('invalid_catalog')
  if (!['made_to_order', 'finite'].includes(catalog.stockMode)) throw new Error('invalid_catalog')
  let origin
  try {
    origin = new URL(catalog.origin)
  } catch {
    throw new Error('invalid_catalog')
  }
  if (!['https:', 'http:'].includes(origin.protocol) || origin.origin !== catalog.origin || origin.username || origin.password) throw new Error('invalid_catalog')
  if (!Array.isArray(catalog.products)) throw new Error('invalid_catalog')

  const ids = new Set()
  const skus = new Set()
  for (const product of catalog.products) {
    if (!object(product) || !PRODUCT_ID.test(product.id || '') || !SKU.test(product.sku || '')) throw new Error('invalid_catalog_product')
    if (ids.has(product.id) || skus.has(product.sku)) throw new Error('duplicate_catalog_identity')
    ids.add(product.id)
    skus.add(product.sku)
    if (typeof product.active !== 'boolean' || typeof product.quote !== 'boolean') throw new Error('invalid_catalog_product')
    if (!object(product.names) || !Object.values(product.names).every(name => typeof name === 'string' && name.length > 0 && name.length <= 200)) throw new Error('invalid_catalog_product')
    if (product.quote ? product.priceMinor !== null : !Number.isSafeInteger(product.priceMinor) || product.priceMinor < 0) throw new Error('invalid_catalog_product')
  }
  return catalog
}

export function normalizeCart (payload) {
  if (!object(payload) || Object.keys(payload).length !== 1 || !Array.isArray(payload.items)) throw new CommerceError('invalid_cart')
  if (payload.items.length < 1 || payload.items.length > MAX_ITEMS) throw new CommerceError('invalid_cart')
  const seen = new Set()
  const items = payload.items.map(item => {
    if (!object(item) || Object.keys(item).some(key => !['id', 'quantity'].includes(key))) throw new CommerceError('invalid_cart_item')
    if (!PRODUCT_ID.test(item.id || '') || seen.has(item.id)) throw new CommerceError('invalid_product_id')
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY) throw new CommerceError('invalid_quantity')
    seen.add(item.id)
    return { id: item.id, quantity: item.quantity }
  })
  return items.sort((a, b) => a.id.localeCompare(b.id))
}

export function priceToMinor (value, minorUnit) {
  const text = String(value)
  if (!Number.isInteger(minorUnit) || minorUnit < 0 || minorUnit > 3 || !/^\d+(?:\.\d+)?$/.test(text)) throw new Error('invalid_price')
  const [whole, fraction = ''] = text.split('.')
  if (fraction.length > minorUnit) throw new Error('invalid_price_precision')
  const scale = 10n ** BigInt(minorUnit)
  const fractional = BigInt((fraction + '0'.repeat(minorUnit)).slice(0, minorUnit) || '0')
  const amount = BigInt(whole) * scale + fractional
  if (amount > BigInt(MAX_ORDER_MINOR)) throw new Error('invalid_price')
  return Number(amount)
}

export function buildOrderSnapshot (catalog, cart, orderId, locale = 'es', createdAt = Date.now()) {
  assertCatalog(catalog)
  if (!catalog.enabled) throw new CommerceError('commerce_disabled', 404)
  if (!PRODUCT_ID.test(orderId || '')) throw new Error('invalid_order_id')
  const products = new Map(catalog.products.map(product => [product.id, product]))
  let subtotalMinor = 0
  const items = cart.map(({ id, quantity }) => {
    const product = products.get(id)
    if (!product || !product.active) throw new CommerceError('product_unavailable', 409)
    if (product.quote) throw new CommerceError('quote_only', 409)
    const lineTotalMinor = product.priceMinor * quantity
    if (!Number.isSafeInteger(lineTotalMinor) || lineTotalMinor < 0) throw new CommerceError('invalid_price')
    subtotalMinor += lineTotalMinor
    if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor > MAX_ORDER_MINOR) throw new CommerceError('order_total_too_large')
    const name = product.names[locale] || product.names.es || Object.values(product.names)[0]
    return {
      productId: product.id,
      sku: product.sku,
      name,
      quantity,
      unitAmountMinor: product.priceMinor,
      lineTotalMinor
    }
  })
  return {
    orderId,
    catalogRelease: catalog.release,
    currency: catalog.currency,
    minorUnit: catalog.minorUnit,
    stockMode: catalog.stockMode,
    subtotalMinor,
    totalMinor: subtotalMinor,
    items,
    createdAt
  }
}

export async function sha256Hex (value) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
