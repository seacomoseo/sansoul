import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { handleAdmin } from '../../admin.js'
import { MIGRATIONS } from '../migrations.js'

function fixture () {
  const sqlite = new DatabaseSync(':memory:')
  for (const name of MIGRATIONS) {
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

const call = (env, catalog, path, { method = 'GET', body } = {}) => handleAdmin(new Request(`https://shop.example/api/commerce/admin/${path}`, {
  method,
  headers: { authorization: `Bearer ${env.COMMERCE_ADMIN_TOKEN}`, ...(body ? { 'content-type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
}), env, catalog)

test('order_documents: mark, filter and unmark; off means no field and no route', async () => {
  const { sqlite, env, id } = fixture()
  const on = { origin: 'https://shop.example', functionsEnabled: true, orderDocuments: true, adminRepo: 'o/r' }
  const off = { origin: 'https://shop.example', functionsEnabled: true }
  let list = await (await call(env, on, 'orders')).json()
  assert.equal(list.order_documents, true)
  assert.equal(list.orders[0].documents_sent_at, null)
  assert.equal((await (await call(env, on, 'orders?documents=pending')).json()).orders.length, 1)
  assert.equal((await (await call(env, on, 'orders?documents=sent')).json()).orders.length, 0)
  assert.equal((await call(env, on, 'orders?documents=bad')).status, 400)
  assert.equal((await call(env, on, `orders/${id}/documents`, { method: 'POST', body: { sent: 'yes' } })).status, 400)
  const marked = await (await call(env, on, `orders/${id}/documents`, { method: 'POST', body: { sent: true } })).json()
  assert.equal(typeof marked.documents_sent_at, 'number')
  // Marking twice keeps the first date.
  assert.equal((await (await call(env, on, `orders/${id}/documents`, { method: 'POST', body: { sent: true } })).json()).documents_sent_at, marked.documents_sent_at)
  assert.equal((await (await call(env, on, 'orders?documents=pending')).json()).orders.length, 0)
  assert.equal((await (await call(env, on, 'orders?documents=sent')).json()).orders.length, 1)
  assert.equal((await (await call(env, on, `orders/${id}/documents`, { method: 'POST', body: { sent: false } })).json()).documents_sent_at, null)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM order_documents').get().n, 0)
  list = await (await call(env, off, 'orders')).json()
  assert.equal('documents_sent_at' in list.orders[0], false)
  assert.equal('order_documents' in list, false)
  assert.equal((await call(env, off, `orders/${id}/documents`, { method: 'POST', body: { sent: true } })).status, 404)
})

test('order_documents refuses unpaid orders', async () => {
  const { sqlite, env, id } = fixture()
  sqlite.prepare("UPDATE orders SET payment_status = 'pending', fulfillment_status = 'awaiting_payment'").run()
  const on = { origin: 'https://shop.example', functionsEnabled: true, orderDocuments: true }
  assert.equal((await call(env, on, `orders/${id}/documents`, { method: 'POST', body: { sent: true } })).status, 409)
  assert.equal((await call(env, on, 'orders/a0000000-0000-4000-8000-0000000000ff/documents', { method: 'POST', body: { sent: true } })).status, 404)
})
