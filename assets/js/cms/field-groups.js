import { createGroupCodec, parseGroupYAML } from './format-codec.js'

export const GROUP_PREFIX = '_sansoul_group_'
export const SOURCE_TOKEN = '_sansoul_source_token'
const metadataKey = '_sansoul_group'
const record = value => value && typeof value === 'object' && !Array.isArray(value)

function cleanField (field) {
  const result = { ...field }
  delete result[metadataKey]
  if (Array.isArray(result.fields)) result.fields = result.fields.map(cleanField)
  if (result.field) result.field = cleanField(result.field)
  if (Array.isArray(result.types)) result.types = result.types.map(type => ({ ...type, fields: (type.fields || []).map(cleanField) }))
  return result
}

function compileFields (fields = []) {
  const groups = new Map()
  const children = new Map()
  const owners = new Map()
  const output = []
  for (const source of fields) {
    if (!source || typeof source.name !== 'string') throw new Error('CMS grouping requires named fields.')
    if (['__proto__', 'constructor', 'prototype', SOURCE_TOKEN].includes(source.name) || source.name.startsWith(GROUP_PREFIX)) throw new Error(`Reserved CMS field name: ${source.name}`)
    if (children.has(source.name)) throw new Error(`Duplicate CMS field name: ${source.name}`)
    const field = cleanField(source)
    const child = {
      field,
      nested: Array.isArray(source.fields) ? compileFields(source.fields) : null,
      item: source.field ? compileFields([source.field]) : null,
      types: new Map((source.types || []).map(type => [type.name, compileFields(type.fields || [])]))
    }
    for (const variant of child.types.values()) { variant.variants = child.types; variant.typeKey = field.typeKey || 'type' }
    if (child.nested) field.fields = child.nested.output
    if (child.item) field.field = child.item.output[0]
    if (field.types) field.types = field.types.map(type => ({ ...type, fields: child.types.get(type.name).output, ...(typeof type.summary === 'string' ? { summary: rewriteSummary(type.summary, child.types.get(type.name)) } : {}) }))
    children.set(source.name, child)
    const metadata = source[metadataKey]
    if (metadata) {
      if (!record(metadata) || !/^[a-z][a-z0-9_]*$/.test(metadata.name || '') || typeof metadata.label !== 'string') throw new Error(`Invalid CMS group on ${source.name}`)
      const name = GROUP_PREFIX + metadata.name
      if (!groups.has(name)) {
        const group = { name, label: metadata.label, widget: 'object', required: true, collapsed: true, i18n: true, fields: [] }
        groups.set(name, group)
        output.push(group)
      }
      if (groups.get(name).label !== metadata.label) throw new Error(`Conflicting CMS group labels: ${name}`)
      groups.get(name).fields.push(field)
      owners.set(source.name, name)
    } else output.push(field)
  }
  const rootList = output.length === 1 && output[0].root && output[0].widget === 'list'
  const plan = { output, groups, children, owners, rootList }
  if (!rootList) output.push({ name: SOURCE_TOKEN, widget: 'hidden', required: false, i18n: true })
  for (const child of children.values()) {
    if (Object.hasOwn(child.field, 'default')) child.field.default = transformChild(child.field.default, child, true)
    if (record(child.field.default_localized)) child.field.default_localized = Object.fromEntries(Object.entries(child.field.default_localized).map(([locale, value]) => [locale, transformChild(value, child, true)]))
    if (child.nested && typeof child.field.summary === 'string') child.field.summary = rewriteSummary(child.field.summary, child.nested)
    if (child.nested && typeof child.field.thumbnail === 'string') child.field.thumbnail = mapGroupPath(child.nested, child.field.thumbnail)
  }
  return plan
}

function rewriteSummary (summary, plan) {
  return summary.replace(/{{\s*(fields\.)?([\w.]+)([^}]*)}}/g, (match, prefix = '', path, tail) => `{{${prefix}${mapGroupPath(plan, path)}${tail}}}`)
}

function nestedPlan (child, value) {
  if (child.types.size) return child.types.get(value?.[child.field.typeKey || 'type'])
  return child.nested
}

function transformChild (value, child, expand, visit) {
  if (child.field.widget === 'list') {
    if (!Array.isArray(value)) return value
    return value.map(item => {
      if (child.item) return transformChild(item, child.item.children.values().next().value, expand, visit)
      const plan = nestedPlan(child, item)
      return plan ? transformGroupData(item, plan, expand, visit) : item
    })
  }
  const plan = nestedPlan(child, value)
  return plan ? transformGroupData(value, plan, expand, visit) : value
}

export function transformGroupData (value, plan, expand = true, visit) {
  if (!record(value)) return value
  let result = { ...value }
  if (expand && visit) result = visit(result, plan)
  if (expand) {
    for (const key of Object.keys(result)) if (key.startsWith(GROUP_PREFIX)) throw new Error(`Reserved CMS group key already exists in source: ${key}`)
    for (const [name, child] of plan.children) {
      if (!Object.hasOwn(result, name)) continue
      const item = transformChild(result[name], child, true, visit)
      const owner = plan.owners.get(name)
      if (owner) {
        result[owner] ||= {}
        result[owner][name] = item
        delete result[name]
      } else result[name] = item
    }
  } else {
    for (const key of Object.keys(result)) {
      if (!key.startsWith(GROUP_PREFIX)) continue
      if (!plan.groups.has(key)) throw new Error(`Unknown CMS group: ${key}`)
      const group = result[key]
      if (group != null && !record(group)) throw new Error(`Invalid CMS group value: ${key}`)
      for (const [name, item] of Object.entries(group || {})) {
        if (plan.owners.get(name) !== key) throw new Error(`Unexpected field in CMS group: ${key}.${name}`)
        if (Object.hasOwn(result, name)) throw new Error(`CMS grouping collision: ${name}`)
        result[name] = item
      }
      delete result[key]
    }
    for (const [name, child] of plan.children) if (Object.hasOwn(result, name)) result[name] = transformChild(result[name], child, false, visit)
  }
  return !expand && visit ? visit(result, plan) : result
}

export function mapGroupPath (plan, path) {
  const parts = String(path).split('.')
  let active = plan
  const result = []
  while (parts.length) {
    const name = parts.shift()
    const child = active?.children.get(name)
    const owner = active?.owners.get(name)
    if (owner) result.push(owner)
    result.push(name)
    if (!child) { result.push(...parts); break }
    if (child.field.widget === 'list' && /^\d+$/.test(parts[0] || '')) result.push(parts.shift())
    active = child.nested || (child.item ? child.item.children.values().next().value.nested : null)
    // Variable-type fields cannot be resolved from a path alone. A shared
    // subfield mapping is usable only when every type resolves it identically.
    if (!active && child.types.size) {
      const choices = [...child.types.values()]
      const mapped = choices.map(choice => mapGroupPath(choice, parts.join('.')))
      if (new Set(mapped).size === 1) { if (parts.length) result.push(...mapped[0].split('.')); break }
    }
  }
  return result.join('.')
}

function hasGroups (plan) {
  return plan.groups.size > 0 || [...plan.children.values()].some(child => child.nested && hasGroups(child.nested) || child.item && hasGroups(child.item) || [...child.types.values()].some(hasGroups))
}

function formatOptions (config, collection, file) {
  const target = file || collection
  const declaredFormat = target.format || collection.format
  const extension = target.file?.split('.').pop() || target.extension || collection.extension || (['yaml', 'yml'].includes(declaredFormat) ? 'yml' : 'md')
  const format = declaredFormat || (['yml', 'yaml'].includes(extension) ? 'yaml' : 'frontmatter')
  return { format, extension, output: config.output?.yaml, bodyField: target.body_field || collection.body_field, delimiters: target.frontmatter_delimiter || collection.frontmatter_delimiter }
}

function effectiveI18n (config, collection, target) {
  if (!record(config.i18n) || !(target.i18n ?? collection.i18n)) return null
  if (target !== collection && typeof target.file === 'string' && !target.i18n) return null
  const i18n = { ...config.i18n, ...(record(collection.i18n) ? collection.i18n : {}), ...(record(target.i18n) ? target.i18n : {}) }
  i18n.default_locale ||= i18n.locales?.[0]
  i18n.structure ||= 'single_file'
  const file = target.file || collection.file
  if (typeof file === 'string') i18n.structure = file.includes('{{locale}}') ? 'multiple_files' : i18n.structure === 'single_file_default_root' ? 'single_file_default_root' : 'single_file'
  return i18n
}

function transformEntryData (data, plan, expand, visit) {
  if (plan.rootList) return transformChild(data, plan.children.values().next().value, expand, visit)
  return transformGroupData(data, plan, expand, visit)
}

function localizedTransform (data, plan, expand, i18n, visit) {
  if (i18n?.structure === 'single_file') return record(data) ? Object.fromEntries(Object.entries(data).map(([key, value]) => [key, (i18n.locales || []).includes(key) ? transformEntryData(value, plan, expand, visit) : value])) : data
  if (i18n?.structure === 'single_file_default_root') {
    const otherLocales = (i18n.locales || []).filter(locale => locale !== i18n.default_locale)
    const base = Object.fromEntries(Object.entries(data || {}).filter(([key]) => !otherLocales.includes(key)))
    return { ...transformEntryData(base, plan, expand, visit), ...Object.fromEntries(otherLocales.filter(locale => Object.hasOwn(data, locale)).map(locale => [locale, transformEntryData(data[locale], plan, expand, visit)])) }
  }
  return transformEntryData(data, plan, expand, visit)
}

const emptyValue = value => value == null || value === '' || Array.isArray(value) && !value.length || record(value) && !Object.keys(value).length

function rejectSourceTokens (value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  for (const key of Object.keys(value)) if (key === SOURCE_TOKEN || key.startsWith(GROUP_PREFIX)) throw new Error(`Reserved CMS source key: ${key}`)
  for (const item of Object.values(value)) rejectSourceTokens(item, seen)
}

function createSourcePresence () {
  const snapshots = new Map()
  const remember = snapshot => {
    const token = globalThis.crypto.randomUUID()
    snapshots.set(token, snapshot)
    return token
  }
  const empties = (value, present) => Object.fromEntries([...present].filter(key => Object.hasOwn(value, key) && emptyValue(value[key])).map(key => [key, structuredClone(value[key])]))
  const snapshotFor = token => {
    const snapshot = snapshots.get(token)
    if (!snapshot) throw new Error('The CMS source token is unknown. Reload the entry before saving.')
    return snapshot
  }
  return {
    read (value, plan) {
      const present = new Set(Object.keys(value))
      return { ...value, [SOURCE_TOKEN]: remember({ present, empties: empties(value, present), plan, phase: 'read' }) }
    },
    write (value) {
      const result = { ...value }
      const token = result[SOURCE_TOKEN]
      delete result[SOURCE_TOKEN]
      if (token == null || token === '') return result
      const snapshot = snapshotFor(token)
      if (snapshot.phase !== 'save') throw new Error('The CMS pre-save hook did not prepare this entry. Reload the CMS and retry; no file has been written.')
      // Native ordering can append an empty weight after optional-field omission.
      // It still represents an absent source field, rather than an author edit.
      for (const name of snapshot.plan.children.keys()) if (!snapshot.present.has(name) && emptyValue(result[name])) delete result[name]
      for (const [name, item] of Object.entries(snapshot.empties)) if (!Object.hasOwn(result, name)) result[name] = structuredClone(item)
      return result
    },
    preview (value, plan) {
      const result = { ...value }
      const token = result[SOURCE_TOKEN]
      delete result[SOURCE_TOKEN]
      const present = token ? snapshotFor(token).present : new Set()
      for (const name of plan.children.keys()) if (!present.has(name) && emptyValue(result[name])) delete result[name]
      return result
    },
    prepareSave (entry) {
      let updated = entry
      const visit = (value, path) => {
        if (!value || typeof value !== 'object') return
        const token = value[SOURCE_TOKEN]
        if (token != null && token !== '') {
          const original = snapshotFor(token)
          const plan = original.plan.variants?.get(value[original.plan.typeKey]) || original.plan
          const logical = transformGroupData(value, plan, false)
          const fresh = remember({ ...original, plan, empties: empties(logical, original.present), phase: 'save' })
          updated = updated.setIn([...path, SOURCE_TOKEN], fresh)
        }
        for (const [name, item] of Object.entries(value)) if (name !== SOURCE_TOKEN) visit(item, [...path, Array.isArray(value) ? Number(name) : name])
      }
      const data = entry.get('data')?.toJS?.()
      if (data) visit(data, ['data'])
      const locales = entry.get('i18n')?.toJS?.() || {}
      for (const [locale, localized] of Object.entries(locales)) if (localized.data) visit(localized.data, ['i18n', locale, 'data'])
      return updated
    }
  }
}

// The published configuration is always flat. Only this transaction creates
// virtual objects and custom formats; unsupported clients retain safe schemas.
export function prepareFieldGroups (source, CMS, { enabled = true } = {}) {
  const config = structuredClone(source)
  delete config._anchors
  const plans = new Map()
  const registrations = []
  const presence = createSourcePresence()
  let serial = 0
  const capable = enabled && typeof CMS?.registerCustomFormat === 'function' && typeof CMS?.registerEventListener === 'function'
  const prepare = (collection, file, identity) => {
    const target = file || collection
    if (!Array.isArray(target.fields)) return
    const flat = target.fields.map(cleanField)
    const options = formatOptions(config, collection, file)
    if (!capable || !['yaml', 'yml', 'frontmatter', 'yaml-frontmatter'].includes(options.format)) { target.fields = flat; return }
    const plan = compileFields(target.fields)
    if (!hasGroups(plan)) { target.fields = flat; return }
    const codec = createGroupCodec(options)
    const i18n = effectiveI18n(config, collection, target)
    const format = `sansoul-groups-${serial++}`
    registrations.push([format, options.extension, {
      fromFile: text => {
        const data = codec.fromFile(text)
        rejectSourceTokens(data)
        return localizedTransform(data, plan, true, i18n, presence.read)
      },
      toFile: data => {
        const plain = localizedTransform(data, plan, false, i18n, presence.write)
        rejectSourceTokens(plain)
        return codec.toFile(plain)
      }
    }])
    target.fields = plan.output
    if (typeof target.thumbnail === 'string') target.thumbnail = mapGroupPath(plan, target.thumbnail)
    if (typeof target.summary === 'string') target.summary = rewriteSummary(target.summary, plan)
    target.format = format
    plans.set(identity, plan)
  }
  for (const collection of config.collections || []) {
    if (collection.divider) continue
    if (collection.index_file?.fields) {
      // Index files have an independent schema and format configuration.
      const original = formatOptions(config, collection, collection.index_file)
      prepare(collection, collection.index_file, `${collection.name}/_index`)
      // A flat index must not inherit the entry collection's virtual format.
      if (!collection.index_file.format) collection.index_file.format = original.format
    }
    if (collection.files) for (const file of collection.files) prepare(collection, file, `${collection.name}/${file.name}`)
    else prepare(collection, null, collection.name)
  }
  for (const file of config.singletons || []) prepare({ name: '_singletons' }, file, `_singletons/${file.name}`)
  if (registrations.length) {
    for (const args of registrations) CMS.registerCustomFormat(...args)
    CMS.registerEventListener({ name: 'preSave', handler: ({ entry }) => presence.prepareSave(entry) })
  }
  return {
    config,
    enabled: registrations.length > 0,
    flatten (data, collection, path = '') {
      const plan = plans.get(/\/_index(?:\.[\w-]+)?\.md$/.test(path) ? `${collection}/_index` : collection)
      return plan ? transformEntryData(data, plan, false, presence.preview) : data
    },
    fieldPath (path, collection, entryPath = '') {
      const plan = plans.get(/\/_index(?:\.[\w-]+)?\.md$/.test(entryPath) ? `${collection}/_index` : collection)
      return plan ? mapGroupPath(plan, path) : path
    }
  }
}

export async function loadFieldGroupConfig (document, fetcher = fetch) {
  const href = document.querySelector('link[rel="cms-config-url"]')?.href
  if (!href) throw new Error('SanSoul CMS configuration URL is missing.')
  const response = await fetcher(href)
  if (!response.ok) throw new Error(`SanSoul CMS configuration failed to load (${response.status}).`)
  return parseGroupYAML(await response.text(), { config: true })
}
