import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { migrateSource, migrateProject } from '../migrations/12.0.0-section-fields.js'

const require = createRequire(import.meta.url)
const YAML = require('yaml')
const migrate = (source, options = {}) => migrateSource(source, { YAML, ...options })

test('only concrete template sections flatten; scalar styles, comments and Markdown body survive', () => {
  const source = `---\ntitle: 'Keep quotes'\ncustom: {params: {title: untouched}}\ntpl:\n  section: [{params: {business: unchanged}}]\n  sections:\n  # Section before\n  - file: hero # reference\n    params: # content\n      # title comment\n      title: 'Hello'\n      md: | # multiline\n        First\n        Second\n    # trailing field comment\n    custom: {params: untouched}\n---\nparams: body unchanged\n`
  const result = migrate(source, { markdown: true })
  const parsed = YAML.parse(result.split('---\n')[1])
  assert.equal(parsed.tpl.sections[0].title, 'Hello')
  assert.equal(parsed.tpl.sections[0].md, 'First\nSecond\n')
  assert.deepEqual(parsed.tpl.sections[0].custom, { params: 'untouched' })
  assert.deepEqual(parsed.tpl.section, [{ params: { business: 'unchanged' } }])
  assert.ok(result.startsWith("---\ntitle: 'Keep quotes'\ncustom: {params: {title: untouched}}\n"))
  assert.ok(result.endsWith('---\nparams: body unchanged\n'))
  for (const comment of ['# Section before', '# reference', '# content', '# title comment', '# multiline', '# trailing field comment']) assert.equal(result.split(comment).length, 2, comment)
  assert.match(result, /title: 'Hello'/)
  assert.match(result, /md: \| # multiline/)
  assert.equal(migrate(result, { markdown: true }), result)
})

test('first params, null/empty wrappers, flow style and explicit false/zero values migrate', () => {
  const sources = [
    'tpl:\n  sections:\n  - params:\n      color: dark\n      pt: 0\n      enabled: false\n',
    'tpl: {sections: [{params: {pt: 0, enabled: false}, file: hero}]}\n',
    'tpl:\n  sections:\n  - params: null # keep null comment\n  - params: {} # keep empty comment\n',
    'tpl:\n  sections:\n  - params: {} # keep empty comment\n    file: hero\n',
    'tpl:\n  sections:\n  - params: # keep header\n      title: Hello\n    color: dark\n'
  ]
  for (const source of sources) {
    const result = migrate(source)
    const sections = YAML.parse(result).tpl.sections
    assert.ok(sections.every(section => !Object.hasOwn(section, 'params')))
    for (const comment of source.match(/# [^\n]+/g) || []) assert.ok(result.includes(comment), comment)
    assert.equal(migrate(result), result)
  }
  const output = YAML.parse(migrate(sources[0])).tpl.sections[0]
  assert.equal(output.pt, 0)
  assert.equal(output.enabled, false)
})

test('JSON, CRLF, defaults wrapper and root defaults sequence retain their public format', () => {
  const json = '{ "tpl": {"sections": [{"file":"hero", "params":{"title":"Hello","pt":0}}]}, "business": {"params": "untouched"}}\n'
  const output = migrate(json, { json: true })
  assert.deepEqual(JSON.parse(output).tpl.sections, [{ file: 'hero', title: 'Hello', pt: 0 }])
  assert.ok(output.startsWith('{ "tpl":'))
  assert.ok(output.endsWith(', "business": {"params": "untouched"}}\n'))
  const crlf = 'tpl:\r\n  sections:\r\n  - params:\r\n      title: Hi\r\n'
  const crlfResult = migrate(crlf)
  assert.ok(!/(?<!\r)\n/.test(crlfResult))
  for (const source of [
    'defaults:\n- tpl: {sections: [{params: {title: Hi}}]}\n',
    '- name: type\n  tpl:\n    sections:\n    - params: {title: Hi}\n'
  ]) {
    const result = YAML.parse(migrate(source))
    const defaults = Array.isArray(result) ? result : result.defaults
    assert.deepEqual(defaults[0].tpl.sections, [{ title: 'Hi' }])
  }
})

test('collisions, aliases, merges, invalid maps and unsupported front matter fail closed', () => {
  for (const source of [
    'tpl: {sections: [{title: same, params: {title: same}}]}',
    'tpl: {sections: [{file: hero, params: {file: other}}]}',
    'tpl: {sections: [{params: {params: custom}}]}',
    'tpl: {sections: [{params: text}]}',
    'tpl: {sections: [{params: []}]}',
    'tpl: {sections: [{params: {title: a, title: b}}]}',
    'anchor: &a {title: Hi}\ntpl: {sections: [{params: *a}]}',
    'anchor: &a {title: Hi}\ntpl: {sections: [*a]}',
    'anchor: &a {title: Hi}\ntpl: {sections: [{params: {<<: *a}}]}',
    'tpl: {sections: [{params: {title: &a Hi}}]}'
  ]) assert.throws(() => migrate(source), /Conflicting|aliases|anchors|merges|must be|unique/)
  assert.throws(() => migrate('+++\ntitle = "Hi"\n+++\n', { markdown: true }), /Non-YAML/)
  assert.equal(migrate('No front matter\nparams: text\n', { markdown: true }), 'No front matter\nparams: text\n')
  assert.equal(migrate('custom: &a {params: {title: Hi}}\nother: *a\n'), 'custom: &a {params: {title: Hi}}\nother: *a\n')
})

function projectFixture (t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-section-fields-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'content/single'), { recursive: true })
  fs.mkdirSync(path.join(root, 'data/types'), { recursive: true })
  fs.mkdirSync(path.join(root, 'node_modules'))
  fs.symlinkSync(path.dirname(require.resolve('yaml/package.json')), path.join(root, 'node_modules/yaml'))
  return root
}

test('project migration preflights all sources before writing and check remains read-only', t => {
  const root = projectFixture(t)
  const first = path.join(root, 'content/single/a.es.md')
  const last = path.join(root, 'data/types/z.yml')
  const source = '---\ntpl:\n  sections:\n  - params: {title: Hi}\n---\nBody\n'
  fs.writeFileSync(first, source)
  fs.writeFileSync(last, 'tpl: {sections: [{file: a, params: {file: b}}]}\n')
  assert.throws(() => migrateProject(root), /before writing/)
  assert.equal(fs.readFileSync(first, 'utf8'), source)
  fs.writeFileSync(last, 'tpl: {sections: [{params: {title: Type}}]}\n')
  assert.deepEqual(migrateProject(root, { check: true }), ['content/single/a.es.md', 'data/types/z.yml'])
  assert.equal(fs.readFileSync(first, 'utf8'), source)
  assert.equal(migrateProject(root).length, 2)
  assert.deepEqual(migrateProject(root), [])
})

test('symbolic link sources and directories fail before writing any target', t => {
  const root = projectFixture(t)
  const source = 'tpl: {sections: [{params: {title: Hi}}]}\n'
  const external = path.join(root, 'external.yml')
  fs.writeFileSync(external, source)
  fs.symlinkSync(external, path.join(root, 'data/types/a.yml'))
  assert.throws(() => migrateProject(root), /symbolic links/)
  assert.equal(fs.readFileSync(external, 'utf8'), source)
  fs.unlinkSync(path.join(root, 'data/types/a.yml'))
  fs.mkdirSync(path.join(root, 'external'))
  fs.symlinkSync(path.join(root, 'external'), path.join(root, 'content/linked'))
  assert.throws(() => migrateProject(root), /symbolic links/)
})

test('serialized template defaults migrate in quoted JSON and multiline YAML without losing their scalar format', () => {
  const fixtures = [
    ['- name: tpl\n  type: dict\n  value: \'{"sections":[{"params":{"title":"Hi","pt":0}}]}\' # keep\n', 'tpl'],
    ['- name: tpl.sections\n  type: dict\n  value: \'[{"params":{"title":"Hi","pt":0}}]\' # keep\n', 'tpl.sections'],
    ['- name: tpl\n  type: dict\n  value: | # keep\n    sections:\n    - params:\n        title: Hi\n        pt: 0\n', 'tpl'],
    ['- name: tpl.sections\n  type: dict\n  value: >- # keep\n    [{"params":{"title":"Hi","pt":0}}]\n', 'tpl.sections']
  ]
  for (const [source, name] of fixtures) {
    const output = migrate(source, { defaults: true })
    const value = YAML.parse(output)[0].value
    const parsed = YAML.parse(value)
    assert.deepEqual(name === 'tpl' ? parsed.sections : parsed, [{ title: 'Hi', pt: 0 }])
    assert.ok(output.includes('# keep'))
    assert.equal(migrate(output, { defaults: true }), output)
    assert.equal(migrate(source), source, 'serialized values are only composition in the defaults file')
  }
  const collision = '- name: tpl\n  type: dict\n  value: \'{"sections":[{"title":"a","params":{"title":"b"}}]}\'\n'
  assert.throws(() => migrate(collision, { defaults: true }), /Conflicting/)
})
