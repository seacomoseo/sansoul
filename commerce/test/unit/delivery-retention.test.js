import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { purgeExpiredDeliveryDetails } from '../../maintenance.js'

// Real SQLite with the original migrations; D1-shaped adapter. Synthetic data only.
const DAY = 86400
const NOW = 2000000000

function fixture (orders) {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const name of ['0001_commerce.sql', '0002_buyer_status.sql', '0003_provider_session_expiry.sql', '0004_operations_and_delivery.sql', '0005_outbox_indexes.sql', '0006_bounded_maintenance.sql']) {
    sqlite.exec(readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'))
  }
  const db = {
    prepare (sql) {
      const statement = sqlite.prepare(sql)
      let args = []
      return {
        bind (...values) { args = values; return this },
        async run () { return { meta: statement.run(...args) } }
      }
    }
  }
  for (const [id, payment, fulfillment, updatedAt] of orders) {
    const snapshot = JSON.stringify({ orderId: id, currency: 'eur', minorUnit: 2, totalMinor: 1000, items: [] })
    sqlite.prepare("INSERT INTO commerce_idempotency VALUES (?, 'hash', ?, ?, 'creating', NULL, NULL, 1, 1, 9999999999)").run(`key-${id}`, id, snapshot)
    sqlite.prepare(`INSERT INTO orders (id, idempotency_key, catalog_release, currency, amount_total_minor, snapshot_json, payment_status, fulfillment_status, created_at, updated_at, expires_at)
      VALUES (?, ?, 'release', 'eur', 1000, ?, ?, ?, 1, ?, 9999999999)`).run(id, `key-${id}`, snapshot, payment, fulfillment, updatedAt)
    sqlite.prepare(`INSERT INTO order_delivery_details (order_id, source, buyer_name, buyer_email, address_line1, postal_code, country_code, updated_at)
      VALUES (?, 'stripe_checkout', 'Persona Ficticia', 'buyer@example.invalid', 'Calle Inventada 1', '28001', 'ES', 1)`).run(id)
  }
  const remaining = () => sqlite.prepare('SELECT order_id FROM order_delivery_details ORDER BY order_id').all().map(row => row.order_id)
  const orderCount = () => sqlite.prepare('SELECT COUNT(*) AS n FROM orders').get().n
  return { db, remaining, orderCount }
}

test('delivery data of closed orders is erased after the retention window, nothing else', async () => {
  const old = NOW - 1096 * DAY
  const recent = NOW - 10 * DAY
  const { db, remaining, orderCount } = fixture([
    ['a-shipped-old', 'paid', 'shipped', old],
    ['b-cancelled-old', 'refunded', 'cancelled', old],
    ['c-expired-old', 'expired', 'awaiting_payment', old],
    ['d-shipped-recent', 'paid', 'shipped', recent],
    ['e-open-old', 'paid', 'manufacturing', old],
    ['f-exception-old', 'paid', 'inventory_exception', old]
  ])
  assert.deepEqual(await purgeExpiredDeliveryDetails(db, 1095, NOW), { purged: 3 })
  assert.deepEqual(remaining(), ['d-shipped-recent', 'e-open-old', 'f-exception-old'])
  assert.equal(orderCount(), 6)
  assert.deepEqual(await purgeExpiredDeliveryDetails(db, 1095, NOW), { purged: 0 })
})

test('purge is bounded per call and inert without a retention setting', async () => {
  const old = NOW - 400 * DAY
  const { db, remaining } = fixture([['a', 'paid', 'shipped', old], ['b', 'paid', 'shipped', old], ['c', 'paid', 'shipped', old]])
  assert.deepEqual(await purgeExpiredDeliveryDetails(db, undefined, NOW), { purged: 0 })
  assert.deepEqual(await purgeExpiredDeliveryDetails(db, 365, NOW, 2), { purged: 2 })
  assert.equal(remaining().length, 1)
})
