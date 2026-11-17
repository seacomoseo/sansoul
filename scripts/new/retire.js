/*
Purpose: `retire` step (only with --retire, once the migrated site is verified
  in production). Removes what the old setup left: Cloudflare Pages projects
  serving this domain or built from the old repository, and the old repository
  seacomoseo/<domain> (or --old-repo). Before deleting the repository it checks
  for commits newer than the new repository (CMS edits made during the
  migration window must be ported first) and keeps a git bundle in
  ~/.local/share/agentes/backups/.
Credentials: CLOUDFLARE_USER_TOKEN / cloudflare-user-token (Pages); gh. The
  gh token may lack delete_repo: the deletion then becomes a manual item.
*/
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { bearer, gh, http, secret } from './lib.js'

const CF = 'https://api.cloudflare.com/client/v4'

export default {
  id: 'retire',
  title: 'Retirada de lo antiguo',
  skip: ctx => !ctx.retire,
  async run (ctx) {
    const oldRepo = ctx.oldRepo || `seacomoseo/${ctx.domain.replace(/^www\./, '')}`
    const newRepo = `${ctx.owner}/${ctx.repo}`
    if (oldRepo === newRepo) throw new Error('el repo antiguo y el nuevo son el mismo')
    if (!(await pages(ctx, oldRepo))) return

    const old = gh(['api', `repos/${oldRepo}`], { allowFail: true })
    if (!old) return ctx.done(`${oldRepo} ya no existe`)
    const created = JSON.parse(gh(['api', `repos/${newRepo}`])).created_at
    const late = JSON.parse(gh(['api', `repos/${oldRepo}/commits?since=${created}&per_page=20`]))
    if (late.length) {
      ctx.warn(`${oldRepo} tiene ${late.length} commit(s) posteriores a ${newRepo} (${late.map(c => c.commit.message.split('\n')[0]).slice(0, 3).join(' | ')}): pórtalos al repo nuevo antes de retirarlo`)
      return ctx.manual(`Portar a ${newRepo} los cambios de ${oldRepo} posteriores a la migración y repetir --retire`)
    }
    if (!ctx.apply) return ctx.todo(`copia (git bundle) y borrado de ${oldRepo}`)
    const dir = path.join(os.homedir(), '.local', 'share', 'agentes', 'backups')
    fs.mkdirSync(dir, { recursive: true })
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-retire-'))
    const bundle = path.join(dir, `${oldRepo.replace('/', '__')}-${new Date().toISOString().slice(0, 10)}.bundle`)
    try {
      execFileSync('git', ['clone', '--quiet', '--mirror', `https://github.com/${oldRepo}.git`, tmp], { stdio: 'ignore' })
      execFileSync('git', ['bundle', 'create', bundle, '--all'], { cwd: tmp, stdio: 'ignore' })
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
    ctx.done(`copia en ${bundle} (borrar a los 30 días)`)
    if (gh(['repo', 'delete', oldRepo, '--yes'], { allowFail: true }) !== null) return ctx.done(`${oldRepo} borrado`)
    ctx.manual(`Borrar ${oldRepo} desde GitHub (el token de gh no tiene delete_repo; en el VPS: node ~/Agentes/scripts/navegador/github-delete-repo.cjs ${oldRepo})`)
  }
}

async function pages (ctx, oldRepo) {
  const auth = bearer(secret('CLOUDFLARE_USER_TOKEN', 'cloudflare-user-token'))
  const apex = ctx.domain.replace(/^www\./, '')
  // Never remove what still serves the site: the domain must already point elsewhere.
  const [zone] = (await http(`${CF}/zones?name=${apex}`, { headers: auth })).data.result
  if (zone) {
    const records = (await http(`${CF}/zones/${zone.id}/dns_records?per_page=100`, { headers: auth })).data.result
    const live = records.filter(r => [apex, `www.${apex}`].includes(r.name) && /\.pages\.dev\.?$/.test(r.content))
    if (live.length) {
      ctx.warn(`${live.map(r => r.name).join(', ')} aún apunta a Pages: no se retira nada`)
      ctx.manual(`Pasar ${apex} a producción en el sitio nuevo (--only cloudflare,gsc --production) antes de --retire`)
      return false
    }
  }
  const accounts = (await http(`${CF}/accounts?per_page=50`, { headers: auth })).data.result
  let found = 0
  for (const account of accounts) {
    const projects = (await http(`${CF}/accounts/${account.id}/pages/projects`, { headers: auth, ok: [200, 403] })).data?.result || []
    for (const project of projects) {
      const source = project.source?.config ? `${project.source.config.owner}/${project.source.config.repo_name}` : ''
      const domains = (project.domains || []).filter(d => !d.endsWith('.pages.dev'))
      if (source !== oldRepo && !domains.some(d => d === apex || d.endsWith(`.${apex}`))) continue
      found++
      const label = `Pages «${project.name}» (cuenta «${account.name}»${domains.length ? `, ${domains.join(', ')}` : ''})`
      if (!ctx.apply) { ctx.todo(`borrar ${label}`); continue }
      if (domains.length) {
        for (const domain of domains) await http(`${CF}/accounts/${account.id}/pages/projects/${project.name}/domains/${domain}`, { method: 'DELETE', headers: auth, ok: [200, 404] })
      }
      await http(`${CF}/accounts/${account.id}/pages/projects/${project.name}`, { method: 'DELETE', headers: auth })
      ctx.done(`${label} borrado`)
    }
  }
  if (!found) ctx.done(`sin proyectos de Pages de ${apex}`)
  return true
}
