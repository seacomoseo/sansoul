import test from 'node:test'
import assert from 'node:assert/strict'
import { parse } from 'yaml'
import { CONFIG, run } from '../golden/scenario.js'
import { formatMoney } from '../../invoice.js'
import { normalizeCommerceRequest } from '../../quote.js'

const PRODUCT = '11111111-1111-4111-8111-111111111111'
const ORDER = '22222222-2222-4222-8222-222222222222'

// Decoded subject and readable parts of a sent MIME message.
export function decode (mime) {
  const header = (mime.match(/^Subject: (.*(?:\r\n[ \t].*)*)/m) || [])[1] || ''
  const subject = header.replace(/=\?UTF-8\?B\?([^?]*)\?=\s*/g, (match, b64) => Buffer.from(b64, 'base64').toString('utf8'))
  let body = ''
  for (const part of mime.split(/\r\n--[A-Za-z0-9-]+/)) {
    const [head, ...rest] = part.split(/\r\n\r\n/)
    const content = rest.join('').replace(/\r\n/g, '')
    if (/text\/(plain|html)/.test(head) && /^[A-Za-z0-9+/=]+$/.test(content)) body += Buffer.from(content, 'base64').toString('utf8') + '\n'
  }
  return {
    to: (mime.match(/^To: (.*)$/m) || [])[1],
    subject,
    body,
    pdf: /application\/pdf/.test(mime)
  }
}

test('checkout request: optional locale, unknown languages ignored, other keys rejected', () => {
  const base = { items: [{ id: PRODUCT, quantity: 1 }], destination: { country: 'ES', postalCode: '28001' }, quote: { policy_version: 'v1', total_minor: 100 } }
  assert.deepEqual(normalizeCommerceRequest(base, { withQuote: true }).options, {})
  assert.deepEqual(normalizeCommerceRequest({ ...base, locale: 'fr' }, { withQuote: true }).options, { locale: 'fr' })
  assert.deepEqual(normalizeCommerceRequest({ ...base, locale: 'zh' }, { withQuote: true }).options, {})
  assert.throws(() => normalizeCommerceRequest({ ...base, email: 'x@example.invalid' }, { withQuote: true }), /invalid_cart/)
  assert.throws(() => normalizeCommerceRequest({ items: base.items, destination: base.destination, locale: 'es' }, { withQuote: false }), /invalid_cart/)
})

test('money formatting: comma languages put the symbol after; fr groups with a narrow space', () => {
  assert.equal(formatMoney(123456, 'eur', 2, 'de'), '1.234,56 €')
  assert.equal(formatMoney(123456, 'eur', 2, 'fr'), '1 234,56 €')
  assert.equal(formatMoney(123456, 'eur', 2, 'es'), '1234,56 €')
  assert.equal(formatMoney(123456, 'eur', 2, 'en'), '€1,234.56')
})

test('buyer confirmation follows the purchase language; merchant notice stays in the project language', async () => {
  const config = parse(CONFIG)
  const sent = (await run({ config, orders: [{ id: ORDER, key: 'a', extra: { locale: 'de' } }] })).map(decode)
  assert.equal(sent.length, 2)
  assert.match(sent[0].subject, /^Nuevo pedido pagado/)
  assert.equal(sent[1].to, 'comprador@example.invalid')
  assert.match(sent[1].subject, /^Wir haben deine Bestellung erhalten/)
  assert.match(sent[1].body, /Lieferadresse/)
  assert.match(sent[1].body, /Spanien/)
  assert.match(sent[1].body, /36,00 €/)
})

function configWith (notices) {
  const config = parse(CONFIG)
  config.order_notices = { enabled: true, ...notices }
  return config
}

test('merchant: none sends no merchant mail but keeps the buyer confirmation; merchant_language en', async () => {
  const none = (await run({ config: configWith({ merchant: 'none', buyer_invoice: 'never' }), orders: [{ id: ORDER, key: 'a' }] })).map(decode)
  assert.deepEqual(none.map(mail => mail.to), ['comprador@example.invalid'])
  const english = (await run({ config: configWith({ merchant_language: 'en', buyer: 'none' }), orders: [{ id: ORDER, key: 'a' }] })).map(decode)
  assert.equal(english.length, 1)
  assert.match(english[0].subject, /^New paid order · /)
  assert.match(english[0].body, /Ship to: Persona Ficticia, Calle Falsa 1/)
  assert.match(english[0].body, /Invoice PDF attached\./)
  assert.equal(english[0].pdf, true)
})

test('buyer_invoice on_request: attached only when the buyer asked for it', async () => {
  const config = configWith({ buyer_invoice: 'on_request', merchant_invoice: false })
  const plain = (await run({ config, orders: [{ id: ORDER, key: 'a' }] })).map(decode)
  assert.deepEqual(plain.map(mail => [mail.to, mail.pdf]), [['tienda@example.invalid', false], ['comprador@example.invalid', false]])
  const asked = (await run({ config, orders: [{ id: ORDER, key: 'a', extra: { invoiceRequested: true } }] })).map(decode)
  assert.deepEqual(asked.map(mail => [mail.to, mail.pdf]), [['tienda@example.invalid', false], ['comprador@example.invalid', true]])
  assert.match(asked[0].body, /Factura: La ha pedido/)
  assert.match(asked[1].body, /Adjuntamos la factura en PDF\./)
})

test('buyer: stripe sends no confirmation, only a separate invoice mail to who asked for it', async () => {
  const config = configWith({ buyer: 'stripe', buyer_invoice: 'on_request' })
  const plain = (await run({ config, orders: [{ id: ORDER, key: 'a' }] })).map(decode)
  assert.deepEqual(plain.map(mail => mail.to), ['tienda@example.invalid'])
  const asked = (await run({ config, orders: [{ id: ORDER, key: 'a', extra: { invoiceRequested: true, locale: 'en' } }] })).map(decode)
  assert.deepEqual(asked.map(mail => [mail.to, mail.pdf]), [['tienda@example.invalid', true], ['comprador@example.invalid', true]])
  assert.match(asked[1].subject, /^Your invoice · /)
  assert.match(asked[1].body, /The invoice for your order is attached as a PDF\./)
})

test('templates: per-language subject, intro and outro with escaped placeholders', async () => {
  const config = configWith({
    buyer_invoice: 'never',
    templates: {
      buyer_paid: {
        subject: { es: 'Pedido {order} recibido', en: 'Order {order} received' },
        intro: { es: 'Hola {name}, gracias.\n\nTotal: **{total}**', en: 'Hi {name}, thanks.' },
        outro: 'Plazo de fabricación: 2 semanas. [Condiciones](https://shop.example.invalid/legal/)'
      },
      merchant_paid: { subject: 'Pedido de {name}', intro: 'Prepara el pedido **ya**.' }
    }
  })
  const sent = (await run({ config, orders: [{ id: ORDER, key: 'a' }] })).map(decode)
  assert.equal(sent[0].subject, 'Pedido de Persona Ficticia')
  assert.match(sent[0].body, /Prepara el pedido <strong>ya<\/strong>\./)
  assert.equal(sent[1].subject, `Pedido ${ORDER} recibido`)
  assert.match(sent[1].body, /<p>Hola Persona Ficticia, gracias\.<\/p><p>Total: <strong>36,00 €<\/strong><\/p>/)
  assert.match(sent[1].body, /Plazo de fabricación: 2 semanas\. Condiciones \(https:\/\/shop\.example\.invalid\/legal\/\)/)
  assert.match(sent[1].body, /<a href="https:\/\/shop\.example\.invalid\/legal\/" rel="noopener noreferrer">Condiciones<\/a>/)
  assert.doesNotMatch(sent[1].body, /Si necesitas algo/)
  const english = (await run({ config, orders: [{ id: ORDER, key: 'a', extra: { locale: 'en' } }] })).map(decode)
  assert.equal(english[1].subject, `Order ${ORDER} received`)
  // No English outro: the one-for-all text applies.
  assert.match(english[1].body, /Plazo de fabricación/)
})

test('company buyer: merchant notice and invoice carry the company name and tax ID; delivery extras shown', async () => {
  const config = configWith({ buyer_invoice: 'on_request' })
  const sent = await run({ config, orders: [{ id: ORDER, key: 'a' }], update: sqlite => sqlite.prepare("UPDATE order_delivery_details SET buyer_business_name = 'Empresa Ficticia SL', buyer_tax_id = 'B00000000', buyer_tax_id_type = 'es_cif', recipient_phone = '+34 600 000 000', delivery_notes = 'Portal verde'").run() })
  const [merchant, buyer] = sent.map(decode)
  assert.match(merchant.body, /Razón social: Empresa Ficticia SL/)
  assert.match(merchant.body, /NIF: B00000000/)
  assert.match(merchant.body, /Teléfono de entrega: \+34 600 000 000/)
  assert.match(merchant.body, /Indicaciones: Portal verde/)
  // A company always receives the invoice under on_request.
  assert.equal(buyer.pdf, true)
  assert.match(buyer.body, /Indicaciones: Portal verde/)
  const pdf = Buffer.from(sent[1].split('application/pdf')[1].split('\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g, ''), 'base64').toString('latin1')
  assert.match(pdf, /Empresa Ficticia SL/)
  assert.match(pdf, /NIF: B00000000/)
})
