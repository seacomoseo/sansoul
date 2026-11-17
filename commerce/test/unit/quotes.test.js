import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { compileQuotes, normalizeIban } from '../../notices-config.js'
import { computeQuote, normalizeQuoteInput, quoteTotals } from '../../quotes.js'
import { handleAdmin } from '../../admin.js'
import { createCommerceWorker } from '../../worker.js'
import { applyPaymentState } from '../../orders.js'
import { buildInvoiceData, renderInvoicePdf } from '../../invoice.js'
import { renderOrderNotice } from '../../notifier.js'
import { SYNTHETIC_TEST_FIXTURE } from '../../approval.js'
import { MIGRATIONS } from '../migrations.js'

// Proformas (14.11) on real SQLite with every migration. Synthetic data only.
const PRODUCT = '11111111-1111-4111-8111-111111111111'
const ORIGIN = 'https://shop.example.invalid'
const TOKEN = 'x'.repeat(40)

const INVOICE = {
  language: 'es',
  timezone: 'Europe/Madrid',
  seller: { name: 'Titular Ficticia', taxId: '00000000T', address: ['Calle Inventada 4', '30000 Ciudad'] },
  series: { prefix: 'WEB', creditPrefix: 'RWEB', year: true, digits: 4, start: 1 },
  itemLabel: 'Venta material 3D ({name})',
  simplified: true,
  exemptNote: 'Operación exenta de IVA (envío a Canarias)'
}

function catalogFor ({ transfer = false } = {}) {
  const tax = { mode: 'inclusive', rateBps: 2100 }
  return {
    enabled: true,
    functionsEnabled: true,
    origin: ORIGIN,
    currency: 'eur',
    minorUnit: 2,
    release: 'release-test',
    stockMode: 'made_to_order',
    products: [{ id: PRODUCT, sku: 'TEST-001', active: true, quote: false, priceMinor: 14000, weightGrams: 900, names: { es: 'Cuaderno ADN' } }],
    checkout: {
      approved: true,
      legalVersion: 'v1',
      destinationCountries: ['ES'],
      taxPolicy: 'included',
      shippingPolicy: 'flat_rate',
      totalsPolicy: { schemaVersion: 2, version: 'p1', currency: 'eur', minorUnit: 2, destinations: { ES: { tax, shipping: { amountMinor: 600, tax, maxUnits: 1 }, excludedPostalPrefixes: ['35', '38'] } } }
    },
    invoice: INVOICE,
    notices: { language: 'es', merchant: 'full', merchantLanguage: 'es', merchantInvoice: true, buyer: 'own', buyerInvoice: 'on_request' },
    quotes: compileQuotes(transfer ? { transfer: { iban: 'ES91 2100 0418 4502 0005 1332' } } : undefined, { cartQuote: true })
  }
}

function database () {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const name of MIGRATIONS) sqlite.exec(readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'))
  const wrap = (sql) => {
    const statement = sqlite.prepare(sql)
    let args = []
    return {
      bind (...values) { args = values; return this },
      async first () { return statement.get(...args) || null },
      async all () { return { results: statement.all(...args) } },
      async run () { return { meta: statement.run(...args) } },
      runSync () { return { meta: statement.run(...args) } }
    }
  }
  const db = {
    prepare: wrap,
    async batch (statements) {
      sqlite.exec('BEGIN')
      try {
        const results = statements.map(statement => statement.runSync())
        sqlite.exec('COMMIT')
        return results
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    }
  }
  return { sqlite, db }
}

function gmail () {
  const sent = []
  const fetch = async (url, init = {}) => {
    const href = String(url)
    if (href.startsWith('https://oauth2.googleapis.com/tokeninfo')) return new Response(JSON.stringify({ email: 'sender@example.invalid', scope: 'https://www.googleapis.com/auth/gmail.send openid' }))
    if (href.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600, scope: 'https://www.googleapis.com/auth/gmail.send' }))
    if (href.startsWith('https://gmail.googleapis.com/')) {
      sent.push(Buffer.from(await new Response(init.body).arrayBuffer()).toString('utf8'))
      return new Response(JSON.stringify({ id: `m${sent.length}` }))
    }
    throw new Error(`unexpected ${href}`)
  }
  return { fetch, sent }
}

function decode (mime) {
  let text = ''
  let pdf = null
  for (const part of mime.split(/\r\n--[A-Za-z0-9-]+/)) {
    const [head, ...rest] = part.split(/\r\n\r\n/)
    const body = rest.join('\r\n\r\n').replace(/\r\n/g, '')
    if (!body || !/^[A-Za-z0-9+/=]+$/.test(body)) continue
    const bytes = Buffer.from(body, 'base64')
    if (/application\/pdf/.test(head)) pdf = pdf || bytes
    else text += bytes.toString('utf8') + '\n'
  }
  return { text, pdf }
}

function environment (db, extra = {}) {
  return {
    COMMERCE_DB: db,
    COMMERCE_ADMIN_TOKEN: TOKEN,
    COMMERCE_ENV: 'test',
    COMMERCE_PROVIDER: 'fake',
    COMMERCE_TEST_FIXTURE: SYNTHETIC_TEST_FIXTURE,
    COMMERCE_RATE_LIMIT_SALT: 's'.repeat(40),
    COMMERCE_NOTIFY_TO: 'tienda@example.invalid',
    FORMS_GMAIL_DEFAULT: 'sender',
    FORMS_GMAIL_CREDENTIALS: JSON.stringify({ sender: { account: 'sender@example.invalid', client_id: 'cid', client_secret: 'csecret', refresh_token: 'rtoken' } }),
    ASSETS: { fetch: async () => new Response('asset') },
    ...extra
  }
}

function admin (env, catalog, path, { method = 'GET', body } = {}) {
  return handleAdmin(new Request(`${ORIGIN}/api/commerce/admin/${path}`, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  }), env, catalog)
}

const INPUT = {
  submission_id: 'sub-0000000000000001',
  customer: { name: 'Persona Ficticia', email: 'Cliente@Example.invalid', phone: '600000000', country: 'ES', postal_code: '35001' },
  lines: [
    { product_id: PRODUCT, description: 'Cuaderno ADN', quantity: 2, unit_minor: 14000 },
    { description: 'Embalaje especial', quantity: 1, unit_minor: 500 }
  ],
  shipping_minor: 1850,
  discount: { type: 'percent', value: 1000 },
  tax: 'standard',
  delivery: '7-10 días laborables',
  note: 'Gracias por tu interés.',
  invoice_requested: true
}

test('quotes config: IBAN checksum, defaults and opt-out', () => {
  assert.equal(normalizeIban('es9121000418450200051332'), 'ES91 2100 0418 4502 0005 1332')
  assert.equal(normalizeIban('ES9121000418450200051333'), null)
  assert.equal(compileQuotes(undefined), null)
  assert.deepEqual(compileQuotes(undefined, { cartQuote: true }), { validityDays: 15 })
  assert.equal(compileQuotes({ enabled: false }, { cartQuote: true }), null)
  assert.throws(() => compileQuotes({ transfer: { iban: 'ES00 1234' } }), /invalid_quotes_iban/)
  assert.throws(() => compileQuotes({ validity_days: 0 }), /validity_days/)
})

test('quote totals: inclusive tax with percent discount, exempt and exclusive', () => {
  const catalog = catalogFor()
  const data = computeQuote(normalizeQuoteInput(INPUT, catalog), catalog)
  // 2 × 140 + 5 = 285; −10 % = 28.50; + 18.50 shipping = 275.00 with VAT included.
  assert.equal(data.subtotalMinor, 28500)
  assert.equal(data.discount.totalMinor, 2850)
  assert.equal(data.totalMinor, 27500)
  assert.equal(data.netMinor + data.taxMinor, data.totalMinor)
  assert.equal(data.customer.email, 'cliente@example.invalid')
  assert.equal(data.lines[0].sku, 'TEST-001')
  assert.equal(data.lines[1].productId, null)
  const totals = quoteTotals(data)
  assert.equal(totals.lines.reduce((sum, line) => sum + line.totalMinor, 0) - totals.discountNetMinor - totals.discountTaxMinor + totals.shippingNetMinor + totals.shippingTaxMinor, totals.totalMinor)

  const exempt = computeQuote(normalizeQuoteInput({ ...INPUT, tax: 'exempt' }, catalog), catalog)
  assert.equal(exempt.totalMinor, 27500)
  assert.equal(exempt.taxMinor, 0)

  const exclusiveCatalog = { ...catalog, checkout: { ...catalog.checkout, totalsPolicy: { ...catalog.checkout.totalsPolicy, destinations: { ES: { ...catalog.checkout.totalsPolicy.destinations.ES, tax: { mode: 'exclusive', rateBps: 2100 } } } } } }
  const exclusive = computeQuote(normalizeQuoteInput({ ...INPUT, discount: { type: 'amount', value: 1000 } }, exclusiveCatalog), exclusiveCatalog)
  // Net 285 − 10 + 18.50 = 293.50, plus 21 % per amount.
  assert.equal(exclusive.netMinor, 29350)
  assert.equal(exclusive.totalMinor, exclusive.netMinor + exclusive.taxMinor)

  assert.throws(() => normalizeQuoteInput({ ...INPUT, lines: [] }, catalog), /invalid_quote_lines/)
  assert.throws(() => normalizeQuoteInput({ ...INPUT, customer: { ...INPUT.customer, email: 'nope' } }, catalog), /invalid_quote_email/)
  assert.throws(() => normalizeQuoteInput({ ...INPUT, discount: { type: 'percent', value: 20000 } }, catalog), /invalid_quote_discount/)
  assert.throws(() => normalizeQuoteInput({ ...INPUT, extra: 1 }, catalog), /invalid_quote/)
})

test('proforma: save, preview, send, pay by card and invoice with discount', async () => {
  const { db, sqlite } = database()
  const catalog = catalogFor()
  const mail = gmail()
  const realFetch = globalThis.fetch
  globalThis.fetch = mail.fetch
  try {
    const env = environment(db)
    const created = await admin(env, catalog, 'quotes', { method: 'POST', body: INPUT })
    assert.equal(created.status, 201)
    const { quote } = await created.json()
    assert.match(quote.reference, /^P-\d{4}-0001$/)
    assert.equal(quote.status, 'draft')
    assert.equal(quote.total_minor, 27500)
    // One proforma per request.
    assert.equal((await admin(env, catalog, 'quotes', { method: 'POST', body: INPUT })).status, 409)

    const pdf = await admin(env, catalog, `quotes/${quote.id}/proforma.pdf`)
    assert.equal(pdf.headers.get('content-type'), 'application/pdf')
    const pdfText = Buffer.from(await pdf.arrayBuffer()).toString('latin1')
    assert.match(pdfText, /FACTURA PROFORMA/)
    assert.match(pdfText, /Descuento \\\(10 %\\\)/)
    assert.match(pdfText, /no es una factura/)

    const sent = await admin(env, catalog, `quotes/${quote.id}/send`, { method: 'POST' })
    assert.equal(sent.status, 200)
    const sentBody = await sent.json()
    assert.equal(sentBody.quote.status, 'sent')
    assert.equal(sentBody.card, true)
    assert.equal(mail.sent.length, 1)
    const message = decode(mail.sent[0])
    assert.match(mail.sent[0], /To: cliente@example\.invalid/i)
    assert.ok(message.pdf && message.pdf.toString('latin1').includes('FACTURA PROFORMA'))
    const link = message.text.match(/https:\/\/shop\.example\.invalid\/api\/commerce\/quote\/([A-Za-z0-9_-]{43})/)
    assert.ok(link, 'payment link in the mail')
    assert.match(message.text, /7-10 días laborables/)

    const worker = createCommerceWorker(catalog, {})
    const pageResponse = await worker.fetch(new Request(link[0]), env)
    assert.equal(pageResponse.status, 200)
    const html = await pageResponse.text()
    assert.match(html, /Pagar 275,00/)
    assert.match(html, /method="post"/)
    // GET never creates orders (mail scanners follow links).
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 0)

    const pay = () => worker.fetch(new Request(`${link[0]}/pay`, { method: 'POST', headers: { origin: ORIGIN } }), env)
    assert.equal((await worker.fetch(new Request(`${link[0]}/pay`, { method: 'POST', headers: { origin: 'https://evil.example' } }), env)).status, 403)
    const redirect = await pay()
    assert.equal(redirect.status, 303)
    assert.match(redirect.headers.get('location'), /\/__test\/checkout\//)
    assert.match(redirect.headers.get('set-cookie') || '', /__Secure-commerce-status-/)
    // A second click reuses the open session.
    const again = await pay()
    assert.equal(again.headers.get('location'), redirect.headers.get('location'))
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 1)

    const order = sqlite.prepare('SELECT * FROM orders').get()
    const snapshot = JSON.parse(order.snapshot_json)
    assert.equal(order.amount_total_minor, 27500)
    assert.equal(snapshot.quote.reference, quote.reference)
    // Webhook: paid with the address Stripe collected.
    await applyPaymentState(db, order, {
      state: 'paid',
      sessionId: order.session_id,
      paymentIntentId: 'pi_quote1',
      deliveryDetails: { buyerName: 'Persona Ficticia', buyerEmail: 'cliente@example.invalid', buyerPhone: null, recipientName: 'Persona Ficticia', line1: 'Calle 1', line2: null, city: 'Las Palmas', state: 'GC', postalCode: '35001', countryCode: 'ES' }
    })
    const paid = sqlite.prepare('SELECT * FROM orders WHERE id = ?').get(order.id)
    assert.equal(paid.payment_status, 'paid')
    assert.equal(paid.fulfillment_status, 'ready')
    const closed = sqlite.prepare('SELECT status, payment_method, order_id FROM quotes WHERE id = ?').get(quote.id)
    assert.deepEqual({ ...closed }, { status: 'paid', payment_method: 'card', order_id: order.id })
    assert.ok(sqlite.prepare("SELECT 1 FROM outbox WHERE order_id = ? AND event_type = 'payment.paid'").get(order.id))

    const details = sqlite.prepare('SELECT * FROM order_delivery_details WHERE order_id = ?').get(order.id)
    const invoice = buildInvoiceData({ order: paid, details, config: INVOICE, issuedAt: 1790000000 })
    assert.equal(invoice.totalMinor, 27500)
    assert.equal(invoice.discount.totalMinor, -2850)
    assert.equal(invoice.lines[0].description, 'Venta material 3D (Cuaderno ADN)')
    assert.equal(invoice.lines[1].description, 'Embalaje especial')
    const invoicePdf = Buffer.from(renderInvoicePdf({ kind: 'invoice', series: 'WEB-2026', number: 1, issued_at: 1790000000, data_json: JSON.stringify(invoice) })).toString('latin1')
    assert.match(invoicePdf, /Descuento/)

    const notice = renderOrderNotice({ item: { order_id: order.id, event_type: 'payment.paid' }, order: { ...paid, ...details }, site: 'shop.example.invalid', merchantDetails: true, catalog })
    assert.match(notice.text, new RegExp(`Presupuesto: ${quote.reference}`))
    assert.match(notice.text, /Descuento: -28,50/)
    assert.match(notice.text, /1 × Embalaje especial —/)

    // The link of a paid proforma says so.
    assert.match(await (await worker.fetch(new Request(link[0]), env)).text(), /ya está pagado/)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('proforma: editing after sending invalidates the link; transfer becomes a paid order', async () => {
  const { db, sqlite } = database()
  const catalog = catalogFor({ transfer: true })
  const mail = gmail()
  const realFetch = globalThis.fetch
  globalThis.fetch = mail.fetch
  try {
    const env = environment(db, { COMMERCE_TEST_FIXTURE: 'off' })
    const { quote } = await (await admin(env, catalog, 'quotes', { method: 'POST', body: { ...INPUT, tax: 'exempt' } })).json()
    const sent = await (await admin(env, catalog, `quotes/${quote.id}/send`, { method: 'POST' })).json()
    assert.equal(sent.card, false)
    assert.equal(sent.transfer, true)
    const message = decode(mail.sent[0])
    assert.match(message.text, /IBAN: ES91 2100 0418 4502 0005 1332/)
    assert.match(message.text, new RegExp(`Concepto: ${quote.reference}`))
    assert.doesNotMatch(message.text, /api\/commerce\/quote\//)
    assert.match(message.pdf.toString('latin1'), /exenta de IVA/)

    // Edit → draft; transfer needs the street address.
    const edited = await (await admin(env, catalog, 'quotes', { method: 'POST', body: { ...INPUT, id: quote.id, tax: 'exempt', shipping_minor: 2000 } })).json()
    assert.equal(edited.quote.status, 'draft')
    assert.equal((await admin(env, catalog, `quotes/${quote.id}/transfer`, { method: 'POST' })).status, 409)
    const withAddress = { ...INPUT, id: quote.id, tax: 'exempt', customer: { ...INPUT.customer, line1: 'Calle 1', locality: 'Las Palmas', region: 'GC', tax_id: '00000000T' } }
    await admin(env, catalog, 'quotes', { method: 'POST', body: withAddress })

    const transfer = await admin(env, catalog, `quotes/${quote.id}/transfer`, { method: 'POST' })
    assert.equal(transfer.status, 200)
    const { order_id: orderId, quote: paidQuote } = await transfer.json()
    assert.equal(paidQuote.status, 'paid')
    assert.equal(paidQuote.payment_method, 'transfer')
    const order = sqlite.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
    assert.equal(order.payment_status, 'paid')
    assert.equal(order.fulfillment_status, 'ready')
    const details = sqlite.prepare('SELECT * FROM order_delivery_details WHERE order_id = ?').get(orderId)
    assert.equal(details.buyer_tax_id, '00000000T')
    const invoice = buildInvoiceData({ order, details, config: INVOICE, issuedAt: 1790000000 })
    assert.equal(invoice.paymentText, 'Pagado por transferencia bancaria')
    assert.equal(invoice.exemptNote, INVOICE.exemptNote)
    assert.equal(invoice.customer.taxId, '00000000T')
    assert.equal(invoice.simplified, undefined)
    // Paid proformas are locked.
    assert.equal((await admin(env, catalog, 'quotes', { method: 'POST', body: withAddress })).status, 409)
    assert.equal((await admin(env, catalog, `quotes/${quote.id}/cancel`, { method: 'POST' })).status, 409)

    const listed = await (await admin(env, catalog, 'quotes')).json()
    assert.equal(listed.quotes.length, 1)
    assert.equal(listed.quotes[0].order_payment_status, 'paid')
    assert.equal(listed.setup.transfer, true)
    assert.equal(listed.setup.products[0].sku, 'TEST-001')
  } finally {
    globalThis.fetch = realFetch
  }
})

test('proforma link: unknown token and disabled quotes', async () => {
  const { db } = database()
  const worker = createCommerceWorker(catalogFor(), {})
  const response = await worker.fetch(new Request(`${ORIGIN}/api/commerce/quote/${'a'.repeat(43)}`), environment(db))
  assert.equal(response.status, 404)
  assert.match(await response.text(), /no es válido/)
  assert.equal((await worker.fetch(new Request(`${ORIGIN}/api/commerce/quote/short`), environment(db))).status, 404)
  const disabled = { ...catalogFor(), quotes: undefined }
  assert.equal((await admin(environment(db), disabled, 'quotes')).status, 404)
})
