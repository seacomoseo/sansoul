import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { handleAdmin } from '../../admin.js'
import { paymentStatements } from '../../orders.js'
import { normalizeCommerceRequest } from '../../quote.js'

const MIGRATIONS = ['0001_commerce.sql', '0002_buyer_status.sql', '0003_provider_session_expiry.sql', '0004_operations_and_delivery.sql', '0005_outbox_indexes.sql', '0006_bounded_maintenance.sql', '0007_invoices.sql', '0008_buyer_tax_and_delivery_notes.sql', '0009_audience_contacts.sql']

function fixture () {
  const sqlite = new DatabaseSync(':memory:')
  for (const name of MIGRATIONS) sqlite.exec(readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'))
  const wrap = sql => {
    const statement = sqlite.prepare(sql)
    let args = []
    return {
      sql,
      get args () { return args },
      bind (...values) { args = values; return this },
      async first () { return statement.get(...args) || null },
      async all () { return { results: statement.all(...args) } },
      async run () { return { meta: statement.run(...args) } }
    }
  }
  const db = { prepare: wrap, async batch (list) { const out = []; for (const item of list) out.push(await item.run()); return out } }
  let counter = 0
  const pay = async (email, audience, locale = 'es', now = 100) => {
    const id = `a0000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`
    const snapshot = { orderId: id, currency: 'eur', minorUnit: 2, stockMode: 'made_to_order', locale, items: [], ...(audience ? { audience } : {}) }
    sqlite.prepare("INSERT INTO commerce_idempotency VALUES (?, 'hash', ?, ?, 'creating', NULL, NULL, 1, 1, 9999999999)").run(`key-${counter}`, id, JSON.stringify(snapshot))
    sqlite.prepare(`INSERT INTO orders (id, idempotency_key, catalog_release, currency, amount_total_minor, snapshot_json, payment_status, fulfillment_status, created_at, updated_at, expires_at)
      VALUES (?, ?, 'r', 'eur', 1000, ?, 'pending', 'awaiting_payment', 1, 1, 9999999999)`).run(id, `key-${counter}`, JSON.stringify(snapshot))
    const order = { id, snapshot_json: JSON.stringify(snapshot) }
    const target = { state: 'paid', paymentIntentId: `pi_x${counter}`, deliveryDetails: { buyerName: 'Persona Ficticia', buyerEmail: email, buyerPhone: null, recipientName: 'P', line1: 'Calle 1', line2: null, city: 'Ciudad', state: null, postalCode: '28001', countryCode: 'ES' } }
    await db.batch(paymentStatements(db, order, target, now))
    return id
  }
  const env = { COMMERCE_DB: db, COMMERCE_ADMIN_TOKEN: 'x'.repeat(40) }
  return { sqlite, db, pay, env }
}

const contact = (sqlite, email) => sqlite.prepare('SELECT * FROM contacts WHERE email = ?').get(email)

test('consent is stored with the payment, version and order; later orders never withdraw it', async () => {
  const { sqlite, pay } = fixture()
  const id = await pay('  Persona@Example.INVALID ', { consent: true, version: 'v1' }, 'en', 100)
  assert.deepEqual({ ...contact(sqlite, 'persona@example.invalid') }, {
    email: 'persona@example.invalid', name: 'Persona Ficticia', locale: 'en', source: 'order', consent_promotions: 1, consent_at: 100,
    consent_version: 'v1', consent_ref: id, unsubscribed_at: null, created_at: 100, updated_at: 100
  })
  // A second order without the box keeps the consent and its proof.
  await pay('persona@example.invalid', { consent: false, version: 'v1' }, 'es', 200)
  const kept = contact(sqlite, 'persona@example.invalid')
  assert.equal(kept.consent_promotions, 1)
  assert.equal(kept.consent_at, 100)
  assert.equal(kept.consent_ref, id)
  assert.equal(kept.updated_at, 200)
})

test('without the audience key, or with customers only, nothing consents; no key writes nothing', async () => {
  const { sqlite, pay } = fixture()
  await pay('none@example.invalid', null)
  assert.equal(contact(sqlite, 'none@example.invalid'), undefined)
  await pay('customer@example.invalid', { consent: false, version: 'v1' })
  const customer = contact(sqlite, 'customer@example.invalid')
  assert.equal(customer.consent_promotions, 0)
  assert.equal(customer.consent_at, null)
})

test('admin: consented export excludes unsubscribed contacts; a new consent reverses the unsubscribe', async () => {
  const { sqlite, pay, env } = fixture()
  await pay('a@example.invalid', { consent: true, version: 'v1' })
  await pay('b@example.invalid', { consent: true, version: 'v1' })
  await pay('c@example.invalid', { consent: false, version: 'v1' })
  const catalog = { origin: 'https://shop.example', functionsEnabled: true, audience: { customers: true, version: 'v1' } }
  const call = (path, init = {}) => handleAdmin(new Request(`https://shop.example/api/commerce/admin/${path}`, { ...init, headers: { authorization: `Bearer ${env.COMMERCE_ADMIN_TOKEN}`, ...(init.body ? { 'content-type': 'application/json' } : {}) } }), env, catalog)
  const unsub = await call('contacts/unsubscribe', { method: 'POST', body: JSON.stringify({ email: 'B@example.invalid' }) })
  assert.equal(unsub.status, 200)
  assert.equal((await call('contacts/unsubscribe', { method: 'POST', body: JSON.stringify({ email: 'nobody@example.invalid' }) })).status, 404)
  const csv = await (await call('contacts.csv')).text()
  assert.match(csv, /^"email","name","language"/)
  assert.match(csv, /a@example\.invalid/)
  assert.doesNotMatch(csv, /b@example\.invalid|c@example\.invalid/)
  assert.equal((await (await call('contacts?scope=all')).json()).contacts.length, 3)
  await pay('b@example.invalid', { consent: true, version: 'v2' }, 'es', 300)
  assert.equal(contact(sqlite, 'b@example.invalid').unsubscribed_at, null)
  assert.match(await (await call('contacts.csv')).text(), /b@example\.invalid/)
  // Projects without audience do not expose the routes.
  const plain = await handleAdmin(new Request('https://shop.example/api/commerce/admin/contacts', { headers: { authorization: `Bearer ${env.COMMERCE_ADMIN_TOKEN}` } }), env, { origin: 'https://shop.example' })
  assert.equal(plain.status, 404)
})

test('checkout options: terms and consent are booleans, unknown keys still fail', () => {
  const base = { items: [{ id: '11111111-1111-4111-8111-111111111111', quantity: 1 }], destination: { country: 'ES', postalCode: '28001' }, quote: { policy_version: 'v1', total_minor: 100 } }
  const parsed = normalizeCommerceRequest({ ...base, terms_accepted: true, audience_consent: true }, { withQuote: true })
  assert.deepEqual(parsed.options, { termsAccepted: true, audienceConsent: true })
  assert.deepEqual(normalizeCommerceRequest({ ...base, terms_accepted: false }, { withQuote: true }).options, {})
  assert.throws(() => normalizeCommerceRequest({ ...base, terms_accepted: 'yes' }, { withQuote: true }))
  assert.throws(() => normalizeCommerceRequest({ ...base, marketing: true }, { withQuote: true }))
})

test('admin panel: GitHub push access opens people routes, never operator routes', async () => {
  const { env } = fixture()
  const catalog = { origin: 'https://shop.example', functionsEnabled: true, adminRepo: 'acme/shop', audience: { customers: false, version: 'v1' } }
  const token = `ghp_${'a'.repeat(36)}`
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (url, init) => {
    calls++
    assert.equal(String(url), 'https://api.github.com/repos/acme/shop')
    return new Response(JSON.stringify({ permissions: { push: init.headers.authorization === `Bearer ${token}` } }), { headers: { 'x-oauth-scopes': 'repo' } })
  }
  try {
    const call = (path, auth, method = 'GET') => handleAdmin(new Request(`https://shop.example/api/commerce/admin/${path}`, { method, headers: { authorization: auth } }), env, catalog)
    assert.equal((await call('contacts', `GitHub ${token}`)).status, 200)
    assert.equal((await call('orders', `GitHub ${token}`)).status, 200)
    assert.equal(calls, 1, 'second call served from the cache')
    assert.equal((await call('reconcile', `GitHub ${token}`, 'POST')).status, 403)
    assert.equal((await call('outbox/claim', `GitHub ${token}`, 'POST')).status, 403)
    assert.equal((await call('contacts', `GitHub ghp_${'b'.repeat(36)}`)).status, 401)
    assert.equal((await handleAdmin(new Request('https://shop.example/api/commerce/admin/orders', { headers: { authorization: `GitHub ${token}` } }), env, { ...catalog, adminRepo: undefined })).status, 404)
  } finally { globalThis.fetch = original }
})
