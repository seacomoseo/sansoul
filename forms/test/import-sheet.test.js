import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { unstable_splitSqlQuery as splitSql } from 'wrangler'
import { convert, IMPORT_REASON, parseCsv, sheetTime, toSql } from '../scripts/import-sheet.js'
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
