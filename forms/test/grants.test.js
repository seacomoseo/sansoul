import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { decryptToken, encryptToken, finishConnect, googleConfigured, listGrants, loadGrant, startConnect } from '../grants.js'
import { createBindings } from './helpers.js'

let bindings
before(async () => { bindings = await createBindings() })
after(async () => { await bindings.dispose() })

const KEY = Buffer.alloc(32, 7).toString('base64url')
const baseEnv = () => ({ FORMS_DB: bindings.db, FORMS_GRANT_KEY: KEY, FORMS_GOOGLE_CLIENT_ID: 'client-id', FORMS_GOOGLE_CLIENT_SECRET: 'client-secret', FORMS_GMAIL_DEFAULT: 'shop' })
const SCOPE = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/drive.file openid https://www.googleapis.com/auth/userinfo.email'

function googleFetch ({ scope = SCOPE, refresh = 'refresh-secret-123', email = 'Owner@Example.com' } = {}) {
  const calls = []
  const fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? Object.fromEntries(init.body) : null })
    if (String(url) === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'access', ...(refresh ? { refresh_token: refresh } : {}) })
    if (String(url).startsWith('https://oauth2.googleapis.com/tokeninfo')) return Response.json({ email, scope })
    return new Response('{}', { status: 404 })
  }
  return { fetch, calls }
}

const withCookie = (nonce, url) => new Request(url, { headers: { cookie: `forms_oauth=${nonce}` } })

async function connect (env, request = new Request('https://example.test/api/forms/admin/google/connect', { method: 'POST', body: '{}' }), now = () => 1_000_000) {
  const { url, ref, nonce } = await startConnect({ request, env, now })
  return { params: new URL(url).searchParams, ref, nonce, now }
}

test('encryption is bound to reference and account and never stores the token in clear', async () => {
  const env = baseEnv()
  const stored = await encryptToken(env, 'tok', 'shop', 'a@example.com')
  assert.doesNotMatch(stored, /tok/)
  assert.equal(await decryptToken(env, stored, 'shop', 'A@Example.com'), 'tok')
  await assert.rejects(decryptToken(env, stored, 'other', 'a@example.com'), { code: 'forms_unavailable' })
  await assert.rejects(decryptToken({ ...env, FORMS_GRANT_KEY: Buffer.alloc(32, 8).toString('base64url') }, stored, 'shop', 'a@example.com'))
})

test('connect: consent URL asks offline access with PKCE and the right scopes; unconfigured fails closed', async () => {
  const { params, ref } = await connect(baseEnv())
  assert.equal(ref, 'shop')
  assert.equal(params.get('access_type'), 'offline')
  assert.equal(params.get('prompt'), 'consent')
  assert.equal(params.get('code_challenge_method'), 'S256')
  assert.equal(params.get('redirect_uri'), 'https://example.test/api/forms/admin/google/callback')
  assert.ok(params.get('scope').includes('gmail.send') && params.get('scope').includes('drive.file'))
  assert.equal(googleConfigured({ ...baseEnv(), FORMS_GRANT_KEY: 'short' }), false)
  await assert.rejects(connect({ ...baseEnv(), FORMS_GRANT_KEY: undefined }), { code: 'google_not_configured' })
})

test('callback stores an encrypted grant that loadGrant returns; the code is exchanged with the PKCE verifier', async () => {
  const env = baseEnv()
  const { params, nonce, now } = await connect(env)
  const google = googleFetch()
  const response = await finishConnect({ request: withCookie(nonce, `https://example.test/api/forms/admin/google/callback?code=abc&state=${encodeURIComponent(params.get('state'))}`), env, fetch: google.fetch, now })
  assert.equal(response.status, 200)
  assert.match(await response.text(), /owner@example\.com/)
  const exchange = google.calls[0].body
  assert.equal(exchange.code, 'abc')
  assert.equal(exchange.redirect_uri, 'https://example.test/api/forms/admin/google/callback')
  const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(exchange.code_verifier))).toString('base64url')
  assert.equal(challenge, params.get('code_challenge'))
  const row = await bindings.db.prepare('SELECT * FROM forms_grants WHERE ref = ?').bind('shop').first()
  assert.doesNotMatch(JSON.stringify(row), /refresh-secret/)
  assert.deepEqual(await loadGrant(env, 'shop'), { account: 'owner@example.com', client_id: 'client-id', client_secret: 'client-secret', refresh_token: 'refresh-secret-123' })
  assert.equal((await listGrants(env))[0].account, 'owner@example.com')
  assert.equal(await loadGrant(env, 'nope'), null)
  // Single use: the same link again is refused, with or without the cookie.
  const again = await finishConnect({ request: withCookie(nonce, `https://example.test/x?code=abc&state=${encodeURIComponent(params.get('state'))}`), env, fetch: googleFetch().fetch, now })
  assert.equal(again.status, 400)
})

test('callback needs the cookie of the browser that started the flow; secret-served refs cannot be connected', async () => {
  const env = baseEnv()
  const { params, nonce, now } = await connect(env)
  const link = `https://example.test/x?code=abc&state=${encodeURIComponent(params.get('state'))}`
  const stolen = await finishConnect({ request: new Request(link), env, fetch: googleFetch().fetch, now })
  assert.equal(stolen.status, 400)
  assert.equal((await finishConnect({ request: withCookie('other', link), env, fetch: googleFetch().fetch, now })).status, 400)
  // The refused attempts did not burn the link: the real browser still finishes.
  assert.equal((await finishConnect({ request: withCookie(nonce, link), env, fetch: googleFetch().fetch, now })).status, 200)
  const served = { ...env, FORMS_GMAIL_CREDENTIALS: JSON.stringify({ shop: { account: 'a@example.com' } }) }
  await assert.rejects(connect(served), { code: 'ref_in_secret' })
})

test('callback rejects a forged, tampered or expired state and missing permissions', async () => {
  const env = baseEnv()
  const { params, nonce, now } = await connect(env)
  const state = params.get('state')
  const finish = (value, fetchImpl = googleFetch().fetch, at = now) => finishConnect({ request: withCookie(nonce, `https://example.test/x?code=abc&state=${encodeURIComponent(value)}`), env, fetch: fetchImpl, now: at })
  assert.equal((await finish('garbage')).status, 400)
  const [body, signature] = state.split('.')
  const forged = Buffer.from(JSON.stringify({ r: 'evil', n: 'x', e: 9e15 })).toString('base64url')
  assert.equal((await finish(`${forged}.${signature}`)).status, 400)
  assert.equal((await finish(`${body}.${signature.slice(0, -2)}AA`)).status, 400)
  assert.equal((await finish(state, undefined, () => 1_000_000 + 11 * 60 * 1000)).status, 400)
  const before = (await bindings.db.prepare('SELECT COUNT(*) AS n FROM forms_grants').first()).n
  // Each attempt that reaches Google burns its link, so every case starts a flow.
  const attempt = async fetchImpl => {
    const next = await connect(env)
    return finishConnect({ request: withCookie(next.nonce, `https://example.test/x?code=abc&state=${encodeURIComponent(next.params.get('state'))}`), env, fetch: fetchImpl, now: next.now })
  }
  assert.equal((await attempt(googleFetch({ scope: 'https://www.googleapis.com/auth/gmail.send openid https://www.googleapis.com/auth/userinfo.email' }).fetch)).status, 400)
  assert.equal((await attempt(googleFetch({ refresh: null }).fetch)).status, 502)
  assert.equal((await bindings.db.prepare('SELECT COUNT(*) AS n FROM forms_grants').first()).n, before)
})

test('fallback: a dead main credential sends through the backup and records it; ambiguous never falls back', async () => {
  const { createGmailProvider } = await import('../providers/gmail.js')
  const sends = []
  const fetch = async (url, init) => {
    const href = String(url)
    if (href === 'https://oauth2.googleapis.com/token') {
      const client = init.body.get('client_id')
      return client === 'dead' ? new Response('{}', { status: 400 }) : Response.json({ access_token: `at-${client}`, scope: SCOPE })
    }
    if (href.startsWith('https://oauth2.googleapis.com/tokeninfo')) return Response.json({ email: href.includes('at-backup') ? 'backup@example.com' : 'main@example.com', scope: SCOPE })
    sends.push(init.headers.authorization)
    return sends.fail ? Promise.reject(new TypeError('boom')) : Response.json({ id: 'm1' })
  }
  const env = {
    ...baseEnv(),
    FORMS_GMAIL_CREDENTIALS: JSON.stringify({
      main: { account: 'main@example.com', client_id: 'dead', client_secret: 's', refresh_token: 'r' },
      backup: { account: 'backup@example.com', client_id: 'backup', client_secret: 's', refresh_token: 'r' }
    }),
    FORMS_GMAIL_DEFAULT: 'main',
    FORMS_GMAIL_FALLBACK: 'backup'
  }
  const provider = createGmailProvider({ fetch })
  const authority = await provider.authority(env, {})
  const message = { to: ['x@example.com'], subject: 's', text: 't', messageId: 'id-1' }
  const result = await provider.send({ env, authority, message, signal: AbortSignal.timeout(5000), beforeSend: async () => {} })
  assert.equal(result.via, 'fallback')
  assert.deepEqual(sends, ['Bearer at-backup'])
  const meta = JSON.parse((await bindings.db.prepare("SELECT value FROM forms_meta WHERE key = 'gmail_fallback'").first()).value)
  assert.equal(meta.reason, 'gmail_grant_invalid')
  // Without a backup the original error surfaces.
  await assert.rejects(provider.send({ env: { ...env, FORMS_GMAIL_FALLBACK: '' }, authority, message, signal: AbortSignal.timeout(5000), beforeSend: async () => {} }), { code: 'gmail_grant_invalid' })
})

test('behind a mirror the redirect URI is the browser origin listed in the manifest, and the exchange reuses it', async () => {
  const env = baseEnv()
  const request = new Request('https://workers.example/api/forms/admin/google/connect', { method: 'POST', body: '{}', headers: { origin: 'https://public.example' } })
  const { url, nonce } = await startConnect({ request, env, now: () => 1_000_000, origins: ['https://public.example'] })
  const params = new URL(url).searchParams
  assert.equal(params.get('redirect_uri'), 'https://public.example/api/forms/admin/google/callback')
  // An origin the manifest does not list is ignored.
  const other = await startConnect({ request: new Request('https://workers.example/x', { method: 'POST', body: '{}', headers: { origin: 'https://evil.example' } }), env, now: () => 1_000_000, origins: ['https://public.example'] })
  assert.equal(new URL(other.url).searchParams.get('redirect_uri'), 'https://workers.example/api/forms/admin/google/callback')
  const google = googleFetch()
  const done = await finishConnect({ request: withCookie(nonce, `https://workers.example/api/forms/admin/google/callback?code=abc&state=${encodeURIComponent(params.get('state'))}`), env, fetch: google.fetch, now: () => 1_000_000 })
  assert.equal(done.status, 200)
  assert.equal(google.calls[0].body.redirect_uri, 'https://public.example/api/forms/admin/google/callback')
})
