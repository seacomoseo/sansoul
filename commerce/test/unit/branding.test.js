import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildCatalog } from '../../scripts/build-catalog.js'
import { encodeQr } from '../../qr.js'
import { parseColor, parsePathData, parseTransform, SvgError, svgToPdf } from '../../svg-pdf.js'
import { renderDocumentPdf } from '../../invoice.js'

// Reference matrix of «https://3dnau.com» (version 2-M, mask 3), checked module by
// module against the `qrcode` npm package with the same mask and decoded by zbar.
const REFERENCE = [
  '1111111010110101001111111',
  '1000001011010100101000001',
  '1011101000001000001011101',
  '1011101011000010001011101',
  '1011101001101011101011101',
  '1000001000010100001000001',
  '1111111010101010101111111',
  '0000000010000001100000000',
  '1011011100010101101001011',
  '1010000011001110100100010',
  '1100101100110100100100000',
  '1000010101001001100101100',
  '0110101001111011011110111',
  '0001110100011011111010001',
  '0101101000110100111010110',
  '1000100101110010100110001',
  '0011101010001011111111111',
  '0000000010100010100010101',
  '1111111010000110101010111',
  '1000001010110110100010000',
  '1011101000100110111111000',
  '1011101010100000011011111',
  '1011101010100011011010110',
  '1000001001111111000010100',
  '1111111010110000011111111'
]

test('QR: size by length, finder patterns, reference matrix and limit', () => {
  assert.equal(encodeQr('a').length, 21)
  assert.equal(encodeQr('x'.repeat(100)).length, 41)
  assert.equal(encodeQr('z'.repeat(213)).length, 57)
  assert.throws(() => encodeQr('z'.repeat(214)), /qr_text_too_long/)
  const rows = encodeQr('https://3dnau.com').map(row => row.map(dark => dark ? 1 : 0).join(''))
  assert.deepEqual(rows, REFERENCE)
})

test('SVG: path commands, arcs, transforms and colors', () => {
  assert.deepEqual(parsePathData('M10 10h5v5H10z'), [['M', 10, 10], ['L', 15, 10], ['L', 15, 15], ['L', 10, 15], ['Z']])
  // Implicit lineto after moveto, compact numbers and a quadratic turned cubic.
  assert.deepEqual(parsePathData('m1 1 2 2.5.5.5q0 0 3 3'), [['M', 1, 1], ['L', 3, 3.5], ['L', 3.5, 4], ['C', 3.5, 4, 4.5, 5, 6.5, 7]])
  // A half circle is split in two quarter curves ending exactly at the endpoint; flags without separators.
  const arc = parsePathData('M0 0a1 1 0 012 0')
  assert.equal(arc.length, 3)
  assert.deepEqual(arc[2].slice(5), [2, 0])
  assert.ok(Math.abs(arc[1][5] - 1) < 1e-9 && Math.abs(arc[1][6] + 1) < 1e-9)
  assert.deepEqual(parseTransform('translate(10 20) scale(2)'), [2, 0, 0, 2, 10, 20])
  assert.deepEqual(parseColor('var(--such,#fff)'), [255, 255, 255])
  assert.deepEqual(parseColor('#333'), [51, 51, 51])
  assert.equal(parseColor('none'), null)
})

test('SVG: logo ops in viewBox units, unsupported content fails visibly', () => {
  const logo = svgToPdf('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="10 0 100 50"><title>Logo</title><g fill="#f00" transform="translate(5 0)"><rect x="10" y="0" width="20" height="10"/></g><path fill-rule="evenodd" d="M10 0h10v10z"/><circle cx="60" cy="25" r="5" fill="none" stroke="#00f" stroke-width="2"/></svg>')
  assert.equal(logo.width, 100)
  assert.equal(logo.height, 50)
  const lines = logo.ops.split('\n')
  assert.equal(lines.length, 3)
  assert.match(lines[0], /^1 0 0 rg 5 0 m 25 0 l 25 10 l 5 10 l h f$/)
  assert.match(lines[1], /^0 0 0 rg 0 0 m .* f\*$/)
  assert.match(lines[2], /^0 0 1 RG 2 w .* S$/)
  for (const bad of ['<svg viewBox="0 0 1 1"><text>x</text></svg>', '<svg viewBox="0 0 1 1"><path class="a" d="M0 0h1"/></svg>', '<svg viewBox="0 0 1 1"><path fill="url(#g)" d="M0 0h1"/></svg>', '<svg viewBox="0 0 1 1"><path opacity=".5" d="M0 0h1"/></svg>', '<svg viewBox="0 0 1 1"></svg>']) {
    assert.throws(() => svgToPdf(bad), SvgError, bad)
  }
})

test('branding: catalog compiles logo and QR, PDFs draw them, absent by default', () => {
  const root = mkdtempSync(join(tmpdir(), 'branding-catalog-'))
  try {
    mkdirSync(join(root, 'functions/api/commerce'), { recursive: true })
    writeFileSync(join(root, 'functions/api/commerce/x.js'), '')
    mkdirSync(join(root, 'data'), { recursive: true })
    mkdirSync(join(root, 'content/product'), { recursive: true })
    mkdirSync(join(root, 'uploads/base'), { recursive: true })
    writeFileSync(join(root, 'uploads/base/logo.svg'), '<svg viewBox="0 0 200 50"><path fill="#333" d="M0 0h200v50H0z"/></svg>')
    const base = 'enabled: true\norigin: https://shop.example.invalid\ncurrency: eur\nstock_mode: made_to_order\ninvoice:\n  enabled: true\n  seller:\n    name: Titular\n    tax_id: 00000000T\n    address: [Calle 1]\n'
    writeFileSync(join(root, 'data/commerce.yml'), base)
    const plain = buildCatalog(root).invoice
    assert.equal(Object.hasOwn(plain, 'logo') || Object.hasOwn(plain, 'qr'), false)
    writeFileSync(join(root, 'data/commerce.yml'), `${base}  logo: true\n  qr: true\n`)
    const invoice = buildCatalog(root).invoice
    assert.equal(invoice.logo.width, 200)
    assert.equal(invoice.qr.text, 'https://shop.example.invalid')
    assert.equal(invoice.qr.modules.length, 29)
    writeFileSync(join(root, 'data/commerce.yml'), `${base}  logo: uploads/base/missing.svg\n`)
    assert.throws(() => buildCatalog(root), /invoice_logo_not_found/)
    writeFileSync(join(root, 'data/commerce.yml'), `${base}  logo: ../logo.svg\n`)
    assert.throws(() => buildCatalog(root), /invalid_invoice_logo/)
    writeFileSync(join(root, 'data/commerce.yml'), `${base}  qr: http://insecure.example\n`)
    assert.throws(() => buildCatalog(root), /invalid_invoice_qr/)

    // Packed box sizes of a product (owner-only, quote notices).
    const product = size => `---\ntitle: Kit\nprice: 10\ncommerce_id: 11111111-1111-4111-8111-111111111111\nsku: SHOP-0001\ncommerce_active: true\ncommerce_dimensions_cm: ${size}\n---\n`
    writeFileSync(join(root, 'data/commerce.yml'), base)
    writeFileSync(join(root, 'content/product/kit.es.md'), product('"31 x 22 × 15,5"'))
    assert.deepEqual(buildCatalog(root).products[0].dimensionsCm, [31, 22, 15.5])
    writeFileSync(join(root, 'content/product/kit.es.md'), product('31 x 22'))
    assert.throws(() => buildCatalog(root), /invalid_commerce_dimensions_cm/)
    rmSync(join(root, 'content/product/kit.es.md'))

    const data = {
      language: 'es',
      currency: 'eur',
      minorUnit: 2,
      seller: { name: 'Titular', taxId: '00000000T', address: ['Calle 1'] },
      customer: { name: 'Cliente', address: [] },
      lines: [{ description: 'Producto', quantity: 1, unitMinor: 1000, totalMinor: 1000, netMinor: 826, taxMinor: 174, taxMode: 'inclusive', taxRateBps: 2100 }],
      shipping: null,
      taxes: [{ mode: 'inclusive', rateBps: 2100, baseMinor: 826, taxMinor: 174 }],
      totalMinor: 1000
    }
    const render = branding => new TextDecoder('latin1').decode(renderDocumentPdf({ data, title: 'FACTURA', number: 'F-1', headerLines: [], created: new Date(0), notes: [], branding }))
    const without = render(null)
    const branded = render(invoice)
    assert.doesNotMatch(without, / cm\n/)
    assert.equal(branded.match(/ cm\n/g).length, 2)
    assert.match(branded, /0\.2 0\.2 0\.2 rg 0 0 m 200 0 l/)
    assert.match(branded, /\(shop\.example\.invalid\) Tj/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
