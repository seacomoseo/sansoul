/*
Purpose: `ga4` step. Property «<domain>» in the agency GA4 account with its web
  stream, user-data acknowledgement, 14-month retention, key event `contact`,
  custom dimensions id/label/type and Viewer access for the project mails.
  The measurement id goes to data/config.yml `ga4` (editable from the CMS).
Credentials: Google grants google-seo-token.json (analytics.edit) and, for
  user access only, google-seacomoseo-oauth-token.json (analytics.manage.users).
*/
import fs from 'node:fs'
import path from 'node:path'
import { bearer, googleAccessToken, hasSecret, http } from './lib.js'
import { editYaml } from './repo.js'
import { unconfirmedMails } from './mails.js'

export const GA4_ACCOUNT = process.env.SANSOUL_GA4_ACCOUNT || '2157126'
const API = 'https://analyticsadmin.googleapis.com'
export const DIMENSIONS = [['id', 'ID'], ['label', 'Label'], ['type', 'Type']]
const ACK = 'I acknowledge that I have the necessary privacy disclosures and rights from my end users for the collection and processing of their data, including the association of such data with the visitation information Google Analytics collects from my site and/or app property.'

export default {
  id: 'ga4',
  title: 'Google Analytics 4',
  async run (ctx) {
    const headers = bearer(await googleAccessToken('google-seo-token.json'))
    const api = (p, options = {}) => http(`${API}${p}`, { ...options, headers }).then(r => r.data || {})
    const list = async (p, key) => (await api(`${p}${p.includes('?') ? '&' : '?'}pageSize=200`))[key] || []

    const properties = await list(`/v1beta/properties?filter=${encodeURIComponent(`parent:accounts/${GA4_ACCOUNT}`)}`, 'properties')
    // An existing project keeps the property behind its data/config.yml id,
    // whatever its name; one outside the agency account is left alone.
    const configured = configuredId(ctx.dir)
    let property = null
    if (configured) {
      for (const candidate of properties) {
        const streams = await list(`/v1beta/${candidate.name}/dataStreams`, 'dataStreams')
        if (streams.some(s => s.webStreamData?.measurementId === configured)) { property = candidate; break }
      }
      if (!property) {
        ctx.done(`data/config.yml usa ${configured}, fuera de la cuenta GA4 ${GA4_ACCOUNT}: no se toca`)
        return ctx.manual(`GA4 ${configured}: revisar retención de 14 meses, evento clave contact y dimensiones id/label/type en su cuenta`)
      }
    } else property = properties.find(p => p.displayName === ctx.domain)
    if (property) ctx.done(`propiedad «${property.displayName}» (${property.name})`)
    else if (!ctx.apply) return ctx.todo(`crear la propiedad «${ctx.domain}» (Europe/Madrid, EUR) con flujo web, retención de 14 meses, evento clave contact y dimensiones id/label/type`)
    else {
      property = await api('/v1beta/properties', { method: 'POST', body: { parent: `accounts/${GA4_ACCOUNT}`, displayName: ctx.domain, timeZone: 'Europe/Madrid', currencyCode: 'EUR' } })
      await api(`/v1beta/${property.name}:acknowledgeUserDataCollection`, { method: 'POST', body: { acknowledgement: ACK } })
      ctx.done(`propiedad «${ctx.domain}» creada (${property.name}) y recogida de datos confirmada`)
    }
    const p = property.name
    ctx.ga4Property = p

    let stream = (await list(`/v1beta/${p}/dataStreams`, 'dataStreams')).find(s => s.type === 'WEB_DATA_STREAM')
    if (stream) ctx.done(`flujo web ${stream.webStreamData.measurementId}`)
    else if (!ctx.apply) ctx.todo(`crear el flujo web https://${ctx.domain}`)
    else {
      stream = await api(`/v1beta/${p}/dataStreams`, { method: 'POST', body: { type: 'WEB_DATA_STREAM', displayName: ctx.domain, webStreamData: { defaultUri: `https://${ctx.domain}` } } })
      ctx.done(`flujo web creado ${stream.webStreamData.measurementId}`)
    }

    const retention = await api(`/v1beta/${p}/dataRetentionSettings`)
    if (retention.eventDataRetention === 'FOURTEEN_MONTHS') ctx.done('retención de 14 meses')
    else if (!ctx.apply) ctx.todo('retención de datos de eventos a 14 meses')
    else {
      await api(`/v1beta/${p}/dataRetentionSettings?updateMask=eventDataRetention`, { method: 'PATCH', body: { eventDataRetention: 'FOURTEEN_MONTHS' } })
      ctx.done('retención a 14 meses')
    }

    if ((await list(`/v1beta/${p}/keyEvents`, 'keyEvents')).some(e => e.eventName === 'contact')) ctx.done('evento clave contact')
    else if (!ctx.apply) ctx.todo('evento clave contact')
    else { await api(`/v1beta/${p}/keyEvents`, { method: 'POST', body: { eventName: 'contact', countingMethod: 'ONCE_PER_EVENT' } }); ctx.done('evento clave contact') }

    const dimensions = (await list(`/v1beta/${p}/customDimensions`, 'customDimensions')).map(d => d.parameterName)
    const missing = DIMENSIONS.filter(([param]) => !dimensions.includes(param))
    if (!missing.length) ctx.done('dimensiones id, label y type')
    else if (!ctx.apply) ctx.todo(`dimensiones ${missing.map(([param]) => param).join(', ')}`)
    else {
      for (const [parameterName, displayName] of missing) {
        await api(`/v1beta/${p}/customDimensions`, { method: 'POST', body: { parameterName, displayName, scope: 'EVENT' } })
      }
      ctx.done(`dimensiones ${missing.map(([param]) => param).join(', ')}`)
    }

    await access(ctx, p)

    const measurement = stream?.webStreamData?.measurementId
    if (measurement && ctx.dir && fs.existsSync(path.join(ctx.dir, 'data', 'config.yml'))) {
      const file = path.join(ctx.dir, 'data', 'config.yml')
      const current = fs.readFileSync(file, 'utf8').match(/^ga4:\s*(\S+)/m)?.[1]
      if (current === measurement) ctx.done(`data/config.yml ga4 = ${measurement}`)
      else if (current) ctx.warn(`data/config.yml tiene ga4 ${current}, distinto de ${measurement}: no se cambia`)
      else if (!ctx.apply) ctx.todo(`data/config.yml ga4 = ${measurement}`)
      else { editYaml(file, doc => doc.set('ga4', measurement)); ctx.changed.push('data/config.yml'); ctx.done(`data/config.yml ga4 = ${measurement}`) }
    }
    await signals(ctx, p, headers)
  }
}

// Google Signals: readable by API; enabling may need consent given in the UI.
async function signals (ctx, property, headers) {
  const url = `${API}/v1alpha/${property}/googleSignalsSettings`
  const link = `https://analytics.google.com/analytics/web/#/a${GA4_ACCOUNT}p${property.split('/')[1]}/admin/datapolicies/datacollection`
  const current = (await http(url, { headers, ok: [200, 403] })).data || {}
  if (current.state === 'GOOGLE_SIGNALS_ENABLED') return ctx.done('Google Signals activo')
  if (!ctx.apply) return ctx.todo('activar Google Signals')
  try {
    await http(`${url}?updateMask=state`, { method: 'PATCH', headers, body: { state: 'GOOGLE_SIGNALS_ENABLED' } })
    ctx.done('Google Signals activado')
  } catch {
    ctx.manual(`Activar Google Signals: ${link}`)
  }
}

function configuredId (dir) {
  const file = dir && path.join(dir, 'data', 'config.yml')
  if (!file || !fs.existsSync(file)) return ''
  return fs.readFileSync(file, 'utf8').match(/^ga4:\s*["']?(G-[A-Z0-9]+)/m)?.[1] || ''
}

async function access (ctx, property) {
  if (!ctx.mails.length) return
  if (!hasSecret('', 'google-seacomoseo-oauth-token.json')) return ctx.manual(`Dar acceso de lectura en GA4 a ${ctx.mails.join(', ')} (falta el grant google-seacomoseo)`)
  const headers = bearer(await googleAccessToken('google-seacomoseo-oauth-token.json'))
  const bindings = (await http(`${API}/v1alpha/${property}/accessBindings?pageSize=200`, { headers })).data.accessBindings || []
  const users = bindings.map(b => (b.user || '').toLowerCase())
  const missing = ctx.mails.filter(m => !users.includes(m.toLowerCase()))
  if (!missing.length) return ctx.done(`acceso GA4 de ${ctx.mails.join(', ')}`)
  if (!ctx.apply) return ctx.todo(`acceso de lectura en GA4 para ${missing.join(', ')}${ctx.mailsSource === 'hugo.yml' ? ' (de params.drive_mails: confírmalos)' : ''}`)
  if (!await ctx.confirmMails()) return unconfirmedMails(ctx, `Lectura en GA4 para ${missing.join(', ')}`)
  for (const user of missing) {
    await http(`${API}/v1alpha/${property}/accessBindings`, { method: 'POST', headers, body: { user, roles: ['predefinedRoles/viewer'] } })
  }
  ctx.done(`acceso de lectura en GA4 para ${missing.join(', ')}`)
}
