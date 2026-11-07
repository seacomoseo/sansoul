#!/usr/bin/env node
/* Run from a consumer root. Plans every edit before writing; --check is read-only.
Only recognized authoring contexts and Markdown link metadata are migrated. Source-range edits preserve unrelated YAML,
comments, flow style and Markdown bodies. Requires the consumer's YAML 2 runtime. */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

function yamlRuntime (project) {
  try {
    const require = createRequire(path.join(path.resolve(project), 'package.json'))
    const yaml = require('yaml')
    if (!/^2\./.test(require('yaml/package.json').version)) throw new Error('YAML 2 is required')
    return yaml
  } catch (error) {
    throw new Error(`Authoring migration requires the project's installed yaml@2 dependency. Install the declared dependencies with the project package manager before updating; no files changed. (${error.message})`)
  }
}

// Operate only in link-title metadata, outside fenced, indented and inline code.
export function migrateMarkdown (source) {
  let fence = ''
  let inline = ''
  function titleMetadata (whole, title) {
    const metadata = /(?:\{([^{}]+)\}|\[([^\[\]]+)\])$/.exec(title)
    if (!metadata) return whole
    const original = metadata[1] ?? metadata[2]
    const tokens = original.split(/(\s+)/).map(token => token === 'homefollow' ? 'sublock' : token === 'ga4' ? 'ga4:contact' : token)
    if (tokens.join('') === original) return whole
    const next = title.slice(0, metadata.index) + '{' + tokens.join('') + '}'
    const offset = whole.lastIndexOf(title)
    return whole.slice(0, offset) + next + whole.slice(offset + title.length)
  }
  function text (chunk) {
    // Nested labels cover button syntax and linked images, while the lookbehind
    // leaves standalone image titles untouched. Quote style is preserved.
    return chunk.replace(/(?<!!)\[(?:[^\[\]\n\\]|\\.|\[(?:[^\[\]\n\\]|\\.)*\])+\]\([^\n]*?\s+(["'])((?:\\.|(?!\1)[^\\])*)\1\)/g,
      (whole, quote, title) => titleMetadata(whole, title))
      .replace(/^( {0,3}\[[^\]\n]+\]:[^\n]*?\s+)(["'])((?:\\.|(?!\2)[^\\])*)\2(?=\s*$)/g,
        (whole, prefix, quote, title) => titleMetadata(whole, title))
      .replace(/(?<!!)\[(?:[^\[\]\n\\]|\\.|\[(?:[^\[\]\n\\]|\\.)*\])+\]\([^\n]*?\s+\(((?:\\.|[^)\\])*)\)\)/g,
        (whole, title) => titleMetadata(whole, title))
  }
  return source.split(/(?<=\n)/).map(line => {
    const marker = /^(?: {0,3})(`{3,}|~{3,})/.exec(line)
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = ''
      return line
    }
    if (marker && !inline) {
      fence = marker[1]
      return line
    }
    if (!inline && /^(?: {4}|\t)/.test(line)) return line
    let result = ''
    let offset = 0
    for (const match of line.matchAll(/`+/g)) {
      const chunk = line.slice(offset, match.index)
      result += (inline ? chunk : text(chunk)) + match[0]
      if (!inline) inline = match[0]
      else if (inline === match[0]) inline = ''
      offset = match.index + match[0].length
    }
    return result + (inline ? line.slice(offset) : text(line.slice(offset)))
  }).join('')
}

export function migrateSource (source, { YAML, section = false, markdown = false, json = false, index = false, type = false, config = false, global = false } = {}) {
  let prefix = ''
  let suffix = ''
  let body = source
  if (markdown) {
    const match = /^(\uFEFF?---[^\S\r\n]*\r?\n)([\s\S]*?)(^---[^\S\r\n]*(?:\r?\n|$))/m.exec(source)
    if (!match || match.index !== 0) {
      if (/^\uFEFF?(?:\+\+\+\s*\r?\n|\{)/.test(source)) throw new Error('Non-YAML front matter requires manual authoring migration before update')
      return migrateMarkdown(source)
    }
    prefix = match[1]
    body = match[2]
    suffix = source.slice(prefix.length + body.length)
  }
  const document = YAML.parseDocument(body, { keepSourceTokens: true, uniqueKeys: true })
  if (document.errors.length) throw new Error(document.errors.map(error => error.message).join('; '))
  const edits = []
  const value = node => YAML.isScalar(node) ? node.value : undefined
  const pair = (node, key) => node.items.find(item => value(item.key) === key)
  function replaceScalar (node, next) {
    if (!YAML.isScalar(node)) throw new Error('Expected a scalar authoring value')
    const original = body.slice(node.range[0], node.range[1])
    const text = json || original.startsWith('"') || next === '' ? JSON.stringify(next) : original.startsWith("'") ? `'${String(next).replace(/'/g, "''")}'` : String(next)
    edits.push({ start: node.range[0], end: node.range[1], text })
  }
  function remove (node, item) {
    const index = node.items.indexOf(item)
    let start = item.key.range[0]
    let end = item.value?.range?.[1] ?? item.key.range[1] + 1
    let text = ''
    if (node.flow) {
      const tokens = node.srcToken.items
      if (index < node.items.length - 1) {
        const comma = tokens[index + 1].start.find(token => token.type === 'comma')
        if (!comma) throw new Error('Cannot safely remove flow property')
        edits.push({ start: comma.offset, end: comma.offset + 1, text: '' })
      } else if (index > 0) {
        const comma = tokens[index].start.find(token => token.type === 'comma')
        if (!comma) throw new Error('Cannot safely remove flow property')
        edits.push({ start: comma.offset, end: comma.offset + 1, text: '' })
      }
    } else if (node.items.length === 1) text = '{}'
    else {
      const lineStart = body.lastIndexOf('\n', start - 1) + 1
      const lineEnd = body.indexOf('\n', end)
      const tail = body.slice(end, lineEnd < 0 ? body.length : lineEnd)
      if (/^[ \t]*$/.test(body.slice(lineStart, start))) {
        if (body[end - 1] === '\n') start = lineStart
        else if (/^[ \t\r]*$/.test(tail)) {
          start = lineStart
          end = lineEnd < 0 ? body.length : lineEnd + 1
        }
      }
    }
    edits.push({ start, end, text })
  }
  function rename (node, from, to) {
    const old = pair(node, from)
    if (!old) return
    if (pair(node, to)) throw new Error(`Conflicting composition keys ${from} and ${to}; resolve before migration`)
    replaceScalar(old.key, to)
  }
  function analytics (node) {
    const ga4 = pair(node, 'ga4')
    if (value(ga4?.value) === true) replaceScalar(ga4.value, 'contact')
    else if ([false, ''].includes(value(ga4?.value))) replaceScalar(ga4.value, 'none')
  }
  function assertMap (node) {
    if (YAML.isAlias(node)) throw new Error('Authoring aliases require manual expansion before migration')
    if (YAML.isMap(node) && pair(node, '<<')) throw new Error('Authoring YAML merges require manual expansion before migration')
  }
  const seen = new Set()
  function composition (node, role = '') {
    if (!node) return
    assertMap(node)
    if (YAML.isSeq(node)) {
      for (const item of node.items) composition(item, role)
      return
    }
    if (!YAML.isMap(node) || seen.has(node)) return
    seen.add(node)
    if (['box', 'gallery'].includes(role)) rename(node, 'pin', 'il')
    if (role === 'link') rename(node, 'icon', 'il')
    if (role === 'review') {
      rename(node, 'icon', 'il')
      rename(node, 'icon_right', 'ir')
    }
    if (['box', 'link', 'form', 'gallery'].includes(role)) analytics(node)
    for (const item of node.items) {
      const key = value(item.key)
      if (['box', 'boxes'].includes(key)) composition(item.value, 'box')
      else if (['link', 'links', 'dots', 'callnow', 'callnows'].includes(key)) composition(item.value, 'link')
      else if (['review', 'reviews'].includes(key)) composition(item.value, 'review')
      else if (key === 'gallery') composition(item.value, 'gallery')
      else if (key === 'items' && role === 'link') composition(item.value, 'link')
      else if (key === 'form') composition(item.value, 'form')
      else if (key === 'menu') {
        assertMap(item.value)
        if (YAML.isMap(item.value)) composition(pair(item.value, 'items')?.value, 'link')
      } else if (['tpl', 'section', 'sections', 'params', 'modal', 'modals', 'footer'].includes(key)) composition(item.value)
    }
  }
  const root = document.contents
  if (section) composition(root, 'box')
  else if (YAML.isMap(root)) {
    if (index || type) rename(root, 'permalinks', 'prefix')
    if (config) {
      rename(root, 'webp', 'imgs_webp')
      const sizes = pair(root, 'img_sizes')
      if (sizes) remove(root, sizes)
    }
    for (const item of root.items) {
      const key = value(item.key)
      if (key === 'tpl' || key === 'footer') composition(item.value)
      if (global && ['menu', 'callnow', 'callnows'].includes(key)) {
        if (key === 'menu') {
          assertMap(item.value)
          if (YAML.isMap(item.value)) composition(pair(item.value, 'items')?.value, 'link')
        } else composition(item.value, 'link')
      }
    }
    const defaults = pair(root, 'defaults')?.value
    if (YAML.isSeq(defaults)) for (const entry of defaults.items) if (YAML.isMap(entry)) composition(pair(entry, 'tpl')?.value)
  } else if (YAML.isSeq(root)) {
    for (const entry of root.items) if (YAML.isMap(entry)) composition(pair(entry, 'tpl')?.value)
  }
  // Markdown values are scalar payloads; keys and code samples remain untouched.
  function markdownValues (node) {
    if (YAML.isMap(node)) { for (const item of node.items) markdownValues(item.value) }
    else if (YAML.isSeq(node)) { for (const item of node.items) markdownValues(item) }
    else if (YAML.isScalar(node) && typeof node.value === 'string') {
      const migrated = migrateMarkdown(node.value)
      if (migrated === node.value) return
      const raw = body.slice(node.range[0], node.range[1])
      if (/^[|>]/.test(raw)) {
        const newline = raw.indexOf('\n')
        const header = raw.slice(0, newline + 1)
        const lines = raw.slice(newline + 1).split(/(?<=\n)/)
        const nonempty = lines.filter(line => line.trim())
        const indent = nonempty.length ? Math.min(...nonempty.map(line => /^ */.exec(line)[0].length)) : 0
        const decoded = lines.map(line => line.trim() ? line.slice(indent) : line).join('')
        const changed = migrateMarkdown(decoded)
        if (changed === decoded) throw new Error('Multiline Markdown metadata requires manual migration before updating')
        const text = header + changed.split(/(?<=\n)/).map(line => line.trim() ? ' '.repeat(indent) + line : line).join('')
        if (YAML.parse(text) !== migrated) throw new Error('Cannot preserve block scalar semantics; migrate Markdown metadata manually')
        edits.push({ start: node.range[0], end: node.range[1], text })
      } else replaceScalar(node, migrated)
    }
  }
  markdownValues(root)
  edits.sort((left, right) => right.start - left.start)
  for (let index = 0; index < edits.length; index++) {
    if (index && edits[index].end > edits[index - 1].start) throw new Error('Overlapping authoring edits; manual review required')
    body = body.slice(0, edits[index].start) + edits[index].text + body.slice(edits[index].end)
  }
  const result = prefix + body + (markdown ? migrateMarkdown(suffix) : suffix)
  if (edits.length) {
    const parsed = YAML.parseDocument(body)
    if (parsed.errors.length) throw new Error('Migration would produce invalid YAML; no files changed')
    if (json) JSON.parse(body)
  }
  return result
}

export function migrateProject (project, { check = false } = {}) {
  const YAML = yamlRuntime(project)
  const planned = []
  const errors = []
  function visit (directory) {
    if (!fs.existsSync(directory)) return
    if (fs.lstatSync(directory).isSymbolicLink()) {
      errors.push(`${path.relative(project, directory)}: symbolic links are not accepted`)
      return
    }
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      const relative = path.relative(project, file).split(path.sep).join('/')
      if (entry.isSymbolicLink()) {
        errors.push(`${relative}: symbolic links are not accepted`)
        continue
      }
      if (entry.isDirectory()) {
        visit(file)
        continue
      }
      if (!entry.isFile() || !/\.(?:md|ya?ml|json)$/.test(entry.name) || entry.name === 'TODO.md') continue
      const source = fs.readFileSync(file, 'utf8')
      try {
        const migrated = migrateSource(source, { YAML, section: /^data\/section\//.test(relative), markdown: /\.md$/.test(file), json: /\.json$/.test(file), index: /^content\/[^/]+\/_index\.[^.]+\.md$/.test(relative), type: /^data\/types\/[^/]+\.ya?ml$/.test(relative), config: /^data\/config\.ya?ml$/.test(relative), global: /^content\/global\.[^.]+\.ya?ml$/.test(relative) })
        if (migrated !== source) planned.push({ file, relative, source: migrated })
      } catch (error) { errors.push(`${relative}: ${error.message}`) }
    }
  }
  for (const name of ['content', 'data']) visit(path.join(project, name))
  if (errors.length) throw new Error(`Authoring migration stopped before writing:\n${errors.join('\n')}`)
  if (!check) for (const entry of planned) fs.writeFileSync(entry.file, entry.source)
  return planned.map(entry => entry.relative)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Usage: 10.0.0-authoring-api.js [--check]')
  const changed = migrateProject(process.cwd(), { check: process.argv.includes('--check') })
  console.log(`${process.argv.includes('--check') ? 'Would migrate' : 'Migrated'} authoring API in ${changed.length} file(s).`)
  for (const file of changed) console.log(`- ${file}`)
}
