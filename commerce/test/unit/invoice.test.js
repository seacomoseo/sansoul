import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildCatalog } from '../../scripts/build-catalog.js'
import { compileInvoice, compileNotices } from '../../notices-config.js'
import { buildCreditNoteData, buildInvoiceData, formatMoney, getOrIssueInvoice, InvoiceError, invoiceNumber, issueInvoice, localDate, renderInvoicePdf } from '../../invoice.js'
import { createPdf, textWidth, toWinAnsi, wrapText } from '../../pdf.js'
import { calculateOrderTotals } from '../../totals.js'
import { dispatchScheduledNotices, handleAdmin } from '../../admin.js'
import { MIGRATIONS } from '../migrations.js'

// Real SQLite with every migration; D1-shaped adapter. Synthetic data only.
const PRODUCT = '11111111-1111-4111-8111-111111111111'
const ORDER = '22222222-2222-4222-8222-222222222222'
const PAID_AT = Date.UTC(2026, 10, 12, 10, 0, 0) / 1000

const INVOICE = {
  language: 'es',
  timezone: 'Europe/Madrid',
  seller: { name: 'Titular Ficticia', taxId: '00000000T', address: ['Calle Inventada 4', '30000 Ciudad (Provincia)'], email: 'tienda@example.invalid' },
  series: { prefix: 'WEB', creditPrefix: 'RWEB', year: true, digits: 4, start: 1 },
  itemLabel: 'Venta material 3D ({name})',
  exemptNote: 'Operación exenta de IVA según art. 21 Ley 37/1992 (envío a Canarias)'
}
const NOTICES = { language: 'es', merchant: 'full', merchantLanguage: 'es', merchantInvoice: true, buyer: 'own', buyerInvoice: 'always' }

function policy (taxMode = 'inclusive', rateBps = 2100) {
  const tax = taxMode === 'exempt' ? { mode: 'exempt', rateBps: 0 } : { mode: taxMode, rateBps }
  return {
    schemaVersion: 2,
    version: 'synthetic',
    currency: 'eur',
    minorUnit: 2,
    destinations: { ES: { tax, shipping: { amountMinor: 600, tax }, excludedPostalPrefixes: [] } }
  }
}

function snapshotFor (quantity = 1, mode = 'inclusive') {
  const base = {
    currency: 'eur',
    minorUnit: 2,
    subtotalMinor: 1500 * quantity,
    items: [{ productId: PRODUCT, sku: 'TEST-001', name: 'Cuaderno ADN', quantity, unitAmountMinor: 1500, lineTotalMinor: 1500 * quantity, weightGrams: 500 }]
  }
  const totals = calculateOrderTotals(base, policy(mode), { country: 'ES', postalCode: '28001' })
  return { ...base, totals, totalMinor: totals.totalMinor }
}

function fixture ({ notices = NOTICES, invoice = INVOICE, snapshot = snapshotFor(), buyerEmail = 'comprador@example.invalid' } = {}) {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const name of MIGRATIONS) sqlite.exec(readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'))
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
    batch: async () => []
  }
  const json = JSON.stringify(snapshot)
  const addOrder = (id, key) => {
    sqlite.prepare("INSERT INTO commerce_idempotency VALUES (?, 'hash', ?, ?, 'creating', NULL, NULL, 1, 1, 9999999999)").run(`key-${key}`, id, json)
    sqlite.prepare(`INSERT INTO orders (id, idempotency_key, catalog_release, currency, amount_total_minor, snapshot_json, payment_status, fulfillment_status, payment_intent_id, created_at, updated_at, expires_at)
      VALUES (?, ?, 'release', 'eur', ?, ?, 'paid', 'ready', ?, 1, ?, 9999999999)`).run(id, `key-${key}`, snapshot.totalMinor, json, `pi_${key}`, PAID_AT)
    sqlite.prepare(`INSERT INTO order_delivery_details (order_id, source, buyer_name, buyer_email, buyer_phone, recipient_name, address_line1, address_line2, locality, administrative_area, postal_code, country_code, updated_at)
      VALUES (?, 'stripe_checkout', 'Persona Ficticia', ?, '+34000000000', 'Persona Ficticia', 'Calle Falsa 1', '2.º B', 'Ciudad', 'Provincia', '28001', 'ES', 1)`).run(id, buyerEmail)
    const eventKey = `${id}:payment.paid`
    sqlite.prepare("INSERT INTO outbox VALUES (?, ?, 'payment.paid', ?, 'pending', 0, 0, NULL, NULL, ?, ?)")
      .run(eventKey, id, JSON.stringify({ eventKey, orderId: id, eventType: 'payment.paid' }), PAID_AT, PAID_AT)
  }
  addOrder(ORDER, 'a')
  const catalog = { origin: 'https://shop.example.invalid', enabled: true, ...(invoice ? { invoice } : {}), ...(notices ? { notices } : {}) }
  const env = {
    COMMERCE_DB: db,
    COMMERCE_ADMIN_TOKEN: 'x'.repeat(40),
    COMMERCE_NOTIFY_TO: 'tienda@example.invalid',
    FORMS_GMAIL_DEFAULT: 'sender',
    FORMS_GMAIL_CREDENTIALS: JSON.stringify({ sender: { account: 'sender@example.invalid', client_id: 'cid', client_secret: 'csecret', refresh_token: 'rtoken' } })
  }
  const order = id => db.prepare('SELECT o.*, d.buyer_name, d.buyer_email, d.recipient_name, d.address_line1, d.address_line2, d.locality, d.administrative_area, d.postal_code, d.country_code FROM orders o LEFT JOIN order_delivery_details d ON d.order_id = o.id WHERE o.id = ?').bind(id).first()
  return { sqlite, db, env, catalog, addOrder, order }
}

const SEND = 'https://www.googleapis.com/auth/gmail.send'

function gmail () {
  const sent = []
  const fetch = async (url, init = {}) => {
    const href = String(url)
    if (href.startsWith('https://oauth2.googleapis.com/tokeninfo')) return new Response(JSON.stringify({ email: 'sender@example.invalid', scope: `${SEND} openid` }))
    if (href.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600, scope: SEND }))
    if (href.startsWith('https://gmail.googleapis.com/')) {
      sent.push(Buffer.from(await new Response(init.body).arrayBuffer()).toString('utf8'))
      return new Response(JSON.stringify({ id: `m${sent.length}` }))
    }
    throw new Error(`unexpected ${href}`)
  }
  return { fetch, sent }
}

// Text of the readable parts and the first PDF attachment of a sent MIME message.
function parse (mime) {
  const parts = mime.split(/\r\n--[A-Za-z0-9-]+/)
  let text = ''
  let pdf = null
  for (const part of parts) {
    const [head, ...rest] = part.split(/\r\n\r\n/)
    const body = rest.join('\r\n\r\n').replace(/\r\n/g, '')
    if (!/^[A-Za-z0-9+/=]+$/.test(body) || !body) continue
    const bytes = Buffer.from(body, 'base64')
    if (/application\/pdf/.test(head)) pdf = pdf || bytes
    else text += bytes.toString('utf8') + '\n'
  }
  return { headers: mime.split('\r\n\r\n')[0], text, pdf }
}

test('pdf writer: valid structure, correct xref offsets and Helvetica metrics', () => {
  const doc = createPdf({ title: 'Prueba €', author: 'Autora', created: new Date(0) })
  const page = doc.addPage()
  page.text('Hola ñandú € (1) \\ ok', 50, 60, { size: 12, bold: true })
  page.rect(50, 80, 100, 20)
  page.line(50, 110, 200, 110)
  const bytes = doc.toBytes()
  const text = new TextDecoder().decode(bytes)
  assert.ok(text.startsWith('%PDF-1.4\n') && text.endsWith('%%EOF\n'))
  const xref = Number(text.match(/startxref\n(\d+)/)[1])
  assert.equal(text.slice(xref, xref + 4), 'xref')
  for (const match of text.matchAll(/(\d{10}) 00000 n /g)) assert.match(text.slice(Number(match[1]), Number(match[1]) + 10), /^\d+ 0 obj/)
  assert.ok(bytes.length < 2000)
  // Helvetica: 'Hello' = 722+556+222+222+556; bold is wider.
  assert.equal(textWidth('Hello', 10), 22.78)
  assert.equal(textWidth('Hello', 10, true), 24.45)
  assert.deepEqual(toWinAnsi('€ñ Ω'), [0x80, 0xf1, 0x20, 0x3f])
  assert.deepEqual(wrapText('uno dos tres cuatro', 10, false, textWidth('uno dos', 10) + 1), ['uno dos', 'tres', 'cuatro'])
})

test('invoice config: defaults, opt-in and strict validation', () => {
  assert.equal(compileInvoice(undefined), null)
  assert.equal(compileInvoice({ enabled: false }), null)
  const seller = { name: 'Titular', tax_id: '00000000T', address: ['Calle 1'] }
  const minimal = compileInvoice({ enabled: true, seller })
  assert.deepEqual(minimal.series, { prefix: 'F', creditPrefix: 'RF', year: true, digits: 4, start: 1 })
  assert.equal(minimal.language, 'es')
  assert.equal(minimal.timezone, 'Europe/Madrid')
  assert.equal(Object.hasOwn(minimal, 'paymentText'), false)
  assert.equal(compileInvoice({ enabled: true, seller, payment_text: false }).paymentText, null)
  assert.equal(compileInvoice({ enabled: true, seller, payment_text: 'Transferencia' }).paymentText, 'Transferencia')
  const bad = [
    { enabled: true }, { enabled: true, seller: { ...seller, address: [] } }, { enabled: true, seller, extra: 1 },
    { enabled: true, seller, series: { prefix: 'A B' } }, { enabled: true, seller, series: { prefix: 'A', credit_prefix: 'A' } },
    { enabled: true, seller, series: { start: 0 } }, { enabled: true, seller, timezone: 'Mars/Base' }, { enabled: true, seller, language: 'fr' }
  ]
  for (const value of bad) assert.throws(() => compileInvoice(value), /invalid_invoice/, JSON.stringify(value))

  assert.equal(compileNotices(undefined, null), null)
  assert.equal(compileNotices({ enabled: false }, null), null)
  assert.deepEqual(compileNotices({ enabled: true }, null), { language: 'es', merchant: 'full', merchantLanguage: 'es', merchantInvoice: false, buyer: 'own', buyerInvoice: 'never' })
  assert.deepEqual(compileNotices({ enabled: true }, minimal), { language: 'es', merchant: 'full', merchantLanguage: 'es', merchantInvoice: true, buyer: 'own', buyerInvoice: 'on_request' })
  // 14.3 keys map onto the new ones.
  assert.equal(compileNotices({ enabled: true, buyer_confirmation: false, buyer_invoice: false }, minimal).buyer, 'none')
  assert.equal(compileNotices({ enabled: true, buyer_confirmation: false }, minimal).buyerInvoice, 'never')
  assert.equal(compileNotices({ enabled: true, merchant_details: false }, null).merchant, 'summary')
  assert.equal(compileNotices({ enabled: true, buyer_invoice: true }, minimal).buyerInvoice, 'always')
  assert.equal(compileNotices({ enabled: true, buyer_invoice: false }, minimal).buyerInvoice, 'never')
  assert.equal(compileNotices({ enabled: true, merchant: 'none' }, minimal).merchantInvoice, false)
  assert.throws(() => compileNotices({ enabled: true, merchant_invoice: true }, null), /requires_invoice/)
  assert.throws(() => compileNotices({ enabled: true, buyer_confirmation: false, buyer_invoice: true }, minimal), /buyer_invoice_requires/)
  assert.throws(() => compileNotices({ enabled: true, merchant: 'none', merchant_invoice: true }, minimal), /merchant_invoice_requires/)
  assert.throws(() => compileNotices({ enabled: true, merchant: 'full', merchant_details: true }, null), /merchant_and_merchant_details/)
  assert.throws(() => compileNotices({ enabled: true, buyer: 'own', buyer_confirmation: true }, null), /buyer_and_buyer_confirmation/)
  assert.throws(() => compileNotices({ enabled: true, merchant_details: 'yes' }, null), /invalid_order_notices/)
  assert.throws(() => compileNotices({ enabled: true, buyer: 'email' }, null), /invalid_order_notices/)
  assert.throws(() => compileNotices({ enabled: true, merchant_language: 'de' }, null), /invalid_order_notices/)
  assert.throws(() => compileNotices({ enabled: true, templates: { buyer_paid: { body: 'x' } } }, null), /templates/)
  assert.throws(() => compileNotices({ enabled: true, templates: { buyer_paid: { subject: { zh: 'x' } } } }, null), /templates/)
  const templated = compileNotices({ enabled: true, templates: { buyer_paid: { subject: 'Gracias · {site}', outro: { es: 'Plazo: **2 semanas**. [Condiciones](https://shop.example.invalid/legal/)', en: 'Lead time: 2 weeks.' } } } }, null)
  assert.deepEqual(templated.templates.buyer_paid.subject, { '*': 'Gracias · {site}' })
  assert.equal(templated.templates.buyer_paid.outro.es.html, '<p>Plazo: <strong>2 semanas</strong>. <a href="https://shop.example.invalid/legal/">Condiciones</a></p>')
  assert.equal(templated.templates.buyer_paid.outro.es.text, 'Plazo: 2 semanas. Condiciones (https://shop.example.invalid/legal/)')
})

test('catalog build: absent keys leave the release untouched; configured keys are compiled', () => {
  const root = mkdtempSync(join(tmpdir(), 'invoice-catalog-'))
  try {
    mkdirSync(join(root, 'functions/api/commerce'), { recursive: true })
    writeFileSync(join(root, 'functions/api/commerce/x.js'), '')
    mkdirSync(join(root, 'data'), { recursive: true })
    mkdirSync(join(root, 'content/product'), { recursive: true })
    const base = 'enabled: true\norigin: https://shop.example.invalid\ncurrency: eur\nstock_mode: made_to_order\n'
    writeFileSync(join(root, 'data/commerce.yml'), base)
    const plain = buildCatalog(root)
    assert.equal(Object.hasOwn(plain, 'invoice') || Object.hasOwn(plain, 'notices'), false)
    writeFileSync(join(root, 'data/commerce.yml'), `${base}order_notices:\n  enabled: true\ninvoice:\n  enabled: true\n  seller:\n    name: Titular\n    tax_id: 00000000T\n    address: [Calle 1]\n  series:\n    prefix: WEB\n`)
    const configured = buildCatalog(root)
    assert.equal(configured.invoice.series.prefix, 'WEB')
    assert.equal(configured.notices.buyer, 'own')
    // Invoicing shops collect the company tax ID by default; delivery fields are opt-in.
    assert.equal(configured.taxIdCollection, true)
    assert.equal(Object.hasOwn(configured, 'checkoutFields'), false)
    writeFileSync(join(root, 'data/commerce.yml'), `${base}checkout_fields: [delivery_notes, recipient_phone]\ncheckout_tax_id: false\n`)
    const fields = buildCatalog(root)
    assert.deepEqual(fields.checkoutFields, ['delivery_notes', 'recipient_phone'])
    assert.equal(Object.hasOwn(fields, 'taxIdCollection'), false)
    for (const bad of ['checkout_fields: [email]', 'checkout_fields: [delivery_notes, delivery_notes]', 'checkout_tax_id: "yes"']) {
      writeFileSync(join(root, 'data/commerce.yml'), `${base}${bad}\n`)
      assert.throws(() => buildCatalog(root), /checkout_fields|checkout_tax_id/, bad)
    }
    assert.notEqual(configured.release, plain.release)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('invoice data: inclusive VAT breakdown, shipping line and number format', () => {
  const { sqlite, order } = fixture()
  return order(ORDER).then(row => {
    try {
      const data = buildInvoiceData({ order: row, details: row, config: INVOICE, issuedAt: PAID_AT })
      assert.equal(data.date, '2026-11-12')
      assert.equal(data.totalMinor, 2100)
      assert.equal(data.pricesIncludeTax, true)
      assert.equal(data.lines[0].description, 'Venta material 3D (Cuaderno ADN)')
      assert.equal(data.shipping.description, 'Envío')
      assert.deepEqual(data.taxes, [{ mode: 'inclusive', rateBps: 2100, baseMinor: 1736, taxMinor: 364 }])
      assert.equal(data.taxes[0].baseMinor + data.taxes[0].taxMinor, data.totalMinor)
      assert.deepEqual(data.customer.address, ['Calle Falsa 1', '2.º B', '28001 Ciudad', 'Provincia', 'España'])
      assert.equal(data.exemptNote, null)
      assert.equal(data.paymentText, 'Pagado con tarjeta')
      assert.equal(invoiceNumber({ series: 'WEB-2026', number: 7 }, data), 'WEB-2026-0007')
    } finally { sqlite.close() }
  })
})

test('invoice data: exempt destination prints the note; data problems raise InvoiceError', async () => {
  const exempt = fixture({ snapshot: snapshotFor(1, 'exempt') })
  try {
    const row = await exempt.order(ORDER)
    const data = buildInvoiceData({ order: row, details: row, config: INVOICE, issuedAt: PAID_AT })
    assert.deepEqual(data.taxes, [{ mode: 'exempt', rateBps: 0, baseMinor: 2100, taxMinor: 0 }])
    assert.match(data.exemptNote, /art\. 21 Ley 37\/1992/)
    const silent = buildInvoiceData({ order: row, details: row, config: { ...INVOICE, exemptNote: undefined, paymentText: null }, issuedAt: PAID_AT })
    assert.equal(silent.exemptNote, null)
    assert.equal(silent.paymentText, null)
    assert.throws(() => buildInvoiceData({ order: { ...row, snapshot_json: JSON.stringify({ items: [] }) }, details: row, config: INVOICE, issuedAt: PAID_AT }), error => error instanceof InvoiceError && error.code === 'invoice_totals_missing')
    assert.throws(() => buildInvoiceData({ order: { ...row, amount_total_minor: 1 }, details: row, config: INVOICE, issuedAt: PAID_AT }), error => error.code === 'invoice_total_mismatch')
  } finally { exempt.sqlite.close() }
})

test('numbering: gap-free, idempotent, per-year series, own start and immutable rows', async () => {
  const { sqlite, db, addOrder, order } = fixture()
  try {
    addOrder('33333333-3333-4333-8333-333333333333', 'b')
    addOrder('44444444-4444-4444-8444-444444444444', 'c')
    const config = { ...INVOICE, series: { ...INVOICE.series, start: 25 } }
    const issue = async (id, issuedAt = PAID_AT) => {
      const row = await order(id)
      return getOrIssueInvoice(db, { order: row, details: row, config, issuedAt })
    }
    const first = await issue(ORDER)
    assert.deepEqual([first.series, first.number], ['WEB-2026', 25])
    assert.equal((await issue(ORDER, PAID_AT + 99999)).number, 25)
    assert.equal(JSON.parse((await issue(ORDER)).data_json).date, '2026-11-12')
    assert.equal((await issue('33333333-3333-4333-8333-333333333333')).number, 26)
    // New year, new series from its own start; December 31 in Madrid vs. UTC.
    const newYear = await issue('44444444-4444-4444-8444-444444444444', Date.UTC(2026, 11, 31, 23, 30) / 1000)
    assert.deepEqual([newYear.series, newYear.number], ['WEB-2027', 25])
    assert.equal(localDate(Date.UTC(2026, 11, 31, 23, 30) / 1000, 'UTC'), '2026-12-31')
    // EU daylight saving boundaries (01:00 UTC on the last Sunday of March/October).
    const madrid = (y, m, d, h, min) => localDate(Date.UTC(y, m - 1, d, h, min) / 1000, 'Europe/Madrid')
    assert.equal(madrid(2026, 3, 28, 23, 30), '2026-03-29') // CET +1
    assert.equal(madrid(2026, 3, 29, 21, 59), '2026-03-29') // CEST +2 from 01:00 UTC
    assert.equal(madrid(2026, 3, 29, 22, 0), '2026-03-30')
    assert.equal(madrid(2026, 10, 24, 22, 0), '2026-10-25')
    assert.equal(madrid(2026, 10, 25, 22, 59), '2026-10-25') // CET again after 01:00 UTC
    assert.equal(madrid(2026, 10, 25, 23, 0), '2026-10-26')
    assert.equal(localDate(Date.UTC(2026, 6, 1, 2, 59) / 1000, 'America/Argentina/Buenos_Aires'), '2026-06-30')
    assert.throws(() => localDate(0, 'Mars/Base'), /unsupported_time_zone/)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM invoices').get().n, 3)
    assert.throws(() => sqlite.prepare('UPDATE invoices SET total_minor = 0').run(), /invoice_immutable/)
    assert.throws(() => sqlite.prepare('DELETE FROM invoices').run(), /invoice_immutable/)
    // Without a year the series is just the prefix.
    const flat = await issueInvoice(db, { orderId: ORDER, kind: 'credit_note', reference: 'r1', data: buildCreditNoteData(first, { ...config, series: { ...config.series, year: false } }, PAID_AT), config: { ...config, series: { ...config.series, year: false } }, issuedAt: PAID_AT })
    assert.deepEqual([flat.series, flat.number], ['RWEB', 25])
  } finally { sqlite.close() }
})

test('money formatting without Intl: grouping, signs, zero-decimal and other currencies', () => {
  assert.equal(formatMoney(6205, 'eur', 2), '62,05\u00a0€')
  assert.equal(formatMoney(123456, 'eur', 2), '1234,56\u00a0€')
  assert.equal(formatMoney(1234567, 'eur', 2), '12.345,67\u00a0€')
  assert.equal(formatMoney(5, 'eur', 2), '0,05\u00a0€')
  assert.equal(formatMoney(123456, 'eur', 2, 'en'), '€1,234.56')
  assert.equal(formatMoney(-1234567, 'usd', 2, 'en'), '-$12,345.67')
  assert.equal(formatMoney(1500, 'jpy', 0), '1500\u00a0JPY')
  assert.equal(formatMoney(1500, 'chf', 2, 'en'), '15.00\u00a0CHF')
})

test('invoice orders must be paid', async () => {
  const { sqlite, db, order } = fixture()
  try {
    sqlite.prepare("UPDATE orders SET payment_status = 'pending', fulfillment_status = 'awaiting_payment'").run()
    const row = await order(ORDER)
    await assert.rejects(getOrIssueInvoice(db, { order: row, details: row, config: INVOICE, issuedAt: PAID_AT }), error => error.code === 'invoice_order_not_paid')
  } finally { sqlite.close() }
})

test('credit note negates every amount, keeps the reference and renders as a PDF', async () => {
  const { sqlite, db, order } = fixture()
  try {
    const row = await order(ORDER)
    const invoice = await getOrIssueInvoice(db, { order: row, details: row, config: INVOICE, issuedAt: PAID_AT })
    const data = buildCreditNoteData(invoice, INVOICE, PAID_AT + 86400 * 3)
    assert.equal(data.totalMinor, -2100)
    assert.deepEqual(data.taxes, [{ mode: 'inclusive', rateBps: 2100, baseMinor: -1736, taxMinor: -364 }])
    assert.deepEqual(data.rectifies, { number: 'WEB-2026-0001', date: '2026-11-12' })
    const credit = await issueInvoice(db, { orderId: ORDER, kind: 'credit_note', reference: 'refund-1', data, config: INVOICE, issuedAt: PAID_AT + 86400 * 3 })
    assert.equal(invoiceNumber(credit), 'RWEB-2026-0001')
    const pdf = renderInvoicePdf(credit)
    assert.equal(new TextDecoder().decode(pdf.slice(0, 8)), '%PDF-1.4')
    assert.equal(formatMoney(-2100, 'eur', 2), '-21,00\u00a0€')
  } finally { sqlite.close() }
})

test('invoice PDF: A4, small, multi-page for long documents', async () => {
  const { sqlite, order } = fixture()
  try {
    const row = await order(ORDER)
    const data = buildInvoiceData({ order: row, details: row, config: INVOICE, issuedAt: PAID_AT })
    const stored = { kind: 'invoice', series: 'WEB-2026', number: 1, issued_at: PAID_AT, data_json: JSON.stringify(data) }
    const pdf = renderInvoicePdf(stored)
    assert.ok(pdf.length > 1500 && pdf.length < 10000, `size ${pdf.length}`)
    assert.match(new TextDecoder().decode(pdf), /\/Count 1 /)
    const many = { ...data, lines: Array.from({ length: 40 }, (_, index) => ({ ...data.lines[0], description: `Línea ${index} con una descripción larga para provocar el ajuste de texto en varias líneas dentro de la columna` })) }
    const long = renderInvoicePdf({ ...stored, data_json: JSON.stringify(many) })
    assert.match(new TextDecoder().decode(long), /\/Count [2-9] /)
  } finally { sqlite.close() }
})

test('notices: merchant gets buyer data and the invoice, buyer gets a confirmation with the same invoice', async () => {
  const { sqlite, env, catalog } = fixture()
  try {
    const { fetch, sent } = gmail()
    // One tick drains the merchant notice, then the buyer event it enqueued.
    const summary = await dispatchScheduledNotices(env, catalog, { fetch, now: () => 100 })
    assert.equal(summary.delivered, 2)
    const merchant = parse(sent[0])
    assert.match(merchant.headers, /^To: .*tienda@example\.invalid/m)
    assert.match(merchant.headers, /^Reply-To: comprador@example\.invalid/m)
    for (const expected of ['Persona Ficticia', 'comprador@example.invalid', '+34000000000', 'Calle Falsa 1', '28001 Ciudad', 'Factura PDF adjunta', 'Cuaderno ADN', '21,00']) assert.ok(merchant.text.includes(expected), expected)
    assert.ok(merchant.pdf && new TextDecoder().decode(merchant.pdf.slice(0, 5)) === '%PDF-')
    assert.match(sent[0], /filename="WEB-2026-0001\.pdf"/)

    // The buyer confirmation is a separate outbox event.
    assert.equal(sqlite.prepare("SELECT status FROM outbox WHERE event_type = 'buyer.confirmation'").get().status, 'delivered')
    assert.equal(sent.length, 2)
    const buyer = parse(sent[1])
    assert.match(buyer.headers, /^To: .*comprador@example\.invalid/m)
    assert.match(buyer.headers, /^Reply-To: tienda@example\.invalid/m)
    for (const expected of ['Hola Persona Ficticia', 'Cuaderno ADN', '21,00', 'Calle Falsa 1', 'Adjuntamos la factura']) assert.ok(buyer.text.includes(expected), expected)
    assert.ok(buyer.pdf)
    assert.ok(buyer.pdf.equals(merchant.pdf), 'same invoice, not a second number')
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM invoices').get().n, 1)

    // Nothing else is pending and a redelivery does not duplicate the event.
    assert.equal((await dispatchScheduledNotices(env, catalog, { fetch, now: () => 300 })).attempted, 0)
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM outbox WHERE event_type = 'buyer.confirmation'").get().n, 1)
  } finally { sqlite.close() }
})

test('notices: buyer confirmation without invoice, without address or switched off', async () => {
  for (const [notices, buyerEmail, expectMail] of [
    [{ ...NOTICES, buyerInvoice: 'never' }, 'comprador@example.invalid', 'plain'],
    [NOTICES, '', 'none'],
    [{ ...NOTICES, buyer: 'none', buyerInvoice: 'never' }, 'comprador@example.invalid', 'none']
  ]) {
    const { sqlite, env, catalog } = fixture({ notices, buyerEmail })
    try {
      const { fetch, sent } = gmail()
      for (let turn = 1; turn <= 3; turn++) await dispatchScheduledNotices(env, catalog, { fetch, now: () => turn * 100 })
      if (expectMail === 'none') {
        assert.equal(sent.length, 1, 'merchant only')
        assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM outbox WHERE status != 'delivered'").get().n, 0)
      } else {
        assert.equal(sent.length, 2)
        const buyer = parse(sent[1])
        assert.equal(buyer.pdf, null)
        assert.ok(!buyer.text.includes('Adjuntamos'))
      }
    } finally { sqlite.close() }
  }
})

test('notices: an order whose data cannot be invoiced still notifies, with the reason', async () => {
  const { sqlite, env, catalog } = fixture({ snapshot: { currency: 'eur', minorUnit: 2, subtotalMinor: 1500, totalMinor: 1500, items: [{ productId: PRODUCT, sku: 'TEST-001', name: 'Cuaderno', quantity: 1, unitAmountMinor: 1500, lineTotalMinor: 1500 }] } })
  try {
    const { fetch, sent } = gmail()
    assert.equal((await dispatchScheduledNotices(env, catalog, { fetch, now: () => 100 })).delivered, 2)
    const merchant = parse(sent[0])
    assert.equal(merchant.pdf, null)
    assert.equal(parse(sent[1]).pdf, null)
    assert.match(merchant.text, /Factura no generada \(invoice_totals_missing\)/)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM invoices').get().n, 0)
  } finally { sqlite.close() }
})

test('notices disabled: today\'s notice (no buyer data, no attachment, no extra event)', async () => {
  const { sqlite, env, catalog } = fixture({ notices: null, invoice: null })
  try {
    const { fetch, sent } = gmail()
    await dispatchScheduledNotices(env, catalog, { fetch, now: () => 100 })
    await dispatchScheduledNotices(env, catalog, { fetch, now: () => 200 })
    assert.equal(sent.length, 1)
    const merchant = parse(sent[0])
    assert.equal(merchant.pdf, null)
    for (const forbidden of ['comprador@example.invalid', 'Calle Falsa', '+34000000000']) assert.ok(!merchant.text.includes(forbidden), forbidden)
    assert.ok(merchant.text.includes('panel de Stripe'))
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM outbox').get().n, 1)
  } finally { sqlite.close() }
})

test('admin: invoice PDF endpoint issues once, needs the token and the configuration', async () => {
  const { sqlite, env, catalog } = fixture()
  try {
    const call = (path, options = {}, cat = catalog) => handleAdmin(new Request(`https://shop.example.invalid${path}`, { headers: { authorization: `Bearer ${'x'.repeat(40)}` }, ...options }), env, cat)
    const url = `/api/commerce/admin/orders/${ORDER}/invoice.pdf`
    assert.equal((await handleAdmin(new Request(`https://shop.example.invalid${url}`), env, catalog)).status, 401)
    const response = await call(url)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'application/pdf')
    assert.match(response.headers.get('content-disposition'), /WEB-2026-0001\.pdf/)
    assert.equal(new TextDecoder().decode((await response.arrayBuffer()).slice(0, 5)), '%PDF-')
    assert.ok((await (await call(url)).arrayBuffer()).byteLength > 0)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM invoices').get().n, 1)
    assert.equal((await call(url, {}, { ...catalog, invoice: undefined })).status, 404)
    assert.equal((await call('/api/commerce/admin/orders/99999999-9999-4999-8999-999999999999/invoice.pdf')).status, 404)
    assert.equal((await call(url, { method: 'DELETE' })).status, 405)
  } finally { sqlite.close() }
})
