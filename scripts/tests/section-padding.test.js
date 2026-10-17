import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const project = path.resolve(engine, path.basename(engine) === 'core' ? '..' : '../..')
const hasHugo = spawnSync('hugo', ['version'], { encoding: 'utf8' }).status === 0
const paddingKeys = ['pt', 'pt_vl', 'pb', 'pb_vl']
const cases = [
  { id: 'both', pt: 2, pt_vl: 8, pb: 3, pb_vl: 1, expected: [2, 8, 3, 1] },
  { id: 'base-only', pt: 2, pb: 0, expected: [2, 2, 0, 0] },
  { id: 'large-only', pt_vl: 2, pb_vl: 0, expected: [2, 2, 0, 0] },
  { id: 'zero', pt: 0, pt_vl: 6, pb: 4, pb_vl: 0, expected: [0, 6, 4, 0] },
  { id: 'negative', pt: -2, pt_vl: -4, pb: -3, pb_vl: -1, expected: [-2, -4, -3, -1] },
  { id: 'null-base', pt: null, pt_vl: 7, pb: null, pb_vl: 0, expected: [7, 7, 0, 0] },
  { id: 'null-large', pt: 3, pt_vl: null, pb: 0, pb_vl: null, expected: [3, 3, 0, 0] },
  { id: 'independent-sides', pt: 2, pb_vl: 8, expected: [2, 2, 8, 8] },
  { id: 'defaults', expected: [5, 5, 5, 5], noInline: true },
  { id: 'all-null', pt: null, pt_vl: null, pb: null, pb_vl: null, expected: [5, 5, 5, 5], noInline: true },
  { id: 'hidden-padding', ph: true, pt: 2, pt_vl: 8, pb: 3, pb_vl: 1, expected: [0, 0, 0, 0], noInline: true },
  { id: 'modal', is_modal: true, modal_key: 0, pt: 2, pt_vl: 8, pb: 3, pb_vl: 1, expected: [0, 0, 0, 0], noInline: true },
  { id: 'footer', is_footer: true, expected: [3, 3, 5, 5], noInline: true },
  { id: 'footer-large', is_footer: true, pt_vl: 7, expected: [7, 7, 5, 5], inlineKeys: ['pt', 'pt_vl'] }
]

// Run real Hugo partials and Dart Sass in a separate consumer. The retained
// output is also a browser fixture: #results reports computed sizes at any width.
test('section padding resolves each endpoint independently, including zero and null', { skip: !hasHugo, timeout: 120000 }, t => {
  const retained = process.env.SANSOUL_PADDING_FIXTURE
  const fixture = retained ? path.resolve(retained) : fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-padding-'))
  const write = (name, value) => {
    const target = path.join(fixture, name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, value)
  }
  fs.mkdirSync(fixture, { recursive: true })
  try {
    for (const name of ['layouts/partials', 'assets/css', 'data']) {
      fs.cpSync(path.join(engine, name), path.join(fixture, name), { recursive: true })
    }
    write('hugo.yml', `baseURL: https://padding.example/
defaultContentLanguage: es
disableKinds: [taxonomy, term, RSS, sitemap]
build:
  noJSConfigInAssets: true
`)
    write('data/styles.yml', fs.readFileSync(path.join(engine, '_examples/data/styles.yml'), 'utf8'))
    write('data/config.yml', 'cms_lang: es\n')
    write('data/padding.json', JSON.stringify(cases))
    write('assets/styles.scss', `@use 'css/custom-properties';
@use 'css/base/section';
@use 'css/utilities/pd';
`)
    write('layouts/index.html', `{{ $css := partial "styles" . }}
{{ $records := slice }}
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Section padding regression fixture</title><link rel="stylesheet" href="{{ $css.RelPermalink }}">
<style>body{font:16px/1.4 sans-serif;margin:0}h1,#results{padding:16px}.fixture-case{outline:1px solid #777;background:#e8eef6}.fixture-label{margin:0;padding:4px;background:#fff;color:#111}.cms-fixture{padding:16px;border:1px solid #777}.cms-fixture .field{display:block;padding:4px}.cms-fixture .field label{display:block}</style>
</head><body><h1>Section padding regression fixture</h1><pre id="results">Measuring…</pre>
{{ range $i, $case := hugo.Data.padding }}
  {{ $input := merge $case (dict "section_key" $i "Page" $ "boxes" (slice (dict "title" "Child"))) }}
  {{ $expanded := index (partial "sections/merged-expand" (slice $input)) 0 }}
  {{ $record := dict "id" .id "attrs" (partial "sections/attr" $input | string) "expanded" dict "children" dict }}
  {{ range slice "pt" "pt_vl" "pb" "pb_vl" }}
    {{ $record = merge $record (dict "expanded" (dict . (index $expanded .)) "children" (dict . (index $expanded.children .))) }}
  {{ end }}
  {{ $records = $records | append $record }}
  <div class="fixture-case" data-case="{{ .id }}">
  {{ if .is_modal }}<dialog {{ partial "sections/attr" $input }}><p class="fixture-label">{{ .id }}</p></dialog>
  {{ else }}<section {{ partial "sections/attr" $input }}><p class="fixture-label">{{ .id }}</p></section>{{ end }}
  </div>
{{ end }}
<script id="padding-cases" type="application/json">{{ hugo.Data.padding | jsonify | safeJS }}</script>
<script src="/verify.js"></script></body></html>
{{ $recordsJSON := $records | jsonify | resources.FromString "records.json" }}{{ $recordsJSON.Publish }}
{{ $t := partial "func/i18n-cms" . }}
{{ $cms := dict "widgets" (partial "cms/config/boxes" $t) "sections" (partial "cms/config/collections/sections" $t) }}
{{ $cmsJSON := $cms | jsonify | resources.FromString "cms-padding.json" }}{{ $cmsJSON.Publish }}
`)
    write('static/verify.js', `const cases = JSON.parse(document.getElementById('padding-cases').textContent)
window.verifyPadding = () => {
  const root = getComputedStyle(document.documentElement)
  const vs = Number(root.getPropertyValue('--vs'))
  const vl = Number(root.getPropertyValue('--vl'))
  const vw = Number(root.getPropertyValue('--vw'))
  const progress = Math.max(0, Math.min(1, (vw - vs) / (vl - vs)))
  const failures = []
  const measurements = cases.filter(item => !item.is_modal).map(item => {
    const el = document.querySelector('[data-case="' + item.id + '"] > section')
    const css = getComputedStyle(el)
    const em = parseFloat(css.fontSize)
    const [pt, ptVl, pb, pbVl] = item.expected
    const top = (pt + (ptVl - pt) * progress) * em
    const bottom = (pb + (pbVl - pb) * progress) * em
    const expected = { paddingTop: Math.max(0, top), paddingBottom: Math.max(0, bottom), marginTop: Math.min(0, top), marginBottom: Math.min(0, bottom) }
    const actual = Object.fromEntries(Object.keys(expected).map(key => [key, parseFloat(css[key])]))
    for (const key of Object.keys(expected)) if (Math.abs(expected[key] - actual[key]) > 0.1) failures.push(item.id + ' ' + key + ': expected ' + expected[key] + ', got ' + actual[key])
    return { id: item.id, expected, actual }
  })
  const result = { width: innerWidth, vs, vl, vw, progress, failures, measurements }
  document.getElementById('results').textContent = JSON.stringify(result, null, 2)
  document.documentElement.dataset.paddingResult = failures.length ? 'failed' : 'passed'
  return result
}
window.verifyPadding()
window.addEventListener('resize', window.verifyPadding)
`)
    const result = spawnSync('hugo', ['--source', fixture, '--cacheDir', path.join(fixture, 'cache'), '--destination', path.join(fixture, 'public')], {
      encoding: 'utf8',
      timeout: 60000,
      env: { ...process.env, PATH: `${path.join(engine, 'scripts/bin')}:${path.join(project, 'node_modules/.bin')}:${process.env.PATH}` }
    })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    const records = JSON.parse(fs.readFileSync(path.join(fixture, 'public/records.json'), 'utf8'))
    assert.equal(records.length, cases.length)
    for (const input of cases) {
      const output = records.find(item => item.id === input.id)
      const actual = Object.fromEntries([...output.attrs.matchAll(/--(pt|pb)(-vl)?:([^;"\s]+)/g)].map(match => [match[1] + (match[2] ? '_vl' : ''), Number(match[3])]))
      const expected = Object.fromEntries((input.noInline ? [] : input.inlineKeys || paddingKeys).map(key => [key, input.expected[paddingKeys.indexOf(key)]]))
      assert.deepEqual(actual, expected, `${input.id}: actual HTML attributes preserve endpoint semantics`)
      if (input.ph) assert.match(output.attrs, /\bph\b/)
      if (input.is_modal) assert.match(output.attrs, /hidden="until-found"/)
      assert.ok(Object.values(output.children).every(value => value === null), `${input.id}: section padding does not leak into child boxes`)
      for (const key of paddingKeys) {
        assert.equal(output.expanded[key], input.is_modal ? null : input[key] ?? null, `${input.id}: merge expansion preserves ${key}`)
      }
    }
    const cms = JSON.parse(fs.readFileSync(path.join(fixture, 'public/cms-padding.json'), 'utf8'))
    const widgets = Object.assign({}, ...cms.widgets)
    const groups = Object.assign({}, ...cms.sections)
    assert.ok(!widgets['&pt_vs'] && !widgets['&pb_vs'], 'CMS retains only the base and large padding API')
    for (const key of paddingKeys) {
      const field = widgets['&' + key]
      assert.equal(field.name, key)
      assert.equal(field.widget, 'number')
      assert.equal(field.value_type, 'float')
      assert.equal(field.required, false, `${key} supports inheritance through an empty value`)
      assert.equal(field.min, -20)
      assert.equal(field.max, 20)
      assert.ok(field.label && field.hint, `${key} has a localized label and explanation`)
      for (const group of ['&section_fields', '&sections_fields', '&sections_fields_params']) assert.ok(groups[group].some(field => field['<<'] === '~' + key && field._sansoul_group?.name === 'paddings'), `${group} exposes ${key} in the visual padding group`)
    }
    const html = fs.readFileSync(path.join(fixture, 'public/index.html'), 'utf8')
    const cssURL = html.match(/href="([^\"]+\.css)"/)[1]
    const css = fs.readFileSync(path.join(fixture, 'public', cssURL), 'utf8')
    assert.ok(css.includes('--pt-size:') && css.includes('--pb-size:'), 'real SCSS compiles both responsive lengths')
    assert.doesNotMatch(css, /data-key-path/, 'padding styles do not depend on CMS markup')
    if (retained) t.diagnostic(`Browser fixture: ${path.join(fixture, 'public/index.html')}`)
  } finally {
    if (!retained) fs.rmSync(fixture, { recursive: true, force: true })
  }
})
