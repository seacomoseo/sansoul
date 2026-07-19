#!/usr/bin/env node

/*
Purpose: Report consumer migrations between the project package version and
the theme package version currently installed in themes/sansoul.
Run from: Consumer project root through `sh do migrations`.
Writes: Root package.json and package-lock.json only for `mark --yes`.
*/

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const themeDir = path.resolve(scriptDir, '..')
const projectDir = process.cwd()
const migrationsFile = path.join(themeDir, 'MIGRATIONS.md')
const themePackageFile = path.join(themeDir, 'package.json')
const projectPackageFile = path.join(projectDir, 'package.json')
const projectLockFile = path.join(projectDir, 'package-lock.json')

const args = process.argv.slice(2)
const command = args.find(argument => !argument.startsWith('-')) || 'show'
const confirmed = args.includes('--yes')

const validCommands = new Set(['show', 'check', 'mark'])
if (!validCommands.has(command)) {
  fail(`Unknown command: ${command}\nUse show, check, or mark --yes.`)
}

if (!fs.existsSync(projectPackageFile)) {
  fail('Missing root package.json; it is required to record project compatibility.')
}

const themeVersion = parseVersion(
  readJson(themePackageFile).version,
  'theme package version'
)
const projectVersion = parseVersion(
  readJson(projectPackageFile).version,
  'project package version'
)

if (compareVersions(projectVersion, themeVersion) > 0) {
  fail(`Project ${projectVersion.raw} is newer than installed theme ${themeVersion.raw}.`)
}

const pending = readMigrations().filter(migration =>
  compareVersions(migration.version, projectVersion) > 0 &&
  compareVersions(migration.version, themeVersion) <= 0
)
const versionsMatch = compareVersions(projectVersion, themeVersion) === 0

console.log(`Project package: ${projectVersion.raw}`)
console.log(`Theme package:   ${themeVersion.raw}`)

if (pending.length === 0 && versionsMatch) {
  console.log('No pending migrations.')
} else if (pending.length === 0) {
  console.log('No documented migration steps. Validate the project, then synchronize its package version.')
} else {
  console.log(`Pending migrations: ${pending.length}\n`)
  for (const migration of pending) console.log(migration.content.trim(), '\n')
}

if (command === 'check' && !versionsMatch) process.exit(1)

if (command === 'mark') {
  if (!confirmed) {
    fail('Refusing to mark migrations without explicit confirmation. Run `sh do migrations mark --yes` after applying and validating them.')
  }
  updateProjectVersion(themeVersion.raw)
  console.log(`Updated project package version to ${themeVersion.raw}.`)
}

function readMigrations () {
  const source = fs.readFileSync(migrationsFile, 'utf8')
  const headings = [...source.matchAll(/^## (\d+\.\d+\.\d+)(?:\s+.*)?$/gm)]

  return headings.map((heading, index) => {
    const start = heading.index
    const end = headings[index + 1]?.index || source.length
    return {
      version: parseVersion(heading[1], 'migration heading'),
      content: source.slice(start, end)
    }
  }).sort((a, b) => compareVersions(a.version, b.version))
}

function updateProjectVersion (version) {
  const projectPackage = readJson(projectPackageFile)
  projectPackage.version = version
  writeJson(projectPackageFile, projectPackage)

  if (fs.existsSync(projectLockFile)) {
    const projectLock = readJson(projectLockFile)
    projectLock.version = version
    if (projectLock.packages?.['']) projectLock.packages[''].version = version
    writeJson(projectLockFile, projectLock)
  }
}

function readJson (file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeJson (file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function parseVersion (value, label) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value)
  if (!match) fail(`Invalid ${label}: ${value}. Expected x.y.z.`)
  return {
    raw: value,
    parts: match.slice(1).map(Number)
  }
}

function compareVersions (left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left.parts[index] !== right.parts[index]) {
      return left.parts[index] - right.parts[index]
    }
  }
  return 0
}

function fail (message) {
  console.error(message)
  process.exit(2)
}
