/*
Purpose: `cloudflare` step. Find the project's Cloudflare account: --cf-account,
  else the account holding the domain's zone (one account may hold several
  projects' domains), else the one running the project's Worker, else the one
  named like the project (params.project, as in the Vault). Give it a
  workers.dev subdomain and rename it to the project name only when it still
  has a default name or the name of this very domain (old criterion). The Worker, D1 and KV are created by the CI
  (scripts/worker-config.js). With --production only: zone, Worker custom
  domain for the canonical host (the baseURL host: apex, or www when baseURL
  has it) and a 301 from the other host (proxied AAAA 100:: + a zone Single
  Redirect keeping path and query), never both hosts on the Worker.
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
      ctx.manual(`Crear la cuenta de Cloudflare «${ctx.project || ctx.domain}» (Free) y repetir; o pasar --cf-account ID`)
      return
    }
    ctx.cfAccount = account.id
    ctx.done(`cuenta «${account.name}» (${account.id})`)
    if (ctx.project && account.name !== ctx.project && renamable(account.name, ctx.domain)) {
      if (!ctx.apply) ctx.todo(`renombrar la cuenta «${account.name}» a «${ctx.project}»`)
      else { await cf(`/accounts/${account.id}`, { method: 'PUT', body: { name: ctx.project } }); ctx.done(`cuenta renombrada a «${ctx.project}»`) }
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
    if (ctx.production) return production(ctx, cf, account)
    // Without --production, only look: what is missing becomes an approval item.
    const pending = []
    const view = { ...ctx, apply: false, todo: item => pending.push(item), manual: item => pending.push(item) }
    await production(view, cf, account)
    ctx.zoneId = view.zoneId
    if (pending.length) ctx.manual(`Producción (con aprobación, --only cloudflare,gsc --production): ${pending.join('; ')}`)
  }
}

export async function findAccount (ctx, cf) {
  if (ctx.cfAccount) return cf(`/accounts/${ctx.cfAccount}`)
  const zones = await cf(`/zones?name=${hosts(ctx).zone}`)
  // While a zone moves between accounts both exist (the old one still active): never guess.
  if (zones.length > 1) throw new Error(`la zona ${hosts(ctx).zone} existe en varias cuentas de Cloudflare (${zones.map(z => `${z.account.name} ${z.account.id}, ${z.status}`).join('; ')}): pasa --cf-account ID`)
  if (zones[0]) return cf(`/accounts/${zones[0].account.id}`)
  const accounts = await cf('/accounts?per_page=50')
  // A Worker name like `site` exists in many client accounts: never take the first hit.
  const holders = []
  for (const account of accounts) {
    const script = await cf(`/accounts/${account.id}/workers/scripts/${ctx.worker}/settings`).catch(() => null)
    if (script) holders.push(account)
  }
  const byProject = list => (ctx.project ? list.filter(a => sameName(a.name, ctx.project)) : [])
  if (holders.length === 1) return holders[0]
  if (holders.length > 1) {
    const named = byProject(holders)
    if (named.length === 1) return named[0]
    throw new Error(`el Worker «${ctx.worker}» existe en varias cuentas de Cloudflare (${holders.map(a => `${a.name} ${a.id}`).join(', ')}): pasa --cf-account ID o --project con el nombre exacto de la cuenta`)
  }
  if (!ctx.project) return null
  const matches = byProject(accounts)
  if (matches.length > 1) throw new Error(`varias cuentas de Cloudflare se llaman «${ctx.project}»: pasa --cf-account (${matches.map(a => a.id).join(', ')})`)
  return matches[0] || null
}

// Old criterion (account named after its domain) or Cloudflare's default name.
export function renamable (name, domain) {
  const current = name.trim().toLowerCase()
  return /'s account$/.test(current) || current === domain.toLowerCase() || current === domain.replace(/^www\./, '').toLowerCase()
}

export function sameName (a, b) {
  const norm = s => s.normalize('NFC').trim().toLowerCase()
  return norm(a) === norm(b)
}

// Canonical host = baseURL host when it is the apex or www of the domain;
// otherwise (workers.dev, Netlify, a positional domain) the apex. The other one
// answers 301 to it.
export function hosts ({ domain, canonical = '' }) {
  const zone = domain.replace(/^www\./, '')
  const main = [canonical, domain].includes(`www.${zone}`) ? `www.${zone}` : zone
  return { zone, canonical: main, alias: main === zone ? `www.${zone}` : zone }
}

export const REDIRECT_REF = 'sansoul_canonical_host'
const REDIRECT_PHASE = 'http_request_dynamic_redirect'

export function redirectRule ({ canonical, alias }) {
  return {
    ref: REDIRECT_REF,
    description: `SanSoul: ${alias} → ${canonical} (301)`,
    expression: `(http.host eq "${alias}")`,
    action: 'redirect',
    action_parameters: { from_value: { status_code: 301, target_url: { expression: `concat("https://${canonical}", http.request.uri.path)` }, preserve_query_string: true } },
    enabled: true
  }
}

// Our rule, or one made by hand for the same host (the pilot's): never a duplicate.
export function findRedirect (rules, alias) {
  return rules.find(r => r.ref === REDIRECT_REF) || rules.find(r => r.action === 'redirect' && r.expression?.includes(`http.host eq "${alias}"`))
}

export function sameRedirect (a, b) {
  const from = r => r?.action_parameters?.from_value || {}
  return a.expression === b.expression && a.enabled !== false &&
    from(a).status_code === from(b).status_code &&
    from(a).target_url?.expression === from(b).target_url?.expression &&
    Boolean(from(a).preserve_query_string) === Boolean(from(b).preserve_query_string)
}

const missing = error => error.status === 404 || /"code":10003/.test(error.message)

export async function production (ctx, cf, account) {
  const { zone: name, canonical, alias } = hosts(ctx)
  let [zone] = await cf(`/zones?name=${name}&account.id=${account.id}`)
  if (!zone) {
    if (!ctx.apply) return ctx.todo(`crear la zona ${name} (Free) y apuntar sus DNS`)
    zone = await cf('/zones', { method: 'POST', body: { name, account: { id: account.id }, type: 'full' } })
    ctx.done(`zona ${name} creada`)
  }
  ctx.zoneId = zone.id
  if (zone.status !== 'active') {
    ctx.manual(`En el registrador de ${name}, poner los DNS de Cloudflare: ${(zone.name_servers || []).join(', ')}; después repetir --production`)
    return
  }
  ctx.done(`zona ${name} activa`)
  // With a Netlify mirror the domain points to Netlify (it redirects www itself); the Worker stays on workers.dev.
  if (ctx.netlify) return ctx.done(`${name} apunta al espejo de Netlify (${ctx.netlify}); el Worker no lleva dominio propio`)
  const z = `/zones/${zone.id}`
  // 1. The 301 first: harmless until the alias host is proxied by Cloudflare.
  const rule = redirectRule({ canonical, alias })
  const entry = await cf(`${z}/rulesets/phases/${REDIRECT_PHASE}/entrypoint`).catch(e => { if (missing(e)) return null; throw e })
  const current = findRedirect(entry?.rules || [], alias)
  if (current && sameRedirect(current, rule)) ctx.done(`regla 301 ${alias} → ${canonical}`)
  else if (!ctx.apply) ctx.todo(`regla 301 ${alias} → https://${canonical} (ruta y query)${current ? ' (corregir la existente)' : ''}`)
  else {
    if (!entry) await cf(`${z}/rulesets/phases/${REDIRECT_PHASE}/entrypoint`, { method: 'PUT', body: { rules: [rule] } })
    else if (current) await cf(`${z}/rulesets/${entry.id}/rules/${current.id}`, { method: 'PATCH', body: rule })
    else await cf(`${z}/rulesets/${entry.id}/rules`, { method: 'POST', body: rule })
    ctx.done(`regla 301 ${alias} → ${canonical}`)
  }
  // 2. Canonical host → Worker custom domain; the alias must not be one (it would answer 200).
  const domains = await cf(`/accounts/${account.id}/workers/domains?zone_id=${zone.id}`)
  const main = domains.find(d => d.hostname === canonical)
  if (main?.service === ctx.worker) ctx.done(`${canonical} → Worker ${ctx.worker}`)
  else if (!ctx.apply) ctx.todo(`${canonical} → Worker ${ctx.worker}${main ? ` (ahora ${main.service})` : ''}`)
  else {
    await cf(`/accounts/${account.id}/workers/domains`, { method: 'PUT', body: { hostname: canonical, service: ctx.worker, zone_id: zone.id, environment: 'production' } })
    ctx.done(`${canonical} → Worker ${ctx.worker}`)
  }
  const old = domains.find(d => d.hostname === alias)
  if (old) {
    if (!ctx.apply) ctx.todo(`quitar ${alias} como dominio del Worker ${old.service} (pasa a 301)`)
    else { await cf(`/accounts/${account.id}/workers/domains/${old.id}`, { method: 'DELETE' }); ctx.done(`${alias} ya no es dominio del Worker ${old.service}`) }
  }
  // 3. The alias needs a proxied record so the redirect rule sees it.
  const records = await cf(`${z}/dns_records?name=${alias}`)
  const record = records.find(r => ['A', 'AAAA', 'CNAME'].includes(r.type))
  if (record?.proxied) ctx.done(`${alias} con proxy (${record.type} ${record.content})`)
  else if (record) ctx.manual(`${alias} tiene ${record.type} ${record.content} sin proxy: activar el proxy o cambiarlo por AAAA 100:: con proxy, para que responda 301`)
  else if (!ctx.apply) ctx.todo(`${alias} AAAA 100:: con proxy`)
  else {
    await cf(`${z}/dns_records`, { method: 'POST', body: { type: 'AAAA', name: alias, content: '100::', proxied: true, comment: 'SanSoul: 301 al host canónico' } })
    ctx.done(`${alias} AAAA 100:: con proxy`)
  }
}
