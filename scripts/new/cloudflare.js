/*
Purpose: `cloudflare` step. Find the project's own Cloudflare account (by id,
  else by name = domain or project name), give it a workers.dev subdomain and
  rename a default-named account. The Worker, D1 and KV are created by the CI
  (scripts/worker-config.js). With --production only: zone and Worker custom
  domains (apex and www).
Credentials: CLOUDFLARE_USER_TOKEN or secrets file cloudflare-user-token.
*/
import { bearer, http, secret } from './lib.js'

const CF = 'https://api.cloudflare.com/client/v4'

export default {
  id: 'cloudflare',
  title: 'Cloudflare',
  async run (ctx) {
    const auth = bearer(secret('CLOUDFLARE_USER_TOKEN', 'cloudflare-user-token'))
    const cf = (path, options = {}) => http(`${CF}${path}`, { ...options, headers: auth }).then(r => r.data.result)
    const account = await findAccount(ctx, cf)
    if (!account) {
      ctx.manual(`Crear la cuenta de Cloudflare «${ctx.domain}» (Free) y repetir; o pasar --cf-account ID`)
      return
    }
    ctx.cfAccount = account.id
    ctx.done(`cuenta «${account.name}» (${account.id})`)
    if (/'s Account$/i.test(account.name)) {
      if (!ctx.apply) ctx.todo(`renombrar la cuenta a «${ctx.domain}»`)
      else { await cf(`/accounts/${account.id}`, { method: 'PUT', body: { name: ctx.domain } }); ctx.done(`cuenta renombrada a «${ctx.domain}»`) }
    }
    const sub = await cf(`/accounts/${account.id}/workers/subdomain`).catch(() => null)
    if (sub?.subdomain) {
      ctx.workersDev = `https://${ctx.worker}.${sub.subdomain}.workers.dev`
      ctx.done(`workers.dev: ${ctx.workersDev}`)
    } else if (!ctx.apply) {
      ctx.todo(`registrar el subdominio workers.dev «${ctx.name}»`)
    } else {
      const created = await cf(`/accounts/${account.id}/workers/subdomain`, { method: 'PUT', body: { subdomain: ctx.name } })
      ctx.workersDev = `https://${ctx.worker}.${created.subdomain}.workers.dev`
      ctx.done(`workers.dev registrado: ${ctx.workersDev}`)
    }
    if (!ctx.production) {
      ctx.manual(`Producción (con aprobación): repetir con --only cloudflare,gsc --production para la zona ${ctx.domain}, sus DNS y el dominio del Worker`)
      return
    }
    await production(ctx, cf, account)
  }
}

async function findAccount (ctx, cf) {
  if (ctx.cfAccount) return cf(`/accounts/${ctx.cfAccount}`)
  const accounts = await cf('/accounts?per_page=50')
  const wanted = [ctx.domain, ctx.name].map(s => s.toLowerCase())
  const matches = accounts.filter(a => wanted.includes(a.name.trim().toLowerCase()))
  if (matches.length > 1) throw new Error(`varias cuentas de Cloudflare se llaman como el proyecto: pasa --cf-account (${matches.map(a => a.id).join(', ')})`)
  return matches[0] || null
}

async function production (ctx, cf, account) {
  let [zone] = await cf(`/zones?name=${ctx.domain}&account.id=${account.id}`)
  if (!zone) {
    if (!ctx.apply) return ctx.todo(`crear la zona ${ctx.domain} (Free)`)
    zone = await cf('/zones', { method: 'POST', body: { name: ctx.domain, account: { id: account.id }, type: 'full' } })
    ctx.done(`zona ${ctx.domain} creada`)
  }
  ctx.zoneId = zone.id
  if (zone.status !== 'active') {
    ctx.manual(`En el registrador de ${ctx.domain}, poner los DNS de Cloudflare: ${(zone.name_servers || []).join(', ')}; después repetir --production`)
    return
  }
  ctx.done(`zona ${ctx.domain} activa`)
  const domains = await cf(`/accounts/${account.id}/workers/domains?zone_id=${zone.id}`)
  for (const hostname of [ctx.domain, `www.${ctx.domain}`]) {
    const current = domains.find(d => d.hostname === hostname)
    if (current?.service === ctx.worker) { ctx.done(`${hostname} → Worker ${ctx.worker}`); continue }
    if (!ctx.apply) { ctx.todo(`${hostname} → Worker ${ctx.worker}${current ? ` (ahora ${current.service})` : ''}`); continue }
    await cf(`/accounts/${account.id}/workers/domains`, { method: 'PUT', body: { hostname, service: ctx.worker, zone_id: zone.id, environment: 'production' } })
    ctx.done(`${hostname} → Worker ${ctx.worker}`)
  }
}
