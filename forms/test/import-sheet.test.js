import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import zlib from 'node:zlib'
import { unstable_splitSqlQuery as splitSql } from 'wrangler'
import { convert, IMPORT_REASON, parseCsv, sheetTime, toSql } from '../scripts/import-sheet.js'
import { readWorkbook } from '../scripts/xlsx.js'
import { createBindings } from './helpers.js'

const ZONE = 'Europe/Madrid'
const CSV = [
  '"Timestamp","CC","URL","Nombre","Email","Mensaje","User Agent","_submission_id","IP"',
  '"2025-12-23 18:03:43","","https://acme.test/","Ana","ana@example.test","Hola, \'qué\' tal\nsegunda línea","UA","0123456789abcdef0123","203.0.113.1"',
  '"2026-07-01 03:00:00","","https://acme.test/tienda/","Luis","","","UA","","203.0.113.2"',
  '"2026-07-01 03:00:00","","https://acme.test/tienda/","Luis","","","UA","","203.0.113.2"'
].join('\n') + '\n'

let bindings
before(async () => { bindings = await createBindings() })
after(async () => { await bindings.dispose() })

test('parseCsv keeps quotes, commas and line breaks inside cells', () => {
  const rows = parseCsv(CSV)
  assert.equal(rows.length, 4)
  assert.equal(rows[1][5], 'Hola, \'qué\' tal\nsegunda línea')
})

test('sheetTime follows the sheet zone, summer and winter', () => {
  assert.equal(new Date(sheetTime('2025-12-23 18:03:43', ZONE)).toISOString(), '2025-12-23T17:03:43.000Z')
  assert.equal(new Date(sheetTime('2026-07-01 3:00:00', ZONE)).toISOString(), '2026-07-01T01:00:00.000Z')
})

test('convert drops technical columns and empty cells, derives key and stable ids', () => {
  const items = convert({ csv: CSV, form: 'form-contacto', timeZone: ZONE })
  assert.equal(items.length, 2, 'a repeated derived id is imported once')
  assert.equal(items[0].id, '0123456789abcdef0123')
  assert.match(items[1].id, /^legacy-[0-9a-f]{24}$/)
  assert.equal(items[0].key, '/#form-contacto')
  assert.equal(items[1].key, '/tienda/#form-contacto')
  assert.deepEqual(items[0].fields.map(([name]) => name), ['Nombre', 'Email', 'Mensaje'])
  assert.deepEqual(items[1].fields, [['Nombre', 'Luis']])
  assert.deepEqual(convert({ csv: CSV, form: 'form-contacto', timeZone: ZONE }), items)
})

test('fixedPage groups a retired multi-page form under one key and keeps the origin as a field', () => {
  const items = convert({ csv: CSV, form: 'form-comprar', timeZone: ZONE, pageDefault: '/producto/', fixedPage: true })
  assert.deepEqual([...new Set(items.map(i => i.key))], ['/producto/#form-comprar'])
  assert.deepEqual(items[1].fields.at(-1), ['Página de origen', '/tienda/'])
})

test('dropValues removes cells that only mean "not chosen"', () => {
  const csv = '"Timestamp","URL","Producto ➡️ A","Producto ➡️ B","_submission_id"\n"2026-01-02 10:00:00","https://acme.test/","✅","❌",""\n'
  const [item] = convert({ csv, form: 'form-comprar', timeZone: ZONE, dropValues: ['❌'] })
  assert.deepEqual(item.fields, [['Producto ➡️ A', '✅']])
})

test('the SQL loads into the real schema, is idempotent and creates no jobs', async () => {
  const sql = toSql(convert({ csv: CSV, form: 'form-contacto', timeZone: ZONE }))
  const run = async () => { for (const statement of splitSql(sql)) await bindings.db.prepare(statement).run() }
  await run()
  await run()
  const rows = (await bindings.db.prepare('SELECT id, form_key, status, reasons, fields, files, created_at FROM forms_submissions ORDER BY created_at').all()).results
  assert.equal(rows.length, 2)
  assert.equal(rows[0].status, 'accepted')
  assert.deepEqual(JSON.parse(rows[0].reasons), [IMPORT_REASON])
  assert.equal(JSON.parse(rows[0].fields)[2][1], 'Hola, \'qué\' tal\nsegunda línea')
  assert.equal((await bindings.db.prepare('SELECT COUNT(*) AS n FROM forms_jobs').first()).n, 0)
})

// A tiny XLSX like the Drive export: shared strings, an inline string, numbers and a gap.
function xlsx (sheets) {
  const { deflateRawSync, crc32 } = zlib
  const files = {
    'xl/workbook.xml': `<workbook xmlns:r="r"><sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships>${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="ws" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
    'xl/sharedStrings.xml': '<sst><si><t>Timestamp</t></si><si><t>URL</t></si><si><r><t>Nom</t></r><r><t>bre</t></r></si><si><t xml:space="preserve">Ana &amp; Luis</t></si></sst>'
  }
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = `<worksheet><sheetData>${s.xml}</sheetData></worksheet>` })
  const locals = []
  const central = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text)
    const data = deflateRawSync(raw)
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(8, 8); head.writeUInt32LE(crc32(raw), 14)
    head.writeUInt32LE(data.length, 18); head.writeUInt32LE(raw.length, 22); head.writeUInt16LE(name.length, 26)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(8, 10); entry.writeUInt32LE(crc32(raw), 16)
    entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(raw.length, 24); entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42)
    locals.push(head, Buffer.from(name), data)
    central.push(entry, Buffer.from(name))
    offset += 30 + name.length + data.length
  }
  const dir = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10)
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, dir, end])
}

test('readWorkbook returns every tab as rows of strings, keeping gaps and entities', () => {
  const book = xlsx([
    { name: 'acme.test#form-contacto', xml: '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" s="1"><v>45849.544525462964</v></c><c r="C2" t="s"><v>3</v></c></row><row r="3"><c r="A3"><v>46320.5</v></c><c r="B3" t="inlineStr"><is><t>https://acme.test/x/</t></is></c><c r="C3" t="b"><v>1</v></c></row>' },
    { name: 'other.test#form', xml: '' }
  ])
  const tabs = readWorkbook(book)
  assert.deepEqual([...tabs.keys()], ['acme.test#form-contacto', 'other.test#form'])
  assert.deepEqual(tabs.get('acme.test#form-contacto'), [
    ['Timestamp', 'URL', 'Nombre'],
    ['45849.544525462964', '', 'Ana & Luis'],
    ['46320.5', 'https://acme.test/x/', 'TRUE']
  ])
  assert.deepEqual(tabs.get('other.test#form'), [])
})

test('serial day timestamps from the XLSX export follow the sheet zone', () => {
  assert.equal(new Date(sheetTime('45849.544525462964', ZONE)).toISOString(), '2025-07-11T11:04:07.000Z')
  assert.equal(new Date(sheetTime('46012.75', ZONE)).toISOString(), '2025-12-21T17:00:00.000Z')
})

test('convert accepts workbook rows like CSV rows', () => {
  const rows = parseCsv(CSV)
  assert.deepEqual(convert({ rows, form: 'form-contacto', timeZone: ZONE }), convert({ csv: CSV, form: 'form-contacto', timeZone: ZONE }))
  const [item] = convert({ rows: [['Timestamp', 'URL', 'Nombre'], ['45849.544525462964', 'https://acme.test/x/', 'Ana'], ['', '', '']], form: 'f', timeZone: ZONE })
  assert.equal(item.key, '/x/#f')
  assert.equal(item.createdAt, Date.parse('2025-07-11T11:04:07Z'))
})
