// Google grants connected from the panel (OAuth web flow). The refresh token is
// stored encrypted; the OAuth `state` is signed and carries a PKCE verifier
// derived from it, so the flow needs no server-side session.
import { FormsError, sha256Hex, timingSafeEqual } from './http.js'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo'
const SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/drive.file', 'openid', 'https://www.googleapis.com/auth/userinfo.email']
const REQUIRED = [SCOPES[0], SCOPES[1]]
const STATE_TTL_MS = 10 * 60 * 1000
const REF = /^[A-Za-z0-9_.-]{1,64}$/
const encoder = new TextEncoder()

const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0))

// The reference the panel connects: FORMS_GMAIL_CONNECT while a project is moving to
// the owner's own Gmail (the active FORMS_GMAIL_DEFAULT switches after the connection).
export function connectRef (env) {
  return env.FORMS_GMAIL_CONNECT || env.FORMS_GMAIL_DEFAULT || 'default'
}

export function googleConfigured (env) {
  return Boolean(env.FORMS_GOOGLE_CLIENT_ID && env.FORMS_GOOGLE_CLIENT_SECRET && grantKeyBytes(env))
}

function grantKeyBytes (env) {
  try {
    const bytes = unb64(String(env.FORMS_GRANT_KEY || ''))
    return bytes.length === 32 ? bytes : null
  } catch {
    return null
  }
}

async function keys (env) {
  const raw = grantKeyBytes(env)
  if (!raw) throw new FormsError('forms_unavailable', 503)
  const derive = async label => crypto.subtle.digest('SHA-256', new Uint8Array([...encoder.encode(label), ...raw]))
  return {
    aes: await crypto.subtle.importKey('raw', await derive('grant:'), 'AES-GCM', false, ['encrypt', 'decrypt']),
    hmac: await crypto.subtle.importKey('raw', await derive('state:'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
  }
}

export async function encryptToken (env, token, ref, account) {
  const { aes } = await keys(env)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(`${ref}|${account.toLowerCase()}`) }, aes, encoder.encode(token))
  return `${b64(iv)}.${b64(data)}`
}

export async function decryptToken (env, stored, ref, account) {
  const { aes } = await keys(env)
  const [iv, data] = String(stored).split('.')
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: encoder.encode(`${ref}|${account.toLowerCase()}`) }, aes, unb64(data))
    return new TextDecoder().decode(plain)
  } catch {
    throw new FormsError('forms_unavailable', 503)
  }
}

// Any other credential stored in D1 (mail accounts: API keys, SMTP passwords).
// `context` binds the ciphertext to its row (id, provider, sender).
export async function encryptSecret (env, secret, context) {
  const { aes } = await keys(env)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(`mail|${context}`) }, aes, encoder.encode(secret))
  return `${b64(iv)}.${b64(data)}`
}

export async function decryptSecret (env, stored, context) {
  const { aes } = await keys(env)
  const [iv, data] = String(stored).split('.')
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: encoder.encode(`mail|${context}`) }, aes, unb64(data))
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}

export function grantKeyConfigured (env) {
  return Boolean(grantKeyBytes(env))
}

// Credential for a reference connected from the panel, or null.
export async function loadGrant (env, ref) {
  if (!env.FORMS_DB || !REF.test(ref) || !googleConfigured(env)) return null
  const row = await env.FORMS_DB.prepare('SELECT account, token_enc FROM forms_grants WHERE ref = ?').bind(ref).first()
  if (!row) return null
  return { account: row.account, client_id: env.FORMS_GOOGLE_CLIENT_ID, client_secret: env.FORMS_GOOGLE_CLIENT_SECRET, refresh_token: await decryptToken(env, row.token_enc, ref, row.account) }
}

export async function listGrants (env) {
  if (!env.FORMS_DB) return []
  const rows = (await env.FORMS_DB.prepare('SELECT ref, account, scopes, created_at FROM forms_grants ORDER BY ref').all()).results
  return rows.map(row => ({ ref: row.ref, account: row.account, scopes: row.scopes.split(' '), created_at: row.created_at }))
}

async function signState (env, payload) {
  const { hmac } = await keys(env)
  const body = b64(encoder.encode(JSON.stringify(payload)))
  return `${body}.${b64(await crypto.subtle.sign('HMAC', hmac, encoder.encode(body)))}`
}

async function verifyState (env, state, now) {
  const [body, signature] = String(state || '').split('.')
  if (!body || !signature) throw new FormsError('invalid_state', 400)
  const { hmac } = await keys(env)
  let valid = false
  try {
    valid = await crypto.subtle.verify('HMAC', hmac, unb64(signature), encoder.encode(body))
  } catch {}
  if (!valid) throw new FormsError('invalid_state', 400)
  const payload = JSON.parse(new TextDecoder().decode(unb64(body)))
  if (!REF.test(payload.r) || typeof payload.n !== 'string' || typeof payload.u !== 'string' || !(payload.e > now)) throw new FormsError('invalid_state', 400)
  return payload
}

async function verifier (env, nonce) {
  const { hmac } = await keys(env)
  return b64(await crypto.subtle.sign('HMAC', hmac, encoder.encode(`pkce:${nonce}`)))
}

// The public origin the browser used: behind a mirror (Netlify proxy) the Worker sees
// its workers.dev URL, so the browser's own Origin counts when the manifest lists it.
function redirectUri (request, origins = []) {
  const origin = request.headers.get('origin')
  const base = origin && origins.includes(origin) ? origin : new URL(request.url).origin
  return `${base}/api/forms/admin/google/callback`
}

// FORMS_GOOGLE_REDIRECT: one fixed return URI registered once in the OAuth client
// (a SanSoul Worker serving /api/forms/google/relay), so a new domain needs no
// change in Google Cloud. Google returns there; the relay forwards code and
// state to this site's callback, which verifies everything as usual.
function relayUri (env) {
  try {
    const url = new URL(String(env.FORMS_GOOGLE_REDIRECT || ''))
    return url.protocol === 'https:' && url.pathname === '/api/forms/google/relay' && !url.search ? url.href : null
  } catch {
    return null
  }
}

const RELAY_TARGET = '/api/forms/admin/google/callback'

function relayAllowed (env, host) {
  return String(env.FORMS_OAUTH_RELAY_HOSTS || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean)
    .some(rule => rule.startsWith('*.') ? host.endsWith(rule.slice(1)) && host.length > rule.length - 1 : host === rule)
}

// GET /api/forms/google/relay: active only where FORMS_OAUTH_RELAY_HOSTS lists
// the sites it may forward to. Holds no secret and stores nothing: the state's
// target is read (not trusted); the site still checks the signature, the
// browser cookie and PKCE, and the code is useless without the client secret.
export function relayCallback ({ request, env }) {
  const url = new URL(request.url)
  const headers = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' }
  if (!env.FORMS_OAUTH_RELAY_HOSTS) return new Response('Not found', { status: 404, headers })
  let target
  try {
    const payload = JSON.parse(new TextDecoder().decode(unb64(String(url.searchParams.get('state') || '').split('.')[0])))
    target = new URL(payload.s)
  } catch {
    return page('Enlace no válido', 'Vuelve al panel de tu web y pulsa «Conectar Gmail» otra vez.', 400)
  }
  if (target.protocol !== 'https:' || target.pathname !== RELAY_TARGET || target.search || target.username || target.port || !relayAllowed(env, target.hostname)) {
    return page('Enlace no válido', 'Esta web no está autorizada para conectar Gmail por este enlace.', 400)
  }
  for (const key of ['code', 'state', 'error', 'scope']) {
    const value = url.searchParams.get(key)
    if (value !== null) target.searchParams.set(key, value)
  }
  return new Response(null, { status: 302, headers: { ...headers, location: target.href } })
}

// POST google/connect: returns the Google consent URL for one reference.
export async function startConnect ({ request, env, now, origins }) {
  if (!googleConfigured(env)) throw new FormsError('google_not_configured', 503)
  const body = await request.json().catch(() => ({}))
  const ref = body?.ref || connectRef(env)
  if (!REF.test(ref)) throw new FormsError('invalid_ref', 400)
  // A reference served by the secret would never use the panel's grant.
  try {
    if (Object.hasOwn(JSON.parse(env.FORMS_GMAIL_CREDENTIALS || '{}'), ref)) throw new FormsError('ref_in_secret', 409)
  } catch (error) {
    if (error instanceof FormsError) throw error
  }
  const nonce = b64(crypto.getRandomValues(new Uint8Array(16)))
  const own = redirectUri(request, origins)
  const redirect = relayUri(env) || own
  const state = await signState(env, { r: ref, n: nonce, e: now() + STATE_TTL_MS, u: redirect, ...(redirect !== own ? { s: own } : {}) })
  const challenge = b64(await crypto.subtle.digest('SHA-256', encoder.encode(await verifier(env, nonce))))
  const params = new URLSearchParams({
    client_id: env.FORMS_GOOGLE_CLIENT_ID,
    redirect_uri: redirect,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  })
  // The panel stores `nonce` as a short-lived cookie: only the browser that started the flow can finish it.
  return { url: `${AUTH_URL}?${params}`, ref, nonce }
}

const page = (title, message, status = 200) => new Response(
  `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem"><h1>${title}</h1><p>${message}</p><p><a href="/admin/">Volver al panel</a></p></body></html>`,
  { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'", 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' } }
)

const escapeHtml = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

// GET google/callback: the signed state is the only credential (issued to a
// person with panel access). Never echoes Google's error text or any token.
export async function finishConnect ({ request, env, fetch, now }) {
  if (!googleConfigured(env) || !env.FORMS_DB) throw new FormsError('google_not_configured', 503)
  const url = new URL(request.url)
  let payload
  try {
    payload = await verifyState(env, url.searchParams.get('state'), now())
  } catch {
    return page('Enlace caducado', 'Vuelve al panel y pulsa «Conectar Gmail» otra vez.', 400)
  }
  // Bound to the browser that started the flow, and usable once.
  const cookie = /(?:^|;\s*)forms_oauth=([A-Za-z0-9_-]{1,64})/.exec(request.headers.get('cookie') || '')?.[1] || ''
  if (!timingSafeEqual(cookie, payload.n)) return page('Enlace no válido', 'Abre el enlace desde el mismo navegador y panel donde pulsaste «Conectar Gmail», o vuelve a pulsarlo.', 400)
  const first = await env.FORMS_DB.prepare('INSERT INTO forms_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING').bind(`oauth:${payload.n}`, String(now())).run()
  if (first.meta?.changes !== 1) return page('Enlace caducado', 'Este enlace ya se ha usado. Vuelve al panel y pulsa «Conectar Gmail» otra vez.', 400)
  const code = url.searchParams.get('code')
  if (url.searchParams.get('error') || !code) return page('No se ha conectado', 'Google no ha dado el permiso. Puedes volver a intentarlo desde el panel.', 400)
  let tokens
  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: env.FORMS_GOOGLE_CLIENT_ID, client_secret: env.FORMS_GOOGLE_CLIENT_SECRET, redirect_uri: payload.u, code_verifier: await verifier(env, payload.n) }),
      signal: AbortSignal.timeout(10000)
    })
    tokens = response.ok ? await response.json() : null
  } catch {}
  if (!tokens?.access_token || !tokens.refresh_token) return page('No se ha conectado', 'Google no ha devuelto el permiso permanente. Vuelve a intentarlo desde el panel.', 502)
  let info
  try {
    const check = await fetch(`${TOKENINFO_URL}?access_token=${encodeURIComponent(tokens.access_token)}`, { signal: AbortSignal.timeout(10000) })
    info = check.ok ? await check.json() : null
  } catch {}
  const granted = String(info?.scope || '').split(' ')
  if (!info?.email) return page('No se ha conectado', 'No se ha podido comprobar la cuenta de Google.', 502)
  const missing = REQUIRED.filter(scope => !granted.includes(scope))
  if (missing.length) return page('Faltan permisos', 'Hay que marcar todas las casillas de permisos en la pantalla de Google (enviar correo y crear archivos). Vuelve a intentarlo desde el panel.', 400)
  const account = String(info.email).toLowerCase()
  const encrypted = await encryptToken(env, tokens.refresh_token, payload.r, account)
  await env.FORMS_DB.batch([
    env.FORMS_DB.prepare('INSERT INTO forms_grants (ref, account, scopes, token_enc, client_fp, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(ref) DO UPDATE SET account = excluded.account, scopes = excluded.scopes, token_enc = excluded.token_enc, client_fp = excluded.client_fp, created_at = excluded.created_at')
      .bind(payload.r, account, granted.join(' '), encrypted, (await sha256Hex(env.FORMS_GOOGLE_CLIENT_ID)).slice(0, 16), now()),
    env.FORMS_DB.prepare("DELETE FROM forms_meta WHERE key = 'gmail_fallback'")
  ])
  // The first account a project connects becomes its default (mail/accounts.js
  // adoptDefault), unless FORMS_GMAIL_DEFAULT or a default route already decide.
  if (!env.FORMS_GMAIL_DEFAULT) {
    await env.FORMS_DB.prepare("INSERT INTO mail_routes (kind, account, updated_at) VALUES ('default', ?, ?) ON CONFLICT (kind) DO NOTHING").bind(payload.r, now()).run().catch(() => {})
  }
  return page('Conectado', `Cuenta conectada: <strong>${escapeHtml(account)}</strong>.`)
}
