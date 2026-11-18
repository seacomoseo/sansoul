/*
Purpose: `drive` step. The project's notes `<project>.md` and access sheet
  `<project> accesos.tsv` (params.project, as in the Vault: one pair per
  client even with several sites) in the SanSoul Drive folder (next to the templates
  `_SanSoul Demo.md` and `_SanSoul Demo accesos.tsv`), owned by the agency
  account. New project: copy the templates, fill var_* (never passwords), share
  the sheet with params.drive_mails and set params.drive_url. Migration: files
  found by params.drive_url or the legacy names (`<domain>`, or the
  `<owner>[-<repo>]` of 14.13.0) move to the agency account (pending owner + accept,
  existing shares kept) and are renamed; nothing else changes.
Credentials: google-seacomoseo-oauth-token.json (drive); for ownership moves
  also the current owner's grant, google-<account>-oauth-token.json, where
  <account> is the owner's mailbox name (e.g. lorensansol).
*/
import fs from 'node:fs'
import path from 'node:path'
import { bearer, googleAccessToken, hasSecret, http } from './lib.js'
import { editYaml } from './repo.js'
import { unconfirmedMails } from './mails.js'

const API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const AGENCY = 'google-seacomoseo-oauth-token.json'
const TEMPLATES = { md: '_SanSoul Demo.md', tsv: '_SanSoul Demo accesos.tsv' }
const SHARE_MESSAGE = 'Hoja de cálculo de Google Drive donde indicaremos todos los servicios externos relevantes al sitio web; con sus emails, usuarios y contraseñas (si procede) de acceso correspondientes. Más detalles aquí: https://seacomoseo.com/entrega/'
const FIELDS = 'id,name,parents,owners(emailAddress,permissionId),webViewLink'

export default {
  id: 'drive',
  title: 'Drive (notas y accesos)',
  async run (ctx) {
    if (!hasSecret('', AGENCY)) return ctx.manual('Drive: falta el grant google-seacomoseo (google-account-oauth.py seacomoseo)')
    const agency = drive(await googleAccessToken(AGENCY))
    // One account can appear under several addresses (seacomoseo@gmail.com and
    // info@seacomoseo.com): compare permission ids, never emails.
    const { emailAddress: me, permissionId: myId } = (await agency.call('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,permissionId)')).user
    const templates = {}
    for (const [kind, name] of Object.entries(TEMPLATES)) {
      templates[kind] = (await agency.find(`name = '${esc(name)}'`))[0]
      if (!templates[kind]) throw new Error(`Drive: no encuentro la plantilla «${name}» (¿está compartida la carpeta SanSoul con ${me}?)`)
    }
    const folder = templates.md.parents[0]
    const params = readParams(ctx.dir)
    if (!ctx.project) return ctx.manual('Drive: falta el nombre del proyecto (--project «Nombre del Vault», se guarda en params.project)')
    const names = { md: `${ctx.project}.md`, tsv: `${ctx.project} accesos.tsv` }
    const legacy = [ctx.domain, ctx.domain.replace(/^www\./, ''), ctx.name]
    const files = {}
    for (const kind of ['md', 'tsv']) {
      const byId = kind === 'tsv' && params.drive_url && /\/d\/([\w-]+)/.exec(params.drive_url)?.[1]
      files[kind] = (byId && await agency.call(`${API}/${byId}?fields=${FIELDS}`).catch(() => null)) ||
        (await agency.find(`name = '${esc(names[kind])}' and '${folder}' in parents`))[0]
      for (const old of legacy) {
        if (files[kind]) break
        files[kind] = (await agency.find(`name = '${esc(kind === 'md' ? `${old}.md` : `${old} accesos.tsv`)}' and '${folder}' in parents`))[0]
      }
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
      if (owner && file.owners[0].permissionId !== myId) {
        const account = owner.split('@')[0].toLowerCase()
        if (!ctx.apply) ctx.todo(`«${file.name}»: propietario ${owner} → ${me}`)
        else if (!hasSecret('', `google-${account}-oauth-token.json`)) ctx.manual(`«${file.name}»: para pasarlo a ${me} falta el grant google-${account} (google-account-oauth.py ${account})`)
        else {
          await transfer(file.id, drive(await googleAccessToken(`google-${account}-oauth-token.json`)), agency, myId)
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
    else if (!ctx.apply) ctx.todo(`compartir la hoja con ${missing.join(', ')}${ctx.mailsSource === 'hugo.yml' ? ' (de params.drive_mails: confírmalos)' : ''}`)
    else if (!await ctx.confirmMails()) unconfirmedMails(ctx, `Compartir la hoja con ${missing.join(', ')}`)
    else {
      for (const emailAddress of missing) {
        await agency.call(`${API}/${sheet.id}/permissions?sendNotificationEmail=true&emailMessage=${encodeURIComponent(SHARE_MESSAGE)}`, { method: 'POST', body: { type: 'user', role: 'writer', emailAddress } })
      }
      ctx.done(`hoja compartida con ${missing.join(', ')}`)
    }
    const url = `https://drive.google.com/file/d/${sheet.id}`
    if (!ctx.dir || !fs.existsSync(path.join(ctx.dir, 'hugo.yml'))) return
    // Confirmed --mails replace a stale list in hugo.yml.
    const listed = ctx.mails.join(', ')
    if (ctx.mailsSource === 'flag' && listed && params.drive_mails !== listed) {
      if (!ctx.apply) ctx.todo(`hugo.yml drive_mails = ${listed}`)
      else {
        editYaml(path.join(ctx.dir, 'hugo.yml'), doc => doc.setIn(['params', 'drive_mails'], listed))
        if (!ctx.changed.includes('hugo.yml')) ctx.changed.push('hugo.yml')
        ctx.done(`hugo.yml drive_mails = ${listed}`)
      }
    }
    if (params.drive_url === url) return ctx.done(`hugo.yml drive_url = ${url}`)
    if (!ctx.apply) return ctx.todo(`hugo.yml drive_url = ${url}`)
    editYaml(path.join(ctx.dir, 'hugo.yml'), doc => doc.setIn(['params', 'drive_url'], url))
    if (!ctx.changed.includes('hugo.yml')) ctx.changed.push('hugo.yml')
    ctx.done(`hugo.yml drive_url = ${url}`)
  }
}

// Consumer Google accounts cannot hand over ownership directly: the owner
// marks the new owner as pending, and the new owner accepts it.
async function transfer (fileId, current, agency, myId) {
  const perms = (await current.call(`${API}/${fileId}/permissions?fields=permissions(id)`)).permissions
  if (!perms.some(p => p.id === myId)) throw new Error('la cuenta de la agencia no tiene acceso al archivo')
  await current.call(`${API}/${fileId}/permissions/${myId}`, { method: 'PATCH', body: { role: 'writer', pendingOwner: true } })
  await agency.call(`${API}/${fileId}/permissions/${myId}?transferOwnership=true`, { method: 'PATCH', body: { role: 'owner' } })
}

// Placeholders of the templates; passwords are never filled in.
export function fill (text, ctx) {
  return text
    .replaceAll('var_domain', ctx.domain)
    .replaceAll('var_owner', ctx.owner)
    .replaceAll('var_name', ctx.project || ctx.name)
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
  return { drive_url: value('drive_url'), drive_mails: value('drive_mails') }
}

function esc (value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}
