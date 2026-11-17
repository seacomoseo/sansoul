/*
Purpose: `drive` step. The project's notes `<name>.md` and access sheet
  `<name> accesos.tsv` in the SanSoul Drive folder (next to the templates
  `_sansoul-demo.md` and `_sansoul-demo accesos.tsv`), owned by the agency
  account. New project: copy the templates, fill var_* (never passwords), share
  the sheet with params.drive_mails and set params.drive_url. Migration: files
  found by params.drive_url or the legacy names `<domain>.md` /
  `<domain> accesos.tsv` move to the agency account (pending owner + accept,
  existing shares kept) and are renamed; nothing else changes.
Credentials: google-seacomoseo-oauth-token.json (drive); for ownership moves
  also the current owner's grant, google-<account>-oauth-token.json, where
  <account> is the owner's mailbox name (e.g. lorensansol).
*/
import fs from 'node:fs'
import path from 'node:path'
import { bearer, googleAccessToken, hasSecret, http } from './lib.js'
import { editYaml } from './repo.js'

const API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const AGENCY = 'google-seacomoseo-oauth-token.json'
const TEMPLATES = { md: '_sansoul-demo.md', tsv: '_sansoul-demo accesos.tsv' }
const SHARE_MESSAGE = 'Hoja de cálculo de Google Drive donde indicaremos todos los servicios externos relevantes al sitio web; con sus emails, usuarios y contraseñas (si procede) de acceso correspondientes. Más detalles aquí: https://seacomoseo.com/entrega/'
const FIELDS = 'id,name,parents,owners(emailAddress),webViewLink'

export default {
  id: 'drive',
  title: 'Drive (notas y accesos)',
  async run (ctx) {
    if (!hasSecret('', AGENCY)) return ctx.manual('Drive: falta el grant google-seacomoseo (google-account-oauth.py seacomoseo)')
    const agency = drive(await googleAccessToken(AGENCY))
    const me = (await agency.call('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)')).user.emailAddress
    const templates = {}
    for (const [kind, name] of Object.entries(TEMPLATES)) {
      templates[kind] = (await agency.find(`name = '${esc(name)}'`))[0]
      if (!templates[kind]) throw new Error(`Drive: no encuentro la plantilla «${name}» (¿está compartida la carpeta SanSoul con ${me}?)`)
    }
    const folder = templates.md.parents[0]
    const params = readParams(ctx.dir)
    const names = { md: `${ctx.name}.md`, tsv: `${ctx.name} accesos.tsv` }
    const legacy = { md: `${ctx.domain}.md`, tsv: `${ctx.domain} accesos.tsv` }
    const files = {}
    for (const kind of ['md', 'tsv']) {
      const byId = kind === 'tsv' && params.drive_url && /\/d\/([\w-]+)/.exec(params.drive_url)?.[1]
      files[kind] = (byId && await agency.call(`${API}/${byId}?fields=${FIELDS}`).catch(() => null)) ||
        (await agency.find(`name = '${esc(names[kind])}' and '${folder}' in parents`))[0] ||
        (await agency.find(`name = '${esc(legacy[kind])}' and '${folder}' in parents`))[0]
    }

    for (const kind of ['md', 'tsv']) {
      let file = files[kind]
      if (!file) {
        if (!ctx.apply) { ctx.todo(`crear «${names[kind]}» desde «${TEMPLATES[kind]}»`); continue }
        file = await agency.call(`${API}/${templates[kind].id}/copy?fields=${FIELDS}`, { method: 'POST', body: { name: names[kind], parents: [folder] } })
        const text = await agency.text(file.id)
        await agency.upload(file.id, fill(text, ctx))
        files[kind] = file
        ctx.done(`«${names[kind]}» creado (propietario ${me})`)
        continue
      }
      const owner = file.owners?.[0]?.emailAddress
      if (owner && owner !== me) {
        const account = owner.split('@')[0].toLowerCase()
        if (!ctx.apply) ctx.todo(`«${file.name}»: propietario ${owner} → ${me}`)
        else if (!hasSecret('', `google-${account}-oauth-token.json`)) ctx.manual(`«${file.name}»: para pasarlo a ${me} falta el grant google-${account} (google-account-oauth.py ${account})`)
        else {
          await transfer(file.id, drive(await googleAccessToken(`google-${account}-oauth-token.json`)), agency, me)
          ctx.done(`«${file.name}»: propietario ${owner} → ${me} (compartidos intactos)`)
        }
      } else ctx.done(`«${file.name}» (propietario ${me})`)
      if (file.name !== names[kind]) {
        if (!ctx.apply) ctx.todo(`renombrar «${file.name}» → «${names[kind]}»`)
        else { await agency.call(`${API}/${file.id}`, { method: 'PATCH', body: { name: names[kind] } }); ctx.done(`«${file.name}» → «${names[kind]}»`) }
      }
    }

    const sheet = files.tsv
    if (!sheet) return
    const shared = (await agency.call(`${API}/${sheet.id}/permissions?fields=permissions(emailAddress,role)`)).permissions
    const missing = ctx.mails.filter(m => !shared.some(p => (p.emailAddress || '').toLowerCase() === m.toLowerCase()))
    if (!ctx.mails.length) ctx.manual('Compartir la hoja de accesos: falta params.drive_mails (--mails)')
    else if (!missing.length) ctx.done(`hoja compartida con ${ctx.mails.join(', ')}`)
    else if (!ctx.apply) ctx.todo(`compartir la hoja con ${missing.join(', ')}`)
    else {
      for (const emailAddress of missing) {
        await agency.call(`${API}/${sheet.id}/permissions?sendNotificationEmail=true&emailMessage=${encodeURIComponent(SHARE_MESSAGE)}`, { method: 'POST', body: { type: 'user', role: 'writer', emailAddress } })
      }
      ctx.done(`hoja compartida con ${missing.join(', ')}`)
    }
    const url = `https://drive.google.com/file/d/${sheet.id}`
    if (!ctx.dir || !fs.existsSync(path.join(ctx.dir, 'hugo.yml'))) return
    if (params.drive_url === url) return ctx.done(`hugo.yml drive_url = ${url}`)
    if (!ctx.apply) return ctx.todo(`hugo.yml drive_url = ${url}`)
    editYaml(path.join(ctx.dir, 'hugo.yml'), doc => doc.setIn(['params', 'drive_url'], url))
    ctx.changed.push('hugo.yml')
    ctx.done(`hugo.yml drive_url = ${url}`)
  }
}

// Consumer Google accounts cannot hand over ownership directly: the owner
// marks the new owner as pending, and the new owner accepts it.
async function transfer (fileId, current, agency, me) {
  const perms = (await current.call(`${API}/${fileId}/permissions?fields=permissions(id,emailAddress,role,pendingOwner)`)).permissions
  const mine = perms.find(p => (p.emailAddress || '').toLowerCase() === me.toLowerCase())
  if (mine && mine.role !== 'owner') {
    await current.call(`${API}/${fileId}/permissions/${mine.id}`, { method: 'PATCH', body: { role: 'writer', pendingOwner: true } })
  } else if (!mine) {
    await current.call(`${API}/${fileId}/permissions?sendNotificationEmail=false`, { method: 'POST', body: { type: 'user', role: 'writer', emailAddress: me, pendingOwner: true } })
  }
  const own = (await agency.call(`${API}/${fileId}/permissions?fields=permissions(id,emailAddress)`)).permissions
    .find(p => (p.emailAddress || '').toLowerCase() === me.toLowerCase())
  await agency.call(`${API}/${fileId}/permissions/${own.id}?transferOwnership=true`, { method: 'PATCH', body: { role: 'owner' } })
}

// Placeholders of the templates; passwords are never filled in.
export function fill (text, ctx) {
  return text
    .replaceAll('var_domain', ctx.domain)
    .replaceAll('var_owner', ctx.owner)
    .replaceAll('var_name', ctx.name)
    .replaceAll('var_members', ctx.mails.join(', '))
    .replaceAll('var_pw', '')
    .replaceAll('var_cf_email', '')
}

function drive (token) {
  const headers = bearer(token)
  const call = (url, options = {}) => http(url, { ...options, headers }).then(r => r.data)
  return {
    call,
    find: async q => (await call(`${API}?q=${encodeURIComponent(`${q} and trashed = false`)}&fields=${encodeURIComponent(`files(${FIELDS})`)}&pageSize=10`)).files,
    text: async id => {
      const response = await fetch(`${API}/${id}?alt=media`, { headers })
      if (!response.ok) throw new Error(`Drive download ${id}: HTTP ${response.status}`)
      return response.text()
    },
    upload: async (id, text) => {
      const response = await fetch(`${UPLOAD}/${id}?uploadType=media`, { method: 'PATCH', headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' }, body: text })
      if (!response.ok) throw new Error(`Drive upload ${id}: HTTP ${response.status}`)
    }
  }
}

function readParams (dir) {
  const file = dir && path.join(dir, 'hugo.yml')
  if (!file || !fs.existsSync(file)) return {}
  const doc = fs.readFileSync(file, 'utf8')
  const value = key => new RegExp(`^\\s+${key}:\\s*(.+)$`, 'm').exec(doc)?.[1].trim().replace(/^["']|["']$/g, '')
  return { drive_url: value('drive_url') }
}

function esc (value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}
