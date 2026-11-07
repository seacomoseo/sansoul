#!/usr/bin/env node
// Run from a consumer root; plan all composition edits before writing any file.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

export function migrateSource (source, { YAML, markdown = false, section = false, json = false, defaults = false, templateRoot = false } = {}) {
  let prefix = ''
  let suffix = ''
  let body = source
  if (markdown) {
    const match = /^(\uFEFF?---[^\S\r\n]*\r?\n)([\s\S]*?)(^---[^\S\r\n]*(?:\r?\n|$))/m.exec(source)
    if (!match || match.index !== 0) {
      if (/^\uFEFF?(?:\+\+\+\s*\r?\n|\{)/.test(source)) throw new Error('Non-YAML front matter requires manual block migration')
      return source
    }
    prefix = match[1]
    body = match[2]
    suffix = source.slice(prefix.length + body.length)
  }
  const doc = YAML.parseDocument(body, { keepSourceTokens: true, uniqueKeys: true })
  if (doc.errors.length) throw new Error(doc.errors.map(error => error.message).join('; '))
  const edits = []
  const pair = (node, key) => YAML.isMap(node) ? node.items.find(item => item.key?.value === key) : undefined
  function safe (node) {
    if (YAML.isAlias(node) || node?.anchor) throw new Error('Composition aliases/anchors require manual expansion')
    if (YAML.isMap(node)) {
      if (pair(node, '<<')) throw new Error('Composition YAML merges require manual expansion')
      for (const item of node.items) {
        safe(item.key)
        safe(item.value)
      }
    } else if (YAML.isSeq(node)) for (const item of node.items) safe(item)
  }
  const prefixPath = String.raw`(^|(?:box|boxes|modal|modals|section|sections)(?:\[\d*\]|\.\d+)?\.)`
  const targetPath = value => value
    .replace(new RegExp(prefixPath + 'when(?=\\.|$)', 'g'), '$1whens')
    .replace(new RegExp(prefixPath + 'gss_sheet(?=\\.|$)', 'g'), '$1gss.sheet')
    .replace(new RegExp(prefixPath + 'gss$', 'g'), '$1gss.id')

  function composition (node) {
    if (YAML.isSeq(node)) return node.items.map(composition).some(Boolean)
    if (!YAML.isMap(node)) return false
    let changed = false
    const when = pair(node, 'when')
    if (when && YAML.isSeq(when.value)) {
      if (pair(node, 'whens')) throw new Error('Conflicting when and whens; resolve before migration')
      when.key.value = 'whens'
      changed = true
    } else if (when?.value && !YAML.isMap(when.value) && !(YAML.isScalar(when.value) && when.value.value == null)) throw new Error('when must be a list or a defaults map')
    const gss = pair(node, 'gss')
    const sheet = pair(node, 'gss_sheet')
    if (gss && YAML.isScalar(gss.value) && gss.value.value != null) {
      if (typeof gss.value.value !== 'string') throw new Error('Legacy gss identifier must be a string')
      const id = gss.value
      gss.value = doc.createNode({})
      gss.value.add(new YAML.Pair(doc.createNode('id'), id))
      changed = true
    }
    if (sheet) {
      if (gss && YAML.isMap(gss.value) && pair(gss.value, 'sheet')) throw new Error('Conflicting gss_sheet and gss.sheet; resolve before migration')
      let value = gss?.value
      if (!YAML.isMap(value)) {
        if (value && !(YAML.isScalar(value) && value.value == null)) throw new Error('gss must be a map or identifier')
        value = doc.createNode({})
        if (gss) gss.value = value
        else node.add(new YAML.Pair(doc.createNode('gss'), value))
      }
      sheet.key.value = 'sheet'
      value.add(sheet)
      node.items.splice(node.items.indexOf(sheet), 1)
      changed = true
    }
    for (const name of ['get', 'remap']) {
      const rules = pair(node, name)?.value
      if (YAML.isSeq(rules)) for (const rule of rules.items) for (const key of ['from', 'to']) {
        const scalar = pair(rule, key)?.value
        if (YAML.isScalar(scalar) && typeof scalar.value === 'string') {
          const next = name === 'get' && key === 'from' && !scalar.value.startsWith('tpl.') ? scalar.value : targetPath(scalar.value)
          if (next !== scalar.value) {
            scalar.value = next
            changed = true
          }
        }
      }
    }
    for (const item of node.items) if (['tpl', 'section', 'sections', 'params', 'box', 'boxes', 'modal', 'modals', 'footer'].includes(item.key?.value)) changed = composition(item.value) || changed
    return changed
  }
  function render (node) {
    const [start, , end] = node.range
    const leading = node.commentBefore
    node.commentBefore = undefined
    let text = json ? JSON.stringify(node.toJSON()) : YAML.stringify(node, { indentSeq: false, lineWidth: 0 })
    node.commentBefore = leading
    const original = body.slice(start, end)
    if (!json) {
      if (!original.endsWith('\n')) text = text.replace(/\n$/, '')
      const column = start - (body.lastIndexOf('\n', start - 1) + 1)
      text = text.replace(/\n(?=.)/g, '\n' + ' '.repeat(column))
      if (body.includes('\r\n')) text = text.replace(/\n/g, '\r\n')
    }
    edits.push({ start, end, text })
  }
  function owner (node) {
    if (!node) return
    safe(node)
    if (composition(node)) render(node)
  }
  function record (node) {
    owner(pair(node, 'tpl')?.value)
    owner(pair(node, 'footer')?.value)
    if (defaults && YAML.isMap(node)) {
      const nameNode = pair(node, 'name')?.value
      const name = nameNode?.value
      const value = pair(node, 'value')?.value
      if (typeof name === 'string' && /^tpl\./.test(name)) {
        const nextName = targetPath(name)
        if (nextName !== name) {
          nameNode.value = nextName
          render(nameNode)
        }
      }
      if (typeof name === 'string' && /^tpl(?:\.|$)/.test(name) && YAML.isScalar(value) && typeof value.value === 'string' && pair(node, 'type')?.value?.value === 'dict') {
        const old = value.value
        const next = migrateSource(old, { YAML, templateRoot: true })
        if (next !== old) {
          value.value = next
          render(value)
        }
      }
    }
  }
  const root = doc.contents
  if (section || templateRoot) owner(root)
  else if (YAML.isMap(root)) {
    record(root)
    const entries = pair(root, 'defaults')?.value
    if (YAML.isSeq(entries)) for (const item of entries.items) record(item)
  } else if (YAML.isSeq(root)) for (const item of root.items) record(item)
  for (const edit of edits.sort((a, b) => b.start - a.start)) body = body.slice(0, edit.start) + edit.text + body.slice(edit.end)
  if (edits.length) {
    const checked = YAML.parseDocument(body, { uniqueKeys: true })
    if (checked.errors.length || JSON.stringify(checked.toJS()) !== JSON.stringify(doc.toJS())) throw new Error('Cannot preserve composition safely; migrate this file manually')
    if (json) JSON.parse(body)
  }
  return prefix + body + suffix
}

export function migrateProject (project, { check = false } = {}) {
  project = path.resolve(project)
  const require = createRequire(path.join(project, 'package.json'))
  const YAML = require('yaml')
  if (!/^2\./.test(require('yaml/package.json').version)) throw new Error('Install declared yaml@2 before migration')
  const planned = []
  function visit (directory) {
    if (!fs.existsSync(directory)) return
    if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('Symbolic links require manual block migration')
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      const name = path.relative(project, file).split(path.sep).join('/')
      if (entry.isSymbolicLink()) throw new Error(`Symbolic link requires manual migration: ${name}`)
      if (entry.isDirectory()) visit(file)
      else if (/\.(?:md|ya?ml|json)$/.test(entry.name) && entry.name !== 'TODO.md') {
        const source = fs.readFileSync(file, 'utf8')
        const migrated = migrateSource(source, { YAML, markdown: /\.md$/.test(file), section: /^data\/section\//.test(name), defaults: /^data\/defaults\.ya?ml$/.test(name), json: /\.json$/.test(file) })
        if (migrated !== source) planned.push({ file, name, migrated })
      }
    }
  }
  for (const name of ['content', 'data']) visit(path.join(project, name))
  if (!check) for (const item of planned) fs.writeFileSync(item.file, item.migrated)
  return planned.map(item => item.name)
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Usage: 13.0.0-block-defaults.js [--check]')
  const changed = migrateProject(process.cwd(), { check: process.argv.includes('--check') })
  console.log(`${process.argv.includes('--check') ? 'Would migrate' : 'Migrated'} block defaults in ${changed.length} file(s).`)
  for (const file of changed) console.log(`- ${file}`)
}
