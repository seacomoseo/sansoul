import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { handleAdmin } from '../../admin.js'
import { applyPaymentState } from '../../orders.js'
import { MIGRATIONS } from '../migrations.js'

// Real SQLite with the engine migrations. Synthetic data only.
const ID = 'a0000000-0000-4000-8000-000000000001'
const REPAIR = '0013_full_refund_cancels.sql'
const sql = name => readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8')

function fixture ({ payment = 'paid', fulfillment = 'manufacturing', refunded = 0, reservation = 'committed', upTo = null } = {}) {
  const sqlite = new DatabaseSync(':memory:')
  for (const name of MIGRATIONS) if (!upTo || name < upTo) sqlite.exec(sql(name))
  const wrap = text => {
    const statement = sqlite.prepare(text)
    let args = []
    return {
      bind (...values) { args = values; return this },
      async first () { return statement.get(...args) || null },
      async all () { return { results: statement.all(...args) } },
      async run () { return { meta: statement.run(...args) } }
    }
  }
  const db = { prepare: wrap, async batch (statements) { const results = []; for (const statement of statements) results.push(await statement.run()); return results } }
  const snapshot = JSON.stringify({ orderId: ID, currency: 'eur', minorUnit: 2, stockMode: 'finite', items: [{ id: 'p1', sku: 'S', name: 'Model', quantity: 1, unitAmountMinor: 1300, lineTotalMinor: 1300 }], totals: { subtotalMinor: 1300, totalMinor: 1300 } })
  sqlite.prepare("INSERT INTO commerce_idempotency VALUES ('key-1', 'hash', ?, ?, 'creating', NULL, NULL, 1, 1, 9999999999)").run(ID, snapshot)
  sqlite.prepare(`INSERT INTO orders (id, idempotency_key, catalog_release, currency, amount_total_minor, snapshot_json, payment_status, fulfillment_status, payment_intent_id, refund_amount_minor, created_at, updated_at, expires_at)
    VALUES (?, 'key-1', 'release', 'eur', 1300, ?, ?, ?, 'pi_synthetic', ?, 1, 1, 9999999999)`).run(ID, snapshot, payment, fulfillment, refunded)
  sqlite.prepare("INSERT INTO inventory (product_id, on_hand, updated_at) VALUES ('p1', 5, 1)").run()
  sqlite.prepare("INSERT INTO stock_reservations VALUES (?, 'p1', 1, ?, 9999999999, 1, 1)").run(ID, reservation)
  const order = () => sqlite.prepare('SELECT id, snapshot_json, payment_status, fulfillment_status, refund_amount_minor FROM orders WHERE id = ?').get(ID)
  const stock = () => sqlite.prepare('SELECT status FROM stock_reservations WHERE order_id = ?').get(ID).status
  const events = () => sqlite.prepare('SELECT event_type FROM outbox WHERE order_id = ? ORDER BY event_key').all(ID).map(row => row.event_type)
  return { sqlite, db, order, stock, events }
}

test('full refund: an order in manufacturing is cancelled, its units come back and the owner is told once', async () => {
  const { db, order, stock, events } = fixture()
  await applyPaymentState(db, order(), { state: 'refund', refundAmount: 1300 }, 10)
  assert.equal(order().payment_status, 'refunded')
  assert.equal(order().fulfillment_status, 'cancelled')
  assert.equal(stock(), 'released')
  assert.deepEqual(events(), ['payment.refunded'])
  // A replayed or stale event changes nothing.
  await applyPaymentState(db, order(), { state: 'refund', refundAmount: 1300 }, 11)
  await applyPaymentState(db, order(), { state: 'refund', refundAmount: 500 }, 12)
  assert.equal(order().fulfillment_status, 'cancelled')
  assert.equal(order().refund_amount_minor, 1300)
  assert.deepEqual(events(), ['payment.refunded'])
})

test('full refund: a ready order (committed units) is cancelled and restocked', async () => {
  const { db, order, stock } = fixture({ fulfillment: 'ready' })
  await applyPaymentState(db, order(), { state: 'refund', refundAmount: 1300 }, 10)
  assert.equal(order().fulfillment_status, 'cancelled')
  assert.equal(stock(), 'released')
})

test('full refund: a shipped order keeps its phase and its committed units', async () => {
  const { db, order, stock, events } = fixture({ fulfillment: 'shipped' })
  await applyPaymentState(db, order(), { state: 'refund', refundAmount: 1300 }, 10)
  assert.equal(order().payment_status, 'refunded')
  assert.equal(order().fulfillment_status, 'shipped')
  assert.equal(stock(), 'committed')
  assert.deepEqual(events(), ['payment.refunded'])
})

test('partial refund: an order in manufacturing stays in manufacturing', async () => {
  const { db, order, stock } = fixture()
  await applyPaymentState(db, order(), { state: 'refund', refundAmount: 300 }, 10)
  assert.equal(order().payment_status, 'partially_refunded')
  assert.equal(order().fulfillment_status, 'manufacturing')
  assert.equal(stock(), 'committed')
})

test('cancel-partial gives committed units back too', async () => {
  const { db, order, stock, events } = fixture({ payment: 'partially_refunded', fulfillment: 'inventory_exception', refunded: 300 })
  const env = { COMMERCE_DB: db, COMMERCE_ADMIN_TOKEN: 'x'.repeat(40) }
  const response = await handleAdmin(new Request(`https://shop.example/api/commerce/admin/orders/${ID}/cancel-partial`, { method: 'POST', headers: { authorization: `Bearer ${env.COMMERCE_ADMIN_TOKEN}` } }), env, { origin: 'https://shop.example', functionsEnabled: true })
  assert.equal(response.status, 200)
  assert.equal(order().fulfillment_status, 'cancelled')
  assert.equal(stock(), 'released')
  assert.deepEqual(events(), ['fulfillment.partial_refund_cancelled'])
})

test(`migration ${REPAIR}: repairs refunded orders stuck before shipping, leaves shipped ones`, () => {
  const stuck = fixture({ payment: 'refunded', refunded: 1300, upTo: REPAIR })
  stuck.sqlite.exec(sql(REPAIR))
  assert.equal(stuck.order().fulfillment_status, 'cancelled')
  assert.equal(stuck.stock(), 'released')
  const shipped = fixture({ payment: 'refunded', fulfillment: 'shipped', refunded: 1300, upTo: REPAIR })
  shipped.sqlite.exec(sql(REPAIR))
  assert.equal(shipped.order().fulfillment_status, 'shipped')
  assert.equal(shipped.stock(), 'committed')
  const partial = fixture({ payment: 'partially_refunded', refunded: 300, upTo: REPAIR })
  partial.sqlite.exec(sql(REPAIR))
  assert.equal(partial.order().fulfillment_status, 'manufacturing')
  assert.equal(partial.stock(), 'committed')
})
