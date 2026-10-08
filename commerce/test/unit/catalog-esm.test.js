import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildCatalog } from '../../scripts/build-catalog.js'

test('generated ESM preserves exact catalog values and release with escaped author strings', async () => {
  const root = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'catalog-esm-'))
  try {
    for (const path of ['functions/api/commerce', 'themes/sansoul', 'content/product', 'data']) mkdirSync(join(root, path), { recursive: true })
    writeFileSync(join(root, 'package.json'), '{"type":"module"}')
    writeFileSync(join(root, 'themes/sansoul/package.json'), '{"version":"7.1.0"}')
    writeFileSync(join(root, 'functions/api/commerce/checkout.js'), '')
    writeFileSync(join(root, 'data/commerce.yml'), 'enabled: true\norigin: https://fixture.invalid\ncurrency: eur\nstock_mode: made_to_order\n')
    const titles = ["Author's \\ path\nnext\tline 😀 café 中文 \u2028 \u2029 \u0000", '"quoted" `backtick` $' + '{notExecutable}']
    for (const [index, title] of titles.entries()) {
      writeFileSync(join(root, `content/product/fixture-${index}.es-es.md`), `---\ntitle: ${JSON.stringify(title)}\ncommerce_id: 11111111-1111-4111-8111-11111111111${index}\nsku: TEST-00${index}\ncommerce_active: true\ncommerce_quote: ${index === 1}\nprice: 10.50\n---\n`)
    }
    const expected = buildCatalog(root)
    const path = join(root, 'functions/_commerce/catalog.generated.js')
    const first = readFileSync(path, 'utf8')
    const { catalog } = await import(pathToFileURL(path).href)
    assert.deepEqual(catalog, JSON.parse(JSON.stringify(expected)))
    assert.equal(catalog.release, expected.release)
    assert.deepEqual(catalog.products.map(p => p.names['es-es']), titles)
    assert.equal(catalog.products[0].priceMinor, 1050)
    assert.equal(catalog.products[1].priceMinor, null)
    assert.equal(catalog.checkout.approved, false)
    assert.deepEqual(catalog.checkout.destinationCountries, [])
    assert.match(first, /^export const catalog = JSON\.parse\('/)
    buildCatalog(root)
    assert.equal(readFileSync(path, 'utf8'), first)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
