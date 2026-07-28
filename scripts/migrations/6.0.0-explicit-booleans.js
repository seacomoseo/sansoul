#!/usr/bin/env node

/*
Purpose: Replace legacy YAML y/n pseudobooleans with YAML 1.2-safe values.
Run from: Consumer project root after updating SanSoul to 6.0.0.
Writes: Project YAML files and YAML front matter outside generated/vendor paths.
*/

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const excludedDirectories = new Set([
  '.git',
  '.codex',
  'node_modules',
  'public',
  'resources',
  'themes',
  'uploads'
])
const yamlExtensions = new Set(['.yaml', '.yml'])
const markdownExtension = '.md'
const changedFiles = []

for (const file of walk(projectDir)) {
  const extension = path.extname(file).toLowerCase()
  if (!yamlExtensions.has(extension) && extension !== markdownExtension) continue

  const relativeFile = path.relative(projectDir, file)
  const useTriStateNumbers = isAuthorData(relativeFile)
  const source = fs.readFileSync(file, 'utf8')
  const migrated = extension === markdownExtension
    ? migrateMarkdownFrontMatter(source, useTriStateNumbers)
    : migrateYaml(source, useTriStateNumbers)

  if (migrated === source) continue

  fs.writeFileSync(file, migrated, 'utf8')
  changedFiles.push(path.relative(projectDir, file))
}

if (changedFiles.length === 0) {
  console.log('No legacy YAML y/n booleans found.')
} else {
  console.log(`Updated explicit booleans in ${changedFiles.length} files:`)
  for (const file of changedFiles) console.log(`- ${file}`)
}

function * walk (directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue

    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) yield * walk(target)
    if (entry.isFile()) yield target
  }
}

function isAuthorData (file) {
  const normalized = file.split(path.sep).join('/')
  if (normalized === 'data/utilities.yml') return false

  return normalized.startsWith('content/') ||
    normalized.startsWith('data/') ||
    normalized.startsWith('archetypes/') ||
    normalized.startsWith('_examples/content/') ||
    normalized.startsWith('_examples/data/')
}

function migrateMarkdownFrontMatter (source, useTriStateNumbers) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  const boundary = `---${newline}`
  if (!source.startsWith(boundary)) return source

  const end = source.indexOf(`${newline}---`, boundary.length)
  if (end === -1) return source

  const frontMatter = source.slice(boundary.length, end)
  return [
    boundary,
    migrateYaml(frontMatter, useTriStateNumbers),
    source.slice(end)
  ].join('')
}

function migrateYaml (source, useTriStateNumbers) {
  const enabled = useTriStateNumbers ? '1' : 'true'
  const disabled = useTriStateNumbers ? '0' : 'false'

  return source.replace(
    /^([ \t]*(?:#[ \t]*)?[^#:\r\n][^:\r\n]*:[ \t]*)(y|n|true|false)([ \t]*(?:#.*)?)$/gm,
    (_match, prefix, value, suffix) =>
      `${prefix}${value === 'y' || value === 'true' ? enabled : disabled}${suffix}`
  )
}
