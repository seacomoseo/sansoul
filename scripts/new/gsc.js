/*
Purpose: `gsc` step. Search Console domain property sc-domain:<domain> owned
  by the agency account. Verification (DNS TXT in the Cloudflare zone) and the
  sitemap only run with --production once the zone is active (see the
  `cloudflare` step, which must run before).
Credentials: google-seacomoseo-oauth-token.json (webmasters, siteverification);
  CLOUDFLARE_USER_TOKEN / cloudflare-user-token for the TXT record.
*/
import { bearer, googleAccessToken, hasSecret, http, secret } from './lib.js'

const SC = 'https://www.googleapis.com/webmasters/v3/sites'
const SV = 'https://www.googleapis.com/siteVerification/v1'
const CF = 'https://api.cloudflare.com/client/v4'

export default {
  id: 'gsc',
  title: 'Search Console',
  async run (ctx) {
    if (!hasSecret('', 'google-seacomoseo-oauth-token.json')) return ctx.manual('Search Console: falta el grant google-seacomoseo (google-account-oauth.py seacomoseo --with gsc,ga4-users)')
    const headers = bearer(await googleAccessToken('google-seacomoseo-oauth-token.json'))
    const site = `sc-domain:${ctx.domain}`
    const sites = (await http(SC, { headers })).data.siteEntry || []
    const entry = sites.find(s => s.siteUrl === site)
    const verified = entry && entry.permissionLevel !== 'siteUnverifiedUser'
    if (entry) ctx.done(`${site}${verified ? ' verificada' : ' (sin verificar)'}`)
    else if (!ctx.apply) ctx.todo(`añadir ${site}`)
    else { await http(`${SC}/${encodeURIComponent(site)}`, { method: 'PUT', headers }); ctx.done(`${site} añadida`) }

    if (!verified) {
      if (!ctx.production || !ctx.zoneId) return ctx.manual(`Verificar ${site} (con aprobación, --only cloudflare,gsc --production, con la zona activa)`)
      if (!ctx.apply) return ctx.todo(`verificar ${site} con un registro TXT en Cloudflare`)
      const domain = { type: 'INET_DOMAIN', identifier: ctx.domain }
      const { token } = (await http(`${SV}/token`, { method: 'POST', headers, body: { site: domain, verificationMethod: 'DNS_TXT' } })).data
      const cf = bearer(secret('CLOUDFLARE_USER_TOKEN', 'cloudflare-user-token'))
      const records = (await http(`${CF}/zones/${ctx.zoneId}/dns_records?type=TXT&name=${ctx.domain}`, { headers: cf })).data.result
      if (!records.some(r => r.content.replace(/"/g, '') === token)) {
        await http(`${CF}/zones/${ctx.zoneId}/dns_records`, { method: 'POST', headers: cf, body: { type: 'TXT', name: ctx.domain, content: token, ttl: 1 } })
      }
      await http(`${SV}/webResource?verificationMethod=DNS_TXT`, { method: 'POST', headers, body: { site: domain } })
      ctx.done(`${site} verificada por DNS`)
    }
    if (!ctx.production) return
    const sitemap = `https://${ctx.domain}/sitemap.xml`
    const sitemaps = (await http(`${SC}/${encodeURIComponent(site)}/sitemaps`, { headers })).data.sitemap || []
    if (sitemaps.some(s => s.path === sitemap)) return ctx.done(`sitemap ${sitemap}`)
    if (!ctx.apply) return ctx.todo(`enviar ${sitemap}`)
    await http(`${SC}/${encodeURIComponent(site)}/sitemaps/${encodeURIComponent(sitemap)}`, { method: 'PUT', headers })
    ctx.done(`sitemap ${sitemap} enviado`)
  }
}
