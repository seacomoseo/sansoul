import test from 'node:test'
import assert from 'node:assert/strict'
import { GROUP_PREFIX, SOURCE_TOKEN, prepareFieldGroups, loadFieldGroupConfig } from '../../assets/js/cms/field-groups.js'
import { createGroupCodec, parseGroupYAML } from '../../assets/js/cms/format-codec.js'

const group = (name, id = 'text', extra = {}) => ({ name, widget: 'string', required: false, _sansoul_group: { name: id, label: id }, ...extra })
const boxFields = [group('title'), group('md'), group('color', 'bg'), { name: 'view', widget: 'hidden' }]
function immutable (data) {
  return {
    toJS: () => structuredClone(data),
    get: key => data[key] && typeof data[key] === 'object' ? immutable(data[key]) : data[key],
    setIn (path, value) {
      const result = structuredClone(data)
      let node = result
      for (const part of path.slice(0, -1)) node = node[part]
      node[path.at(-1)] = value
      return immutable(result)
    }
  }
}
function stripTokens (data) {
  if (Array.isArray(data)) return data.map(stripTokens)
  if (data && typeof data === 'object') return Object.fromEntries(Object.entries(data).filter(([key]) => key !== SOURCE_TOKEN).map(([key, value]) => [key, stripTokens(value)]))
  return data
}
function setup (extra = {}, CMS) {
  const rawRegistrations = []
  let saveHook
  const source = {
    output: { omit_empty_optional_fields: true, yaml: { indent_sequences: false } },
    collections: [{ name: 'pages', folder: 'content/pages', fields: [{ name: 'slug' }, { name: 'tpl', widget: 'object', fields: [{ name: 'boxes', widget: 'list', summary: '{{fields.title}}', fields: boxFields }] }] }],
    ...extra
  }
  const result = prepareFieldGroups(source, CMS || { registerCustomFormat: (...args) => rawRegistrations.push(args), registerEventListener: hook => { saveHook = hook } })
  const prepareSave = data => saveHook.handler({ entry: immutable({ data, i18n: {} }) }).get('data').toJS()
  // Most codec tests exercise a complete successful save. Separate tests below
  // deliberately omit the public hook and simulate Sveltia's omission stage.
  const registrations = rawRegistrations.map(([name, extension, codec]) => [name, extension, { ...codec, toFile: data => codec.toFile(prepareSave(data)) }])
  return { source, ...result, registrations, rawRegistrations, codec: registrations[0]?.[2], prepareSave, saveHook }
}

test('schema creates native collapsed objects and preserves child widget options', () => {
  const { source, config, enabled } = setup()
  assert.equal(enabled, true)
  const boxes = config.collections[0].fields[1].fields[0]
  assert.equal(boxes.summary, '{{fields._sansoul_group_text.title}}')
  assert.deepEqual(boxes.fields[0], { name: '_sansoul_group_text', label: 'text', widget: 'object', required: true, collapsed: true, i18n: true, fields: boxFields.slice(0, 2).map(({ _sansoul_group, ...field }) => field) })
  assert.equal(source.collections[0].fields[1].fields[0].fields[0]._sansoul_group.name, 'text')
  assert.equal(config.output.omit_empty_optional_fields, true)
})

test('semantic roundtrip preserves unknowns, legacy view, false, zero and explicit empties', () => {
  const { codec } = setup()
  const value = { slug: 'a', unknown: { 'example.com': { '2024': 7 }, empty: {} }, tpl: { boxes: [{ title: '', md: null, color: false, view: ['titles'], x: 0, other: [], unknown: {} }, {}, { title: 'hello\nworld\n' }] } }
  const plain = createGroupCodec({ format: 'yaml-frontmatter' })
  const encoded = plain.toFile(value)
  const grouped = codec.fromFile(encoded)
  assert.equal(grouped.tpl.boxes[0]._sansoul_group_bg.color, false)
  assert.deepEqual(stripTokens(grouped.tpl.boxes[1]), {})
  assert.deepEqual(plain.fromFile(codec.toFile(grouped)), plain.fromFile(encoded))
  assert.deepEqual(value.tpl.boxes[1], {})
})

test('group editing flattens to siblings and does not mutate live draft objects', () => {
  const { codec, flatten } = setup()
  const draft = codec.fromFile('---\nslug: a\ntpl:\n  boxes:\n  - title: Before\n    md: Body\n---')
  draft.tpl.boxes[0]._sansoul_group_text.title = 'After'
  const copy = structuredClone(draft)
  const output = parseGroupYAML(codec.toFile(draft).split('---')[1])
  assert.equal(output.tpl.boxes[0].title, 'After')
  assert.equal(output.tpl.boxes[0][GROUP_PREFIX + 'text'], undefined)
  assert.deepEqual(draft, copy)
  assert.equal(flatten(draft, 'pages').tpl.boxes[0].md, 'Body')
})

test('logical nested focus paths map to native object paths', () => {
  const { fieldPath } = setup()
  assert.equal(fieldPath('tpl.boxes.2.md', 'pages'), 'tpl.boxes.2._sansoul_group_text.md')
  assert.equal(fieldPath('slug', 'pages'), 'slug')
  assert.equal(fieldPath('unknown.value', 'pages'), 'unknown.value')
})

test('disabled and missing API fallback retain flat schemas, formats and output', () => {
  for (const CMS of [{}, { registerCustomFormat: undefined }]) {
    const { config, enabled } = setup({}, CMS)
    assert.equal(enabled, false)
    assert.equal(config.collections[0].format, undefined)
    assert.equal(config.output.omit_empty_optional_fields, true)
    assert.equal(config.collections[0].fields[1].fields[0].fields[0]._sansoul_group, undefined)
  }
  const source = setup().source
  const result = prepareFieldGroups(source, { registerCustomFormat: () => { throw Error('must not register') } }, { enabled: false })
  assert.equal(result.enabled, false)
})

test('unsupported configured formats remain flat', () => {
  const { config, enabled } = setup({ collections: [{ name: 'json', format: 'json', fields: [group('title')] }] })
  assert.equal(enabled, false)
  assert.equal(config.collections[0].format, 'json')
  assert.equal(config.collections[0].fields[0].name, 'title')
})

test('collection, file, singleton and index formats keep independent schema closures', () => {
  const { config, registrations } = setup({ collections: [
    { name: 'one', extension: 'yml', fields: [group('title')], thumbnail: 'title', index_file: { name: '_index', fields: [group('color', 'bg')] } },
    { name: 'settings', files: [{ name: 'one', file: 'data/one.yml', fields: [group('color', 'bg')] }, { name: 'two', file: 'data/two.yml', fields: [group('title')] }] }
  ], singletons: [{ name: 'global', file: 'content/global.{{locale}}.yml', fields: [group('color', 'bg')] }] })
  assert.equal(registrations.length, 5)
  assert.equal(new Set(registrations.map(item => item[0])).size, 5)
  assert.equal(config.collections[0].thumbnail, '_sansoul_group_text.title')
  const byFormat = new Map(registrations.map(([name, extension, codec]) => [name, { extension, codec }]))
  const one = byFormat.get(config.collections[0].format)
  assert.equal(one.extension, 'yml')
  assert.deepEqual(stripTokens(one.codec.fromFile('title: A\ncolor: red')), { _sansoul_group_text: { title: 'A' }, color: 'red' })
  const file = byFormat.get(config.collections[1].files[0].format).codec
  assert.deepEqual(stripTokens(file.fromFile('title: B\ncolor: blue')), { title: 'B', _sansoul_group_bg: { color: 'blue' } })
  assert.deepEqual(stripTokens(one.codec.fromFile('title: C')), { _sansoul_group_text: { title: 'C' } })
})

test('nested objects and lists retain groups at each original composition level', () => {
  const { codec, fieldPath } = setup({ collections: [{ name: 'deep', extension: 'yml', fields: [{ name: 'boxes', widget: 'list', fields: [...boxFields, { name: 'box', widget: 'object', fields: boxFields }] }] }] })
  const value = { boxes: [{ title: 'A', box: { md: 'B', color: 0 } }] }
  const plain = createGroupCodec()
  assert.deepEqual(plain.fromFile(codec.toFile(codec.fromFile(plain.toFile(value)))), value)
  assert.equal(fieldPath('boxes.0.box.md', 'deep'), 'boxes.0.box._sansoul_group_text.md')
})

test('variable types use their own child schema and retain type keys', () => {
  const { codec } = setup({ collections: [{ name: 'types', extension: 'yml', fields: [{ name: 'blocks', widget: 'list', types: [{ name: 'a', fields: [group('title')] }, { name: 'b', fields: [group('color', 'bg')] }] }] }] })
  const value = { blocks: [{ type: 'a', title: 'A', color: 'raw' }, { type: 'b', color: 'blue', title: 'raw' }] }
  const plain = createGroupCodec()
  assert.deepEqual(plain.fromFile(codec.toFile(codec.fromFile(plain.toFile(value)))), value)
})

test('single-file i18n applies grouping inside locale mappings', () => {
  const { codec } = setup({ i18n: { structure: 'single_file', locales: ['es', 'en'], default_locale: 'es' }, collections: [{ name: 'translated', extension: 'yml', i18n: true, fields: [group('title')] }] })
  const value = { es: { title: 'ES', unknown: false }, en: { title: 'EN' }, other: { title: 'raw' } }
  const plain = createGroupCodec()
  assert.deepEqual(plain.fromFile(codec.toFile(codec.fromFile(plain.toFile(value)))), value)
})

test('single-file default-root i18n preserves locale metadata and flat default locale', () => {
  const { codec } = setup({ i18n: { structure: 'single_file_default_root', locales: ['es', 'en'], default_locale: 'es' }, collections: [{ name: 'translated', extension: 'yml', i18n: true, fields: [group('title')] }] })
  const value = { lang: ['es', 'en'], title: 'ES', en: { title: 'EN' } }
  const plain = createGroupCodec()
  assert.deepEqual(plain.fromFile(codec.toFile(codec.fromFile(plain.toFile(value)))), value)
})

test('root list collections group each list item', () => {
  const { codec } = setup({ collections: [{ name: 'list', extension: 'yml', fields: [{ name: 'items', widget: 'list', root: true, fields: [group('title')] }] }] })
  assert.deepEqual(parseGroupYAML(codec.toFile(codec.fromFile('- title: A\n- title: B'))), [{ title: 'A' }, { title: 'B' }])
})

test('schema and source collisions fail without overwriting values', () => {
  assert.throws(() => setup({ collections: [{ name: 'duplicate', fields: [group('title'), group('title', 'other')] }] }), /Duplicate/)
  assert.throws(() => setup({ collections: [{ name: 'reserved', fields: [group('_sansoul_group_x')] }] }), /Reserved/)
  const { codec } = setup()
  assert.throws(() => codec.fromFile('---\ntpl:\n  boxes:\n  - _sansoul_group_text: { title: bad }\n---'), /Reserved/)
  assert.throws(() => codec.toFile({ tpl: { boxes: [{ title: 'a', _sansoul_group_text: { title: 'b' } }] } }), /collision/)
  assert.throws(() => codec.toFile({ tpl: { boxes: [{ _sansoul_group_text: { bad: 'b' } }] } }), /Unexpected/)
  assert.throws(() => codec.toFile({ tpl: { boxes: [{ _sansoul_group_unknown: {} }] } }), /Unknown/)
})

test('codec rejects malformed YAML, duplicate keys and unsafe integer precision', () => {
  const codec = createGroupCodec()
  for (const source of ['a: [', 'a: 1\na: 2', 'id: 9007199254740993', 'id: -9007199254740993', 'cycle: &c {again: *c}']) assert.throws(() => codec.fromFile(source))
  assert.equal(codec.fromFile('id: 9007199254740991').id, Number.MAX_SAFE_INTEGER)
  assert.throws(() => codec.toFile({ value: 9007199254740992 }), /safe integers/)
})

test('YAML string semantics remain compatible with older YAML readers', () => {
  const codec = createGroupCodec()
  const value = { values: ['yes', 'no', 'y', 'n', 'on', 'off', '1_000', '1:20', '2024-01-01', 'false'], enabled: false, amount: 0 }
  assert.deepEqual(codec.fromFile(codec.toFile(value)), value)
  assert.match(codec.toFile(value), /['"]yes['"]/)
})

test('Markdown body, body_field options and custom delimiters roundtrip', () => {
  for (const options of [{}, { bodyField: { key: 'content' } }, { bodyField: { inline: true } }, { delimiters: ['~~~', '~~~'] }]) {
    const codec = createGroupCodec({ format: 'yaml-frontmatter', ...options })
    const value = { title: 'A', [options.bodyField?.key || 'body']: '# Body\n\nText' }
    assert.deepEqual(codec.fromFile(codec.toFile(value)), value)
  }
  const codec = createGroupCodec({ format: 'frontmatter' })
  assert.deepEqual(codec.fromFile('Just body'), { body: 'Just body' })
  assert.deepEqual(codec.fromFile('---\n---\nText'), { body: 'Text' })
  assert.throws(() => codec.fromFile('+++\ntitle="A"\n+++'), /YAML front matter/)
  assert.throws(() => codec.fromFile('---\ntitle: A'), /Unclosed/)
})

test('config loading resolves YAML aliases and merge metadata without global parser state', async () => {
  const document = { querySelector: () => ({ href: 'https://example.test/config.yml' }) }
  const source = 'base: &a { name: title, widget: string }\ncollections:\n- name: pages\n  fields:\n  - <<: *a\n    _sansoul_group: { name: text, label: Text }'
  const config = await loadFieldGroupConfig(document, async () => ({ ok: true, text: async () => source }))
  assert.equal(config.collections[0].fields[0].name, 'title')
  await assert.rejects(loadFieldGroupConfig({ querySelector: () => null }), /URL/)
  await assert.rejects(loadFieldGroupConfig(document, async () => ({ ok: false, status: 503 })), /503/)
})

test('native YAML tags that need non-JSON objects fail closed', () => {
  assert.throws(() => parseGroupYAML('date: !!timestamp 2024-01-01'), /tagged YAML/)
  assert.throws(() => parseGroupYAML('values: !!set {a: null}'), /tagged YAML/)
})

test('index schemas and focus mapping stay independent from the entry schema', () => {
  const { fieldPath, flatten } = setup({ collections: [{ name: 'pages', fields: [group('title')], index_file: { name: '_index', fields: [group('title', 'index')] } }] })
  assert.equal(fieldPath('title', 'pages', 'content/pages/a.es.md'), '_sansoul_group_text.title')
  assert.equal(fieldPath('title', 'pages', 'content/pages/_index.es.md'), '_sansoul_group_index.title')
  assert.deepEqual(flatten({ _sansoul_group_index: { title: 'Index' } }, 'pages', 'content/pages/_index.es.md'), { title: 'Index' })
})

test('declaring YAML format without extension retains the built-in yml default', () => {
  const { registrations } = setup({ collections: [{ name: 'yaml', format: 'yaml', fields: [group('title')] }] })
  assert.equal(registrations[0][1], 'yml')
})

test('object and list defaults are expanded for new entries that never run fromFile', () => {
  const { config } = setup({ collections: [{ name: 'defaults', extension: 'yml', fields: [{ name: 'box', widget: 'object', fields: [group('title')], default: { title: 'A' }, default_localized: { es: { title: 'ES' } } }, { name: 'boxes', widget: 'list', fields: [group('title')], default: [{ title: 'B' }] }] }] })
  const [box, boxes] = config.collections[0].fields
  assert.deepEqual(box.default, { _sansoul_group_text: { title: 'A' } })
  assert.deepEqual(box.default_localized, { es: { _sansoul_group_text: { title: 'ES' } } })
  assert.deepEqual(boxes.default, [{ _sansoul_group_text: { title: 'B' } }])
})

test('file paths determine extensions ahead of collection-level extension defaults', () => {
  const { registrations } = setup({ collections: [{ name: 'settings', extension: 'md', files: [{ name: 'one', file: 'data/one.yml', fields: [group('title')] }] }] })
  assert.equal(registrations[0][1], 'yml')
})

test('flat index format remains explicit when its parent collection gets an adapter', () => {
  const { config } = setup({ collections: [{ name: 'pages', fields: [group('title')], index_file: { name: '_index', fields: [{ name: 'title' }] } }] })
  assert.equal(config.collections[0].index_file.format, 'frontmatter')
})

test('singleton locale filenames override single_file global structure', () => {
  const { registrations } = setup({ i18n: { structure: 'single_file', locales: ['es', 'en'] }, collections: [], singletons: [{ name: 'global', file: 'content/global.{{locale}}.yml', i18n: true, fields: [group('title')] }] })
  const codec = registrations[0][2]
  assert.deepEqual(stripTokens(codec.fromFile('title: ES')), { _sansoul_group_text: { title: 'ES' } })
  assert.deepEqual(parseGroupYAML(codec.toFile(codec.fromFile('title: ES'))), { title: 'ES' })
})

test('singleton fixed filenames select single_file and default locale is the first locale', () => {
  const { registrations } = setup({ i18n: { structure: 'multiple_files', locales: ['es', 'en'] }, collections: [], singletons: [{ name: 'global', file: 'content/global.yml', i18n: true, fields: [group('title')] }] })
  assert.deepEqual(stripTokens(registrations[0][2].fromFile('es: {title: ES}\nen: {title: EN}')), { es: { _sansoul_group_text: { title: 'ES' } }, en: { _sansoul_group_text: { title: 'EN' } } })
  const withDefaultRoot = setup({ i18n: { structure: 'single_file_default_root', locales: ['es', 'en'] }, collections: [{ name: 'locale', extension: 'yml', i18n: true, fields: [group('title')] }] }).codec
  assert.deepEqual(stripTokens(withDefaultRoot.fromFile('title: ES\nen: {title: EN}')), { _sansoul_group_text: { title: 'ES' }, en: { _sansoul_group_text: { title: 'EN' } } })
})

test('individual file i18n is opt-in even when its file collection enables i18n', () => {
  const { registrations } = setup({ i18n: { structure: 'single_file', locales: ['es', 'en'] }, collections: [{ name: 'settings', i18n: true, files: [{ name: 'one', file: 'data/one.yml', fields: [group('title')] }] }] })
  assert.deepEqual(stripTokens(registrations[0][2].fromFile('title: Local')), { _sansoul_group_text: { title: 'Local' } })
})

function nativeOmit (value, fields) {
  const empty = item => item == null || item === '' || Array.isArray(item) && !item.length || item && typeof item === 'object' && !Object.keys(item).length
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const output = { ...value }
  for (const field of fields) {
    if (!Object.hasOwn(output, field.name)) continue
    let item = output[field.name]
    const nested = entry => field.fields || field.types?.find(type => type.name === entry?.[field.typeKey || 'type'])?.fields
    if (field.widget === 'object' && nested(item)) item = nativeOmit(item, nested(item))
    if (field.widget === 'list' && Array.isArray(item)) item = item.map(entry => nested(entry) ? nativeOmit(entry, nested(entry)) : entry)
    if (field.required === false && empty(item)) delete output[field.name]
    else output[field.name] = item
  }
  return output
}
function nativeMaterialize (value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const result = structuredClone(value)
  for (const field of fields) {
    if (!Object.hasOwn(result, field.name) && field.widget !== 'hidden') result[field.name] = field.name.startsWith(GROUP_PREFIX) ? {} : field.widget === 'list' ? [] : ['string', 'text', 'markdown', undefined].includes(field.widget) ? '' : null
    if (field.widget === 'object') result[field.name] = nativeMaterialize(result[field.name], field.fields || [])
    if (field.widget === 'list' && Array.isArray(result[field.name])) result[field.name] = result[field.name].map(item => nativeMaterialize(item, field.fields || field.types?.find(type => type.name === item.type)?.fields || []))
  }
  return result
}

test('source presence removes synthesized absences while keeping explicit empty values after native omission', () => {
  const adapter = setup()
  const raw = adapter.rawRegistrations[0][2]
  const fields = adapter.config.collections[0].fields
  const original = { slug: 'a', tpl: { boxes: [{ title: '', md: null, color: false, unknown: [] }, { title: 'B' }] } }
  const plain = createGroupCodec({ format: 'yaml-frontmatter' })
  const draft = nativeMaterialize(raw.fromFile(plain.toFile(original)), fields)
  draft.tpl.boxes[1]._sansoul_group_text.title = 'Changed'
  const saving = adapter.prepareSave(draft)
  const filtered = nativeOmit(saving, fields)
  const saved = plain.fromFile(raw.toFile(filtered))
  assert.deepEqual(saved, { ...original, tpl: { boxes: [original.tpl.boxes[0], { title: 'Changed' }] }, body: '' })
  assert.equal(adapter.config.output.omit_empty_optional_fields, true)
  assert.doesNotMatch(raw.toFile(filtered), /_sansoul_(source|group)/)
})

test('copied list items get independent save tokens and keep presence through reorder, deletion and two concurrent documents', () => {
  const adapter = setup()
  const raw = adapter.rawRegistrations[0][2]
  const fields = adapter.config.collections[0].fields
  const first = raw.fromFile('---\nslug: a\ntpl: {boxes: [{title: "", md: null}, {title: B}]}\n---')
  const second = raw.fromFile('---\nslug: b\ntpl: {boxes: [{title: Other}]}\n---')
  const copy = structuredClone(first.tpl.boxes[0])
  copy._sansoul_group_text.title = null
  copy._sansoul_group_text.md = 'Copy'
  first.tpl.boxes = [copy, first.tpl.boxes[1], first.tpl.boxes[0]]
  first.tpl.boxes[2]._sansoul_group_text.title = 'Original'
  const saving = adapter.prepareSave(first)
  assert.notEqual(saving.tpl.boxes[0][SOURCE_TOKEN], saving.tpl.boxes[2][SOURCE_TOKEN])
  const plain = createGroupCodec({ format: 'yaml-frontmatter' })
  assert.deepEqual(plain.fromFile(raw.toFile(nativeOmit(saving, fields))).tpl.boxes, [{ title: null, md: 'Copy' }, { title: 'B' }, { title: 'Original', md: null }])
  first.tpl.boxes.splice(0, 1)
  assert.equal(plain.fromFile(raw.toFile(nativeOmit(adapter.prepareSave(first), fields))).tpl.boxes.length, 2)
  assert.equal(plain.fromFile(raw.toFile(nativeOmit(adapter.prepareSave(second), fields))).tpl.boxes[0].title, 'Other')
})

test('pre-save skip, unknown tokens, source collisions and residual virtual keys fail closed', () => {
  const adapter = setup()
  const raw = adapter.rawRegistrations[0][2]
  const draft = raw.fromFile('---\nslug: a\n---')
  assert.throws(() => raw.toFile(draft), /pre-save hook/)
  assert.throws(() => raw.toFile({ [SOURCE_TOKEN]: 'unknown' }), /unknown/)
  assert.throws(() => raw.fromFile(`---\nunknown: {${SOURCE_TOKEN}: x}\n---`), /Reserved/)
  const saving = adapter.prepareSave(draft)
  saving.unknown = { [SOURCE_TOKEN]: 'injected' }
  assert.throws(() => raw.toFile(saving), /Reserved/)
  const fresh = raw.toFile({ slug: 'new' })
  assert.match(fresh, /slug: new/)
})

test('pre-save handles both locales and deleting optional objects without reviving their old values', () => {
  const adapter = setup()
  const raw = adapter.rawRegistrations[0][2]
  const es = raw.fromFile('---\nslug: es\ntpl: {boxes: [{title: ""}]}\n---')
  const en = raw.fromFile('---\nslug: en\ntpl: {boxes: [{title: null}]}\n---')
  es.tpl = null
  const entry = adapter.saveHook.handler({ entry: immutable({ data: es, i18n: { en: { data: en } } }) }).toJS()
  const fields = adapter.config.collections[0].fields
  const plain = createGroupCodec({ format: 'yaml-frontmatter' })
  assert.equal(plain.fromFile(raw.toFile(nativeOmit(entry.data, fields))).tpl, null)
  assert.equal(plain.fromFile(raw.toFile(nativeOmit(entry.i18n.en.data, fields))).tpl.boxes[0].title, null)
})

test('preview strips source tokens and synthesized empty fields without changing current explicit values', () => {
  const adapter = setup()
  const draft = adapter.codec.fromFile('---\nslug: a\ntpl: {boxes: [{title: ""}]}\n---')
  const materialized = nativeMaterialize(draft, adapter.config.collections[0].fields)
  const preview = adapter.flatten(materialized, 'pages')
  assert.deepEqual(preview, { slug: 'a', tpl: { boxes: [{ title: '' }] }, body: '' })
  assert.doesNotMatch(JSON.stringify(preview), /_sansoul_(source|group)/)
})

test('changing a variable type uses its current schema and does not revive removed old fields', () => {
  const adapter = setup({ collections: [{ name: 'typed', extension: 'yml', fields: [{ name: 'blocks', widget: 'list', types: [{ name: 'a', fields: [group('title')] }, { name: 'b', fields: [group('color', 'bg')] }] }] }] })
  const raw = adapter.rawRegistrations[0][2]
  const data = raw.fromFile('blocks: [{type: a, title: ""}]')
  data.blocks[0] = { type: 'b', [SOURCE_TOKEN]: data.blocks[0][SOURCE_TOKEN], _sansoul_group_bg: { color: 'blue' } }
  const saved = raw.toFile(nativeOmit(adapter.prepareSave(data), adapter.config.collections[0].fields))
  assert.deepEqual(parseGroupYAML(saved), { blocks: [{ type: 'b', color: 'blue' }] })
})

test('absence of the public pre-save API retains the flat editor and native output settings', () => {
  const result = setup({}, { registerCustomFormat: () => { throw Error('must not register') } })
  assert.equal(result.enabled, false)
  assert.equal(result.config.output.omit_empty_optional_fields, true)
  assert.doesNotMatch(JSON.stringify(result.config), /_sansoul_source_token/)
})

test('empty native ordering values injected after omission do not materialize absent source fields', () => {
  const adapter = setup({ collections: [{ name: 'ordered', extension: 'yml', fields: [{ name: 'weight', widget: 'number', required: false }, group('title')] }] })
  const raw = adapter.rawRegistrations[0][2]
  const fields = adapter.config.collections[0].fields
  for (const [source, expected] of [['title: A', { title: 'A' }], ['title: A\nweight: null', { title: 'A', weight: null }], ['title: A\nweight: 0', { title: 'A', weight: 0 }]]) {
    const filtered = nativeOmit(adapter.prepareSave(raw.fromFile(source)), fields)
    if (!Object.hasOwn(filtered, 'weight')) filtered.weight = null
    assert.deepEqual(parseGroupYAML(raw.toFile(filtered)), expected)
  }
})

test('content YAML merge aliases retain effective Hugo values when serialized', () => {
  const codec = createGroupCodec()
  const source = 'base: &base {title: Inherited, color: red}\nbox:\n  <<: *base\n  color: blue\n'
  const expected = { base: { title: 'Inherited', color: 'red' }, box: { title: 'Inherited', color: 'blue' } }
  assert.deepEqual(codec.fromFile(source), expected)
  assert.deepEqual(codec.fromFile(codec.toFile(codec.fromFile(source))), expected)
})
