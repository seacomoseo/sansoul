#!/usr/bin/env node
/* Run from a consumer root. Plans every edit before writing; --check is read-only.
Only composition keys are migrated. Source-range edits preserve unrelated YAML,
comments, flow style and Markdown bodies. Requires the consumer's YAML 2 runtime. */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

function yamlRuntime (project) {
  try {
    const require = createRequire(path.join(path.resolve(project), 'package.json'))
    const yaml = require('yaml')
    if (!/^2\./.test(require('yaml/package.json').version)) throw new Error('YAML 2 is required')
    return yaml
  } catch (error) {
    throw new Error(`Authoring migration requires the project's installed yaml@2 dependency. Install the declared dependencies with the project package manager before updating; no files changed. (${error.message})`)
  }
}

export function migrateSource (source, { YAML, section = false, markdown = false, json = false } = {}) {
  let prefix = ''
  let suffix = ''
  let body = source
  if (markdown) {
    const match = /^(\uFEFF?---[^\S\r\n]*\r?\n)([\s\S]*?)(^---[^\S\r\n]*(?:\r?\n|$))/m.exec(source)
    if (!match || match.index !== 0) return source
    prefix = match[1]
    body = match[2]
    suffix = source.slice(prefix.length + body.length)
  }
  const document = YAML.parseDocument(body, { keepSourceTokens: true, uniqueKeys: true })
  if (document.errors.length) throw new Error(document.errors.map(error => error.message).join('; '))
  const edits = []
  const value = node => YAML.isScalar(node) ? node.value : undefined
  const pair = (node, key) => node.items.find(item => value(item.key) === key)
  function replaceScalar (node, next) {
    if (!YAML.isScalar(node)) throw new Error('Expected a scalar authoring value')
    const original = body.slice(node.range[0], node.range[1])
    const text = json || original.startsWith('"') ? JSON.stringify(next) : original.startsWith("'") ? `'${String(next).replace(/'/g, "''")}'` : String(next)
    edits.push({ start: node.range[0], end: node.range[1], text })
  }
  function remove (node, item) {
    const index = node.items.indexOf(item)
    const start = item.key.range[0]
    const end = item.value?.range?.[1] ?? item.key.range[1] + 1
    let text = ''
    if (node.flow) {
      const tokens = node.srcToken.items
      if (index < node.items.length - 1) {
        const comma = tokens[index + 1].start.find(token => token.type === 'comma')
        if (!comma) throw new Error('Cannot safely remove flow property')
        edits.push({ start: comma.offset, end: comma.offset + 1, text: '' })
      } else if (index > 0) {
        const comma = tokens[index].start.find(token => token.type === 'comma')
        if (!comma) throw new Error('Cannot safely remove flow property')
        edits.push({ start: comma.offset, end: comma.offset + 1, text: '' })
      }
    } else if (node.items.length === 1) text = '{}'
    edits.push({ start, end, text })
  }
  function rename (node, from, to) {
    const old = pair(node, from)
    if (!old) return
    if (pair(node, to)) throw new Error(`Conflicting composition keys ${from} and ${to}; resolve before migration`)
    replaceScalar(old.key, to)
  }
  function migrateFull (node) {
    if (YAML.isAlias(node)) throw new Error('Composition aliases require manual expansion before migration')
    if (!YAML.isMap(node)) return
    if (pair(node, '<<')) throw new Error('Composition YAML merges require manual expansion before migration')
    const full = pair(node, 'full')
    if (!full) return
    const enabled = value(full.value)
    if (enabled === true) {
      if (pair(node, 'fit')) throw new Error('Conflicting full and fit on an input/link; resolve before migration')
      replaceScalar(full.key, 'fit')
      // Numeric values must remain numeric, even if the YAML key was quoted.
      edits.push({ start: full.value.range[0], end: full.value.range[1], text: '1' })
    } else if (enabled === false || enabled == null) remove(node, full)
    else throw new Error('full on an input/link must be true, false or null; resolve before migration')
  }
  const seen = new Set()
  function composition (node, role = '') {
    if (!node) return
    if (YAML.isAlias(node)) throw new Error('Composition aliases require manual expansion before migration')
    if (YAML.isSeq(node)) { for (const item of node.items) composition(item, role); return }
    if (!YAML.isMap(node) || seen.has(node)) return
    seen.add(node)
    if (pair(node, '<<')) throw new Error('Composition YAML merges require manual expansion before migration')
    rename(node, 'map', 'geo')
    if (role === 'box') {
      const grow = pair(node, 'grow')
      if (grow && value(grow.value) === true) {
        if (pair(node, 'align_x')) throw new Error('Conflicting box.grow and box.align_x; resolve before migration')
        replaceScalar(grow.key, 'align_x')
        replaceScalar(grow.value, 'grow')
      }
    }
    const sort = pair(node, 'sort')?.value
    if (value(sort) === 'map') replaceScalar(sort, 'geo')
    if (YAML.isSeq(sort)) for (const item of sort.items) if (value(item) === 'map') replaceScalar(item, 'geo')
    for (const item of node.items) {
      const key = value(item.key)
      if (['box', 'boxes'].includes(key)) composition(item.value, 'box')
      else if (['tpl', 'section', 'sections', 'params', 'modal', 'modals', 'footer'].includes(key)) composition(item.value)
      else if (['inputs', 'links'].includes(key)) {
        if (YAML.isSeq(item.value)) for (const child of item.value.items) migrateFull(child)
      }
    }
  }
  const root = document.contents
  if (section) composition(root)
  else if (YAML.isMap(root)) {
    for (const item of root.items) {
      const key = value(item.key)
      if (key === 'tpl' || key === 'footer') composition(item.value)
    }
    // Defaults are lists of selectors with a tpl payload, not arbitrary trees.
    const defaults = pair(root, 'defaults')?.value
    if (YAML.isSeq(defaults)) for (const entry of defaults.items) if (YAML.isMap(entry)) composition(pair(entry, 'tpl')?.value)
  } else if (YAML.isSeq(root)) {
    for (const entry of root.items) if (YAML.isMap(entry)) composition(pair(entry, 'tpl')?.value)
  }
  edits.sort((left, right) => right.start - left.start)
  for (let index = 0; index < edits.length; index++) {
    if (index && edits[index].end > edits[index - 1].start) throw new Error('Overlapping authoring edits; manual review required')
    body = body.slice(0, edits[index].start) + edits[index].text + body.slice(edits[index].end)
  }
  const result = prefix + body + suffix
  if (edits.length) {
    const parsed = YAML.parseDocument(body)
    if (parsed.errors.length) throw new Error('Migration would produce invalid YAML; no files changed')
    if (json) JSON.parse(body)
  }
  return result
}

export function migrateProject (project, { check = false } = {}) {
  const YAML = yamlRuntime(project)
  const planned = []
  const errors = []
  function visit (directory) {
    if (!fs.existsSync(directory)) return
    if (fs.lstatSync(directory).isSymbolicLink()) { errors.push(`${path.relative(project, directory)}: symbolic links are not accepted`); return }
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      const relative = path.relative(project, file).split(path.sep).join('/')
      if (entry.isSymbolicLink()) { errors.push(`${relative}: symbolic links are not accepted`); continue }
      if (entry.isDirectory()) { visit(file); continue }
      if (!entry.isFile() || !/\.(?:md|ya?ml|json)$/.test(entry.name) || entry.name === 'TODO.md') continue
      const source = fs.readFileSync(file, 'utf8')
      try {
        const migrated = migrateSource(source, { YAML, section: /^data\/section\//.test(relative), markdown: /\.md$/.test(file), json: /\.json$/.test(file) })
        if (migrated !== source) planned.push({ file, relative, source: migrated })
      } catch (error) { errors.push(`${relative}: ${error.message}`) }
    }
  }
  for (const name of ['content', 'data']) visit(path.join(project, name))
  if (errors.length) throw new Error(`Authoring migration stopped before writing:\n${errors.join('\n')}`)
  if (!check) for (const entry of planned) fs.writeFileSync(entry.file, entry.source)
  return planned.map(entry => entry.relative)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Usage: 9.0.0-authoring-layout.js [--check]')
  const changed = migrateProject(process.cwd(), { check: process.argv.includes('--check') })
  console.log(`${process.argv.includes('--check') ? 'Would migrate' : 'Migrated'} authoring layout in ${changed.length} file(s).`)
  for (const file of changed) console.log(`- ${file}`)
}
