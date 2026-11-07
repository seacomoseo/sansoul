import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { migrateSource, migrateProject } from '../migrations/13.0.0-block-defaults.js'

const require = createRequire(import.meta.url)
const YAML = require('yaml')
const engine = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')

test('block migration is contextual, idempotent and preserves Markdown/body and aliases outside composition', () => {
  const input = '---\ntitle: Keep\norg:\n  when: [{days: Monday}]\ntpl:\n  sections:\n  - boxes:\n    - when: [{days: Monday, hours: "9-5"}] # hours\n      gss: public-id # public\n      gss_sheet: 0\n      get: [{from: org.when, to: when}]\n      remap: [{from: gss_sheet, to: when.0.hours}]\n---\nBody {{ set literal }}\n'
  const output = migrateSource(input, { YAML, markdown: true })
  const data = YAML.parse(output.split('---')[1])
  const box = data.tpl.sections[0].boxes[0]
  assert.deepEqual(box.gss, { id: 'public-id', sheet: 0 })
  assert.equal(box.whens[0].hours, '9-5')
  assert.equal(box.get[0].from, 'org.when')
  assert.equal(box.get[0].to, 'whens')
  assert.equal(box.remap[0].from, 'gss.sheet')
  assert.equal(box.remap[0].to, 'whens.0.hours')
  assert.equal(data.org.when[0].days, 'Monday')
  assert.match(output, /# public/)
  assert.ok(output.endsWith('---\nBody {{ set literal }}\n'))
  assert.equal(migrateSource(output, { YAML, markdown: true }), output)
})

test('new block defaults coexist and migration rejects collisions, aliases and invalid identifiers', () => {
  const current = 'tpl: {sections: [{boxes: [{when: {mt: 0}, whens: [{days: Monday}], gss: {id: pub, sheet: 0}}]}]}\n'
  assert.equal(migrateSource(current, { YAML }), current)
  for (const body of ['when: [], whens: []', 'gss: {id: pub, sheet: 1}, gss_sheet: 2', 'gss: false', 'when: &schedule []']) {
    assert.throws(() => migrateSource(`tpl: {sections: [{boxes: [{${body}}]}]}\n`, { YAML }), /Conflicting|identifier|aliases/)
  }
  assert.throws(() => migrateSource('+++\ntitle="old"\n+++\n', { YAML, markdown: true }), /Non-YAML/)
})

test('block migration plans every file before writing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-block-migration-'))
  try {
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}')
    fs.symlinkSync(path.join(engine, '../node_modules'), path.join(root, 'node_modules'))
    fs.mkdirSync(path.join(root, 'data/section'), { recursive: true })
    const first = path.join(root, 'data/section/a.yml')
    fs.writeFileSync(first, 'boxes:\n- gss: public-id\n  gss_sheet: 3\n')
    const last = path.join(root, 'data/section/z.yml')
    fs.writeFileSync(last, 'boxes:\n- when: []\n  whens: []\n')
    assert.throws(() => migrateProject(root), /Conflicting/)
    assert.match(fs.readFileSync(first, 'utf8'), /gss: public-id/)
    fs.unlinkSync(last)
    assert.deepEqual(migrateProject(root, { check: true }), ['data/section/a.yml'])
    assert.match(fs.readFileSync(first, 'utf8'), /gss: public-id/)
    migrateProject(root)
    assert.deepEqual(migrateProject(root), [])
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('effective dot/when/gss defaults render alignment, inherited links and explicit zero', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-block-defaults-'))
  const write = (name, text) => {
    const file = path.join(root, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, text)
  }
  try {
    fs.cpSync(path.join(engine, 'layouts/partials'), path.join(root, 'layouts/partials'), { recursive: true })
    fs.cpSync(path.join(engine, 'data'), path.join(root, 'data'), { recursive: true })
    write('hugo.yml', 'baseURL: https://fixture.example/\n')
    write('layouts/partials/link.html', '<a href="{{ .url }}" data-ga4="{{ .ga4 }}" data-lock="{{ .lock }}" data-dot="{{ .dot }}">{{ .il }}{{ .label }}</a>')
    write('layouts/partials/icon.html', '{{ return "" }}')
    write('layouts/index.html', `{{ partial "blocks/dots" (dict "dot" (dict "align_x" "flex-start" "mt" 0 "mt_vl" 2 "url" "#{{ set custom }}" "ga4" "test_click" "lock" false) "dots" (slice (dict "custom" "target" "label" "Custom" "il" "check") "https://github.com/example")) }}
{{ partial "blocks/when" (dict "when" (dict "align_x" "flex-end" "mt" 0 "mt_vl" 3) "whens" (slice (dict "days" "Monday" "hours" "9–5"))) }}
{{ partial "blocks/gss" (dict "gss" (dict "id" "public-id" "sheet" 0 "mt" 0 "mt_vl" 4)) }}
{{ partial "cms/config/blocks" (partial "func/i18n-cms" .) | jsonify | safeHTML }}`)
    const built = spawnSync('hugo', [], { cwd: root, encoding: 'utf8' })
    assert.equal(built.status, 0, built.stdout + built.stderr)
    const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8')
    assert.match(html, /links box__block dots links--flex-start/)
    assert.match(html, /href="#target" data-ga4="test_click"[\s\S]*data-dot="true"/)
    assert.match(html, /brand:github-alt/)
    assert.match(html, /whens box__block whens--flex-end/)
    assert.match(html, /Monday/)
    assert.match(html, /\/public-id\/pubhtml\?gid=0/)
    for (const n of [2, 3, 4]) assert.match(html, new RegExp(`--block-mt-vs:0;--block-mt-vl:${n}`))
    const widgets = JSON.parse(html.slice(html.lastIndexOf('\n[') + 1))
    assert.ok(widgets.some(item => item['&dot']))
    assert.ok(widgets.some(item => item['&whens']))
    const sheet = widgets.find(item => item['&gss_sheet'])['&gss_sheet']
    assert.equal(sheet.name, 'sheet')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})


test('serialized defaults and nested composition directive paths migrate without renaming org fields', () => {
  const source = `- name: tpl.sections\n  type: dict\n  value: '[{"boxes":[{"when":[{"days":"Monday"}],"gss":"public"}]}]'\n- name: tpl.section.0.box.when\n  type: dict\n  value: '[{"days":"Monday"}]'\n- name: tpl.section.0.box.gss\n  type: str\n  value: public\n`
  const migrated = migrateSource(source, { YAML, defaults: true })
  const values = YAML.parse(migrated)
  assert.equal(YAML.parse(values[0].value)[0].boxes[0].gss.id, 'public')
  assert.equal(values[1].name, 'tpl.section.0.box.whens')
  assert.equal(values[2].name, 'tpl.section.0.box.gss.id')
  assert.equal(migrateSource(migrated, { YAML, defaults: true }), migrated)
  const directives = 'tpl: {sections: [{get: [{from: org.when, to: box.when}, {from: tpl.sections.0.boxes.0.when, to: "boxes[].gss_sheet"}]}]}\n'
  const result = YAML.parse(migrateSource(directives, { YAML })).tpl.sections[0].get
  assert.equal(result[0].from, 'org.when')
  assert.equal(result[0].to, 'box.whens')
  assert.equal(result[1].from, 'tpl.sections.0.boxes.0.whens')
  assert.equal(result[1].to, 'boxes[].gss.sheet')
})
