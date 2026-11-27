#!/usr/bin/env node
/*
Purpose: Until 13.7.0 a slider's arrows (and pips) took the colour of its block's
  `btn`; since then they use `arrows` and `btn` only colours the box buttons, so
  projects migrated from older versions lost that colour without notice. For every
  `box` or `review` block that has its own `slider: true`, its own `btn` colour other
  than `cta` and no `arrows`, this adds `arrows: <that colour>` right after `btn`.
  Nothing else changes: blocks without an active slider keep their buttons as they
  are, and `btn` stays. Skipped (reported): blocks with any `arrows` (including
  `float`, which now always uses `cta`), flow-style maps, and block types whose
  data/styles.yml defaults already set `arrows` (those defaults arrived in 14.19.0,
  so they are a deliberate later choice). data/styles.yml itself is never changed:
  its `btn` defaults never coloured arrows.
Run from: Consumer root through `sh do update`; --check reports without writing.
Writes: YAML files and Markdown YAML front matter under content/ and data/, inserting
  one line per block; comments and formatting are preserved. Does not follow symlinks.
*/
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isMap, isScalar, isSeq, parseDocument } from 'yaml'

const COLORS = ['main', 'alt', 'light', 'dark', 'turn', 'such', 'whatsapp']
const BLOCKS = ['box', 'review']

const keyOf = pair => String(isScalar(pair.key) ? pair.key.value : pair.key)
const pairOf = (map, key) => map.items.find(pair => keyOf(pair) === key)
const scalarOf = (map, key) => {
  const value = pairOf(map, key)?.value
  return isScalar(value) ? value.value : undefined
}

// Block types whose global defaults already decide the arrows.
function globalArrows (projectDir) {
  const file = path.join(projectDir, 'data', 'styles.yml')
  if (!fs.existsSync(file)) return new Set()
  const doc = parseDocument(fs.readFileSync(file, 'utf8'))
  if (doc.errors.length || !isMap(doc.contents)) return new Set()
  return new Set(BLOCKS.filter(block => {
    const value = pairOf(doc.contents, block)?.value
    return isMap(value) && scalarOf(value, 'arrows') != null
  }))
}

export function migrateSource (source, { markdown = false, skip = new Set(), onWarning = () => {} } = {}) {
  let offset = 0
  let body = source
  if (markdown) {
    const match = /^(﻿?---[^\S\r\n]*\r?\n)([\s\S]*?)^---[^\S\r\n]*(?:\r?\n|$)/m.exec(source)
    if (!match || match.index !== 0) return source
    offset = match[1].length
    body = match[2]
  }
  const doc = parseDocument(body)
  if (doc.errors.length) {
    onWarning(`YAML parse error, left unchanged: ${doc.errors[0].message}`)
    return source
  }
  const inserts = []
  function visit (node) {
    if (isSeq(node)) return node.items.forEach(visit)
    if (!isMap(node)) return
    for (const pair of node.items) {
      const block = keyOf(pair)
      const value = pair.value
      if (BLOCKS.includes(block) && isMap(value) && scalarOf(value, 'slider') === true) {
        const btn = scalarOf(value, 'btn')
        if (COLORS.includes(btn)) {
          if (pairOf(value, 'arrows')) {
            if (scalarOf(value, 'arrows') === 'float') onWarning(`${block} with slider, btn: ${btn} and arrows: float: float arrows now always use cta; review by hand.`)
          } else if (skip.has(block)) {
            onWarning(`${block} with slider and btn: ${btn} left unchanged: data/styles.yml already sets ${block}.arrows.`)
          } else if (value.flow) {
            onWarning(`${block} with slider and btn: ${btn} is a flow map; add arrows: ${btn} by hand.`)
          } else {
            const btnPair = pairOf(value, 'btn')
            const column = btnPair.key.range[0] - body.lastIndexOf('\n', btnPair.key.range[0] - 1) - 1
            const lineEnd = body.indexOf('\n', btnPair.value.range[1])
            inserts.push({ at: lineEnd === -1 ? body.length : lineEnd, text: `${' '.repeat(column)}arrows: ${btn}`, end: lineEnd === -1 })
          }
        }
      }
      visit(value)
    }
  }
  visit(doc.contents)
  if (!inserts.length) return source
  const newline = body.includes('\r\n') ? '\r\n' : '\n'
  let result = body
  for (const insert of inserts.sort((a, b) => b.at - a.at)) {
    const at = insert.end ? insert.at : (result[insert.at - 1] === '\r' ? insert.at - 1 : insert.at)
    result = result.slice(0, at) + newline + insert.text + result.slice(at)
  }
  return source.slice(0, offset) + result + source.slice(offset + body.length)
}

export function migrateProject (projectDir, { check = false, onWarning = message => console.warn(message) } = {}) {
  const skip = globalArrows(projectDir)
  const changed = []
  function visit (directory) {
    if (!fs.existsSync(directory) || !fs.lstatSync(directory).isDirectory()) return
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      const name = path.relative(projectDir, file).split(path.sep).join('/')
      if (entry.isDirectory()) visit(file)
      else if (entry.isFile() && /\.(md|ya?ml)$/.test(entry.name) && name !== 'data/styles.yml') {
        const source = fs.readFileSync(file, 'utf8')
        const migrated = migrateSource(source, { markdown: /\.md$/.test(entry.name), skip, onWarning: message => onWarning(`${name}: ${message}`) })
        if (migrated === source) continue
        changed.push(name)
        if (!check) fs.writeFileSync(file, migrated, 'utf8')
      }
    }
  }
  for (const directory of ['content', 'data']) visit(path.join(projectDir, directory))
  return { changed: changed.length > 0, files: changed }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const check = process.argv.includes('--check')
  try {
    const { files } = migrateProject(process.cwd(), { check })
    console.log(files.length
      ? `${check ? 'Would add' : 'Added'} slider arrows colour from btn in ${files.length} file(s):\n${files.map(file => `- ${file}`).join('\n')}`
      : 'Slider arrows: nothing to migrate.')
  } catch (error) {
    console.error(error.message)
    process.exit(2)
  }
}
