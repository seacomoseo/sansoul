import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { migrateCustomFields, migrateProject } from '../migrations/11.0.0-custom-fields.js'

const require = createRequire(import.meta.url)
const YAML = require('yaml')

test('nested custom fields migrate without rewriting comments or unrelated author values', () => {
  const source = '# Keep\n- name: group\n  sub: # children\n  - name: nested\n    widget: object\n    sub: [{name: title, def: {sub: unchanged}}]\n  opts: [{label: sub, value: sub}]\n'
  const output = migrateCustomFields(source, YAML)
  assert.match(output, /fields: # children/)
  assert.match(output, /fields: \[\{name: title, def: \{sub: unchanged\}\}\]/)
  assert.match(output, /opts: \[\{label: sub, value: sub\}\]/)
  assert.ok(output.startsWith('# Keep\n'))
  assert.equal(migrateCustomFields(output, YAML), output)
})

test('custom collisions and aliases fail before any source write', () => {
  for (const source of ['- {name: a, sub: [], fields: []}', '- &a {name: a}\n- *a', '- {name: a, sub: wrong}', '- {name: a, sub: [], sub: []}']) {
    assert.throws(() => migrateCustomFields(source, YAML))
  }
  assert.equal(migrateCustomFields('- {name: a, sub: null}\n', YAML), '- {name: a, fields: null}\n')
})

test('project custom planner is read-only and reports its exact target', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-custom-fields-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'data'))
  fs.writeFileSync(path.join(root, 'package.json'), '{}')
  const yamlModule = path.dirname(require.resolve('yaml/package.json'))
  fs.mkdirSync(path.join(root, 'node_modules'))
  fs.symlinkSync(yamlModule, path.join(root, 'node_modules/yaml'), 'dir')
  const file = path.join(root, 'data/customs.yml')
  const source = '- {name: footer, sub: [{var: md}]}\n'
  fs.writeFileSync(file, source)
  assert.deepEqual(migrateProject(root, { check: true }), ['data/customs.yml'])
  assert.equal(fs.readFileSync(file, 'utf8'), source)
  migrateProject(root)
  assert.deepEqual(migrateProject(root, { check: true }), [])
  assert.deepEqual(YAML.parse(fs.readFileSync(file, 'utf8'))[0].fields, [{ var: 'md' }])
})

test('custom migration refuses a symlinked data directory without writing its target', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-custom-links-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'external'))
  const file = path.join(root, 'external/customs.yml')
  const source = '- {name: a, sub: []}\n'
  fs.writeFileSync(file, source)
  fs.symlinkSync(path.join(root, 'external'), path.join(root, 'data'), 'dir')
  assert.throws(() => migrateProject(root), /symbolic links/)
  assert.equal(fs.readFileSync(file, 'utf8'), source)
})
