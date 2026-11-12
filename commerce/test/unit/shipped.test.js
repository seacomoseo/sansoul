import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { dispatchScheduledNotices, handleAdmin } from '../../admin.js'
import { compileNotices } from '../../notices-config.js'

const SEND = 'https://www.googleapis.com/auth/gmail.send'

function fixture () {
  const sqlite = new DatabaseSync(':memory:')
  for (const name of ['0001_commerce.sql', '0002_buyer_status.sql', '0003_provider_session_expiry.sql', '0004_operations_and_delivery.sql', '0005_outbox_indexes.sql', '0006_bounded_maintenance.sql', '0007_invoices.sql', '0008_buyer_tax_and_delivery_notes.sql']) {
    sqlite.exec(readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'))
  }
  const wrap = sql => {
    const statement = sqlite.prepare(sql)
    let args = []
    return {
      bind (...values) { args = values; return this },
      async first () { return statement.get(...args) || null },
      async all () { return { results: statement.all(...args) } },
      async run () { return { meta: statement.run(...args) } }
    }
  }
  const db = {
    prepare: wrap,
    async batch (statements) {
      const results = []
      for (const statement of statements) results.push(await statement.run())
      return results
    }
  }
  const snapshot = JSON.stringify({ orderId: 'a0000000-0000-4000-8000-000000000001', currency: 'eur', minorUnit: 2, locale: 'en', items: [{ sku: 'S', name: 'Model', quantity: 1, unitAmountMinor: 5000, lineTotalMinor: 5000 }], totals: { subtotalMinor: 5000, totalMinor: 5000 } })
  const id = 'a0000000-0000-4000-8000-000000000001'
  sqlite.prepare("INSERT INTO commerce_idempotency VALUES ('key-1', 'hash', ?, ?, 'creating', NULL, NULL, 1, 1, 9999999999)").run(id, snapshot)
  sqlite.prepare(`INSERT INTO orders (id, idempotency_key, catalog_release, currency, amount_total_minor, snapshot_json, payment_status, fulfillment_status, payment_intent_id, created_at, updated_at, expires_at)
    VALUES (?, 'key-1', 'release', 'eur', 5000, ?, 'paid', 'manufacturing', 'pi_synthetic', 1, 1, 9999999999)`).run(id, snapshot)
  sqlite.prepare(`INSERT INTO order_delivery_details (order_id, source, buyer_name, buyer_email, recipient_name, address_line1, locality, postal_code, country_code, updated_at)
    VALUES (?, 'stripe_checkout', 'Persona Ficticia', 'buyer@example.invalid', 'Persona Ficticia', 'Calle Inventada 1', 'Ciudad', '28001', 'ES', 1)`).run(id)
  const env = {
    COMMERCE_DB: db,
    COMMERCE_ADMIN_TOKEN: 'x'.repeat(40),
    COMMERCE_NOTIFY_TO: 'shop@example.invalid',
    FORMS_GMAIL_DEFAULT: 'sender',
    FORMS_GMAIL_CREDENTIALS: JSON.stringify({ sender: { account: 'sender@example.invalid', client_id: 'cid', client_secret: 'csecret', refresh_token: 'rtoken' } })
  }
  return { sqlite, env, id }
}

function gmail () {
  const sent = []
  const fetch = async (url, init = {}) => {
    const href = String(url)
    if (href.startsWith('https://oauth2.googleapis.com/token?') || href === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600, scope: SEND }))
    if (href.startsWith('https://oauth2.googleapis.com/tokeninfo')) return new Response(JSON.stringify({ email: 'sender@example.invalid', scope: `${SEND} openid` }))
    if (href.startsWith('https://gmail.googleapis.com/')) {
      sent.push(Buffer.from(await new Response(init.body).arrayBuffer()).toString('utf8'))
      return new Response(JSON.stringify({ id: `m${sent.length}` }))
    }
    throw new Error(`unexpected ${href}`)
  }
  return { fetch, sent }
}

const ship = (env, catalog, id, body) => handleAdmin(new Request(`https://shop.example/api/commerce/admin/orders/${id}/ship`, {
  method: 'POST',
  headers: { authorization: `Bearer ${env.COMMERCE_ADMIN_TOKEN}`, ...(body ? { 'content-type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
}), env, catalog)

const decode = mime => mime.split(/\r\n\r\n/).slice(1).map(part => {
  const base64 = part.split('\r\n--')[0].replace(/\r\n/g, '')
  return /^[A-Za-z0-9+/=]+$/.test(base64) ? Buffer.from(base64, 'base64').toString('utf8') : part
}).join('\n')

test('buyer_shipped is opt-in and compiles', () => {
  assert.equal(compileNotices({ enabled: true }).buyerShipped, undefined)
  assert.equal(compileNotices({ enabled: true, buyer_shipped: true }).buyerShipped, true)
  assert.throws(() => compileNotices({ enabled: true, buyer_shipped: 'yes' }), /invalid_order_notices/)
})

test('ship enqueues one buyer mail with the tracking link, in the language of the purchase', async () => {
  const { sqlite, env, id } = fixture()
  const catalog = { origin: 'https://shop.example', functionsEnabled: true, notices: compileNotices({ enabled: true, buyer_shipped: true }) }
  const response = await ship(env, catalog, id, { tracking: 'https://carrier.example/t/123' })
  assert.equal(response.status, 200)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM outbox WHERE event_type = 'buyer.shipped'").get().n, 1)
  const { fetch, sent } = gmail()
  await dispatchScheduledNotices(env, catalog, { fetch })
  assert.equal(sent.length, 1)
  const body = decode(sent[0])
  assert.match(sent[0], /^To: .*buyer@example\.invalid/m)
  assert.match(body, /We have shipped your order/)
  assert.match(body, /https:\/\/carrier\.example\/t\/123/)
  // A second ship is a conflict and does not enqueue another mail.
  assert.equal((await ship(env, catalog, id)).status, 409)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM outbox WHERE event_type = 'buyer.shipped'").get().n, 1)
})

test('ship without buyer_shipped, or with a bad tracking value, sends nothing new', async () => {
  const { sqlite, env, id } = fixture()
  const off = { origin: 'https://shop.example', functionsEnabled: true, notices: compileNotices({ enabled: true }) }
  assert.equal((await ship(env, off, id, { tracking: 'x'.repeat(201) })).status, 400)
  assert.equal(sqlite.prepare('SELECT fulfillment_status FROM orders').get().fulfillment_status, 'manufacturing')
  assert.equal((await ship(env, off, id)).status, 200)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM outbox WHERE event_type = 'buyer.shipped'").get().n, 0)
})
