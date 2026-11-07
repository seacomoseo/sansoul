import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { migrateSource, migrateProject } from '../migrations/9.0.0-authoring-layout.js'
const require = createRequire(import.meta.url)
const YAML = require('yaml')
const migrate = (source, options = {}) => migrateSource(source, { YAML, ...options })

test('nested composition changes preserve Markdown, unknown maps and source formatting', () => {
  const source = `---\ntitle: Hello\ncustom: { map: untouched, grow: true }\ntpl:\n  sections:\n  - params:\n      map: { zoom: 12 } # note\n      sort: [map, links]\n      box: { grow: true, cols: 2 }\n      boxes:\n      - links: [{ full: true, type: h2, label: 'Keep' }]\n        inputs:\n        - { full: false, name: other }\n        md: |\n          map: do not change\n          full: true\n---\nmap: never touch body\n`
  const result = migrate(source, { markdown: true })
  assert.match(result, /geo: \{ zoom: 12 \} # note/)
  assert.match(result, /sort: \[geo, links\]/)
  assert.match(result, /box: \{ align_x: grow, cols: 2 \}/)
  assert.match(result, /links: \[\{ fit: 1, type: h2, label: 'Keep' \}\]/)
  assert.match(result, /custom: \{ map: untouched, grow: true \}/)
  assert.match(result, /md: \|\n          map: do not change\n          full: true/)
  assert.ok(result.endsWith('---\nmap: never touch body\n'))
  assert.equal(migrate(result, { markdown: true }), result)
})

test('false/null full removal handles flow and block including sole fields and comments', () => {
  for (const source of ['links: [{full: false, url: x}, {url: z, full: null}, {full: false}]\n', 'inputs:\n- full: false # keep\n  name: x\n- full: null\n', 'links: [{full: false # keep\n  , url: x}]\n', 'inputs:\n- full: # keep\n  name: x\n']) {
    const result = migrate(source, { section: true })
    assert.ok(!/full:/.test(result))
    assert.equal(migrate(result, { section: true }), result)
    assert.equal(YAML.parseDocument(result).errors.length, 0)
    if (source.includes('# keep')) assert.ok(result.includes('# keep'))
  }
})

test('JSON preserves whitespace and unknown data without rewriting heading types', () => {
  const source = '{ "tpl": {"sections": [{"params": {"map": {}, "box": {"grow": true}, "links": [{"full": true, "type": "br"}]}}]}, "other": {"map": "unchanged"}}\n'
  const result = migrate(source, { json: true })
  assert.equal(JSON.parse(result).tpl.sections[0].params.links[0].fit, 1)
  assert.equal(JSON.parse(result).tpl.sections[0].params.links[0].type, 'br')
  assert.ok(result.includes('"other": {"map": "unchanged"}'))
  assert.ok(result.startsWith('{ "tpl":'))
})

test('ambiguous collisions and composition aliases fail before edits', () => {
  for (const source of ['map: {}\ngeo: {}\n', 'box: {grow: true, align_x: left}\n', 'links: [{full: true, fit: 0.5}]\n', 'links: [{full: y}]\n', 'anchor: &a {map: {}}\nboxes: [*a]\n']) {
    assert.throws(() => migrate(source, { section: true }), /Conflicting|must be|aliases/)
  }
})

test('project planner validates all files before writing and check is idempotent/read-only', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-migrate9-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'data/section'), { recursive: true })
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true })
  fs.symlinkSync(path.dirname(require.resolve('yaml/package.json')), path.join(root, 'node_modules/yaml'))
  const first = path.join(root, 'data/section/a.yml')
  const second = path.join(root, 'data/section/z.yml')
  fs.writeFileSync(first, 'map: {}\n')
  fs.writeFileSync(second, 'map: {}\ngeo: {}\n')
  assert.throws(() => migrateProject(root), /before writing/)
  assert.equal(fs.readFileSync(first, 'utf8'), 'map: {}\n')
  fs.writeFileSync(second, 'box: {grow: true}\n')
  assert.equal(migrateProject(root, { check: true }).length, 2)
  assert.equal(fs.readFileSync(first, 'utf8'), 'map: {}\n')
  assert.equal(migrateProject(root).length, 2)
  assert.deepEqual(migrateProject(root), [])
})

test('missing YAML dependency fails actionably without writes', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-migrate9-empty-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  assert.throws(() => migrateProject(root, { check: true }), /installed yaml@2 dependency/)
  assert.deepEqual(fs.readdirSync(root), [])
})


test('defaults, reusable modals, CRLF and null/false semantics remain scoped', () => {
  const source = '- targets: {kind: page}\r\n  tpl:\r\n    modal: {box: {grow: false}, map: null}\r\n    modals: [{box: {grow: true}, links: [{full: null}, {full: false}]}]\r\n'
  const result = migrate(source)
  assert.ok(result.includes('geo: null'))
  assert.ok(result.includes('box: {grow: false}'))
  assert.ok(result.includes('box: {align_x: grow}'))
  assert.equal(result.replaceAll('\r\n', '').includes('\n'), false)
  assert.equal(migrate(result), result)
})
