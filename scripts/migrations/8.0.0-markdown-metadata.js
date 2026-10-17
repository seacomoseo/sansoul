#!/usr/bin/env node
/*
Purpose: Migrate recognized Markdown metadata without rewriting source formatting.
Run from: Consumer root; --check reports changes without writing.
Writes: Markdown/YAML under content/ and data/. Does not follow symlinks.
*/
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { linkPattern, imagePattern, parseLinkTitle, parseImage, formatImage, escapeMarkdownTitle } from '../../assets/js/cms/markdown-metadata.js'

function migrateText (source) {
  // Images first: link matching deliberately excludes image labels.
  let result = source.replace(new RegExp(imagePattern.source, 'g'), (whole, alt, src, title) => {
    if (!/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(alt)) return whole
    return formatImage(parseImage(alt, src, title))
  })
  result = result.replace(new RegExp(linkPattern.source, 'g'), (whole, button, icon, anchor, closing, url, rawTitle) => {
    if (!rawTitle) return whole
    const { title, tokens } = parseLinkTitle(rawTitle)
    if (!tokens.length) return whole
    const metadata = `${title}${title ? ' ' : ''}{${tokens.join(' ')}}`
    return whole.replace(/"(?:\\.|[^"\\])*"\)$/, () => `"${escapeMarkdownTitle(metadata)}")`)
  })
  return result
}

function mappingIndent (line) {
  const mapping = line.match(/^( *)(-\s+)?(?:[\w.-]+|"[^"]+"|'[^']+'):/)
  return mapping ? mapping[1].length + (mapping[2]?.length ?? 0) : line.match(/^ */)[0].length
}

// Without a YAML parser, only rewrite scalars whose quoting we can preserve.
// Skip the complete YAML region when flow or multiline quoting is ambiguous.
function needsManualYAML (source) {
  let blockIndent = null
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue
    const indent = line.match(/^ */)[0].length
    if (blockIndent !== null) {
      if (indent > blockIndent) continue
      blockIndent = null
    }
    const entry = line.match(/^\s*(?:-\s+)?(?:[\w.-]+|"[^"]+"|'[^']+'):\s*(.*)$/)
    const value = entry ? entry[1] : line.replace(/^\s*(?:-\s+)?/, '')
    if (/(?:^|\s)[|>](?:[+-]?[1-9]?|[1-9][+-]?)(?:\s*(?:#.*)?)$/.test(value) && !/^[|>]/.test(value)) return true
    if (/^[|>](?:[+-]?[1-9]?|[1-9][+-]?)(?:\s*(?:#.*)?)$/.test(value)) {
      blockIndent = mappingIndent(line)
      continue
    }
    if (/^[\[{]/.test(value) || (!entry && /['"]/.test(value) && !/^['"]/.test(value))) return true
    if (/^['"]/.test(value)) {
      const supported = line.match(/^(\s*(?:-\s+)?[\w-]+:\s*)(['"])(.*)\2(\s*(?:#.*)?)$/)
      if (!supported) return true
      if (supported[2] === '"') {
        try { JSON.parse(`"${supported[3]}"`) } catch { return true }
      }
    } else if (/^[&!*?]/.test(value) && /['"\[{]/.test(value)) return true
  }
  return false
}

export function migrateMarkdown (source, { yaml = false, onWarning = () => {} } = {}) {
  if (source.startsWith('\uFEFF')) return '\uFEFF' + migrateMarkdown(source.slice(1), { yaml, onWarning })
  if (yaml && needsManualYAML(source)) {
    if (migrateText(source) !== source) onWarning('Unsupported YAML flow, quoted list, or multiline scalar; preserved this YAML region for manual review.')
    return source
  }
  if (!yaml && /^---\r?\n/.test(source)) {
    const frontMatter = source.match(/^(---\r?\n)([\s\S]*?)(^---[^\S\r\n]*(?:\r?\n|$))/m)
    if (frontMatter) {
      const migrated = migrateMarkdown(frontMatter[2], { yaml: true, onWarning })
      return frontMatter[1] + migrated + frontMatter[3] + migrateLines(source.slice(frontMatter[0].length), false)
    }
  }
  return yaml ? migrateYAML(source, onWarning) : migrateLines(source, false)
}

function migrateYAML (source, onWarning) {
  const lines = source.split(/(?<=\n)/)
  let result = ''
  let plain = ''
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const header = line.match(/^( *)(?:-\s+)?(?:(?:[\w.-]+|"[^"]+"|'[^']+'):\s*)?([|>])([+-]?[1-9]?|[1-9][+-]?)\s*(?:#.*)?(?:\r?\n)?$/)
    if (!header) {
      plain += line
      continue
    }
    result += migrateLines(plain, true) + line
    plain = ''
    const body = []
    const parentIndent = mappingIndent(line)
    while (index + 1 < lines.length) {
      const next = lines[index + 1]
      if (next.trim() && next.match(/^ */)[0].length <= parentIndent) break
      body.push(next)
      index++
    }
    const original = body.join('')
    if (header[2] === '>' || /[1-9]/.test(header[3])) {
      if (migrateText(original) !== original) onWarning('Folded or explicitly indented YAML block preserved for manual review.')
      result += original
      continue
    }
    const nonempty = body.filter(value => value.trim())
    const indent = nonempty.length ? Math.min(...nonempty.map(value => value.match(/^ */)[0].length)) : 0
    const markdown = body.map(value => value.trim() ? value.slice(indent) : value).join('')
    const migrated = migrateLines(markdown, false).split(/(?<=\n)/)
    result += migrated.map((value, row) => body[row]?.trim() ? ' '.repeat(indent) + value : value).join('')
  }
  return result + migrateLines(plain, true)
}

function migrateLines (source, yaml) {
  let fence = ''
  let inline = ''
  return source.split(/(?<=\n)/).map(line => {
    if (!yaml && /^(?: {4}|\t)/.test(line) && !fence) return line
    const marker = line.match(/^\s*(`{3,}|~{3,})/)
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = ''
      return line
    }
    if (marker && !inline) {
      fence = marker[1]
      return line
    }
    // Preserve quoted YAML scalars, including their original quote style.
    const scalar = yaml && !inline && line.match(/^(\s*(?:-\s+)?[\w-]+:\s*)(['"])(.*)\2(\s*(?:#.*)?\r?\n?)$/)
    if (scalar) {
      const [, prefix, quote, encoded, suffix] = scalar
      let value
      try { value = quote === "'" ? encoded.replace(/''/g, "'") : JSON.parse(`"${encoded}"`) } catch { return line }
      const migrated = migrateMarkdown(value)
      if (migrated === value) return line
      return prefix + (quote === "'" ? `'${migrated.replace(/'/g, "''")}'` : JSON.stringify(migrated)) + suffix
    }
    let result = ''
    let offset = 0
    for (const match of line.matchAll(/`+/g)) {
      const chunk = line.slice(offset, match.index)
      result += inline ? chunk : migrateText(chunk)
      result += match[0]
      if (!inline) inline = match[0]
      else if (match[0] === inline) inline = ''
      offset = match.index + match[0].length
    }
    return result + (inline ? line.slice(offset) : migrateText(line.slice(offset)))
  }).join('')
}

export function migrateProject (projectDir, { check = false, onWarning = message => console.warn(message) } = {}) {
  const changed = []
  function visit (directory) {
    if (!fs.existsSync(directory) || !fs.lstatSync(directory).isDirectory()) return
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (entry.isFile() && /\.(md|ya?ml)$/.test(entry.name)) {
        const source = fs.readFileSync(file, 'utf8')
        const migrated = migrateMarkdown(source, { yaml: /\.ya?ml$/.test(entry.name), onWarning: message => onWarning(`${path.relative(projectDir, file)}: ${message}`) })
        if (source === migrated) continue
        changed.push(path.relative(projectDir, file))
        if (!check) fs.writeFileSync(file, migrated)
      }
    }
  }
  for (const directory of ['content', 'data']) visit(path.join(projectDir, directory))
  return changed
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const check = process.argv.includes('--check')
  const changed = migrateProject(process.cwd(), { check })
  console.log(`${check ? 'Would migrate' : 'Migrated'} Markdown metadata in ${changed.length} file(s).`)
  for (const file of changed) console.log(`- ${file}`)
}
