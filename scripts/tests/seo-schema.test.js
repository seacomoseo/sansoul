import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

test('real Hugo preserves inventory facts, review averages, image facts and accessible controls', async t => {
  if (spawnSync('hugo', ['version']).status !== 0) return t.skip('Hugo unavailable')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-seo-schema-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  for (const dir of ['content/inherited', 'data', 'assets/u', 'layouts']) await fs.mkdir(path.join(root, dir), { recursive: true })
  await fs.cp(path.join(engine, 'layouts/partials'), path.join(root, 'layouts/partials'), { recursive: true })
  const stubs = {
    icon: '{{ return "" }}',
    'func/logo': '{{ return "/u/pixel.png" }}',
    'head-loader': '',
    'files/font-preloads': '',
    styles: '{{ return (resources.FromString "fixture.css" "body{}") }}',
    'schema/_': '{{ return "{}" }}'
  }
  for (const [name, content] of Object.entries(stubs)) await fs.writeFile(path.join(root, 'layouts/partials', name + '.html'), content)
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\ntitle: Fixture\nparams:\n  ga4: G-FIXTURE\n')
  await fs.writeFile(path.join(root, 'data/config.yml'), 'cookies_legal: true\n')
  await fs.writeFile(path.join(root, 'data/styles.yml'), 'colors:\n  main:\n    color: "#000000"\n')
  await fs.writeFile(path.join(root, 'assets/u/pixel.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=', 'base64'))
  await fs.writeFile(path.join(root, 'assets/u/icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"/>')
  const cases = {
    positive: 'stock: 12\nimg: /u/pixel.png',
    zero: 'stock: 0',
    no: 'stock: false',
    yes: 'stock: true',
    absent: '',
    remote: 'img: https://images.example/photo.jpg',
    svg: 'img: /u/icon.svg',
    array: 'imgs: [/u/pixel.png]'
  }
  for (const [key, body] of Object.entries(cases)) await fs.writeFile(path.join(root, 'content', key + '.md'), `---\ntitle: ${key}\n${body}\n---\n`)
  await fs.writeFile(path.join(root, 'content/inherited/_index.md'), '---\ntitle: Inherited\ncascade:\n  stock: 7\n---\n')
  await fs.writeFile(path.join(root, 'content/inherited/item.md'), '---\ntitle: inherited\n---\n')
  await fs.writeFile(path.join(root, 'layouts/index.html'), `{{ $results := dict }}{{ range site.RegularPages }}{{ $results = merge $results (dict .Title (dict "product" (partial "schema/product" .) "image" (partial "schema/img-main" .))) }}{{ end }}
<script id="results" type="application/json">{{ $results | jsonify | safeJS }}</script>
{{ partial "schema/review" (dict "reviews" (slice (dict "title" "A" "rating" 4 "date" "2025-01-01") (dict "title" "B" "rating" 5))) | safeHTML }}
{{ partial "head" . }}
{{ partial "blocks/faq" (dict "faq" dict "faqs" (slice (dict "title" "Question" "md" "Answer")) "level" 2) }}
{{ partial "blocks/faq" (dict "faq" (dict "headers" true) "faqs" (slice (dict "title" "Other" "md" "Answer")) "level" 2) }}
{{ with site.GetPage "/positive" }}{{ partial "menu/_" (dict "menu" (dict "items" (slice (dict "url" "/" "label" "Home"))) "Page" .) }}{{ end }}`)
  const built = spawnSync('hugo', ['--source', root, '--environment', 'production'], { encoding: 'utf8' })
  assert.equal(built.status, 0, built.stdout + built.stderr)
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  const results = JSON.parse(html.match(/<script id="results" type="application\/json">(.*?)<\/script>/s)[1])
  for (const key of ['positive', 'yes', 'inherited']) assert.equal(results[key].product.offers.availability, 'https://schema.org/InStock', key)
  for (const key of ['zero', 'no']) assert.equal(results[key].product.offers.availability, 'https://schema.org/OutOfStock', key)
  assert.equal(results.absent.product.offers.availability, undefined)
  for (const key of ['positive', 'array', 'absent']) {
    assert.equal(results[key].image.url, 'https://fixture.example/u/pixel.png')
    assert.equal(results[key].image.contentUrl, results[key].image.url)
    assert.equal(results[key].image.width, 1)
    assert.equal(results[key].image.height, 1)
  }
  for (const key of ['remote', 'svg']) {
    assert.ok(results[key].image.url)
    assert.equal(results[key].image.width, undefined)
    assert.equal(results[key].image.height, undefined)
  }
  const review = JSON.parse(html.match(/\{"@context":"http:\/\/schema.org","@graph":\[\{"@type":"Review".*?\}\]\}/s)[0])
  assert.equal(review['@graph'][2].ratingValue, 4.5)
  assert.equal(review['@graph'][0].datePublished, '2025-01-01T00:00:00Z')
  assert.equal(review['@graph'][0].reviewRating.datePublished, undefined)
  assert.match(html, /<meta property="og:title" content="[^"]+">/)
  const consent = html.match(/const isCk = (.+)/)[1]
  for (const [value, expected] of [[null, false], ['false', false], ['0', false], ['1', true], ['2', true], ['true', true]]) {
    assert.equal(vm.runInNewContext(consent, { localStorage: { getItem: () => value } }), expected, String(value))
  }
  const controls = [...html.matchAll(/aria-controls="(faq-[^"]+)"/g)].map(match => match[1])
  assert.equal(new Set(controls).size, 2)
  for (const id of controls) assert.match(html, new RegExp('id="' + id + '" class="faq__md md"'))
  assert.match(html, /aria-controls="menu" aria-expanded="false"/)
  assert.match(html, /<nav id="menu"[^>]*tabindex="-1"/)
  for (const match of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) assert.doesNotThrow(() => JSON.parse(match[1]))
})
