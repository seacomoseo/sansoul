#!/usr/bin/env node

/*
Purpose: Remove the legacy PurgeCSS/PostCSS consumer configuration and
  ensure the shared image, Sass and icon dependencies are declared.
Run from: Consumer project root after updating SanSoul to 6.0.2.
Writes: Root package.json and .gitignore; removes known generated files.
*/

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const packageFile = path.join(projectDir, 'package.json')
const packageLockFile = path.join(projectDir, 'package-lock.json')
const gitignoreFile = path.join(projectDir, '.gitignore')
const postcssFile = path.join(projectDir, 'postcss.config.js')
const hugoStatsFile = path.join(projectDir, 'hugo_stats.json')
const legacyDependencies = new Set([
  '@fullhuman/postcss-purgecss',
  'postcss',
  'purgecss'
])
const dependencySections = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies'
]
const requiredProjectDependencies = {
  '@fortawesome/fontawesome-free': '^7.0.1',
  'simple-icons': '^15.12.0',
  'sass-embedded': '^1.100.0',
  sharp: '^0.35.3',
  'sharp-ico': '^0.1.5'
}
const legacyPostcssHash =
  'ae359aa3d9fd8b870d8358f1083f3e93e37d3e363cc0535e212371d5c1970a0b'
const changed = []
const warnings = []

if (!fs.existsSync(packageFile)) {
  fail('Missing root package.json.')
}

removeDependencies()
ensureProjectDependencies()
removeGitignoreEntries()
removeGeneratedFile(hugoStatsFile)
removeLegacyPostcss()

if (changed.length === 0) {
  console.log('No legacy PurgeCSS/PostCSS consumer files found.')
} else {
  console.log('Applied the SanSoul 6.0.2 CSS cleanup:')
  for (const item of changed) console.log(`- ${item}`)
}

if (packageLockNeedsSync()) {
  console.log('- Run `npm install` to synchronize package-lock.json and installed dependencies.')
}

for (const warning of warnings) console.warn(`WARNING: ${warning}`)

function removeDependencies () {
  const packageJson = readJson(packageFile)
  const removed = []

  for (const section of dependencySections) {
    if (!packageJson[section]) continue

    for (const dependency of legacyDependencies) {
      if (!(dependency in packageJson[section])) continue
      delete packageJson[section][dependency]
      removed.push(`${section}.${dependency}`)
    }
  }

  if (removed.length === 0) return

  fs.writeFileSync(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')
  changed.push(`Removed dependencies: ${removed.join(', ')}`)
}

function ensureProjectDependencies () {
  const packageJson = readJson(packageFile)
  const added = []
  const moved = []
  const upgraded = []

  packageJson.dependencies ||= {}
  packageJson.devDependencies ||= {}

  for (const [dependency, version] of Object.entries(requiredProjectDependencies)) {
    const fromDependencies = packageJson.dependencies[dependency]
    const fromDevDependencies = packageJson.devDependencies[dependency]
    const current = fromDependencies || fromDevDependencies

    if (fromDevDependencies && !fromDependencies) {
      delete packageJson.devDependencies[dependency]
      moved.push(dependency)
    }

    if (!current) {
      packageJson.dependencies[dependency] = version
      added.push(`${dependency}@${version}`)
      continue
    }

    if (dependency === 'sharp' && current === '^0.33.5') {
      packageJson.dependencies[dependency] = version
      upgraded.push(`${dependency} ${current} → ${version}`)
    } else if (!fromDependencies) {
      packageJson.dependencies[dependency] = current
    }
  }

  if (added.length === 0 && moved.length === 0 && upgraded.length === 0) return

  for (const section of ['dependencies', 'devDependencies']) {
    if (Object.keys(packageJson[section]).length === 0) delete packageJson[section]
  }

  fs.writeFileSync(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')
  if (added.length > 0) changed.push(`Added project dependencies: ${added.join(', ')}`)
  if (moved.length > 0) changed.push(`Moved project dependencies to dependencies: ${moved.join(', ')}`)
  if (upgraded.length > 0) changed.push(`Updated project dependencies: ${upgraded.join(', ')}`)
}

function removeGitignoreEntries () {
  if (!fs.existsSync(gitignoreFile)) return

  const source = fs.readFileSync(gitignoreFile, 'utf8')
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  const finalNewline = source.endsWith('\n')
  const lines = source.split(/\r?\n/)
  if (finalNewline) lines.pop()

  const filtered = lines.filter(line => {
    const entry = line.trim()
    return entry !== 'hugo_stats.json' && entry !== 'postcss.config.js'
  })

  if (filtered.length === lines.length) return

  const result = filtered.join(newline) + (finalNewline ? newline : '')
  fs.writeFileSync(gitignoreFile, result, 'utf8')
  changed.push('Removed legacy entries from .gitignore')
}

function removeGeneratedFile (file) {
  if (!fs.existsSync(file)) return
  fs.rmSync(file)
  changed.push(`Removed ${path.basename(file)}`)
}

function removeLegacyPostcss () {
  if (!fs.existsSync(postcssFile)) return

  const source = fs.readFileSync(postcssFile, 'utf8').replace(/\r\n/g, '\n')
  const hash = crypto.createHash('sha256').update(source).digest('hex')

  if (hash !== legacyPostcssHash) {
    warnings.push(
      'Kept postcss.config.js because it differs from the former generated SanSoul configuration; review it manually.'
    )
    return
  }

  fs.rmSync(postcssFile)
  changed.push('Removed the former generated postcss.config.js')
}

function readJson (file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    fail(`Cannot parse ${path.basename(file)}: ${error.message}`)
  }
}

function packageLockNeedsSync () {
  if (!fs.existsSync(packageLockFile)) return false

  const packageLock = readJson(packageLockFile)
  const rootPackage = packageLock.packages?.[''] || packageLock

  const hasLegacyDependencies = dependencySections.some(section =>
    [...legacyDependencies].some(dependency =>
      dependency in (rootPackage[section] || {})
    )
  )

  const hasUnsynchronizedRequiredDependencies = Object.entries(requiredProjectDependencies).some(
    ([dependency, version]) => rootPackage.dependencies?.[dependency] !== version ||
      !packageLock.packages?.[`node_modules/${dependency}`]
  )

  return hasLegacyDependencies || hasUnsynchronizedRequiredDependencies
}

function fail (message) {
  console.error(message)
  process.exit(2)
}
