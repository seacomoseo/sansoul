// One-off import of a legacy Google Sheets tab (exported as CSV) into the forms
// database, so the history shows in the CMS «Formularios» panel. It only writes
// SQL: apply it with `wrangler d1 execute <db> --remote --file <out>`.
//   node forms/scripts/import-sheet.js --csv tab.csv --form form-contacto --out import.sql [--tz Europe/Madrid]
// Rows are INSERT OR IGNORE keyed by the legacy `_submission_id` (or a stable id
// derived from form, timestamp and row text), so repeating it at cutover only
// adds the new rows. No jobs are created: nothing is sent, nothing is retried.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { formKey } from '../manifest.js'

export const IMPORT_REASON = 'imported:sheets'
const DROP = new Set(['CC', 'URL', 'User Agent', 'IP', '_submission_id', 'Timestamp'])

export function parseCsv (text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      rows.push(row); row = []
    } else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(value => value.trim()))
}

// "2025-12-16 3:53:17" in the sheet's time zone -> epoch ms.
export function sheetTime (text, timeZone) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2}):(\d{2})$/.exec(text.trim())
  if (!m) throw new Error(`bad_timestamp:${text}`)
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number)
  const wall = Date.UTC(y, mo - 1, d, h, mi, s)
  const offset = at => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(at)).map(p => [p.type, p.value]))
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - at
  }
  let at = wall - offset(wall)
  at = wall - offset(at)
  return at
}

const sha = text => createHash('sha256').update(text).digest('hex')
const sql = value => `'${String(value).replace(/'/g, "''")}'`

export function convert ({ csv, form, timeZone, pageDefault = '/', fixedPage = false }) {
  const [header, ...body] = parseCsv(csv)
  const col = name => header.indexOf(name)
  const iTs = col('Timestamp')
  if (iTs < 0) throw new Error('missing_timestamp_column')
  const iUrl = col('URL')
  const iId = col('_submission_id')
  const out = []
  const seen = new Set()
  for (const row of body) {
    const createdAt = sheetTime(row[iTs], timeZone)
    let page = pageDefault
    let origin = ''
    try { if (iUrl >= 0 && row[iUrl]) origin = new URL(row[iUrl]).pathname } catch { /* keep the default */ }
    if (origin && !fixedPage) page = origin
    const fields = header.map((name, i) => [name, (row[i] || '').replace(/\r\n?/g, '\n')]).filter(([name, value]) => !DROP.has(name) && value.trim() !== '')
    // One panel entry for a retired form that lived on many pages: keep where it came from as a field.
    if (fixedPage && origin) fields.push(['Página de origen', origin])
    const key = formKey(page, form)
    const legacy = iId >= 0 ? row[iId].trim() : ''
    const id = /^[A-Za-z0-9-]{16,64}$/.test(legacy) ? legacy : `legacy-${sha(`${form}\n${row.join('\u0001')}`).slice(0, 24)}`
    if (seen.has(id)) continue // duplicated id in the sheet: the first row wins
    seen.add(id)
    const digest = sha(JSON.stringify({ key, fields, files: [] }))
    out.push({ id, key, page, digest, fields, createdAt })
  }
  return out
}

export function toSql (items) {
  return items.map(item =>
    `INSERT OR IGNORE INTO forms_submissions (id, form_key, page, digest, status, reasons, fields, files, created_at) VALUES (${sql(item.id)}, ${sql(item.key)}, ${sql(item.page)}, ${sql(item.digest)}, 'accepted', ${sql(JSON.stringify([IMPORT_REASON]))}, ${sql(JSON.stringify(item.fields))}, '[]', ${item.createdAt});`
  ).join('\n') + '\n'
}

function main (argv) {
  const args = Object.fromEntries(argv.map((a, i) => a.startsWith('--') && !a.startsWith('--fixed') ? [a.slice(2), argv[i + 1]] : null).filter(Boolean))
  if (!args.csv || !args.form || !args.out || !args.tz) throw new Error('usage: --csv FILE --form ID --tz ZONE --out FILE.sql [--page /] [--fixed-page]')
  const items = convert({ csv: readFileSync(args.csv, 'utf8'), form: args.form, timeZone: args.tz, pageDefault: args.page || '/', fixedPage: argv.includes('--fixed-page') })
  writeFileSync(args.out, toSql(items), { mode: 0o600 })
  const times = items.map(i => i.createdAt)
  console.log(JSON.stringify({ form: args.form, rows: items.length, legacyIds: items.filter(i => !i.id.startsWith('legacy-')).length, from: new Date(Math.min(...times)).toISOString(), to: new Date(Math.max(...times)).toISOString(), keys: [...new Set(items.map(i => i.key))] }))
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main(process.argv.slice(2))
