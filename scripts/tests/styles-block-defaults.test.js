import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { migrateProject } from '../migrations/14.19.0-styles-form.js'

async function fixture (t, styles, page) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-style-blocks-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'layouts'), { recursive: true })
  await fs.mkdir(path.join(root, 'data'))
  await fs.cp(new URL('../../layouts/partials', import.meta.url), path.join(root, 'layouts/partials'), { recursive: true })
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\n')
  await fs.mkdir(path.join(root, 'content'))
  await fs.writeFile(path.join(root, 'content/_index.md'), '---\nprovince: murcia\nzone: costa\n---\n')
  await fs.writeFile(path.join(root, 'data/styles.yml'), styles)
  await fs.writeFile(path.join(root, 'layouts/index.html'), page)
  const built = spawnSync('hugo', ['--source', root], { encoding: 'utf8' })
  assert.equal(built.status, 0, built.stderr)
  return fs.readFile(path.join(root, 'public/index.html'), 'utf8')
}

test('styles.yml block defaults apply only to boxes with that block and box values win', async t => {
  const html = await fixture(t, 'faq:\n  headers: true\n  btn: cta\nform:\n  labels: out\n', `
    {{- $faq := partial "func/block-defaults" (dict "faqs" (slice (dict "title" "Q"))) -}}
    {{- $own := partial "func/block-defaults" (dict "faqs" (slice 1) "faq" (dict "headers" false)) -}}
    {{- $none := partial "func/block-defaults" (dict "title" "No blocks") -}}
    {{- $form := partial "func/block-defaults" (dict "inputs" (slice 1)) -}}
    <p id="faq">{{ $faq.faq.headers }}|{{ $faq.faq.btn }}</p>
    <p id="own">{{ $own.faq.headers }}|{{ $own.faq.btn }}</p>
    <p id="none">{{ $none.faq }}</p>
    <p id="form">{{ $form.form.labels }}</p>`)
  assert.match(html, /<p id="faq">true\|cta<\/p>/)
  assert.match(html, /<p id="own">false\|cta<\/p>/)
  assert.match(html, /<p id="none"><\/p>/)
  assert.match(html, /<p id="form">out<\/p>/)
})

test('legacy styles inputs still feed form defaults, with form winning', async t => {
  const html = await fixture(t, 'inputs:\n  labels: both\n  fill: true\nform:\n  labels: out\n', `
    {{- $form := partial "func/style-block" "form" -}}
    <p id="form">{{ $form.labels }}|{{ $form.fill }}</p>`)
  assert.match(html, /<p id="form">out\|true<\/p>/)
})

test('if supports equality, negation and a working and', async t => {
  const html = await fixture(t, '', `
    {{- range slice "province=murcia" "province=alicante" "not province=alicante" "and province=murcia zone=costa" "and province=murcia zone=x" "or province=x zone=costa" "and province=murcia !zone=x" "and province=murcia !zone" "missing=" -}}
      <p>{{ . }}:{{ partial "func/if" (dict "Page" $ "if" .) }}</p>
    {{- end -}}`)
  const results = Object.fromEntries([...html.matchAll(/<p>([^<]*):(true|false)<\/p>/g)].map(match => [match[1], match[2]]))
  assert.deepEqual(results, {
    'province=murcia': 'true',
    'province=alicante': 'false',
    'not province=alicante': 'true',
    'and province=murcia zone=costa': 'true',
    'and province=murcia zone=x': 'false',
    'or province=x zone=costa': 'true',
    'and province=murcia !zone=x': 'true',
    'and province=murcia !zone': 'false',
    'missing=': 'false'
  })
})

test('14.19.0 migration renames inputs to form and keeps comments', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-styles-form-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'data'))
  const file = path.join(root, 'data/styles.yml')
  await fs.writeFile(file, 'colors:\n  main: red\ninputs:\n  # pinned\n  action: https://x/exec # own\nshadow:\n  left: 0.1\n')
  assert.equal(migrateProject(root, { check: true }).changed, true)
  assert.match(await fs.readFile(file, 'utf8'), /^inputs:/m)
  assert.equal(migrateProject(root).changed, true)
  assert.equal(await fs.readFile(file, 'utf8'), 'colors:\n  main: red\nshadow:\n  left: 0.1\nform:\n  # pinned\n  action: https://x/exec # own\n')
  assert.equal(migrateProject(root).changed, false)
  await fs.writeFile(file, 'form:\n  labels: out\ninputs:\n  labels: in\n  fill: true\n')
  migrateProject(root)
  assert.equal(await fs.readFile(file, 'utf8'), 'form:\n  labels: out\n  fill: true\n')
})

test('styles.yml box defaults keep only the allowed keys and fill unset box values', async t => {
  const html = await fixture(t, 'box:\n  md_align: left\n  btn: cta\n  title: Not allowed\n  color: dark\n', `
    {{- $box := partialCached "func/style-box" "box" "box" -}}
    <p id="box">{{ $box.md_align }}|{{ $box.btn }}|{{ $box.title }}|{{ $box.color }}</p>`)
  assert.match(html, /<p id="box">left\|cta\|\|<\/p>/)
})
