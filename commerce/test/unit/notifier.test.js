import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { dispatchScheduledNotices } from '../../admin.js'
import { createCommerceWorker } from '../../worker.js'
import { MIGRATIONS } from '../migrations.js'

// Real SQLite with the original migrations; D1-shaped adapter. Synthetic data only.
function fixture () {
  const sqlite = new DatabaseSync(':memory:')
  for (const name of MIGRATIONS) {
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
    }
  }
  const snapshot = JSON.stringify({
    orderId: 'order-1', currency: 'eur', minorUnit: 2, subtotalMinor: 5000, totalMinor: 6205,
    items: [{ sku: 'SKU-1', name: 'Modelo de prueba', quantity: 1, unitAmountMinor: 5000, lineTotalMinor: 5000 }],
    totals: { subtotalMinor: 5000, shippingTotalMinor: 1205, taxMinor: 868, totalMinor: 6205, destination: { country: 'ES' } }
  })
  sqlite.prepare("INSERT INTO commerce_idempotency VALUES ('key-1', 'hash', 'order-1', ?, 'creating', NULL, NULL, 1, 1, 9999999999)").run(snapshot)
  sqlite.prepare(`INSERT INTO orders (id, idempotency_key, catalog_release, currency, amount_total_minor, snapshot_json, payment_status, fulfillment_status, payment_intent_id, created_at, updated_at, expires_at)
    VALUES ('order-1', 'key-1', 'release', 'eur', 6205, ?, 'paid', 'ready', 'pi_synthetic', 1, 1, 9999999999)`).run(snapshot)
  sqlite.prepare(`INSERT INTO order_delivery_details (order_id, source, buyer_name, buyer_email, buyer_phone, recipient_name, address_line1, locality, postal_code, country_code, updated_at)
    VALUES ('order-1', 'stripe_checkout', 'Persona Ficticia', 'buyer@example.invalid', '+34000000000', 'Persona Ficticia', 'Calle Inventada 1', 'Ciudad', '28001', 'ES', 1)`).run()
  sqlite.prepare("INSERT INTO outbox VALUES ('order-1:payment.paid', 'order-1', 'payment.paid', ?, 'pending', 0, 0, NULL, NULL, 1, 1)")
    .run(JSON.stringify({ eventKey: 'order-1:payment.paid', orderId: 'order-1', eventType: 'payment.paid' }))
  const env = {
    COMMERCE_DB: db,
    COMMERCE_NOTIFY_TO: 'shop@example.invalid',
    FORMS_GMAIL_DEFAULT: 'sender',
    FORMS_GMAIL_CREDENTIALS: JSON.stringify({ sender: { account: 'sender@example.invalid', client_id: 'cid', client_secret: 'csecret', refresh_token: 'rtoken' } })
  }
  const row = () => sqlite.prepare("SELECT status, attempts, last_error FROM outbox WHERE event_key = 'order-1:payment.paid'").get()
  return { sqlite, env, row }
}

const SEND = 'https://www.googleapis.com/auth/gmail.send'

function gmail ({ tokenStatus = 200 } = {}) {
  const sent = []
  const fetch = async (url, init = {}) => {
    const href = String(url)
    if (href.startsWith('https://oauth2.googleapis.com/token?') || href === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify(tokenStatus === 200 ? { access_token: 'at', expires_in: 3600, scope: SEND } : { error: 'invalid_grant' }), { status: tokenStatus })
    }
    if (href.startsWith('https://oauth2.googleapis.com/tokeninfo')) return new Response(JSON.stringify({ email: 'sender@example.invalid', scope: `${SEND} openid` }))
    if (href.startsWith('https://gmail.googleapis.com/')) {
      sent.push(Buffer.from(await new Response(init.body).arrayBuffer()).toString('utf8'))
      return new Response(JSON.stringify({ id: `m${sent.length}` }))
    }
    throw new Error(`unexpected ${href}`)
  }
  return { fetch, sent }
}

function decodedBody (mime) {
  return mime.split(/\r\n\r\n/).slice(1).map(part => {
    const base64 = part.split('\r\n--')[0].replace(/\r\n/g, '')
    return /^[A-Za-z0-9+/=]+$/.test(base64) ? Buffer.from(base64, 'base64').toString('utf8') : part
  }).join('\n')
}

test('mail notifier: one notice per paid order, without buyer contact or street address', async () => {
  const { sqlite, env, row } = fixture()
  try {
    const { fetch, sent } = gmail()
    const summary = await dispatchScheduledNotices(env, { origin: 'https://shop.example.invalid' }, { fetch, now: () => 100 })
    assert.equal(summary.delivered, 1, JSON.stringify({ ...row() }))
    assert.equal(row().status, 'delivered')
    assert.equal(sent.length, 1)
    assert.match(sent[0], /^To: .*shop@example\.invalid/m)
    const body = decodedBody(sent[0])
    for (const expected of ['order-1', 'pi_synthetic', 'CP 28001', 'Modelo de prueba', 'SKU-1', '62,05']) assert.ok(body.includes(expected), expected)
    for (const forbidden of ['buyer@example.invalid', 'Calle Inventada', '+34000000000', 'Persona Ficticia']) assert.ok(!body.includes(forbidden), forbidden)
    // Nothing left: a second tick sends nothing.
    assert.equal((await dispatchScheduledNotices(env, {}, { fetch, now: () => 200 })).attempted, 0)
    assert.equal(sent.length, 1)
  } finally { sqlite.close() }
})

test('mail notifier: a rejected grant keeps the notice pending with the provider code', async () => {
  const { sqlite, env, row } = fixture()
  try {
    const { fetch, sent } = gmail({ tokenStatus: 400 })
    const summary = await dispatchScheduledNotices(env, {}, { fetch, now: () => 100 })
    assert.deepEqual([summary.delivered, summary.failed], [0, 1])
    assert.deepEqual({ ...row() }, { status: 'pending', attempts: 1, last_error: 'gmail_grant_invalid' })
    assert.equal(sent.length, 0)
  } finally { sqlite.close() }
})

test('mail notifier: missing recipient or credentials never sends and stays retryable', async () => {
  for (const patch of [{ COMMERCE_NOTIFY_TO: undefined }, { FORMS_GMAIL_CREDENTIALS: undefined }]) {
    const { sqlite, env, row } = fixture()
    try {
      const { fetch, sent } = gmail()
      await dispatchScheduledNotices({ ...env, ...patch }, {}, { fetch, now: () => 100 })
      assert.equal(row().status, 'pending')
      assert.equal(sent.length, 0)
    } finally { sqlite.close() }
  }
})

test('worker scheduled hook drains only with commerce enabled and a database', () => {
  const waits = []
  const ctx = { waitUntil: promise => waits.push(promise) }
  createCommerceWorker({ functionsEnabled: false }, {}).scheduled({}, { COMMERCE_DB: {} }, ctx)
  createCommerceWorker({ functionsEnabled: true }, {}).scheduled({}, {}, ctx)
  assert.equal(waits.length, 0)
})
