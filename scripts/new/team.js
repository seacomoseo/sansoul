/*
Purpose: `team` step. Access to the client's organization, as in 3dnau:
  team `operations` (admin on the repo; the agents' account) and team
  `clients` (maintain on the repo: CMS and content, no settings), members with
  no default repository access who cannot create repositories. --members adds
  the client's GitHub users to `clients` (GitHub invites them to the org).
  Skipped for repositories owned by a personal account.
*/
import { gh } from './lib.js'

export const TEAMS = [
  { slug: 'operations', permission: 'admin', description: 'Sea Como SEO: operación y despliegue' },
  { slug: 'clients', permission: 'maintain', description: 'Cliente: contenidos y CMS' }
]
const api = (path, method = 'GET', fields = []) =>
  gh(['api', '-X', method, path, ...fields.flatMap(f => ['-f', f])], { allowFail: method === 'GET' })

export default {
  id: 'team',
  title: 'Permisos en la organización',
  async run (ctx) {
    const slug = `${ctx.owner}/${ctx.repo}`
    const owner = api(`users/${ctx.owner}`)
    if (!owner) return ctx.todo(`permisos en ${ctx.owner}: la cuenta aún no existe`)
    if (JSON.parse(owner).type !== 'Organization') return ctx.done(`${ctx.owner} es una cuenta personal: sin equipos`)
    const me = JSON.parse(gh(['api', 'user'])).login

    const org = JSON.parse(api(`orgs/${ctx.owner}`) || '{}')
    if (org.default_repository_permission === 'none' && org.members_can_create_repositories === false) ctx.done('miembros sin acceso por defecto ni creación de repos')
    else if (!ctx.apply) ctx.todo('organización: miembros sin acceso por defecto y sin crear repos')
    else {
      gh(['api', '-X', 'PATCH', `orgs/${ctx.owner}`, '-f', 'default_repository_permission=none', '-F', 'members_can_create_repositories=false'])
      ctx.done('organización: miembros sin acceso por defecto y sin crear repos')
    }

    const repoExists = Boolean(api(`repos/${slug}`))
    for (const team of TEAMS) {
      let current = api(`orgs/${ctx.owner}/teams/${team.slug}`)
      if (!current) {
        if (!ctx.apply) { ctx.todo(`equipo ${team.slug} (${team.permission} en ${ctx.repo})`); continue }
        gh(['api', '-X', 'POST', `orgs/${ctx.owner}/teams`, '-f', `name=${team.slug}`, '-f', `description=${team.description}`, '-f', 'privacy=closed'])
        current = api(`orgs/${ctx.owner}/teams/${team.slug}`)
        ctx.done(`equipo ${team.slug} creado`)
      }
      if (!repoExists) { ctx.todo(`${team.slug}: ${team.permission} en ${ctx.repo} cuando exista`); continue }
      const access = gh(['api', '-H', 'Accept: application/vnd.github.v3.repository+json', `orgs/${ctx.owner}/teams/${team.slug}/repos/${slug}`], { allowFail: true })
      const role = access ? JSON.parse(access).role_name : ''
      if (role === team.permission) ctx.done(`${team.slug}: ${team.permission} en ${ctx.repo}`)
      else if (!ctx.apply) ctx.todo(`${team.slug}: ${team.permission} en ${ctx.repo}${role ? ` (ahora ${role})` : ''}`)
      else { api(`orgs/${ctx.owner}/teams/${team.slug}/repos/${slug}`, 'PUT', [`permission=${team.permission}`]); ctx.done(`${team.slug}: ${team.permission} en ${ctx.repo}`) }
    }

    await membership(ctx, 'operations', [me])
    await membership(ctx, 'clients', ctx.members)
    if (!ctx.members.length) {
      const clients = api(`orgs/${ctx.owner}/teams/clients/members`)
      const people = clients ? JSON.parse(clients).map(m => m.login).filter(l => l !== me) : []
      if (people.length) ctx.done(`clientes: ${people.join(', ')}`)
      else ctx.manual(`Pedir al cliente su usuario de GitHub y repetir con --members <usuario> (equipo clients de ${ctx.owner})`)
    }
  }
}

async function membership (ctx, team, users) {
  for (const user of users) {
    const state = api(`orgs/${ctx.owner}/teams/${team}/memberships/${user}`)
    const current = state ? JSON.parse(state).state : ''
    if (current === 'active') { ctx.done(`${user} en ${team}`); continue }
    if (current === 'pending') { ctx.done(`${user} invitado a ${team} (pendiente de aceptar)`); continue }
    if (!ctx.apply) { ctx.todo(`invitar a ${user} al equipo ${team}`); continue }
    api(`orgs/${ctx.owner}/teams/${team}/memberships/${user}`, 'PUT', ['role=member'])
    ctx.done(`${user} invitado al equipo ${team}`)
  }
}
