/*
Purpose: `forms-history` step. Copies the project's submissions from the legacy
  shared forms spreadsheet (one tab per `<domain>#<form id>`) into the
  project's own forms database (`<worker>-forms`, D1), so they show in the CMS
  «Formularios» panel. Repeatable: rows are INSERT OR IGNORE with stable ids
  (forms/scripts/import-sheet.js), so a later run only adds new rows; nothing is
  sent or retried. Without the database, --apply creates it and applies the
  forms migrations with Wrangler's own bookkeeping (`d1_migrations`); the next
  deploy then binds it even without Worker forms (scripts/worker-config.js).
  The spreadsheet is read in memory (Drive export as XLSX) and never written.
Credentials: google-seacomoseo-oauth-token.json (Drive) and
  CLOUDFLARE_USER_TOKEN / cloudflare-user-token (D1). Needs the cloudflare step.
Undo: DELETE FROM forms_submissions WHERE reasons LIKE '%imported:sheets%'
*/
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bearer, googleAccessToken, hasSecret, http, secret } from './lib.js'
import { readWorkbook } from '../../forms/scripts/xlsx.js'
import { IMPORT_REASON, convert, toSql } from '../../forms/scripts/import-sheet.js'

const CF = 'https://api.cloudflare.com/client/v4'
const AGENCY = 'google-seacomoseo-oauth-token.json'
// «Formularios 🔥», written by the shared Apps Script (sansoulsend).
export const LEGACY_SHEET = process.env.FORMS_LEGACY_SHEET || '1yQEoxReqnvQbQ5LkGnhUvu2_Aa-PhGfFztoRG1qY6iM'
export const LEGACY_TIME_ZONE = process.env.FORMS_LEGACY_TZ || 'Europe/Madrid'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'forms', 'migrations')
// XLSX caps tab names at 31 characters, so long form ids arrive cut.
const TAB_LIMIT = 31
const BATCH = 40

// Form ids the project declares (`id: form-…` in content and data), to restore cut tab names.
export function projectFormIds (dir) {
  const ids = new Set()
  const walk = folder => {
    if (!fs.existsSync(folder)) return
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (/\.(ya?ml|md)$/.test(entry.name)) {
        for (const m of fs.readFileSync(file, 'utf8').matchAll(/^\s*-?\s*id:\s*['"]?([\w-]+)['"]?\s*$/gm)) ids.add(m[1])
      }
    }
  }
  for (const folder of ['content', 'data']) walk(path.join(dir, folder))
  return ids
}

// Tabs of this domain -> [{ tab, form, rows, cut }].
export function domainTabs (tabs, domain, formIds = new Set()) {
  const prefix = `${domain}#`
  const found = []
  for (const [tab, rows] of tabs) {
    if (!tab.startsWith(prefix)) continue
    let form = tab.slice(prefix.length)
    let cut = false
    if (tab.length >= TAB_LIMIT) {
      const full = [...formIds].filter(id => id.startsWith(form))
      if (full.length === 1) form = full[0]
      else cut = true
    }
    if (rows.length > 1) found.push({ tab, form, rows, cut })
  }
  return found
}

function d1 (account) {
  const auth = bearer(secret('CLOUDFLARE_USER_TOKEN', 'cloudflare-user-token'))
  const call = (route, options = {}) => http(`${CF}/accounts/${account}/d1/database${route}`, { ...options, headers: auth }).then(r => r.data.result)
  return {
    find: async name => (await call(`?name=${encodeURIComponent(name)}&per_page=100`)).find(db => db.name === name) || null,
    create: name => call('', { method: 'POST', body: { name } }),
    query: (uuid, sql) => call(`/${uuid}/query`, { method: 'POST', body: { sql } })
  }
}

const rowsOf = result => (Array.isArray(result) ? result : [result]).flatMap(r => r?.results || [])

async function importedCount (api, uuid) {
  try {
    return rowsOf(await api.query(uuid, `SELECT COUNT(*) AS n FROM forms_submissions WHERE reasons LIKE '%${IMPORT_REASON}%'`))[0]?.n ?? 0
  } catch {
    return null // no schema yet
  }
}

// Forms migrations not yet recorded, applied and recorded like `wrangler d1 migrations apply`.
async function migrate (api, uuid) {
  await api.query(uuid, 'CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);')
  const done = new Set(rowsOf(await api.query(uuid, 'SELECT name FROM d1_migrations')).map(r => r.name))
  const applied = []
  for (const file of fs.readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue
    await api.query(uuid, fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'))
    await api.query(uuid, `INSERT INTO d1_migrations (name) VALUES ('${file.replace(/'/g, "''")}');`)
    applied.push(file)
  }
  return applied
}

export default {
  id: 'forms-history',
  title: 'Histórico de formularios (Sheets → D1)',
  async run (ctx) {
    if (!hasSecret('', AGENCY)) return ctx.manual('histórico de formularios: falta el grant google-seacomoseo (google-account-oauth.py seacomoseo)')
    const token = await googleAccessToken(AGENCY)
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${LEGACY_SHEET}/export?mimeType=${encodeURIComponent(XLSX)}`, { headers: bearer(token) })
    if (!response.ok) throw new Error(`Drive: no puedo exportar la hoja de formularios (HTTP ${response.status})`)
    const tabs = domainTabs(readWorkbook(Buffer.from(await response.arrayBuffer())), ctx.domain, projectFormIds(ctx.dir || process.cwd()))
    if (!tabs.length) return ctx.done(`sin histórico de ${ctx.domain} en la hoja de formularios`)
    const items = tabs.flatMap(({ form, rows }) => convert({ rows, form, timeZone: LEGACY_TIME_ZONE }))
    const summary = tabs.map(t => `${t.form} ${t.rows.length - 1}${t.cut ? ' (id cortado en la hoja: revisar)' : ''}`).join(', ')
    if (!ctx.cfAccount) return ctx.todo(`importar ${items.length} envío(s) (${summary}): ejecutar junto al paso cloudflare`)
    const api = d1(ctx.cfAccount)
    const name = `${ctx.worker}-forms`
    let db = await api.find(name)
    const before = db ? await importedCount(api, db.uuid) : null
    if (!ctx.apply) {
      const state = !db ? `crear la D1 ${name}, aplicar sus migraciones e ` : before === null ? `aplicar las migraciones de ${name} e ` : ''
      return ctx.todo(`${state}importar ${items.length} envío(s) (${summary})${before ? `; ya hay ${before} importado(s), solo se añaden los nuevos` : ''}`)
    }
    if (!db) {
      db = await api.create(name)
      ctx.done(`D1 ${name} creada`)
    }
    const applied = await migrate(api, db.uuid)
    if (applied.length) ctx.done(`migraciones aplicadas en ${name}: ${applied.join(', ')}`)
    const start = (await importedCount(api, db.uuid)) || 0
    const statements = toSql(items).trim().split('\n')
    for (let i = 0; i < statements.length; i += BATCH) await api.query(db.uuid, statements.slice(i, i + BATCH).join('\n'))
    const end = await importedCount(api, db.uuid)
    // Every source row must now exist under its stable id.
    let present = 0
    for (let i = 0; i < items.length; i += BATCH) {
      const ids = items.slice(i, i + BATCH).map(item => `'${item.id.replace(/'/g, "''")}'`).join(', ')
      present += rowsOf(await api.query(db.uuid, `SELECT COUNT(*) AS n FROM forms_submissions WHERE id IN (${ids})`))[0]?.n ?? 0
    }
    if (present !== items.length) throw new Error(`D1 ${name}: tras importar hay ${present} de ${items.length} envíos`)
    ctx.done(`histórico importado en ${name}: ${end - start} nuevo(s), ${end} en total (${summary}); el panel aparece tras el siguiente despliegue`)
  }
}
