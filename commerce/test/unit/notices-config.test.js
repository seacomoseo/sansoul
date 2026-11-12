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
  const subject = mime.match(/^Subject: =\?UTF-8\?B\?([^?]*)\?=/m)
  let body = ''
  for (const part of mime.split(/\r\n--[A-Za-z0-9-]+/)) {
    const [head, ...rest] = part.split(/\r\n\r\n/)
    const content = rest.join('').replace(/\r\n/g, '')
    if (/text\/(plain|html)/.test(head) && /^[A-Za-z0-9+/=]+$/.test(content)) body += Buffer.from(content, 'base64').toString('utf8') + '\n'
  }
  return {
    to: (mime.match(/^To: (.*)$/m) || [])[1],
    subject: subject ? Buffer.from(subject[1], 'base64').toString('utf8') : '',
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
