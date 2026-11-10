import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { expirePendingCheckouts } from '../../orders.js'
import { handleAdmin } from '../../admin.js'
import { rotateCandidates } from '../../maintenance.js'

// Real SQLite, original migrations and atomic batches; count statements, not batch calls.
function database () {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const name of ['0001_commerce.sql', '0002_buyer_status.sql', '0003_provider_session_expiry.sql', '0004_operations_and_delivery.sql', '0005_outbox_indexes.sql', '0006_bounded_maintenance.sql']) {
    sqlite.exec(readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'))
  }
  const db = {
    queries: 0,
    statements: [],
    count (sql) {
      db.statements.push(sql)
      db.beforeStatement?.(sql)
      db.queries++
      if (db.queryLimit && db.queries > db.queryLimit) throw new Error('synthetic_d1_query_limit')
      if (db.failSql?.(sql)) throw new Error('synthetic_sql_failure')
    },
    prepare (sql) {
      const statement = sqlite.prepare(sql)
      let args = []
      return {
        bind (...values) { args = values; return this },
        async first () { db.count(sql); return statement.get(...args) || null },
        async all () { db.count(sql); return { results: statement.all(...args) } },
        async run () { db.count(sql); return { meta: statement.run(...args) } }
      }
    },
    async batch (statements) {
      if (db.beforeBatch) {
        const beforeBatch = db.beforeBatch
        db.beforeBatch = null
        beforeBatch()
      }
      sqlite.exec('BEGIN')
      try {
        const result = []
        for (const statement of statements) result.push(await statement.run())
        sqlite.exec('COMMIT')
        return result
      } catch (error) { sqlite.exec('ROLLBACK'); throw error }
    }
  }
  sqlite.exec("INSERT INTO inventory VALUES ('product', 10000, 1)")
  const seed = (id, status = 'pending', expires = 2, reserve = true) => {
    const snapshot = JSON.stringify({ orderId: id, idempotencyKey: id, stockMode: 'finite', totalMinor: 100, currency: 'eur', items: [{ id: 'product', quantity: 1 }] })
    sqlite.prepare('INSERT INTO commerce_idempotency VALUES (?, ?, ?, ?, ?, NULL, NULL, 1, 1, ?)').run(id, 'hash', id, snapshot, 'creating', expires)
    sqlite.prepare(`INSERT INTO orders (id, idempotency_key, catalog_release, currency, amount_total_minor, snapshot_json, payment_status, fulfillment_status, created_at, updated_at, expires_at)
      VALUES (?, ?, 'release', 'eur', 100, ?, ?, 'awaiting_payment', 1, 1, ?)`).run(id, id, snapshot, status, expires)
    if (reserve) sqlite.prepare("INSERT INTO stock_reservations VALUES (?, 'product', 1, 'held', ?, 1, 1)").run(id, expires)
    sqlite.prepare('INSERT INTO order_status_capabilities (capability_hash, order_id, idempotency_key, created_at, updated_at, expires_at) VALUES (?, ?, ?, 1, 1, ?)').run(createHash('sha256').update(id).digest('hex'), id, id, expires)
  }
  return { sqlite, db, seed }
}

function outboxFixture (size = 20) {
  const fixture = database()
  fixture.seed('outbox-order', 'paid', 10000)
  for (let i = 0; i < size; i++) {
    fixture.sqlite.prepare("INSERT INTO outbox VALUES (?, 'outbox-order', 'payment.paid', ?, 'pending', 0, 0, NULL, NULL, ?, 1)").run(`event-${i}`, JSON.stringify({ eventKey: `event-${i}` }), i)
  }
  let sends = 0
  const env = {
    COMMERCE_DB: fixture.db,
    COMMERCE_ADMIN_TOKEN: 'local-free-budget-fixture-token-not-a-secret',
    COMMERCE_NOTIFIER: { async fetch () { sends++; return new Response(null, { status: 204 }) } }
  }
  const dispatch = () => handleAdmin(new Request('https://fixture.invalid/api/commerce/admin/outbox/dispatch', { method: 'POST', headers: { authorization: `Bearer ${env.COMMERCE_ADMIN_TOKEN}` } }), env, {})
  return { ...fixture, env, dispatch, sends: () => sends }
}

test('outbox successful send with every delivered acknowledgement failing stays within Free budget and retries', async t => {
  const { sqlite, db, dispatch, sends } = outboxFixture(20)
  try {
    sqlite.exec("CREATE TRIGGER synthetic_ack_failure BEFORE UPDATE OF status ON outbox WHEN NEW.status = 'delivered' BEGIN SELECT RAISE(ABORT, 'ack_failure'); END")
    for (let i = 0; i < 20; i++) {
      db.queries = 0
      assert.deepEqual(await (await dispatch()).json(), { attempted: 1, delivered: 0, failed: 1, has_more: true })
      assert.equal(db.queries, 6)
    }
    assert.equal(sends(), 20)
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM outbox WHERE attempts = 1 AND status = 'pending' AND next_attempt_at > 0 AND claimed_at IS NULL").get().count, 20)
    sqlite.exec("DROP TRIGGER synthetic_ack_failure; UPDATE outbox SET next_attempt_at = 0")
    for (let i = 0; i < 20; i++) {
      db.queries = 0
      assert.deepEqual(await (await dispatch()).json(), { attempted: 1, delivered: 1, failed: 0, has_more: i < 19 })
      assert.equal(db.queries, 5)
    }
    assert.equal(sends(), 40) // Send before failed ack is retried; at least once.
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM outbox').get().count, 20)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM commerce_idempotency').get().count, 1)
    t.diagnostic('20 ack failures retained and retried; 6 attempted statements/call')
  } finally { sqlite.close() }
})

test('outbox normal success drains bounded pages under an enforced 50-query ceiling', async () => {
  const { sqlite, db, dispatch, sends } = outboxFixture()
  try {
    db.queryLimit = 50
    for (let i = 0; i < 20; i++) {
      db.queries = 0
      assert.deepEqual(await (await dispatch()).json(), { attempted: 1, delivered: 1, failed: 0, has_more: i < 19 })
      assert.equal(db.queries, 5)
    }
    assert.equal(sends(), 20)
  } finally { sqlite.close() }
})

test('outbox notifier failure retains bounded delayed retries without acknowledgement SQL', async () => {
  const { sqlite, db, env, dispatch } = outboxFixture()
  try {
    env.COMMERCE_NOTIFIER.fetch = async () => { throw new Error('synthetic_notifier_failure') }
    for (let i = 0; i < 20; i++) {
      db.queries = 0
      assert.deepEqual(await (await dispatch()).json(), { attempted: 1, delivered: 0, failed: 1, has_more: true })
      assert.equal(db.queries, 5)
    }
    db.queries = 0
    assert.deepEqual(await (await dispatch()).json(), { attempted: 0, delivered: 0, failed: 0, has_more: true })
    assert.equal(db.queries, 3)
  } finally { sqlite.close() }
})

test('outbox recovers stale processing claims but does not steal fresh claims', async () => {
  const { sqlite, db, dispatch, sends } = outboxFixture()
  try {
    sqlite.exec("UPDATE outbox SET status = 'processing', claimed_at = 1")
    sqlite.prepare("UPDATE outbox SET claimed_at = ? WHERE event_key = 'event-0'").run(Math.floor(Date.now() / 1000))
    for (let i = 0; i < 19; i++) {
      db.queries = 0
      assert.deepEqual(await (await dispatch()).json(), { attempted: 1, delivered: 1, failed: 0, has_more: true })
      assert.equal(db.queries, 6)
    }
    assert.equal(sqlite.prepare("SELECT status FROM outbox WHERE event_key = 'event-0'").get().status, 'processing')
    assert.equal(sends(), 19)
  } finally { sqlite.close() }
})

test('outbox lost claims do not notify or acknowledge', async () => {
  const { sqlite, db, dispatch, sends } = outboxFixture()
  try {
    sqlite.exec("CREATE TRIGGER synthetic_lost_claim BEFORE UPDATE OF status ON outbox WHEN NEW.status = 'processing' BEGIN SELECT RAISE(IGNORE); END")
    assert.deepEqual(await (await dispatch()).json(), { attempted: 0, delivered: 0, failed: 0, has_more: true })
    assert.equal(db.queries, 4)
    assert.equal(sends(), 0)
  } finally { sqlite.close() }
})

test('outbox SQL failures terminate safely; exhausted fallback preserves processing for later recovery', async t => {
  for (const [label, matches, expectedQueries, expectedSends] of [
    ['stale-select', sql => sql.includes('SELECT event_key, claimed_at'), 1, 0],
    ['select', sql => sql.includes('FROM outbox INDEXED BY outbox_due_notifications'), 2, 0],
    ['claim', sql => sql.includes("SET status = 'processing'"), 3, 0],
    ['fallback', sql => sql.includes("SET status = 'delivered'") || sql.includes('last_error = ?'), 5, 1],
    ['presence', sql => sql.includes('SELECT event_key FROM outbox'), 5, 1],
    ['quota', sql => sql.includes("SET status = 'delivered'"), 5, 1]
  ]) {
    const { sqlite, db, dispatch, sends } = outboxFixture()
    try {
      db.failSql = matches
      db.queryLimit = label === 'quota' ? 4 : 50
      const response = await dispatch()
      assert.equal(response.status, 500, label)
      assert.deepEqual(await response.json(), { error: 'internal_error' }, label)
      assert.equal(db.queries, expectedQueries, label)
      assert.equal(sends(), expectedSends, label)
      if (label === 'fallback' || label === 'quota') {
        assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM outbox WHERE status = 'processing'").get().count, 1)
        db.failSql = null
        db.queryLimit = 50
        db.queries = 0
        sqlite.exec("UPDATE outbox SET claimed_at = 1 WHERE status = 'processing'")
        assert.equal((await dispatch()).status, 200)
        assert.equal(db.queries, 6)
        assert.equal(sends(), 2)
      }
      t.diagnostic(`${label}: SQL=${expectedQueries}; sends=${expectedSends}; status=500`)
    } finally { sqlite.close() }
  }
})

test('outbox large stale backlog bounds resets, survives CAS races and drains fairly', async t => {
  const { sqlite, db, dispatch, sends } = outboxFixture(1500)
  try {
    sqlite.exec("UPDATE outbox SET status = 'processing', claimed_at = created_at + 1")
    sqlite.exec('CREATE TABLE reset_audit (event_key TEXT)')
    sqlite.exec("CREATE TRIGGER reset_audit AFTER UPDATE ON outbox WHEN OLD.status = 'processing' AND NEW.status = 'pending' AND NEW.last_error IS NULL BEGIN INSERT INTO reset_audit VALUES (NEW.event_key); END")
    let race = true
    db.beforeStatement = sql => {
      if (race && sql.includes("UPDATE outbox SET status = 'pending', claimed_at")) {
        race = false
        sqlite.prepare("UPDATE outbox SET claimed_at = ? WHERE event_key = 'event-0'").run(Math.floor(Date.now() / 1000))
        sqlite.exec("UPDATE outbox SET status = 'delivered' WHERE event_key = 'event-1'")
      }
    }
    let calls = 0
    while (sqlite.prepare("SELECT COUNT(*) AS count FROM outbox WHERE status = 'processing' AND event_key != 'event-0'").get().count) {
      db.queries = 0
      sqlite.exec('DELETE FROM reset_audit')
      assert.equal((await dispatch()).status, 200)
      assert.ok(db.queries <= 7)
      assert.ok(sqlite.prepare('SELECT COUNT(*) AS count FROM reset_audit').get().count <= 1)
      assert.ok(++calls <= 1500)
    }
    assert.equal(sqlite.prepare("SELECT status FROM outbox WHERE event_key = 'event-0'").get().status, 'processing')
    assert.equal(sends(), 1498)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM outbox').get().count, 1500)
    assert.deepEqual(await (await dispatch()).json(), { attempted: 0, delivered: 0, failed: 0, has_more: true })
    t.diagnostic(`large backlog: ${calls} calls; 1498 delivered; renewed lease preserved; reset writes <=1`)
  } finally { sqlite.close() }
})

test('outbox stale backlog worst ack path costs 7; indexed query plans avoid sorting and exact count', async t => {
  const { sqlite, db, dispatch } = outboxFixture(2000)
  try {
    sqlite.exec("UPDATE outbox SET status = 'processing', claimed_at = created_at + 1")
    sqlite.exec("CREATE TRIGGER synthetic_ack_failure BEFORE UPDATE OF status ON outbox WHEN NEW.status = 'delivered' BEGIN SELECT RAISE(ABORT, 'ack_failure'); END")
    assert.deepEqual(await (await dispatch()).json(), { attempted: 1, delivered: 0, failed: 1, has_more: true })
    assert.equal(db.queries, 7)
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM outbox WHERE status = 'processing'").get().count, 1999)
    assert.ok(db.statements.every(sql => !sql.includes('COUNT(*)')))
    for (const sql of db.statements.filter(sql => sql.includes('SELECT event_key'))) {
      const plan = sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...Array((sql.match(/\?/g) || []).length).fill(1)).map(row => row.detail).join('; ')
      t.diagnostic(plan)
      assert.doesNotMatch(plan, /TEMP B-TREE/)
      if (sql.includes('outbox_due_notifications')) assert.match(plan, /outbox_due_notifications/)
      if (sql.includes('claimed_at')) assert.match(plan, /outbox_expired_claims/)
    }
    db.queries = 0
    db.failSql = sql => sql.includes("UPDATE outbox SET status = 'pending', claimed_at")
    assert.equal((await dispatch()).status, 500)
    assert.equal(db.queries, 2)
  } finally { sqlite.close() }
})

test('expiration bounds writes, drains backlog, preserves paid stock and idempotency', async () => {
  const { sqlite, db, seed } = database()
  try {
    for (let i = 0; i < 27; i++) seed(`due-${i}`)
    seed('paid', 'paid')
    seed('future', 'pending', 10000)
    await expirePendingCheckouts(db, 100)
    const count = () => sqlite.prepare("SELECT COUNT(*) AS count FROM orders WHERE payment_status = 'expired'").get().count
    assert.equal(count(), 1)
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM stock_reservations WHERE status = 'expired'").get().count, 1)
    assert.ok(db.queries <= 7)
    for (let i = 0; i < 26; i++) await expirePendingCheckouts(db, 100)
    assert.equal(count(), 27)
    const before = sqlite.prepare('SELECT * FROM orders ORDER BY id').all()
    await expirePendingCheckouts(db, 100)
    assert.deepEqual(sqlite.prepare('SELECT * FROM orders ORDER BY id').all(), before)
    assert.equal(sqlite.prepare("SELECT status FROM stock_reservations WHERE order_id = 'paid'").get().status, 'held')
    assert.equal(sqlite.prepare("SELECT status FROM stock_reservations WHERE order_id = 'future'").get().status, 'held')
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM commerce_idempotency').get().count, 29)
  } finally { sqlite.close() }
})

test('partial refund repair and outbox are bounded and replay-safe', async () => {
  const { sqlite, db, seed } = database()
  try {
    for (let i = 0; i < 27; i++) seed(`partial-${i}`, 'partially_refunded', 10000)
    await expirePendingCheckouts(db, 100)
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM orders WHERE fulfillment_status = 'inventory_exception'").get().count, 1)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM outbox').get().count, 1)
    for (let i = 0; i < 27; i++) await expirePendingCheckouts(db, 100)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM outbox').get().count, 27)
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM stock_reservations WHERE status = 'held'").get().count, 27)
  } finally { sqlite.close() }
})

test('separate expiration, recovery and paid unmatched operations fit 50 D1 statements per invocation', async t => {
  const { sqlite, db, seed } = database()
  const now = Math.floor(Date.now() / 1000)
  try {
    for (let i = 0; i < 30; i++) {
      seed(`recover-${String(i).padStart(2, '0')}`, 'pending', now + 86400)
      const eventOrderId = `eeeeeeee-eeee-4eee-8eee-${String(i).padStart(12, '0')}`
      seed(eventOrderId, 'expired', now + 86400)
      const recovery = { version: 1, clientReferenceId: eventOrderId, metadataOrderId: eventOrderId, amountTotal: 100, currency: 'eur', target: { state: 'paid', sessionId: `cs_test_event${i}`, paymentIntentId: `pi_event${i}` } }
      sqlite.prepare("INSERT INTO webhook_events (event_id, event_type, event_created, body_sha256, status, received_at, recovery_json) VALUES (?, 'checkout.session.completed', ?, 'hash', 'unmatched', ?, ?)").run(`evt_${i}`, now, now, JSON.stringify(recovery))
    }
    for (let i = 0; i < 15; i++) seed(`due-${i}`)
    for (let i = 0; i < 15; i++) seed(`partial-${i}`, 'partially_refunded', now + 86400)
    const env = { COMMERCE_DB: db, COMMERCE_ADMIN_TOKEN: 'local-free-budget-fixture-token-not-a-secret', COMMERCE_ENV: 'test', COMMERCE_PROVIDER: 'fake', COMMERCE_TEST_FIXTURE: 'synthetic-commerce-test' }
    const catalog = { enabled: true, origin: 'https://fixture.invalid' }
    let maxQueries = 0
    for (let invocation = 0; invocation < 180; invocation++) {
      const operation = ['expiration', 'orders', 'unmatched_webhooks'][invocation % 3]
      db.queries = 0
      const response = await handleAdmin(new Request(`https://fixture.invalid/api/commerce/admin/reconcile?operation=${operation}`, { method: 'POST', headers: { authorization: 'Bearer local-free-budget-fixture-token-not-a-secret' } }), env, catalog)
      const body = await response.json()
      assert.equal(response.status, 200, JSON.stringify(body))
      maxQueries = Math.max(maxQueries, db.queries)
      assert.ok(db.queries <= 50, `invocation ${invocation}: ${db.queries} statements`)
      assert.ok(body.checked <= 1)
      assert.ok((body.unmatched_checked || 0) <= 1)
    }
    t.diagnostic(`180 invocations; max D1 statements=${maxQueries}; recovered sessions=30; replayed events=30`)
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM commerce_idempotency WHERE status = 'ready'").get().count, 30)
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM webhook_events WHERE status = 'processed'").get().count, 30)
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM outbox WHERE event_type = 'payment.paid'").get().count, 30)
  } finally { sqlite.close() }
})

test('expiration rechecks concurrent payment and session extension before releasing stock', async () => {
  const { sqlite, db, seed } = database()
  try {
    seed('payment-race')
    seed('extension-race')
    db.beforeBatch = () => {
      sqlite.exec("UPDATE orders SET payment_status = 'paid' WHERE id = 'payment-race'; UPDATE orders SET expires_at = 10000 WHERE id = 'extension-race'; UPDATE stock_reservations SET expires_at = 10000 WHERE order_id = 'extension-race'")
    }
    await expirePendingCheckouts(db, 100)
    assert.equal(sqlite.prepare("SELECT payment_status FROM orders WHERE id = 'payment-race'").get().payment_status, 'paid')
    assert.equal(sqlite.prepare("SELECT payment_status FROM orders WHERE id = 'extension-race'").get().payment_status, 'pending')
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM stock_reservations WHERE status = 'held'").get().count, 2)
  } finally { sqlite.close() }
})

test('reservation-driven expiration releases all lines atomically and rolls back on write failure', async () => {
  const { sqlite, db, seed } = database()
  try {
    seed('reservation-due', 'pending', 10000)
    sqlite.exec("UPDATE stock_reservations SET expires_at = 2; INSERT INTO inventory VALUES ('second-product', 10, 1); INSERT INTO stock_reservations VALUES ('reservation-due', 'second-product', 1, 'held', 10000, 1, 1)")
    sqlite.exec("CREATE TRIGGER synthetic_expiration_failure BEFORE UPDATE OF status ON stock_reservations BEGIN SELECT RAISE(ABORT, 'expiration_write_failure'); END")
    await assert.rejects(expirePendingCheckouts(db, 100), /expiration_write_failure/)
    assert.equal(sqlite.prepare('SELECT payment_status FROM orders').get().payment_status, 'pending')
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM stock_reservations WHERE status = 'held'").get().count, 2)
    sqlite.exec('DROP TRIGGER synthetic_expiration_failure')
    await expirePendingCheckouts(db, 100)
    assert.equal(sqlite.prepare('SELECT payment_status FROM orders').get().payment_status, 'expired')
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM stock_reservations WHERE status = 'expired'").get().count, 2)
    assert.equal(sqlite.prepare('SELECT status FROM commerce_idempotency').get().status, 'creating')
  } finally { sqlite.close() }
})


test('cursor singleton wrap revisits deferred candidates; revision CAS admits only one concurrent winner', async () => {
  const { sqlite, db, seed } = database()
  try {
    seed('singleton', 'pending', 10000)
    const rotate = () => rotateCandidates(db, 'orders',
      'SELECT id, created_at AS cursor_created_at, id AS cursor_id FROM orders',
      "WHERE payment_status = 'pending'", 'created_at', 'id', 100)
    assert.equal((await rotate()).rows[0].id, 'singleton')
    const concurrent = await Promise.all([rotate(), rotate()])
    assert.equal(concurrent.reduce((sum, page) => sum + page.rows.length, 0), 1)
    assert.equal(concurrent.filter(page => page.contended).length, 1)
    assert.ok(concurrent.every(page => page.hasMore === false))
    assert.equal((await rotate()).rows[0].id, 'singleton')
    assert.equal(sqlite.prepare("SELECT revision FROM commerce_operation_cursors WHERE operation = 'orders'").get().revision, 3)
  } finally { sqlite.close() }
})

test('independent maintenance operation rejects invalid selectors without any SQL', async () => {
  const { sqlite, db } = database()
  try {
    const response = await handleAdmin(new Request('https://fixture.invalid/api/commerce/admin/reconcile?operation=all', {
      method: 'POST', headers: { authorization: 'Bearer local-free-budget-fixture-token-not-a-secret' }
    }), { COMMERCE_DB: db, COMMERCE_ADMIN_TOKEN: 'local-free-budget-fixture-token-not-a-secret' }, {})
    assert.equal(response.status, 400)
    assert.equal(db.queries, 0)
  } finally { sqlite.close() }
})

test('actual maintenance queries avoid sorting at 2000 and 10000 rows without changing eligibility', async t => {
  const evidence = []
  for (const size of [2000, 10000]) {
    const { sqlite, db, seed } = database()
    try {
      sqlite.exec('BEGIN')
      for (let i = 0; i < size; i++) {
        seed(`scale-${String(i).padStart(5, '0')}`, 'pending', 2, false)
        sqlite.prepare("INSERT INTO webhook_events (event_id,event_type,event_created,body_sha256,status,received_at,recovery_json) VALUES (?,'checkout.session.completed',1,'fixture','unmatched',1,'{}')").run(`evt_scale${i}`)
      }
      sqlite.exec('COMMIT')
      for (const operation of ['orders', 'expiration', 'unmatched_webhooks']) {
        db.queries = 0
        db.statements = []
        const response = await handleAdmin(new Request(`https://fixture.invalid/api/commerce/admin/reconcile?operation=${operation}`, {
          method: 'POST', headers: { authorization: 'Bearer local-free-budget-fixture-token-not-a-secret' }
        }), { COMMERCE_DB: db, COMMERCE_ADMIN_TOKEN: 'local-free-budget-fixture-token-not-a-secret' }, {})
        assert.equal(response.status, 200)
        assert.ok(db.queries <= 13)
        const query = db.statements.find(sql => sql.includes('ORDER BY') && sql.includes('LIMIT 2'))
        const args = operation === 'expiration' ? [Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000), 0, ''] : [0, '']
        const plan = sqlite.prepare(`EXPLAIN QUERY PLAN ${query}`).all(...args)
        assert.ok(plan.every(row => !row.detail.includes('TEMP B-TREE')), JSON.stringify(plan))
        const baseline = query.replace(/ INDEXED BY \w+/g, '')
        assert.deepEqual(sqlite.prepare(query).all(...args), sqlite.prepare(baseline).all(...args))
        evidence.push({ size, operation, query, args, plan, statements: db.queries })
      }
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM commerce_idempotency').get().n, size)
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM webhook_events').get().n, size)
      t.diagnostic(`real SQLite ${size} rows: three actual handler plans, no temp sorts, <=13 SQL; histories retained`)
    } finally { sqlite.close() }
  }
  if (process.env.COMMERCE_SCALE_EVIDENCE) writeFileSync(process.env.COMMERCE_SCALE_EVIDENCE, JSON.stringify(evidence, null, 2))
})
