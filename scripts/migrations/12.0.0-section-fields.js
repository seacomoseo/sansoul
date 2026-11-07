#!/usr/bin/env node
/* Run from a consumer root. Only concrete tpl.sections entries lose their params
wrapper. Plan all files before writing; --check is read-only. Preserve source
outside each affected section, and retain YAML comments and scalar styles inside
it. Alias/merge compositions require explicit expansion before migration. */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

function yamlRuntime (project) {
  const require = createRequire(path.join(path.resolve(project), 'package.json'))
  if (!/^2\./.test(require('yaml/package.json').version)) throw new Error('Install the declared yaml@2 dependency before migrating section fields')
  return require('yaml')
}

export function migrateSource (source, { YAML, markdown = false, json = false, defaults = false, templateRoot = false, sectionsRoot = false } = {}) {
  let prefix = ''
  let suffix = ''
  let body = source
  if (markdown) {
    const match = /^(\uFEFF?---[^\S\r\n]*\r?\n)([\s\S]*?)(^---[^\S\r\n]*(?:\r?\n|$))/m.exec(source)
    if (!match || match.index !== 0) {
      if (/^\uFEFF?(?:\+\+\+[^\S\r\n]*\r?\n|\{)/.test(source)) throw new Error('Non-YAML front matter requires manual section migration before update')
      return source
    }
    prefix = match[1]
    body = match[2]
    suffix = source.slice(prefix.length + body.length)
  }
  const document = YAML.parseDocument(body, { keepSourceTokens: true, uniqueKeys: true })
  if (document.errors.length) throw new Error(document.errors.map(error => error.message).join('; '))
  const pair = (node, key) => YAML.isMap(node) ? node.items.find(item => item.key?.value === key) : undefined
  const edits = []
  function safe (node) {
    if (YAML.isAlias(node) || node?.anchor) throw new Error('Section aliases and anchors require manual expansion before migration')
    if (YAML.isMap(node)) {
      if (pair(node, '<<')) throw new Error('Section YAML merges require manual expansion before migration')
      for (const item of node.items) {
        safe(item.key)
        safe(item.value)
      }
    } else if (YAML.isSeq(node)) for (const item of node.items) safe(item)
  }
  const comments = (...values) => values.filter(value => value != null && value !== '').join('\n') || undefined
  function flatten (section) {
    if (YAML.isAlias(section)) throw new Error('Section aliases require manual expansion before migration')
    if (!YAML.isMap(section)) return
    if (pair(section, '<<')) throw new Error('Section YAML merges require manual expansion before migration')
    const wrapper = pair(section, 'params')
    if (!wrapper) return
    safe(section)
    if (wrapper.value && !(YAML.isScalar(wrapper.value) && wrapper.value.value == null) && !YAML.isMap(wrapper.value)) throw new Error('Section params must be a map or null before flattening')
    const children = YAML.isMap(wrapper.value) ? wrapper.value.items : []
    for (const child of children) {
      if (!YAML.isScalar(child.key) || typeof child.key.value !== 'string') throw new Error('Section field names must be strings')
      if (child.key.value === 'params' || pair(section, child.key.value)) throw new Error(`Conflicting section field ${child.key.value}; resolve before migration`)
    }
    const index = section.items.indexOf(wrapper)
    const before = comments(wrapper.key.commentBefore, wrapper.key.comment, wrapper.value?.commentBefore)
    const after = wrapper.value?.comment
    section.items.splice(index, 1, ...children)
    if (children.length) {
      children[0].key.commentBefore = comments(before, children[0].key.commentBefore)
      const last = children.at(-1)
      const target = last.value || last.key
      target.comment = comments(target.comment, after)
    } else {
      const next = section.items[index]
      if (next) next.key.commentBefore = comments(before, after, next.key.commentBefore)
      else section.comment = comments(section.comment, before, after)
    }
    const [start, , end] = section.range
    const original = body.slice(start, end)
    // Leading map comments live before its source range and remain in place.
    const leading = section.commentBefore
    section.commentBefore = undefined
    let text = json ? JSON.stringify(section.toJSON()) : YAML.stringify(section, { lineWidth: 0 })
    section.commentBefore = leading
    const column = start - (body.lastIndexOf('\n', start - 1) + 1)
    if (!json) {
      if (!original.endsWith('\n')) text = text.replace(/\n$/, '')
      text = text.replace(/\n(?=.)/g, '\n' + ' '.repeat(column))
      if (body.includes('\r\n')) text = text.replace(/\n/g, '\r\n')
    }
    edits.push({ start, end, text })
  }
  function template (node) {
    if (YAML.isAlias(node)) throw new Error('Template aliases require manual expansion before migration')
    if (!YAML.isMap(node)) return
    if (pair(node, '<<')) throw new Error('Template YAML merges require manual expansion before migration')
    const sections = pair(node, 'sections')?.value
    if (YAML.isAlias(sections)) throw new Error('Section aliases require manual expansion before migration')
    if (YAML.isSeq(sections)) for (const section of sections.items) flatten(section)
  }
  function defaultRecord (entry) {
    if (defaults && YAML.isAlias(entry)) throw new Error('Default record aliases require manual expansion before migration')
    template(pair(entry, 'tpl')?.value)
    if (!defaults || !YAML.isMap(entry)) return
    const name = pair(entry, 'name')?.value?.value
    const field = pair(entry, 'value')
    if (!field || !['tpl', 'tpl.sections'].includes(name)) return
    if (pair(entry, 'type')?.value?.value !== 'dict' || !YAML.isScalar(field.value) || typeof field.value.value !== 'string') throw new Error('Serialized template defaults require a string value and type: dict')
    const original = field.value.value
    let serializedJSON = false
    try { JSON.parse(original); serializedJSON = true } catch {}
    const migrated = migrateSource(original, { YAML, json: serializedJSON, templateRoot: name === 'tpl', sectionsRoot: name === 'tpl.sections' })
    if (migrated === original) return
    field.value.value = migrated
    const [start, , end] = field.value.range
    const leading = field.value.commentBefore
    field.value.commentBefore = undefined
    let text = YAML.stringify(field.value, { lineWidth: 0 })
    field.value.commentBefore = leading
    if (!body.slice(start, end).endsWith('\n')) text = text.replace(/\n$/, '')
    const column = field.key.range[0] - (body.lastIndexOf('\n', field.key.range[0] - 1) + 1)
    text = text.replace(/\n(?=.)/g, '\n' + ' '.repeat(column + (field.value.type?.startsWith('BLOCK_') ? 2 : 0)))
    if (body.includes('\r\n')) text = text.replace(/\n/g, '\r\n')
    edits.push({ start, end, text })
  }
  const root = document.contents
  if (templateRoot) template(root)
  else if (sectionsRoot && YAML.isSeq(root)) for (const section of root.items) flatten(section)
  else if (YAML.isMap(root)) {
    template(pair(root, 'tpl')?.value)
    const defaults = pair(root, 'defaults')?.value
    if (YAML.isSeq(defaults)) for (const entry of defaults.items) defaultRecord(entry)
  } else if (YAML.isSeq(root)) {
    for (const entry of root.items) defaultRecord(entry)
  }
  for (const edit of edits.sort((left, right) => right.start - left.start)) body = body.slice(0, edit.start) + edit.text + body.slice(edit.end)
  if (edits.length) {
    const checked = YAML.parseDocument(body, { uniqueKeys: true })
    if (checked.errors.length || JSON.stringify(checked.toJS()) !== JSON.stringify(document.toJS())) throw new Error('Section migration cannot preserve this source safely; migrate the affected section manually')
    if (json) JSON.parse(body)
  }
  return prefix + body + suffix
}

export function migrateProject (project, { check = false } = {}) {
  project = path.resolve(project)
  const YAML = yamlRuntime(project)
  const planned = []
  const errors = []
  function visit (directory) {
    if (!fs.existsSync(directory)) return
    if (fs.lstatSync(directory).isSymbolicLink()) {
      errors.push(`${path.relative(project, directory)}: symbolic links are not accepted`)
      return
    }
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      const relative = path.relative(project, file).split(path.sep).join('/')
      if (entry.isSymbolicLink()) {
        errors.push(`${relative}: symbolic links are not accepted`)
        continue
      }
      if (entry.isDirectory()) visit(file)
      else if (entry.isFile() && /\.(?:md|ya?ml|json)$/.test(entry.name) && entry.name !== 'TODO.md') {
        try {
          const source = fs.readFileSync(file, 'utf8')
          const migrated = migrateSource(source, { YAML, markdown: /\.md$/.test(file), json: /\.json$/.test(file), defaults: /^data\/defaults\.ya?ml$/.test(relative) })
          if (migrated !== source) planned.push({ file, relative, source: migrated })
        } catch (error) { errors.push(`${relative}: ${error.message}`) }
      }
    }
  }
  for (const name of ['content', 'data']) visit(path.join(project, name))
  if (errors.length) throw new Error(`Section migration stopped before writing:\n${errors.join('\n')}`)
  if (!check) for (const entry of planned) fs.writeFileSync(entry.file, entry.source)
  return planned.map(entry => entry.relative)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Usage: 12.0.0-section-fields.js [--check]')
  const changed = migrateProject(process.cwd(), { check: process.argv.includes('--check') })
  console.log(`${process.argv.includes('--check') ? 'Would migrate' : 'Migrated'} section fields in ${changed.length} file(s).`)
  for (const file of changed) console.log(`- ${file}`)
}
