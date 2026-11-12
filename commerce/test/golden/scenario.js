import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { compileInvoice, compileNotices } from '../../notices-config.js'
import { calculateOrderTotals } from '../../totals.js'
import { dispatchScheduledNotices } from '../../admin.js'

// Golden scenario: the notices a shop configured like 3DNAU (14.3.3) sends, captured
// as raw MIME. Synthetic seller and buyer; same keys and shape as the real project.
// Any engine change must keep these bytes identical for an unchanged commerce.yml.
export const CONFIG = `
order_notices:
  enabled: true
  buyer_invoice: false
invoice:
  enabled: true
  language: es
  timezone: Europe/Madrid
  seller:
    name: Titular Ficticia
    tax_id: 00000000T
    address:
      - Calle Inventada 4, 2.º A
      - 30000 Ciudad (Provincia)
  series:
    prefix: WEB
  payment_text: Pagado con tarjeta bancaria
  item_label: "Venta material 3D ({name})"
  exempt_note: "Operación exenta de IVA según art. 21 Ley 37/1992 (envío a Canarias)"
`

export const MIGRATIONS = ['0001_commerce.sql', '0002_buyer_status.sql', '0003_provider_session_expiry.sql', '0004_operations_and_delivery.sql', '0005_outbox_indexes.sql', '0006_bounded_maintenance.sql', '0007_invoices.sql']
const PRODUCT = '11111111-1111-4111-8111-111111111111'
const PAID_AT = Date.UTC(2026, 10, 12, 10, 0, 0) / 1000
const SEND = 'https://www.googleapis.com/auth/gmail.send'

function snapshotFor (mode) {
  const tax = mode === 'exempt' ? { mode: 'exempt', rateBps: 0 } : { mode, rateBps: 2100 }
  const policy = { schemaVersion: 2, version: 'synthetic', currency: 'eur', minorUnit: 2, destinations: { ES: { tax, shipping: { amountMinor: 600, tax }, excludedPostalPrefixes: [] } } }
  const base = {
    currency: 'eur',
    minorUnit: 2,
    subtotalMinor: 3000,
    items: [{ productId: PRODUCT, sku: 'TEST-001', name: 'Cuaderno ADN', quantity: 2, unitAmountMinor: 1500, lineTotalMinor: 3000, weightGrams: 500 }]
  }
  const totals = calculateOrderTotals(base, policy, { country: 'ES', postalCode: '28001' })
  return { ...base, totals, totalMinor: totals.totalMinor }
}

function database (migrations = MIGRATIONS) {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const name of migrations) sqlite.exec(readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'))
  const db = {
    prepare (sql) {
      const statement = sqlite.prepare(sql)
      let args = []
      return {
        bind (...values) { args = values; return this },
        async first () { return statement.get(...args) || null },
        async all () { return { results: statement.all(...args) } },
        async run () { return { meta: statement.run(...args) } }
      }
    },
    batch: async () => []
  }
  return { sqlite, db }
}

function addOrder (sqlite, { id, key, mode = 'inclusive', delivery = true, event = 'payment.paid', status = 'paid', refund = 0, extra = {} }) {
  const snapshot = { ...snapshotFor(mode), ...extra }
  const json = JSON.stringify(snapshot)
  sqlite.prepare("INSERT INTO commerce_idempotency VALUES (?, 'hash', ?, ?, 'creating', NULL, NULL, 1, 1, 9999999999)").run(`key-${key}`, id, json)
  sqlite.prepare(`INSERT INTO orders (id, idempotency_key, catalog_release, currency, amount_total_minor, snapshot_json, payment_status, fulfillment_status, payment_intent_id, refund_amount_minor, created_at, updated_at, expires_at)
    VALUES (?, ?, 'release', 'eur', ?, ?, ?, 'ready', ?, ?, 1, ?, 9999999999)`).run(id, `key-${key}`, snapshot.totalMinor, json, status, `pi_${key}`, refund, PAID_AT)
  if (delivery) {
    sqlite.prepare(`INSERT INTO order_delivery_details (order_id, source, buyer_name, buyer_email, buyer_phone, recipient_name, address_line1, address_line2, locality, administrative_area, postal_code, country_code, updated_at)
      VALUES (?, 'stripe_checkout', 'Persona Ficticia', 'comprador@example.invalid', '+34000000000', 'Persona Ficticia', 'Calle Falsa 1', '2.º B', 'Ciudad', 'Provincia', '28001', 'ES', 1)`).run(id)
  }
  const eventKey = `${id}:${event}`
  sqlite.prepare("INSERT INTO outbox VALUES (?, ?, ?, ?, 'pending', 0, 0, NULL, NULL, ?, ?)")
    .run(eventKey, id, event, JSON.stringify({ eventKey, orderId: id, eventType: event }), PAID_AT, PAID_AT)
}

export function gmail () {
  const sent = []
  const fetch = async (url, init = {}) => {
    const href = String(url)
    if (href.startsWith('https://oauth2.googleapis.com/tokeninfo')) return new Response(JSON.stringify({ email: 'sender@example.invalid', scope: `${SEND} openid` }))
    if (href.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600, scope: SEND }))
    if (href.startsWith('https://gmail.googleapis.com/')) {
      sent.push(Buffer.from(await new Response(init.body).arrayBuffer()).toString('utf8'))
      return new Response(JSON.stringify({ id: `m${sent.length}` }))
    }
    throw new Error(`unexpected ${href}`)
  }
  return { fetch, sent }
}

export async function run ({ config, orders, migrations, env: extraEnv = {} }) {
  const { sqlite, db } = database(migrations)
  for (const order of orders) addOrder(sqlite, order)
  const invoice = compileInvoice(config.invoice)
  const notices = compileNotices(config.order_notices, invoice)
  const catalog = { origin: 'https://shop.example.invalid', enabled: true, ...(invoice ? { invoice } : {}), ...(notices ? { notices } : {}) }
  const env = {
    COMMERCE_DB: db,
    COMMERCE_NOTIFY_TO: 'tienda@example.invalid',
    FORMS_GMAIL_DEFAULT: 'sender',
    FORMS_GMAIL_CREDENTIALS: JSON.stringify({ sender: { account: 'sender@example.invalid', client_id: 'cid', client_secret: 'csecret', refresh_token: 'rtoken' } }),
    ...extraEnv
  }
  const { fetch, sent } = gmail()
  await dispatchScheduledNotices(env, catalog, { limit: 10, fetch, now: () => PAID_AT + 60 })
  return sent
}

// Every scenario's sent messages, in order. `migrations` lets a newer engine run
// the same orders against its full schema.
export async function captureGolden (migrations) {
  const config = parse(CONFIG)
  const plain = { ...config, order_notices: undefined }
  return {
    paid: await run({ config, migrations, orders: [{ id: '22222222-2222-4222-8222-222222222222', key: 'a' }] }),
    exempt: await run({ config, migrations, orders: [{ id: '33333333-3333-4333-8333-333333333333', key: 'b', mode: 'exempt' }] }),
    awaiting: await run({ config, migrations, orders: [{ id: '44444444-4444-4444-8444-444444444444', key: 'c', delivery: false, event: 'payment.awaiting_address' }] }),
    refunded: await run({ config, migrations, orders: [{ id: '55555555-5555-4555-8555-555555555555', key: 'd', event: 'payment.refunded', status: 'refunded', refund: 3600 }] }),
    plain: await run({ config: plain, migrations, orders: [{ id: '66666666-6666-4666-8666-666666666666', key: 'e' }] })
  }
}
