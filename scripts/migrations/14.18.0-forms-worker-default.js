#!/usr/bin/env node
/*
Purpose: SanSoul 14.18.0 made the project's own Worker the default form action.
  Until 14.29.2 this migration pinned `inputs.action` to the shared Apps Script
  for existing projects. Since 14.29.2 it writes nothing (Loren, 2026-11-27): no
  project uses Apps Script by default; a project opts in only by setting the URL
  by hand. It only reports where an Apps Script action is already pinned.
Run from: Consumer root through `sh do update`; --check behaves the same.
Writes: nothing.
*/
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseDocument } from 'yaml'

export const LEGACY_GAS_ACTION = 'https://script.google.com/macros/s/AKfycbzEd6cjH5eTjzVxDVk6x-3Q9QwUHDMWpR8V1Ij1g6IG7MYwpPM_epAGpxJUR1__ljrWMQ/exec'

export function migrateProject (projectDir) {
  const file = path.join(projectDir, 'data', 'styles.yml')
  const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const doc = parseDocument(source)
  if (doc.errors.length) throw new Error(`data/styles.yml: ${doc.errors[0].message}`)
  const current = doc.contents === null ? undefined : doc.getIn(['inputs', 'action'])
  const action = current === undefined || current === null ? '' : String(current).trim()
  return { changed: false, action: action || 'worker' }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    const { action } = migrateProject(process.cwd())
    console.log(action.includes('script.google.com')
      ? 'data/styles.yml pins inputs.action to an Apps Script. Remove it to use the project Worker (see core/forms/README.md).'
      : 'Forms use the project Worker by default; nothing to change.')
  } catch (error) {
    console.error(error.message)
    process.exit(2)
  }
}
