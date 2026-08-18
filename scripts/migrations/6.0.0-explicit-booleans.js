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
const themeHugoConfig = path.join(projectDir, 'themes', 'sansoul', 'hugo.default.yml')
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

  const source = fs.readFileSync(file, 'utf8')
  const migrated = extension === markdownExtension
    ? migrateMarkdownFrontMatter(source)
    : migrateYaml(source)

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

if (fs.existsSync(themeHugoConfig)) {
  const themeConfig = fs.readFileSync(themeHugoConfig, 'utf8')
  const hugoVersion = themeConfig.match(/^\s*min:\s*([0-9]+\.[0-9]+\.[0-9]+)\s*$/m)?.[1]
  if (!hugoVersion) throw new Error(`Could not determine Hugo minimum from ${path.relative(projectDir, themeHugoConfig)}`)

  for (const fileName of ['netlify.toml', 'wrangler.toml']) {
    const filePath = path.join(projectDir, fileName)
    if (!fs.existsSync(filePath)) continue

    const source = fs.readFileSync(filePath, 'utf8')
    const migrated = source.replace(
      /^(\s*HUGO_VERSION\s*=\s*["'])([^"']+)(["']\s*(?:#.*)?)$/gm,
      `$1${hugoVersion}$3`
    )
    if (migrated === source) continue

    fs.writeFileSync(filePath, migrated, 'utf8')
    changedFiles.push(fileName)
    console.log(`Synchronized ${fileName} HUGO_VERSION to ${hugoVersion}.`)
  }
} else {
  console.log('No installed theme Hugo configuration found; deployment versions were not changed.')
}

function * walk (directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue

    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) yield * walk(target)
    if (entry.isFile()) yield target
  }
}

function migrateMarkdownFrontMatter (source) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  const boundary = `---${newline}`
  if (!source.startsWith(boundary)) return source

  const end = source.indexOf(`${newline}---`, boundary.length)
  if (end === -1) return source

  const frontMatter = source.slice(boundary.length, end)
  return [
    boundary,
    migrateYaml(frontMatter),
    source.slice(end)
  ].join('')
}

function migrateYaml (source) {
  const enabled = 'true'
  const disabled = 'false'

  return source.replace(
    /^([ \t]*(?:#[ \t]*)?[^#:\r\n][^:\r\n]*:[ \t]*)(y|n|true|false)([ \t]*(?:#.*)?)$/gm,
    (_match, prefix, value, suffix) =>
      `${prefix}${value === 'y' || value === 'true' ? enabled : disabled}${suffix}`
  )
}
