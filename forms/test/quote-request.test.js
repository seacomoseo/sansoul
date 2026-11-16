// Cart quote request: a Worker form enriched with the commerce catalog
// (commerce/quote-request.js) before it is stored and delivered.
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'
import { createFormsWorker } from '../worker.js'
import { validateManifest } from '../manifest.js'
import { createQuoteRequestEnricher } from '../../commerce/quote-request.js'
import { ADMIN_TOKEN, createBindings, createFakeGoogle, credentials, decodeMime, manifest as baseManifest, submitRequest, withLength } from './helpers.js'

const HEART = '154d9a91-d7fe-46de-9301-5f217b98c14c'
const KIT = '1465c264-5305-4c02-b27a-16b7f580e427'
const catalog = {
  enabled: true,
  currency: 'eur',
  minorUnit: 2,
  checkout: {
    totalsPolicy: {
      destinations: {
        ES: { excludedPostalPrefixes: ['35', '38'], shipping: { amountMinor: 600, maxUnits: 1, maxWeightGrams: 2000 } }
      }
    }
  },
  products: [
    { id: HEART, sku: 'SHOP-0005', active: true, quote: false, priceMinor: 10500, weightGrams: 600, names: { es: 'Corazón <humano>' } },
    { id: KIT, sku: 'SHOP-0028', active: true, quote: false, priceMinor: 14500, weightGrams: 1300, names: { es: 'Kit ADN' } }
  ]
}
const quoteSpec = {
  id: 'form-presupuesto',
  lang: 'es',
  subject: 'Solicitud de presupuesto',
  title: 'Carrito',
  to: ['owner@example.test'],
  account: '',
  confirm: { enabled: true, fields: false, subject: 'Hemos recibido tu solicitud', introHtml: '<p>Gracias, [[Nombre]].</p>', noticeHtml: '<p>No respondas.</p>' },
  enrich: { type: 'commerce_quote', cart: 'Carrito' },
  fields: [
    { name: 'Nombre', type: 'text' },
    { name: 'Email', type: 'email' },
    { name: 'País', type: 'text' },
    { name: 'Código postal', type: 'text' },
    { name: 'Comentarios', type: 'area' },
    { name: 'Carrito', type: 'hidden' }
  ]
}
const manifest = {
  ...baseManifest,
  forms: { ...baseManifest.forms, '/es/carrito/#form-presupuesto': 'quote' },
  specs: { ...baseManifest.specs, quote: quoteSpec }
}
const options = { page: '/es/carrito/', form: 'form-presupuesto' }
const cart = (items, extra = {}) => JSON.stringify({ items, country: 'ES', postalCode: '35001', ...extra })
const fields = cartValue => [
  ['Nombre', 'Ana'],
  ['Email', 'ana@example.org'],
  ['País', 'España'],
  ['Código postal', '35001'],
  ['Comentarios', 'Para un colegio'],
  ['Carrito', cartValue]
]

let bindings
let google
let worker
let env
const now = () => 1_800_000_000_000

async function send (formFields, extra = {}) {
  const { id, request } = submitRequest(formFields, { ...options, ...extra })
  const response = await worker.fetch(await withLength(request), env, null)
  return { id, response, body: await response.json() }
}

before(async () => { bindings = await createBindings() })
after(async () => { await bindings.dispose() })
beforeEach(async () => {
  for (const table of ['forms_jobs', 'forms_submissions', 'forms_rate']) await bindings.db.prepare(`DELETE FROM ${table}`).run()
  google = createFakeGoogle()
  worker = createFormsWorker(manifest, { fetch: google.fetch, now, enrichers: { commerce_quote: createQuoteRequestEnricher(catalog) } })
  env = {
    FORMS_DB: bindings.db,
    FORMS_FILES: bindings.kv,
    FORMS_PROVIDER: 'gmail',
    FORMS_GMAIL_CREDENTIALS: JSON.stringify(credentials),
    FORMS_GMAIL_DEFAULT: 'main',
    FORMS_SENDER_NAME: 'Tienda',
    FORMS_ADMIN_TOKEN: ADMIN_TOKEN
  }
})

describe('cart quote request', () => {
  test('the manifest only accepts enrich on a hidden field of the form', () => {
    assert.doesNotThrow(() => validateManifest(manifest))
    const bad = structuredClone(manifest)
    bad.specs.quote.enrich.cart = 'Comentarios'
    assert.throws(() => validateManifest(bad), /forms_manifest_invalid_spec/)
  })

  test('stores catalog lines and reasons, notifies the owner and confirms the summary', async () => {
    const { id, response, body } = await send(fields(cart([{ id: HEART, quantity: 2, path: '/productos/corazon/' }, { id: KIT, quantity: 1 }])))
    assert.equal(response.status, 200)
    assert.equal(body.status, 'accepted')

    const row = await bindings.db.prepare('SELECT fields FROM forms_submissions WHERE id = ?').bind(id).first()
    const stored = new Map(JSON.parse(row.fields))
    assert.equal(stored.get('Carrito'), [
      '2 × Corazón <humano> (SHOP-0005) · 105,00 € = 210,00 €',
      '1 × Kit ADN (SHOP-0028) · 145,00 € = 145,00 €',
      'Subtotal de productos: 355,00 €',
      'Unidades: 3 · Peso total: 2,5 kg'
    ].join('\n'))
    assert.equal(stored.get('Motivo del presupuesto'), [
      'Código postal 35001 (ES) fuera de la tarifa de envío fija',
      '3 unidades (envío fijo hasta 1)',
      'Peso total 2,5 kg (envío fijo hasta 2 kg)'
    ].join('\n'))

    const owner = decodeMime(google.state.sent.find(mail => /^To: owner@/m.test(mail.mime)).mime)
    assert.match(owner.headers, /^Reply-To: ana@example\.org/m)
    const html = owner.parts.find(part => /text\/html/.test(part.head)).body.toString()
    assert.match(html, /<a href="https:\/\/example\.test\/productos\/corazon\/">Corazón &lt;humano&gt;<\/a>/)
    assert.match(html, /SHOP-0028/)
    assert.match(html, /Por qué necesita presupuesto/)
    // The lead replaces the raw cart rows; the visitor's own data stays in the table.
    assert.doesNotMatch(html, /<th[^>]*>Carrito<\/th>/)
    assert.match(html, /<th[^>]*>Comentarios<\/th>/)
    const text = owner.parts.find(part => /text\/plain/.test(part.head)).body.toString()
    assert.match(text, /^Carrito:\n- 2 × Corazón <humano> \(SHOP-0005\) · 105,00 € = 210,00 € · 1,2 kg\n {2}https:\/\/example\.test\/productos\/corazon\/\n/)

    const confirmation = decodeMime(google.state.sent.find(mail => /^To: ana@/m.test(mail.mime)).mime)
    const visitor = confirmation.parts.find(part => /text\/html/.test(part.head)).body.toString()
    assert.match(visitor, /<p>Gracias, Ana\.<\/p>/)
    assert.match(visitor, /Corazón &lt;humano&gt;/)
    assert.doesNotMatch(visitor, /SHOP-0005|Peso|Motivo|35001/)
  })

  test('retries return the same receipt although the stored fields are enriched', async () => {
    const id = crypto.randomUUID()
    const value = cart([{ id: HEART, quantity: 1 }], { postalCode: '30140' })
    const first = await send(fields(value), { id })
    const again = await send(fields(value), { id })
    assert.deepEqual(again.body, first.body)
    assert.equal(google.state.sent.length, 2)
    const row = await bindings.db.prepare('SELECT fields FROM forms_submissions WHERE id = ?').bind(id).first()
    assert.equal(new Map(JSON.parse(row.fields)).get('Motivo del presupuesto'), 'Ninguno según la tarifa: lo pide el cliente')
  })

  test('unknown destinations and products are explained, not rejected', async () => {
    const ghost = '00000000-0000-4000-8000-000000000001'
    const { id, body } = await send(fields(cart([{ id: ghost, quantity: 1 }, { id: HEART, quantity: 1 }], { country: null, postalCode: '' })))
    assert.equal(body.status, 'accepted')
    const stored = new Map(JSON.parse((await bindings.db.prepare('SELECT fields FROM forms_submissions WHERE id = ?').bind(id).first()).fields))
    assert.match(stored.get('Carrito'), /^1 × Producto no disponible · A consultar = A consultar\n/)
    assert.match(stored.get('Carrito'), /Subtotal de productos: 105,00 € \+ a consultar/)
    assert.equal(stored.get('Motivo del presupuesto'), `Producto que ya no está en el catálogo (${ghost})\nDestino sin tarifa de envío fija`)
  })

  test('a tampered cart is refused before anything is stored', async () => {
    for (const value of ['', 'nope', cart([]), cart([{ id: HEART, quantity: 11 }]), cart([{ id: HEART, quantity: 1, path: 'https://evil.test/' }]), cart([{ id: HEART, quantity: 1, price: 1 }])]) {
      const { response, body } = await send(fields(value))
      assert.equal(response.status, 400, value)
      assert.equal(body.error, 'invalid_cart')
    }
    assert.equal((await bindings.db.prepare('SELECT COUNT(*) AS n FROM forms_submissions').first()).n, 0)
  })

  test('without the commerce enricher the form fails closed', async () => {
    worker = createFormsWorker(manifest, { fetch: google.fetch, now })
    const { response, body } = await send(fields(cart([{ id: HEART, quantity: 1 }])))
    assert.equal(response.status, 503)
    assert.equal(body.error, 'forms_unavailable')
  })
})
