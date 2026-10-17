#!/usr/bin/env node
/*
Purpose: Remove redundant engine selectors and upgrade recognized root wrappers.
Run from: Consumer root; --check reports changes without writing.
Writes: Only regular root hugo.yml and do files. Never moves Git submodules.
*/
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { relativeEnginePath } from '../engine-paths.js'

export const universalWrapper = `#!/bin/sh
set -eu

# Resolve the consumer root before selecting the current or legacy engine.
PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$PROJECT_DIR"
if [ -f ./core/do ]; then
  exec sh ./core/do "$@"
elif [ -f ./themes/sansoul/do ]; then
  exec sh ./themes/sansoul/do "$@"
fi
printf '%s\\n' 'SanSoul is not initialized. Run git submodule update --init --recursive.' >&2
exit 2
`

function scalar (value) {
  const match = /^(?:'([^']*)'|"([^"\\]*)"|([^\s#'"\[\]{},&*!|>]+))\s*(?:#.*)?$/.exec(value.trim())
  return match ? match[1] ?? match[2] ?? match[3] : null
}

function commentOnly (line) {
  // Recognized scalar forms contain no # inside quotes; retain authored notes.
  const comment = line.match(/\s+#[^\r\n]*/)?.[0].trim()
  return comment ? `${comment}${line.endsWith('\r\n') ? '\r\n' : '\n'}` : ''
}

function rootEntries (lines, key) {
  const entries = []
  for (let index = 0; index < lines.length; index++) {
    if (!new RegExp(`^(?:${key}|'${key}'|"${key}")\\s*:`).test(lines[index])) continue
    let end = index + 1
    while (end < lines.length && (!/^(?:[^\s#]|\.\.\.)/.test(lines[end]) || (key === 'theme' && /^-\s/.test(lines[end])))) end++
    entries.push({ start: index, end, value: lines[index].replace(/^[^:]+:/, '').trim() })
  }
  return entries
}

function themeValue (lines, entry) {
  const inline = entry.value.match(/^\[\s*(.*?)\s*\]\s*(?:#.*)?$/)
  if (inline) return scalar(inline[1])
  if (entry.value && !entry.value.startsWith('#')) return scalar(entry.value)
  const items = lines.slice(entry.start + 1, entry.end).filter(line => line.trim() && !/^\s*#/.test(line))
  if (items.length !== 1) return null
  const item = items[0].match(/^\s*-\s+(.+?)\s*$/)
  return item ? scalar(item[1]) : null
}

export function migrateHugoConfig (source, enginePath) {
  if (!['core', 'themes/sansoul'].includes(enginePath)) throw new Error('Unsupported engine layout')
  const warnings = []
  if (/^(?:---|\.\.\.)\s*$/gm.test(source.replace(/^(?:\uFEFF)?---\s*\r?\n/, ''))) {
    return { source, warnings: ['hugo.yml contains multiple YAML documents; review engine selectors and parameter order manually.'] }
  }
  let lines = source.split(/(?<=\n)/)
  const themes = rootEntries(lines, 'theme')
  const directories = rootEntries(lines, 'themesDir')
  const expectedTheme = path.posix.basename(enginePath)
  const expectedDirectory = path.posix.dirname(enginePath)
  const themeKnown = themes.length === 0 || (themes.length === 1 && themeValue(lines, themes[0]) === expectedTheme)
  const directoryKnown = directories.length === 0 || (directories.length === 1 && scalar(directories[0].value) === expectedDirectory)
  if (themeKnown && directoryKnown) {
    const removals = [...themes, ...directories].sort((left, right) => right.start - left.start)
    for (const entry of removals) {
      // Keep blank lines and standalone comments outside the recognized value.
      const replacement = lines.slice(entry.start, entry.end).map(line => {
        if (!line.trim() || /^\s*#/.test(line)) return line
        return commentOnly(line)
      })
      lines.splice(entry.start, entry.end - entry.start, ...replacement)
    }
  } else {
    warnings.push('Custom or unrecognized theme/themesDir in hugo.yml was preserved; review it before changing the engine path.')
  }

  const params = rootEntries(lines, 'params')
  if (params.length === 1 && /^(?:#.*)?$/.test(params[0].value)) {
    const { start, end } = params[0]
    const entries = []
    const children = lines.slice(start + 1, end).filter(line => line.trim() && !/^\s*#/.test(line))
    const indent = Math.min(...children.map(line => line.match(/^ */)[0].length))
    for (let index = start + 1; index < end; index++) {
      const match = /^( +)(domain|owner|name):\s*(.+?)\s*$/.exec(lines[index])
      if (!match || scalar(match[3]) === null) continue
      if (match[1].length === indent) entries.push({ index, key: match[2], line: lines[index] })
    }
    if (entries.length === 3 && new Set(entries.map(entry => entry.key)).size === 3) {
      const ordered = ['domain', 'owner', 'name'].map(key => entries.find(entry => entry.key === key).line)
      entries.forEach((entry, index) => {
        const ending = entry.line.match(/\r?\n$/)?.[0] || ''
        lines[entry.index] = ordered[index].replace(/\r?\n$/, '') + ending
      })
    }
  }
  return { source: lines.join(''), warnings }
}

export function isHistoricalWrapper (source) {
  const lines = source.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (lines[0]?.startsWith('#!')) lines.shift()
  if (lines.length !== 1) return false
  return /^(?:exec\s+)?sh\s+(?:\.\/)?(?:themes\/sansoul|core)\/do\s+(?:\$1|"\$1"|\$@|"\$@")\s*$/.test(lines[0])
}

function atomicWrite (file, source, mode) {
  // The invoking shell may still be reading do. Replacing its inode avoids
  // changing the bytes under that active reader and preserves executable bits.
  const temporary = `${file}.sansoul-${randomUUID()}.tmp`
  try {
    fs.writeFileSync(temporary, source, { flag: 'wx', mode })
    fs.chmodSync(temporary, mode)
    fs.renameSync(temporary, file)
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}

export function migrateProjectConfig (projectDir, { check = false, enginePath = relativeEnginePath(projectDir) } = {}) {
  const changed = []
  const warnings = []
  for (const name of ['hugo.yml', 'do']) {
    const file = path.join(projectDir, name)
    let stat
    try { stat = fs.lstatSync(file) } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    if (!stat.isFile()) {
      warnings.push(`${name} is not a regular file; it was not followed or changed.`)
      continue
    }
    const source = fs.readFileSync(file, 'utf8')
    let next = source
    if (name === 'hugo.yml') {
      const result = migrateHugoConfig(source, enginePath)
      next = result.source
      warnings.push(...result.warnings)
    } else if (isHistoricalWrapper(source)) {
      next = universalWrapper
    } else if (source.replaceAll('\r\n', '\n') !== universalWrapper) {
      warnings.push('Custom do wrapper was preserved; check that it supports core before renaming the submodule.')
    }
    if (next !== source) {
      changed.push(name)
      if (!check) atomicWrite(file, next, stat.mode & 0o777)
    }
  }
  return { changed, warnings }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const check = process.argv.includes('--check')
  const result = migrateProjectConfig(process.cwd(), { check })
  console.log(`${check ? 'Would migrate' : 'Migrated'} project configuration in ${result.changed.length} file(s).`)
  for (const file of result.changed) console.log(`- ${file}`)
  for (const warning of result.warnings) console.warn(`Review: ${warning}`)
}
