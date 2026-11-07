#!/usr/bin/env node
// Run from a consumer root. Plan every custom-schema rename before writing.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

export function migrateCustomFields (source, YAML) {
  const document = YAML.parseDocument(source, { keepSourceTokens: true, uniqueKeys: true })
  if (document.errors.length) throw new Error(document.errors.map(error => error.message).join('; '))
  if (!document.contents) return source
  const edits = []
  function fields (node) {
    if (!YAML.isSeq(node)) throw new Error('Custom fields must be a sequence; aliases require manual expansion')
    for (const field of node.items) {
      if (!YAML.isMap(field)) throw new Error('Each custom field must be a map; aliases require manual expansion')
      if (field.items.some(item => item.key?.value === '<<')) throw new Error('Custom schema YAML merges require manual expansion')
      const old = field.items.find(item => item.key?.value === 'sub')
      const current = field.items.find(item => item.key?.value === 'fields')
      if (old && current) throw new Error('Conflicting custom keys sub and fields; resolve before migration')
      if (old) {
        const [start, end] = old.key.range
        const original = source.slice(start, end)
        const text = original.startsWith('"') ? '"fields"' : original.startsWith("'") ? "'fields'" : 'fields'
        edits.push({ start, end, text })
      }
      const children = (old || current)?.value
      if (children && !YAML.isScalar(children)) fields(children)
      else if (children && children.value != null) throw new Error('Nested custom fields must be a sequence or null')
    }
  }
  fields(document.contents)
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end)
  return source
}

export function migrateProject (project, { check = false } = {}) {
  project = path.resolve(project)
  const data = path.join(project, 'data')
  if (fs.existsSync(data) && fs.lstatSync(data).isSymbolicLink()) throw new Error('Custom schema directory symbolic links require manual migration')
  const candidates = ['data/customs.yml', 'data/customs.yaml'].map(name => path.join(project, name)).filter(file => fs.existsSync(file))
  if (candidates.length > 1) throw new Error('Both customs.yml and customs.yaml exist; resolve before migration')
  if (!candidates.length) return []
  const file = candidates[0]
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Custom schema symbolic links require manual migration')
  const require = createRequire(path.join(project, 'package.json'))
  if (!/^2\./.test(require('yaml/package.json').version)) throw new Error('Install the declared yaml@2 dependency before migrating')
  const source = fs.readFileSync(file, 'utf8')
  const migrated = migrateCustomFields(source, require('yaml'))
  if (source === migrated) return []
  if (!check) fs.writeFileSync(file, migrated)
  return [path.relative(project, file)]
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Usage: 11.0.0-custom-fields.js [--check]')
  const changed = migrateProject(process.cwd(), { check: process.argv.includes('--check') })
  console.log(`${process.argv.includes('--check') ? 'Would migrate' : 'Migrated'} custom fields in ${changed.length} file(s).`)
  for (const file of changed) console.log(`- ${file}`)
}
