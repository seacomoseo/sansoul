// Minimal XLSX reader for the legacy forms spreadsheet exported by Google Drive
// (files.export as Office Open XML): every tab as rows of strings, no
// dependencies. Covers what Sheets writes: shared and inline strings, numbers,
// booleans and formula results; styles and dates stay raw (date cells come back
// as serial numbers, see import-sheet.js sheetTime).
import { inflateRawSync } from 'node:zlib'

function unzip (buffer) {
  let end = buffer.length - 22
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end--
  if (end < 0) throw new Error('xlsx_not_zip')
  const count = buffer.readUInt16LE(end + 10)
  let at = buffer.readUInt32LE(end + 16)
  const files = new Map()
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(at) !== 0x02014b50) throw new Error('xlsx_bad_directory')
    const method = buffer.readUInt16LE(at + 10)
    const size = buffer.readUInt32LE(at + 20)
    const nameLength = buffer.readUInt16LE(at + 28)
    const extraLength = buffer.readUInt16LE(at + 30)
    const commentLength = buffer.readUInt16LE(at + 32)
    const local = buffer.readUInt32LE(at + 42)
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength)
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
    const data = buffer.subarray(start, start + size)
    files.set(name, () => {
      if (method === 0) return data.toString('utf8')
      if (method === 8) return inflateRawSync(data).toString('utf8')
      throw new Error(`xlsx_compression_${method}`)
    })
    at += 46 + nameLength + extraLength + commentLength
  }
  return name => {
    const read = files.get(name)
    if (!read) throw new Error(`xlsx_missing:${name}`)
    return read()
  }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decode = text => text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, code) => {
  if (code[0] === '#') return String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)))
  return ENTITIES[code] ?? all
})
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)]))
// Text runs of a string item, skipping phonetic hints (<rPh>).
const texts = xml => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)].map(m => decode(m[1] || '')).join('')
const column = ref => [...ref.replace(/\d+$/, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1

// { tabName: [[cell, ...], ...] } in workbook order (Map keeps the order).
export function readWorkbook (buffer) {
  const read = unzip(buffer)
  const shared = (() => {
    try { return [...read('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => texts(m[1])) } catch { return [] }
  })()
  const rels = Object.fromEntries([...read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map(m => attrs(m[0])).map(r => [r.Id, r.Target]))
  const tabs = new Map()
  for (const match of read('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
    const sheet = attrs(match[0])
    const target = rels[sheet['r:id']]
    if (!target) continue
    const file = target.startsWith('/') ? target.slice(1) : `xl/${target}`
    const rows = []
    for (const row of read(file).matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const cells = []
      for (const cell of (row[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const { r, t } = attrs(cell[1])
        const body = cell[2] || ''
        const value = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1]
        let text = ''
        if (t === 's') text = shared[Number(value)] ?? ''
        else if (t === 'inlineStr') text = texts(body)
        else if (t === 'b') text = value === '1' ? 'TRUE' : 'FALSE'
        else if (value !== undefined) text = decode(value)
        cells[r ? column(r) : cells.length] = text
      }
      const index = Number(attrs(`<row ${row[1]}>`).r || rows.length + 1) - 1
      rows[index] = Array.from(cells, value => value ?? '')
    }
    tabs.set(sheet.name, Array.from(rows, row => row || []))
  }
  return tabs
}
