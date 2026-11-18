#!/usr/bin/env node
/*
Purpose: SanSoul 14.19.0 renames the data/styles.yml `inputs` key to `form`: global
  defaults for the form block, next to the other block defaults (step, gallery, faq,
  review, when, dot, link, geo). Keys and comments are kept in place; when both keys
  exist, `form` wins and missing keys come from `inputs`. It also applies the CMS order:
  `shadow` right after `colors`, and `box` plus the block defaults last.
Run from: Consumer root through `sh do update`; --check reports without writing.
Writes: data/styles.yml (comments preserved), only when a rename or reorder is needed.
*/
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isMap, parseDocument } from 'yaml'

export function migrateProject (projectDir, { check = false } = {}) {
  const file = path.join(projectDir, 'data', 'styles.yml')
  if (!fs.existsSync(file)) return { changed: false }
  const doc = parseDocument(fs.readFileSync(file, 'utf8'))
  if (doc.errors.length) throw new Error(`data/styles.yml: ${doc.errors[0].message}`)
  if (!isMap(doc.contents)) return { changed: false }
  const pairs = doc.contents.items
  const keyOf = pair => String(pair.key?.value ?? pair.key)
  const inputs = pairs.find(pair => keyOf(pair) === 'inputs')
  const form = pairs.find(pair => keyOf(pair) === 'form')
  if (inputs) {
    if (!form) {
      if (typeof inputs.key === 'object') inputs.key.value = 'form'
      else inputs.key = doc.createNode('form')
    } else {
      if (!isMap(form.value)) form.value = doc.createNode({})
      if (isMap(inputs.value)) {
        for (const item of inputs.value.items) {
          if (!form.value.has(keyOf(item))) form.value.items.push(item)
        }
      }
      doc.contents.items = doc.contents.items.filter(pair => pair !== inputs)
    }
  }
  const before = doc.contents.items.map(keyOf).join()
  doc.contents.items = ordered(doc.contents.items, keyOf)
  const changed = Boolean(inputs) || doc.contents.items.map(keyOf).join() !== before
  if (changed && !check) fs.writeFileSync(file, doc.toString(), 'utf8')
  return { changed }
}

// CMS order: design tokens first (shadow right after colors), then box and block defaults.
const BLOCKS = ['box', 'step', 'gallery', 'faq', 'review', 'when', 'dot', 'link', 'form', 'geo']
function ordered (items, keyOf) {
  const blocks = items.filter(pair => BLOCKS.includes(keyOf(pair)))
    .sort((a, b) => BLOCKS.indexOf(keyOf(a)) - BLOCKS.indexOf(keyOf(b)))
  const rest = items.filter(pair => !BLOCKS.includes(keyOf(pair)))
  const shadow = rest.find(pair => keyOf(pair) === 'shadow')
  const colors = rest.findIndex(pair => keyOf(pair) === 'colors')
  if (shadow && colors !== -1) {
    rest.splice(rest.indexOf(shadow), 1)
    rest.splice(rest.findIndex(pair => keyOf(pair) === 'colors') + 1, 0, shadow)
  }
  return [...rest, ...blocks]
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const check = process.argv.includes('--check')
  try {
    const result = migrateProject(process.cwd(), { check })
    console.log(result.changed
      ? `${check ? 'Would update' : 'Updated'} data/styles.yml (inputs → form and CMS key order).`
      : 'data/styles.yml is already up to date.')
  } catch (error) {
    console.error(error.message)
    process.exit(2)
  }
}
