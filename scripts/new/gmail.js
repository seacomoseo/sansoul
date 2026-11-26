/*
Purpose: `gmail` step. Leaves «Conectar Gmail» ready in the Correo and
  Formularios panels: the Worker secrets FORMS_GOOGLE_CLIENT_ID and
  FORMS_GOOGLE_CLIENT_SECRET (shared OAuth Web client) and FORMS_GRANT_KEY
  (32 random bytes per project). An existing FORMS_GRANT_KEY is never
  replaced: it encrypts the tokens already stored in D1. The secrets need the
  Worker, so a new project repeats the step after its first deploy. The
  callback URI on the OAuth client is registered by hand (browser).
Credentials: CLOUDFLARE_USER_TOKEN or secrets file cloudflare-user-token;
  SANSOUL_GOOGLE_OAUTH_CLIENT or secrets file google-sansoul-oauth-client.json.
*/
import crypto from 'node:crypto'
import fs from 'node:fs'
import { parse } from 'yaml'
import { bearer, http, secret } from './lib.js'

const CF = 'https://api.cloudflare.com/client/v4'
export const SECRETS = ['FORMS_GOOGLE_CLIENT_ID', 'FORMS_GOOGLE_CLIENT_SECRET', 'FORMS_GRANT_KEY']

export function callbackUri (domain) {
  return `https://${domain}/api/forms/admin/google/callback`
}

// Secrets still missing on the Worker; the OAuth client ones are refreshed on
// --rotate, the grant key never (it would orphan the connected accounts).
export function missingSecrets (present, rotate = false) {
  return SECRETS.filter(name => !present.includes(name) || (rotate && name !== 'FORMS_GRANT_KEY'))
}

export function grantKey () {
  return crypto.randomBytes(32).toString('base64url')
}

function oauthClient () {
  const web = JSON.parse(secret('SANSOUL_GOOGLE_OAUTH_CLIENT', 'google-sansoul-oauth-client.json')).web || {}
  if (!web.client_id || !web.client_secret) throw new Error('cliente OAuth sin client_id/client_secret')
  return { FORMS_GOOGLE_CLIENT_ID: web.client_id, FORMS_GOOGLE_CLIENT_SECRET: web.client_secret }
}

export default {
  id: 'gmail',
  title: 'Conectar Gmail (panel de Correo)',
  async run (ctx) {
    if (!ctx.cfAccount) return ctx.todo('Gmail: falta la cuenta de Cloudflare (ejecutar junto al paso cloudflare)')
    const auth = bearer(secret('CLOUDFLARE_USER_TOKEN', 'cloudflare-user-token'))
    const base = `${CF}/accounts/${ctx.cfAccount}/workers/scripts/${ctx.worker}/secrets`
    let present
    try {
      present = (await http(base, { headers: auth })).data.result.map(s => s.name)
    } catch (error) {
      if (error.status !== 404) throw error
      return ctx.todo(`Gmail: el Worker ${ctx.worker} aún no existe; repetir el paso tras el primer despliegue`)
    }
    const missing = missingSecrets(present, ctx.rotate)
    if (!missing.length) ctx.done(`secretos ${SECRETS.join(', ')}`)
    else if (!ctx.apply) ctx.todo(`guardar en el Worker ${missing.join(', ')}`)
    else {
      const values = { ...oauthClient(), FORMS_GRANT_KEY: grantKey() }
      for (const name of missing) await http(base, { method: 'PUT', headers: auth, body: { name, text: values[name], type: 'secret_text' } })
      ctx.done(`secretos guardados: ${missing.join(', ')}`)
    }
    const vars = ctx.dir && fs.existsSync(`${ctx.dir}/hugo.yml`) ? parse(fs.readFileSync(`${ctx.dir}/hugo.yml`, 'utf8'))?.params?.worker_vars || {} : {}
    if (vars.FORMS_PROVIDER !== 'gmail' || !vars.FORMS_GMAIL_DEFAULT) ctx.warn('hugo.yml → params.worker_vars: FORMS_PROVIDER: gmail y FORMS_GMAIL_DEFAULT: <referencia corta del proyecto>')
    ctx.warn(`URI de retorno en el cliente OAuth «SanSoul Web», si falta (el agente: ~/Agentes/scripts/navegador/sansoul-oauth-uri.cjs): ${callbackUri(ctx.domain)}`)
  }
}
