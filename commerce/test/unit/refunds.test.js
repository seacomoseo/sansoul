import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { handleAdmin } from '../../admin.js'
import { MIGRATIONS } from '../migrations.js'

// Real SQLite with the original migrations; Stripe and GitHub are stubbed. Synthetic data only.
const ID = 'a0000000-0000-4000-8000-000000000001'
const CATALOG = { origin: 'https://shop.example', functionsEnabled: true, adminRepo: 'o/r' }

function fixture ({ payment = 'paid', refunded = 0, intent = 'pi_synthetic' } = {}) {
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
  const db = { prepare: wrap, async batch (statements) { return Promise.all(statements.map(statement => statement.run())) } }
  const snapshot = JSON.stringify({ orderId: ID, currency: 'eur', minorUnit: 2, items: [{ sku: 'S', name: 'Model', quantity: 1, unitAmountMinor: 1300, lineTotalMinor: 1300 }], totals: { subtotalMinor: 1300, totalMinor: 1300 } })
  sqlite.prepare("INSERT INTO commerce_idempotency VALUES ('key-1', 'hash', ?, ?, 'creating', NULL, NULL, 1, 1, 9999999999)").run(ID, snapshot)
  sqlite.prepare(`INSERT INTO orders (id, idempotency_key, catalog_release, currency, amount_total_minor, snapshot_json, payment_status, fulfillment_status, payment_intent_id, refund_amount_minor, created_at, updated_at, expires_at)
    VALUES (?, 'key-1', 'release', 'eur', 1300, ?, ?, 'manufacturing', ?, ?, 1, 1, 9999999999)`).run(ID, snapshot, payment, intent, refunded)
  const env = {
    COMMERCE_DB: db,
    COMMERCE_ADMIN_TOKEN: 'x'.repeat(40),
    COMMERCE_ENV: 'live',
    COMMERCE_PROVIDER: 'stripe',
    STRIPE_SECRET_KEY: 'rk_live_synthetic',
    STRIPE_WEBHOOK_SECRET: 'whsec_synthetic'
  }
  const row = () => sqlite.prepare('SELECT payment_status, fulfillment_status, refund_amount_minor, updated_at FROM orders WHERE id = ?').get(ID)
  return { env, row }
}

const call = (env, path, body, authorization = `Bearer ${env.COMMERCE_ADMIN_TOKEN}`) => handleAdmin(new Request(`https://shop.example/api/commerce/admin/${path}`, {
  method: 'POST',
  headers: { authorization, 'content-type': 'application/json' },
  body: JSON.stringify(body)
}), env, CATALOG)

// Records Stripe calls and answers with `reply(form)` (status, body).
async function withStripe (reply, run) {
  const calls = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith('https://api.github.com/')) return Response.json({ permissions: { push: true } }, { headers: { 'x-oauth-scopes': 'repo' } })
    const form = new URLSearchParams(String(options.body || ''))
    calls.push({ url: String(url), headers: options.headers, form })
    const [status, body] = reply(form)
    return Response.json(body, { status })
  }
  try {
    await run(calls)
  } finally {
    globalThis.fetch = realFetch
  }
}

const okRefund = form => [200, { id: 're_synthetic1', object: 'refund', status: 'succeeded', amount: Number(form.get('amount')), payment_intent: form.get('payment_intent') }]

test('refund: full by default, sent to Stripe with a state-derived key, D1 untouched', async () => {
  const { env, row } = fixture()
  const before = row()
  await withStripe(okRefund, async calls => {
    const response = await call(env, `orders/${ID}/refund`, { reason: 'Cliente lo pide' })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { order_id: ID, refund_id: 're_synthetic1', refund_status: 'succeeded', amount_minor: 1300, currency: 'eur' })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://api.stripe.com/v1/refunds')
    assert.equal(calls[0].headers['idempotency-key'], `commerce_refund_${ID}_0_1300`)
    assert.equal(calls[0].form.get('payment_intent'), 'pi_synthetic')
    assert.equal(calls[0].form.get('amount'), '1300')
    assert.equal(calls[0].form.get('metadata[commerce_order_id]'), ID)
    assert.equal(calls[0].form.get('metadata[note]'), 'Cliente lo pide')
  })
  // The order only changes through the signed charge.refunded webhook.
  assert.deepEqual(row(), before)
})

test('refund: partial amount, then the rest of a partially refunded order', async () => {
  const { env } = fixture({ payment: 'partially_refunded', refunded: 500 })
  await withStripe(okRefund, async calls => {
    assert.equal((await call(env, `orders/${ID}/refund`, { amount_minor: 801, reason: 'x' })).status, 409)
    assert.equal(calls.length, 0)
    const response = await call(env, `orders/${ID}/refund`, { amount_minor: 300, reason: 'Pieza rota' })
    assert.equal((await response.json()).amount_minor, 300)
    assert.equal(calls[0].headers['idempotency-key'], `commerce_refund_${ID}_500_300`)
    await call(env, `orders/${ID}/refund`, { reason: 'Resto' })
    assert.equal(calls[1].form.get('amount'), '800')
  })
})

test('refund: invalid bodies and orders that cannot be refunded never reach Stripe', async () => {
  await withStripe(okRefund, async calls => {
    const { env } = fixture()
    for (const body of [{}, { reason: '  ' }, { reason: 'x'.repeat(201) }, { reason: 'x', amount_minor: 0 }, { reason: 'x', amount_minor: 1.5 }, { reason: 'x', extra: 1 }]) {
      const response = await call(env, `orders/${ID}/refund`, body)
      assert.equal(response.status, 400)
      assert.equal((await response.json()).error, 'invalid_refund')
    }
    for (const state of [{ payment: 'pending' }, { payment: 'expired' }, { intent: null }]) {
      const response = await call(fixture(state).env, `orders/${ID}/refund`, { reason: 'x' })
      assert.equal(response.status, 409)
      assert.equal((await response.json()).error, 'order_not_refundable')
    }
    // Already refunded (second click or stale tab after the webhook): its own code.
    const done = await call(fixture({ payment: 'refunded', refunded: 1300 }).env, `orders/${ID}/refund`, { reason: 'x' })
    assert.equal(done.status, 409)
    assert.equal((await done.json()).error, 'refund_already_done')
    assert.equal((await call(env, 'orders/a0000000-0000-4000-8000-0000000000ff/refund', { reason: 'x' })).status, 404)
    assert.equal(calls.length, 0)
  })
})

test('refund: Stripe rejections become actionable codes', async () => {
  const { env } = fixture()
  const cases = [
    [403, { error: { type: 'invalid_request_error', message: 'restricted key' } }, 'refund_permission_missing'],
    [400, { error: { code: 'charge_already_refunded' } }, 'refund_already_done'],
    [400, { error: { code: 'balance_insufficient' } }, 'refund_balance_insufficient'],
    [400, { error: { type: 'idempotency_error' } }, 'refund_rejected'],
    [409, { error: { type: 'idempotency_error' } }, 'refund_in_progress'],
    [200, { id: 're_synthetic1', status: 'succeeded', amount: 999, payment_intent: 'pi_synthetic' }, 'payment_provider_invalid_response']
  ]
  for (const [status, body, code] of cases) {
    await withStripe(() => [status, body], async () => {
      const response = await call(env, `orders/${ID}/refund`, { reason: 'x' })
      assert.equal((await response.json()).error, code)
    })
  }
})

test('refund: allowed to people of the CMS, refused without credentials', async () => {
  const { env } = fixture()
  await withStripe(okRefund, async calls => {
    assert.equal((await call(env, `orders/${ID}/refund`, { reason: 'x' }, '')).status, 401)
    const response = await call(env, `orders/${ID}/refund`, { reason: 'Desde el panel' }, `GitHub gho_${'a'.repeat(36)}`)
    assert.equal(response.status, 200)
    assert.equal(calls.filter(entry => entry.url.startsWith('https://api.stripe.com/')).length, 1)
  })
})
