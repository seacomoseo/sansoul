#!/usr/bin/env node

/*
Purpose: Rename localized global data files for the content-adapter pipeline.
Run from: Consumer project root after updating SanSoul to 7.0.0.
Writes: Renames content/values.<lang>.yml to content/global.<lang>.yml.
*/

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const contentDir = path.join(projectDir, 'content')
const renamed = []

if (!fs.existsSync(contentDir)) {
  console.log('No content directory found; no localized global files to rename.')
  process.exit()
}

for (const name of fs.readdirSync(contentDir)) {
  if (!/^values\.[^.]+\.ya?ml$/.test(name)) continue

  const source = path.join(contentDir, name)
  const target = path.join(contentDir, name.replace(/^values\./, 'global.'))

  if (fs.existsSync(target)) {
    fail(`Cannot rename ${name}: ${path.basename(target)} already exists.`)
  }

  fs.renameSync(source, target)
  renamed.push(`${name} → ${path.basename(target)}`)
}

if (renamed.length === 0) {
  console.log('No legacy content/values.<lang>.yml files found.')
} else {
  console.log('Renamed localized global data files:')
  for (const item of renamed) console.log(`- ${item}`)
}

function fail (message) {
  console.error(message)
  process.exit(2)
}

