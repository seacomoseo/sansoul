import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { prepareFieldGroups } from '../../assets/js/cms/field-groups.js'

function immutable (value) {
  return {
    toJS: () => structuredClone(value),
    get: key => value[key] && typeof value[key] === 'object' ? immutable(value[key]) : value[key],
    setIn (keys, item) {
      const result = structuredClone(value)
      let parent = result
      for (const key of keys.slice(0, -1)) parent = parent[key]
      parent[keys.at(-1)] = item
      return immutable(result)
    }
  }
}

const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

test('flat section overrides reusable file and CMS content group persists flat fields', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-flat-sections-'))
  const write = (name, value) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value) }
  try {
    fs.cpSync(path.join(engine, 'layouts/partials'), path.join(root, 'layouts/partials'), { recursive: true })
    fs.cpSync(path.join(engine, 'data'), path.join(root, 'data'), { recursive: true })
    write('hugo.yml', 'baseURL: https://fixture.example/\nparams:\n  cms_enabled: false\n')
    write('data/section/reusable.yml', 'id: inherited\ncolor: dark\nboxes:\n- title: Inherited\n')
    write('content/_index.md', '---\ntpl:\n  sections:\n  - file: reusable\n    id: concrete\n    color: light\n    boxes:\n    - title: Concrete\n  - id: inline\n    boxes:\n    - title: Inline\n---\n')
    write('layouts/index.html', '{{ partial "sections/merged-files" .Params.tpl.sections | jsonify | safeHTML }}\n{{ partial "cms/config/collections/templates" (partial "func/i18n-cms" .) | jsonify | safeHTML }}\n{{ partial "cms/config/boxes" (partial "func/i18n-cms" .) | jsonify | safeHTML }}')
    const result = spawnSync('hugo', [], { cwd: root, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    const [sections, anchors, widgets] = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    const timer = widgets.find(item => item['&slider_time'])['&slider_time']
    assert.equal(timer.min, 0)
    assert.equal(timer.step, 1)
    assert.match(timer.hint, /segundos|seconds/)
    assert.equal(sections[0].id, 'concrete')
    assert.equal(sections[0].color, 'light')
    assert.equal(sections[0].boxes[0].title, 'Concrete')
    assert.equal(sections[1].boxes[0].title, 'Inline')
    assert.equal(sections[0].file, null)
    const field = anchors.find(item => item['&tpl_sections'])['&tpl_sections']
    assert.equal(field.fields.some(item => item.name === 'params'), false)
    const id = field.fields.find(item => item['<<'] === '~id')
    assert.equal(id._sansoul_group.name, 'content')
    // Resolve only the alias fields needed by this codec round trip. The native
    // generated schema is additionally exercised by the integrated build/CMS.
    const fields = field.fields.filter(item => item._sansoul_group).slice(0, 1).map(item => ({ name: 'id', widget: 'string', ...item, '<<': undefined }))
    const source = { collections: [{ name: 'single', folder: 'content/single', fields: [{ name: 'tpl', widget: 'object', fields: [{ name: 'sections', widget: 'list', fields: [{ name: 'file', widget: 'string' }, ...fields] }] }] }] }
    const formats = []
    let saveHook
    const prepared = prepareFieldGroups(source, { registerCustomFormat: (...args) => formats.push(args), registerEventListener: hook => { saveHook = hook } })
    const content = prepared.config.collections[0].fields[0].fields[0].fields.find(item => item.name === '_sansoul_group_content')
    assert.equal(content.collapsed, true)
    const codec = formats[0][2]
    const input = '---\ntpl:\n  sections:\n  - file: reusable\n    id: saved-flat\n---\nBody\n'
    const draft = codec.fromFile(input)
    const saving = saveHook.handler({ entry: immutable({ data: draft, i18n: {} }) }).get('data').toJS()
    const saved = codec.toFile(saving)
    assert.match(saved, /id: saved-flat/)
    assert.doesNotMatch(saved, /params:|_sansoul_group/)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
