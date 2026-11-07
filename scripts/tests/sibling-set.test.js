import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const literal = value => `${JSON.stringify(JSON.stringify(value))} | transform.Unmarshal`

async function fixture (t) {
  if (spawnSync('hugo', ['version']).status !== 0) {
    t.skip('Hugo unavailable')
    return null
  }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-sibling-set-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'layouts'), { recursive: true })
  await fs.mkdir(path.join(root, 'content'), { recursive: true })
  await fs.cp(path.join(engine, 'layouts/partials'), path.join(root, 'layouts/partials'), { recursive: true })
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\n')
  await fs.writeFile(path.join(root, 'content/demo.md'), '---\ntitle: Demo\ncustom: fetched-anchor\n---\n')
  return {
    root,
    async build (layout) {
      await fs.writeFile(path.join(root, 'layouts/index.html'), layout)
      return spawnSync(process.env.SANSOUL_TEST_HUGO || 'hugo', ['--source', root], { encoding: 'utf8' })
    },
    async output () { return fs.readFile(path.join(root, 'public/index.html'), 'utf8') }
  }
}

test('set resolves scalar siblings, chains, nested scopes and arrays without executing arbitrary templates', async t => {
  const f = await fixture(t)
  if (!f) return
  const input = {
    custom: 'section-a', url: '#{{ set custom }}', chain: '{{ set custom }}-{{ set zero }}', zero: 0,
    enabled: false, text: '{{set enabled}} / {{ set chain }} / {{ set custom }}',
    literal: '{{ getenv "SECRET" }}',
    nested: { custom: 'inner', url: '#{{ set custom }}' },
    rows: [[{ custom: 'cell', url: '#{{ set custom }}' }]],
    items: [{ custom: 'first', url: '#{{ set custom }}' }, { custom: 'second', url: '#{{ set custom }}' }]
  }
  const built = await f.build(`{{ partial "func/set" (dict "value" (${literal(input)})) | jsonify | safeHTML }}`)
  assert.equal(built.status, 0, built.stdout + built.stderr)
  const output = JSON.parse(await f.output())
  assert.equal(output.url, '#section-a')
  assert.equal(output.text, 'false / section-a-0 / section-a')
  assert.equal(output.enabled, false)
  assert.equal(output.zero, 0)
  assert.equal(output.literal, '{{ getenv "SECRET" }}')
  assert.equal(output.nested.url, '#inner')
  assert.equal(output.rows[0][0].url, '#cell')
  assert.deepEqual(output.items.map(item => item.url), ['#first', '#second'])
})

test('set rejects missing, non-scalar, cyclic, invalid and excessive references with actionable errors', async t => {
  const f = await fixture(t)
  if (!f) return
  const chain = Object.fromEntries(Array.from({ length: 34 }, (_, i) => [`k${i}`, i === 33 ? 'end' : `{{ set k${i + 1} }}`]))
  const dense = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, i >= 18 ? 'end' : `{{ set k${i + 1} }}{{ set k${i + 2} }}`]))
  const deep = Array.from({ length: 66 }).reduce(value => ({ child: value }), { value: 'end' })
  const cases = [
    [{ url: '#{{ set missing }}' }, /missing sibling "missing" at fixture.url/],
    [{ custom: null, url: '{{ set custom }}' }, /must be a non-null scalar/],
    [{ custom: { key: 'value' }, url: '{{ set custom }}' }, /must be a non-null scalar/],
    [{ custom: ['value'], url: '{{ set custom }}' }, /must be a non-null scalar/],
    [{ a: '{{ set b }}', b: '{{ set a }}' }, /cyclic sibling reference/],
    [{ url: '{{ set custom.key }}' }, /invalid expression/],
    [chain, /dependency chain exceeds 32 keys/],
    [dense, /interpolation exceeds 1024 references/],
    [{ custom: 'a', text: '{{ set custom }}'.repeat(129) }, /more than 128 expressions/],
    [deep, /nesting exceeds 64 levels/]
  ]
  for (const [input, message] of cases) {
    const built = await f.build(`{{ partial "func/set" (dict "value" (${literal(input)}) "path" "fixture") | jsonify }}`)
    assert.notEqual(built.status, 0, JSON.stringify(input))
    assert.match(built.stdout + built.stderr, message)
  }
})

test('set follows get/remap and defers nested composition until its effective defaults merge', async t => {
  const f = await fixture(t)
  if (!f) return
  const source = { get: [{ from: 'custom', to: 'temporary' }], remap: [{ from: 'temporary', to: 'custom' }], url: '#{{ set custom }}' }
  const layout = `{{ $page := site.GetPage "/demo" }}
{{ $expanded := partial "func/get-params-merge" (dict "Page" $page "item" (${literal(source)})) }}
<script id="get">{{ partial "func/set" (dict "value" $expanded) | jsonify | safeJS }}</script>
{{ $defaults := dict "url" "#{{ set custom }}" }}
{{ $container := dict "col_vl" 1.0 "col_vs" 1.0 "box" $defaults "boxes" (slice (dict "custom" "from-first-box") (dict "custom" "from-second-box")) }}
{{ $early := partial "func/set" (dict "value" $container "composed" true) }}
{{ $boxes := partial "boxes/merge-expand-items" $early }}
<script id="boxes">{{ $boxes.boxes | jsonify | safeJS }}</script>
{{ $links := dict "link" $defaults "links" (slice (dict "custom" "from-first-link" "label" "One") (dict "custom" "from-second-link" "label" "Two")) }}
{{ partial "blocks/links" (partial "func/set" (dict "value" $links "composed" true)) }}
<script id="deferred">{{ partial "func/set" (dict "value" (dict "child" (${literal(source)}))) | jsonify | safeJS }}</script>`
  await fs.writeFile(path.join(f.root, 'layouts/partials/link.html'), '<a href="{{ .url }}">{{ .label }}</a>')
  const built = await f.build(layout)
  assert.equal(built.status, 0, built.stdout + built.stderr)
  const output = await f.output()
  const parsed = id => JSON.parse(output.match(new RegExp(`<script id="${id}">(.*?)</script>`, 's'))[1])
  assert.equal(parsed('get').url, '#fetched-anchor')
  assert.deepEqual(parsed('boxes').map(box => box.url), ['#from-first-box', '#from-second-box'])
  assert.match(output, /href="#from-first-link"/)
  assert.match(output, /href="#from-second-link"/)
  assert.equal(parsed('deferred').child.url, '#{{ set custom }}')
})

test('section shortcode expansion leaves set expressions for the data phase', async t => {
  const f = await fixture(t)
  if (!f) return
  const input = [{ custom: 'target', url: '#{{ set custom }}', compact: '{{set custom}}' }]
  const built = await f.build(`{{ $page := site.GetPage "/demo" }}{{ partial "sections/merged-shortcodes" (dict "items" (${literal(input)}) "Page" $page) | jsonify | safeHTML }}`)
  assert.equal(built.status, 0, built.stdout + built.stderr)
  assert.deepEqual(JSON.parse(await f.output()), input)
})

test('FAQ and review structured data uses the same effective interpolated content as rendered HTML', async t => {
  const f = await fixture(t)
  if (!f) return
  await fs.writeFile(path.join(f.root, 'layouts/partials/icon.html'), '{{ return "" }}')
  const faq = { level: 2, faq: { title: '{{ set question }}', md: '**{{ set answer }}**', open: true }, faqs: [{ question: 'Visible question', answer: 'Visible answer' }] }
  const review = { level: 2, review: { title: '{{ set person }}', md: '**{{ set quote }}**', rating: 4 }, reviews: [{ person: 'Visible reviewer', quote: 'Visible testimonial' }] }
  const built = await f.build(`{{ partial "blocks/faq" (${literal(faq)}) }}{{ partial "blocks/reviews" (${literal(review)}) }}`)
  assert.equal(built.status, 0, built.stdout + built.stderr)
  const output = await f.output()
  assert.match(output, /<b>Visible question<\/b>/)
  assert.match(output, /<strong>Visible answer<\/strong>/)
  assert.match(output, /<p[^>]*>Visible reviewer<\/p>/)
  assert.match(output, /<strong>Visible testimonial<\/strong>/)
  const [faqSchema, reviewSchema] = [...output.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(match => JSON.parse(match[1]))
  assert.equal(faqSchema.mainEntity[0].name, 'Visible question')
  assert.equal(faqSchema.mainEntity[0].acceptedAnswer.text, 'Visible answer')
  const schemaReview = reviewSchema['@graph'].find(item => item['@type'] === 'Review')
  assert.equal(schemaReview.author.name, 'Visible reviewer')
  assert.equal(schemaReview.reviewBody, 'Visible testimonial')
  assert.equal(schemaReview.reviewRating.ratingValue, 4)
  assert.doesNotMatch(output, /\{\{\s*set\b/)
})

test('set bounds repeated-token expansion before allocation and allows normal repeated references', async t => {
  const f = await fixture(t)
  if (!f) return
  const doubling = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, i === 19 ? 'x' : `{{ set k${i + 1} }}{{ set k${i + 1} }}`]))
  const built = await f.build(`{{ partial "func/set" (dict "value" (${literal(doubling)}) "path" "doubling") | jsonify }}`)
  assert.notEqual(built.status, 0)
  assert.match(built.stdout + built.stderr, /interpolated value would exceed 65536 bytes at doubling/)

  const ordinary = { custom: 'visible', text: '{{ set custom }}'.repeat(64) }
  const repeated = await f.build(`{{ partial "func/set" (dict "value" (${literal(ordinary)})) | jsonify | safeHTML }}`)
  assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr)
  assert.equal(JSON.parse(await f.output()).text, 'visible'.repeat(64))

  const unicode = { custom: '😀'.repeat(20000), text: '{{ set custom }}' }
  const multibyte = await f.build(`{{ partial "func/set" (dict "value" (${literal(unicode)})) | jsonify }}`)
  assert.notEqual(multibyte.status, 0)
  assert.match(multibyte.stdout + multibyte.stderr, /interpolated value would exceed 65536 bytes/)
})

test('set shares the cumulative allocation budget across distinct values', async t => {
  const f = await fixture(t)
  if (!f) return
  const input = { custom: 'x'.repeat(65536), ...Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`value${i}`, '{{ set custom }}'])) }
  const boundary = await f.build(`{{ partial "func/set" (dict "value" (${literal(input)})) | jsonify | safeHTML }}`)
  assert.equal(boundary.status, 0, boundary.stdout + boundary.stderr)
  assert.equal(JSON.parse(await f.output()).value0.length, 65536)
  input.extra = '{{ set custom }}'
  const excessive = await f.build(`{{ partial "func/set" (dict "value" (${literal(input)})) | jsonify }}`)
  assert.notEqual(excessive.status, 0)
  assert.match(excessive.stdout + excessive.stderr, /interpolation exceeds 1048576 total output bytes/)
})
