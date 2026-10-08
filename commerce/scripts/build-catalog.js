import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseDocument } from 'yaml'
import { priceToMinor } from '../catalog.js'
import { CHECKOUT_SHIPPING_POLICIES, CHECKOUT_TAX_POLICIES, hasCompleteCommercialApproval, isValidCheckoutLegalVersion, isValidDestinationCountries } from '../approval.js'

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SKU = /^[A-Z0-9][A-Z0-9_-]{2,63}$/

function parseYaml (text, filename) {
  const document = parseDocument(text, { uniqueKeys: true })
  if (document.errors.length) {
    const line = document.errors[0].linePos?.[0]?.line
    throw new Error(`${filename}: invalid_yaml${line ? `_line_${line}` : ''}`)
  }
  const values = document.toJS()
  if (!values || typeof values !== 'object' || Array.isArray(values) || !Array.isArray(document.contents?.items)) {
    throw new Error(`${filename}: yaml_mapping_required`)
  }
  const nodes = new Map()
  for (const pair of document.contents.items) {
    if (typeof pair.key?.value !== 'string') throw new Error(`${filename}: yaml_string_keys_required`)
    nodes.set(pair.key.value, pair.value)
  }
  return { values, nodes }
}

function readFrontMatter (filename) {
  const text = readFileSync(filename, 'utf8')
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) throw new Error(`${filename}: missing_front_matter`)
  return parseYaml(match[1], filename)
}

function productFiles (directory) {
  try {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return productFiles(path)
      return entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('_') ? [path] : []
    }).sort()
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

function languageOf (filename) {
  return basename(filename).match(/\.([a-z]{2}(?:-[a-z]{2})?)\.md$/i)?.[1].toLowerCase() || 'und'
}

function buildProducts (root, currency, minorUnit) {
  const files = productFiles(resolve(root, 'content/product'))
  const byId = new Map()
  const bySku = new Map()
  for (const filename of files) {
    const parsed = readFrontMatter(filename)
    const front = parsed.values
    const id = typeof front.commerce_id === 'string' ? front.commerce_id : ''
    const sku = typeof front.sku === 'string' ? front.sku : ''
    if (!ID.test(id) || !SKU.test(sku)) throw new Error(`${filename}: commerce_id_and_unique_sku_required`)
    if (typeof front.commerce_active !== 'boolean') throw new Error(`${filename}: commerce_active_boolean_required`)
    const quote = front.commerce_quote === true
    if (front.commerce_quote !== undefined && typeof front.commerce_quote !== 'boolean') throw new Error(`${filename}: commerce_quote_boolean_required`)
    if (front.draft === true && front.commerce_active) throw new Error(`${filename}: draft_product_cannot_be_active`)
    const active = front.commerce_active && front.draft !== true
    const title = front.title
    if (typeof title !== 'string' || title.trim().length === 0 || title.length > 200) throw new Error(`${filename}: product_title_required`)
    const priceNode = parsed.nodes.get('price')
    const price = typeof front.price === 'number' ? priceNode?.source ?? front.price : front.price
    const priceMinor = quote ? null : front.price === undefined ? null : priceToMinor(price, minorUnit)
    if (active && !quote && priceMinor === null) throw new Error(`${filename}: active_product_price_required`)

    const idKey = id.toLowerCase()
    const product = byId.get(idKey) || { id, sku, active, quote, priceMinor, names: Object.create(null) }
    if (product.id !== id || product.sku !== sku || product.active !== active || product.quote !== quote || product.priceMinor !== priceMinor) throw new Error(`${filename}: translated_commerce_fields_mismatch`)
    const language = languageOf(filename)
    if (product.names[language]) throw new Error(`${filename}: duplicate_product_language`)
    product.names[language] = title.trim()
    byId.set(idKey, product)
    const knownSku = bySku.get(sku)
    if (knownSku && knownSku !== idKey) throw new Error(`${filename}: duplicate_sku`)
    bySku.set(sku, idKey)
  }
  return [...byId.values()].filter(product => product.active).sort((a, b) => a.id.localeCompare(b.id))
}

function readCommerceConfig (root) {
  const path = resolve(root, 'data/commerce.yml')
  try {
    return parseYaml(readFileSync(path, 'utf8'), path).values
  } catch (error) {
    if (error.code === 'ENOENT') return { enabled: false }
    throw error
  }
}

function buildCheckoutApproval (config) {
  if (config.checkout_approved !== undefined && typeof config.checkout_approved !== 'boolean') throw new Error('data/commerce.yml: checkout_approved_must_be_boolean')
  const checkout = {
    approved: config.checkout_approved === true,
    legalVersion: config.checkout_legal_version ?? null,
    destinationCountries: config.checkout_destination_countries ?? [],
    taxPolicy: config.checkout_tax_policy ?? null,
    shippingPolicy: config.checkout_shipping_policy ?? null
  }
  if (checkout.legalVersion !== null && !isValidCheckoutLegalVersion(checkout.legalVersion)) throw new Error('data/commerce.yml: invalid_checkout_legal_version')
  if (!isValidDestinationCountries(checkout.destinationCountries)) throw new Error('data/commerce.yml: invalid_checkout_destination_countries')
  if (checkout.taxPolicy !== null && !CHECKOUT_TAX_POLICIES.includes(checkout.taxPolicy)) throw new Error('data/commerce.yml: invalid_checkout_tax_policy')
  if (checkout.shippingPolicy !== null && !CHECKOUT_SHIPPING_POLICIES.includes(checkout.shippingPolicy)) throw new Error('data/commerce.yml: invalid_checkout_shipping_policy')
  if (checkout.approved && !hasCompleteCommercialApproval(checkout)) throw new Error('data/commerce.yml: checkout_approval_details_required')
  return checkout
}

function makeCatalog (root) {
  const theme = JSON.parse(readFileSync(resolve(root, 'themes/sansoul/package.json'), 'utf8'))
  const config = readCommerceConfig(root)
  const allowedConfigKeys = new Set(['enabled', 'functions_enabled', 'origin', 'currency', 'stock_mode', 'checkout_approved', 'checkout_legal_version', 'checkout_destination_countries', 'checkout_tax_policy', 'checkout_shipping_policy'])
  if (Object.keys(config).some(key => !allowedConfigKeys.has(key))) throw new Error('data/commerce.yml: unknown_configuration_key')
  if (config.functions_enabled !== undefined && typeof config.functions_enabled !== 'boolean') throw new Error('data/commerce.yml: functions_enabled_must_be_boolean')
  const functionsEnabled = config.functions_enabled ?? (config.enabled === true)
  const checkout = buildCheckoutApproval(config)
  if (config.enabled !== true) {
    if (config.enabled !== undefined && config.enabled !== false) throw new Error('data/commerce.yml: enabled_must_be_boolean')
    if (checkout.approved) throw new Error('data/commerce.yml: checkout_requires_commerce_enabled')
    const disabled = {
      schemaVersion: 2,
      enabled: false,
      functionsEnabled,
      checkout,
      themeVersion: theme.version,
      origin: 'https://example.invalid',
      currency: 'eur',
      minorUnit: 2,
      stockMode: 'made_to_order',
      products: []
    }
    return { ...disabled, release: createHash('sha256').update(JSON.stringify(disabled)).digest('hex') }
  }

  if (typeof config.origin !== 'string' || typeof config.currency !== 'string' || typeof config.stock_mode !== 'string') throw new Error('data/commerce.yml: origin_currency_stock_mode_required')
  let origin
  try {
    origin = new URL(config.origin)
  } catch {
    throw new Error('data/commerce.yml: invalid_origin')
  }
  if (origin.protocol !== 'https:' || origin.origin !== config.origin || origin.username || origin.password) throw new Error('data/commerce.yml: https_origin_required')
  if (!['made_to_order', 'finite'].includes(config.stock_mode)) throw new Error('data/commerce.yml: invalid_stock_mode')
  const currency = config.currency.toLowerCase()
  if (!/^[a-z]{3}$/.test(currency)) throw new Error('data/commerce.yml: invalid_currency')
  let minorUnit
  try {
    minorUnit = new Intl.NumberFormat('en', { style: 'currency', currency: currency.toUpperCase() }).resolvedOptions().maximumFractionDigits
  } catch {
    throw new Error('data/commerce.yml: invalid_currency')
  }
  const products = buildProducts(root, currency, minorUnit)
  const base = {
    schemaVersion: 2,
    enabled: true,
    functionsEnabled,
    checkout,
    themeVersion: theme.version,
    origin: origin.origin,
    currency,
    minorUnit,
    stockMode: config.stock_mode,
    products
  }
  return { ...base, release: createHash('sha256').update(JSON.stringify(base)).digest('hex') }
}

export function buildCatalog (root = process.cwd()) {
  const routesDirectory = resolve(root, 'functions/api/commerce')
  const functionRoot = resolve(root, 'functions')
  if (!filesExist(functionRoot) || !readdirSync(functionRoot, { withFileTypes: true }).some(entry => entry.isDirectory() && entry.name === 'api')) return null
  if (!filesExist(routesDirectory)) throw new Error('functions/api/commerce adapters are missing')
  const catalog = makeCatalog(root)
  const generatedDirectory = resolve(root, 'functions/_commerce')
  mkdirSync(generatedDirectory, { recursive: true })
  mkdirSync(resolve(root, 'public'), { recursive: true })
  const json = JSON.stringify(catalog).replace(/\$/g, '\\u0024').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  writeFileSync(join(generatedDirectory, 'catalog.generated.js'), `export const catalog = JSON.parse('${json}')\n`)
  const routes = catalog.functionsEnabled
    ? { version: 1, include: ['/api/commerce/*'], exclude: [] }
    : { version: 1, include: ['/'], exclude: ['/'] }
  writeFileSync(resolve(root, 'public/_routes.json'), `${JSON.stringify(routes, null, 2)}\n`)
  return catalog
}

function filesExist (directory) {
  try {
    return readdirSync(directory).length > 0
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const catalog = buildCatalog()
    if (catalog) process.stdout.write(`Commerce catalog ${catalog.enabled ? catalog.release : 'disabled'}\n`)
  } catch (error) {
    process.stderr.write(`Commerce catalog build failed: ${error.message}\n`)
    process.exitCode = 1
  }
}
