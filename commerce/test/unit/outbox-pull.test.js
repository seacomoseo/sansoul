import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { handleAdmin } from '../../admin.js'

const TOKEN = 'local-outbox-pull-fixture-token-not-a-secret'

// Real SQLite with the original migrations; D1-shaped adapter.
function fixture () {
  const sqlite = new DatabaseSync(':memory:')
  for (const name of ['0001_commerce.sql', '0002_buyer_status.sql', '0003_provider_session_expiry.sql', '0004_operations_and_delivery.sql', '0005_outbox_indexes.sql', '0006_bounded_maintenance.sql']) {
    sqlite.exec(readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'))
  }
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
    async batch (statements) {
      const results = []
      for (const statement of statements) results.push(await statement.run())
      return results
    }
  }
  const snapshot = JSON.stringify({ orderId: 'order-1', totalMinor: 3995, currency: 'eur', items: [{ sku: 'SKU-1', name: 'Producto', quantity: 1, unitAmountMinor: 2790, lineTotalMinor: 2790 }] })
  sqlite.prepare("INSERT INTO commerce_idempotency VALUES ('key-1', 'hash', 'order-1', ?, 'creating', NULL, NULL, 1, 1, 9999999999)").run(snapshot)
  sqlite.prepare(`INSERT INTO orders (id, idempotency_key, catalog_release, currency, amount_total_minor, snapshot_json, payment_status, fulfillment_status, created_at, updated_at, expires_at)
    VALUES ('order-1', 'key-1', 'release', 'eur', 3995, ?, 'paid', 'ready', 1, 1, 9999999999)`).run(snapshot)
  sqlite.prepare("INSERT INTO outbox VALUES ('order-1:payment.paid', 'order-1', 'payment.paid', ?, 'pending', 0, 0, NULL, NULL, 1, 1)")
    .run(JSON.stringify({ eventKey: 'order-1:payment.paid', orderId: 'order-1', eventType: 'payment.paid' }))
  const env = { COMMERCE_DB: db, COMMERCE_ADMIN_TOKEN: TOKEN }
  const call = (path, body, token = TOKEN) => handleAdmin(new Request(`https://fixture.invalid/api/commerce/admin/outbox/${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  }), env, {})
  const row = () => sqlite.prepare("SELECT status, attempts, claimed_at, next_attempt_at FROM outbox WHERE event_key = 'order-1:payment.paid'").get()
  return { sqlite, call, row }
}

test('pull consumer: claim returns the order, ack delivers once', async () => {
  const { sqlite, call, row } = fixture()
  try {
    const { item } = await (await call('claim')).json()
    assert.equal(item.event_type, 'payment.paid')
    assert.equal(item.attempts, 1)
    assert.equal(item.order.id, 'order-1')
    assert.equal(item.order.amount_total_minor, 3995)
    assert.equal(row().status, 'processing')
    assert.deepEqual(await (await call('claim')).json(), { item: null })
    const ack = { event_key: item.event_key, claimed_at: item.claimed_at, attempts: item.attempts, delivered: true }
    assert.deepEqual(await (await call('ack', ack)).json(), { acked: true })
    assert.equal(row().status, 'delivered')
    assert.deepEqual(await (await call('ack', ack)).json(), { acked: false })
  } finally { sqlite.close() }
})

test('pull consumer: nack reschedules with backoff and is not immediately re-claimable', async () => {
  const { sqlite, call, row } = fixture()
  try {
    const { item } = await (await call('claim')).json()
    const response = await call('ack', { event_key: item.event_key, claimed_at: item.claimed_at, attempts: item.attempts, delivered: false })
    assert.deepEqual(await response.json(), { acked: true })
    const state = row()
    assert.equal(state.status, 'pending')
    assert.ok(state.next_attempt_at >= item.claimed_at + 30)
    assert.deepEqual(await (await call('claim')).json(), { item: null })
  } finally { sqlite.close() }
})

test('pull consumer: an expired lease is re-claimed and the stale ack is rejected', async () => {
  const { sqlite, call, row } = fixture()
  try {
    const first = (await (await call('claim')).json()).item
    sqlite.exec("UPDATE outbox SET claimed_at = claimed_at - 600 WHERE event_key = 'order-1:payment.paid'")
    const second = (await (await call('claim')).json()).item
    assert.equal(second.attempts, 2)
    const stale = { event_key: first.event_key, claimed_at: first.claimed_at - 600, attempts: first.attempts, delivered: true }
    assert.deepEqual(await (await call('ack', stale)).json(), { acked: false })
    assert.deepEqual(await (await call('ack', { ...stale, claimed_at: second.claimed_at, attempts: 2 })).json(), { acked: true })
    assert.equal(row().status, 'delivered')
  } finally { sqlite.close() }
})

test('pull consumer: auth and ack validation', async () => {
  const { sqlite, call } = fixture()
  try {
    assert.equal((await call('claim', undefined, 'wrong-token-wrong-token-wrong-token')).status, 401)
    assert.equal((await call('ack', { event_key: 'x', claimed_at: 'now', attempts: 1, delivered: true })).status, 400)
    assert.equal((await call('ack', { event_key: 'x', claimed_at: 1, attempts: 0, delivered: true })).status, 400)
  } finally { sqlite.close() }
})
