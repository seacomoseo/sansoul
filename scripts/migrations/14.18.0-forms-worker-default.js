#!/usr/bin/env node
/*
Purpose: SanSoul 14.18.0 makes the project's own Worker the default form action.
  Existing projects keep posting to the shared Apps Script until someone moves
  them on purpose: when data/styles.yml has no `inputs.action`, pin it to the
  legacy Apps Script URL. Forms with their own `action` are unaffected.
Run from: Consumer root through `sh do update`; --check reports without writing.
Writes: data/styles.yml (comments preserved), only when `inputs.action` is unset.
*/
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseDocument } from 'yaml'

export const LEGACY_GAS_ACTION = 'https://script.google.com/macros/s/AKfycbzEd6cjH5eTjzVxDVk6x-3Q9QwUHDMWpR8V1Ij1g6IG7MYwpPM_epAGpxJUR1__ljrWMQ/exec'

export function migrateProject (projectDir, { check = false } = {}) {
  const file = path.join(projectDir, 'data', 'styles.yml')
  const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const doc = parseDocument(source)
  if (doc.errors.length) throw new Error(`data/styles.yml: ${doc.errors[0].message}`)
  if (doc.contents === null) doc.contents = doc.createNode({})
  const current = doc.getIn(['inputs', 'action'])
  if (current !== undefined && current !== null && String(current).trim() !== '') {
    return { changed: false, action: String(current) }
  }
  if (!check) {
    if (!doc.hasIn(['inputs'])) doc.set('inputs', doc.createNode({}))
    doc.setIn(['inputs', 'action'], LEGACY_GAS_ACTION)
    const node = doc.getIn(['inputs'], true).items.find(pair => String(pair.key?.value ?? pair.key) === 'action')
    // A key added by setIn is a plain string; comments need a Scalar node.
    if (node && typeof node.key !== 'object') node.key = doc.createNode(node.key)
    if (node) node.key.commentBefore = ' Legacy shared Apps Script (pinned by SanSoul 14.18.0). Remove it to use the\n project Worker (D1 + CMS panel) once its mail is set up: see core/forms/README.md.'
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, doc.toString(), 'utf8')
  }
  return { changed: true, action: LEGACY_GAS_ACTION }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const check = process.argv.includes('--check')
  try {
    const result = migrateProject(process.cwd(), { check })
    console.log(result.changed
      ? `${check ? 'Would pin' : 'Pinned'} inputs.action in data/styles.yml to the legacy Apps Script.`
      : 'Keeping the existing inputs.action in data/styles.yml.')
  } catch (error) {
    console.error(error.message)
    process.exit(2)
  }
}
