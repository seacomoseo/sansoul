import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { compileInvoice } from '../../notices-config.js'
import { sendOrderNotice } from '../../notifier.js'
import { MIGRATIONS } from '../migrations.js'

const SEND = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/drive.file'

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
  const snapshot = JSON.stringify({ orderId: 'a0000000-0000-4000-8000-000000000001', currency: 'eur', minorUnit: 2, locale: 'en', items: [{ productId: 'p1', sku: 'S', name: 'Model', quantity: 1, unitAmountMinor: 5000, lineTotalMinor: 5000 }], totals: { currency: 'eur', minorUnit: 2, subtotalMinor: 5000, totalMinor: 5000, lines: [{ productId: 'p1', netMinor: 4132, taxMinor: 868, taxMode: 'inclusive', taxRateBps: 2100 }], shippingBaseMinor: 0, shippingTax: { mode: 'inclusive', rateBps: 2100 } } })
  const id = 'a0000000-0000-4000-8000-000000000001'
  sqlite.prepare("INSERT INTO commerce_idempotency VALUES ('key-1', 'hash', ?, ?, 'creating', NULL, NULL, 1, 1, 9999999999)").run(id, snapshot)
  sqlite.prepare(`INSERT INTO orders (id, idempotency_key, catalog_release, currency, amount_total_minor, snapshot_json, payment_status, fulfillment_status, payment_intent_id, created_at, updated_at, expires_at)
    VALUES (?, 'key-1', 'release', 'eur', 5000, ?, 'paid', 'manufacturing', 'pi_synthetic', 1, 1, 9999999999)`).run(id, snapshot)
  sqlite.prepare(`INSERT INTO order_delivery_details (order_id, source, buyer_name, buyer_email, recipient_name, address_line1, locality, postal_code, country_code, updated_at)
    VALUES (?, 'stripe_checkout', 'Persona Ficticia', 'buyer@example.invalid', 'Persona Ficticia', 'Calle Inventada 1', 'Ciudad', '28001', 'ES', 1)`).run(id)
  const forms = new DatabaseSync(':memory:')
  for (const name of readdirSync(new URL('../../../forms/migrations/', import.meta.url)).sort()) forms.exec(readFileSync(new URL(`../../../forms/migrations/${name}`, import.meta.url), 'utf8'))
  const formsDb = { prepare: sql => { const st = forms.prepare(sql); let a = []; return { bind (...v) { a = v; return this }, async first () { return st.get(...a) || null }, async all () { return { results: st.all(...a) } }, async run () { return { meta: st.run(...a) } } } } }
  const env = {
    FORMS_DB: formsDb,
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

function drive () {
  const calls = []
  const seen = {}
  const fetch = async (url, init = {}) => {
    const href = String(url)
    if (href === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'at', expires_in: 3600, scope: SEND })
    if (href.startsWith('https://oauth2.googleapis.com/tokeninfo')) return Response.json({ email: 'sender@example.invalid', scope: `${SEND} openid` })
    if (href.startsWith('https://www.googleapis.com/drive/v3/files?q=')) {
      calls.push('find')
      return Response.json({ files: [] })
    }
    if (href.startsWith('https://www.googleapis.com/drive/v3/files?fields=id')) {
      calls.push('folder')
      return Response.json({ id: `folder-${calls.length}` })
    }
    if (href.startsWith('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart')) {
      calls.push('upload')
      seen.body = Buffer.from(await new Response(init.body).arrayBuffer()).toString('latin1')
      return Response.json({ id: 'file-1', webViewLink: 'https://drive.example/file-1' })
    }
    throw new Error(`unexpected ${href}`)
  }
  return { fetch, calls, seen }
}

const config = { enabled: true, language: 'es', seller: { name: 'Vendedor', tax_id: 'X0000000X', address: ['Calle 1'] }, drive_archive: true }

test('invoice.archive files the PDF once under «Facturas web <site>» › year and records it', async () => {
  const { sqlite, env, id } = fixture()
  const catalog = { invoice: compileInvoice(config), notices: null }
  assert.equal(catalog.invoice.driveArchive, true)
  const google = drive()
  const item = { order_id: id, event_type: 'invoice.archive', event_key: `${id}:invoice.archive`, payload_json: '{}' }
  const run = () => sendOrderNotice({ env, db: env.COMMERCE_DB, item, site: 'Tienda', catalog, fetch: google.fetch })
  await run()
  assert.deepEqual(google.calls, ['find', 'folder', 'find', 'folder', 'find', 'upload'])
  assert.match(google.seen.body, /"name":"[A-Za-z0-9._-]+\.pdf"/)
  assert.match(google.seen.body, /%PDF/)
  const row = sqlite.prepare('SELECT drive_file_id, link FROM invoice_archive').get()
  assert.equal(row.drive_file_id, 'file-1')
  await run()
  assert.equal(google.calls.filter(call => call === 'upload').length, 1, 'idempotent')
  // Disabled in config: nothing happens.
  const off = drive()
  await sendOrderNotice({ env, db: env.COMMERCE_DB, item, site: 'Tienda', catalog: { invoice: compileInvoice({ ...config, drive_archive: false }) }, fetch: off.fetch })
  assert.deepEqual(off.calls, [])
})

test('paying an order queues the archive event only when drive_archive is on', async () => {
  const { sqlite, env, id } = fixture()
  const send = (catalog) => sendOrderNotice({ env, db: env.COMMERCE_DB, item: { order_id: id, event_type: 'payment.paid', event_key: `${id}:payment.paid`, payload_json: '{}' }, site: 'Tienda', catalog, fetch: gmail().fetch })
  await send({ invoice: compileInvoice({ ...config, drive_archive: false }), notices: null })
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM outbox WHERE event_type = 'invoice.archive'").get().n, 0)
  await send({ invoice: compileInvoice(config), notices: null })
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM outbox WHERE event_type = 'invoice.archive'").get().n, 1)
})
