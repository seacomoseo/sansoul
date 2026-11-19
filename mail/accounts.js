// Sending accounts of the site and the route of each kind of mail.
//
// Gmail accounts are the Google grants already used by forms: the panel's
// `forms_grants` rows and the `FORMS_GMAIL_CREDENTIALS` secret. The other
// providers (Brevo, SMTP2GO, generic SMTP) live in `mail_accounts`, with the API
// key or password encrypted with FORMS_GRANT_KEY, or in the `MAIL_ACCOUNTS`
// secret. Every account shares one id namespace; a secret entry wins over a
// D1 row with the same id and is read-only in the panel.
import { FormsError, sha256Hex } from '../forms/http.js'
import { validAddress } from '../forms/mime.js'
import { decryptSecret, encryptSecret, googleConfigured, grantKeyConfigured, listGrants } from '../forms/grants.js'
import { DEFAULT_ROUTE, DRIVE_KIND, isMailKind } from './kinds.js'

export const ACCOUNT_ID = /^[A-Za-z0-9_.-]{1,64}$/
export const MAIL_PROVIDERS = Object.freeze(['brevo', 'smtp2go', 'smtp'])
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const LINE = /^[^\r\n\0]*$/

const parseJson = text => {
  try {
    const value = JSON.parse(text || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

// Validates author/panel input into the stored shape. Throws FormsError (400).
export function normalizeAccount (input, { requireSecret = true } = {}) {
  const fail = code => { throw new FormsError(code, 400) }
  const provider = String(input?.provider || '')
  if (!MAIL_PROVIDERS.includes(provider)) fail('mail_provider_invalid')
  const sender = String(input.sender || '').trim().toLowerCase()
  if (!validAddress(sender)) fail('mail_sender_invalid')
  const senderName = String(input.senderName ?? input.sender_name ?? '').trim()
  const label = String(input.label || '').trim()
  if (senderName.length > 80 || !LINE.test(senderName) || label.length > 80 || !LINE.test(label)) fail('mail_label_invalid')
  const settings = {}
  if (provider === 'smtp') {
    const host = String(input.host || input.settings?.host || '').trim().toLowerCase()
    const port = Number(input.port || input.settings?.port || 587)
    const security = String(input.security || input.settings?.security || (port === 465 ? 'tls' : 'starttls'))
    const username = String(input.username ?? input.settings?.username ?? '').trim()
    if (!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)) fail('mail_host_invalid')
    // Port 25 is blocked for Workers outbound sockets.
    if (!Number.isInteger(port) || port < 1 || port > 65535 || port === 25) fail('mail_port_invalid')
    if (!['starttls', 'tls'].includes(security)) fail('mail_security_invalid')
    if (!username || username.length > 254 || !LINE.test(username)) fail('mail_username_invalid')
    Object.assign(settings, { host, port, security, username })
  }
  const secret = input.secret ?? input.api_key ?? input.apiKey ?? input.password
  if (secret !== undefined && secret !== null && secret !== '') {
    if (typeof secret !== 'string' || secret.length > 500 || !LINE.test(secret)) fail('mail_secret_invalid')
  } else if (requireSecret) fail('mail_secret_required')
  return { provider, sender, senderName, label, settings, secret: secret || '' }
}

// Who the account is: rotating its key or password keeps the authority; another
// provider, sender, server or user does not (jobs then stay `authority_drift`).
export async function accountFingerprint ({ provider, sender, settings = {} }) {
  return (await sha256Hex([provider, sender.toLowerCase(), settings.host || '', settings.username || ''].join('\n'))).slice(0, 32)
}

function secretAccounts (env) {
  const accounts = new Map()
  for (const [id, value] of Object.entries(parseJson(env.MAIL_ACCOUNTS))) {
    if (!ACCOUNT_ID.test(id)) continue
    try {
      accounts.set(id, { id, ...normalizeAccount(value), source: 'secret' })
    } catch {
      console.error('mail_secret_account_invalid', id)
    }
  }
  return accounts
}

function gmailSecretRefs (env) {
  const refs = new Map()
  for (const [ref, value] of Object.entries(parseJson(env.FORMS_GMAIL_CREDENTIALS))) {
    if (ACCOUNT_ID.test(ref) && validAddress(value?.account)) refs.set(ref, value.account.toLowerCase())
  }
  return refs
}

// Reads tolerate a database without migration 0006 (nothing configured yet).
async function rows (env, sql, ...values) {
  if (!env.FORMS_DB) return []
  try {
    return (await env.FORMS_DB.prepare(sql).bind(...values).all()).results
  } catch {
    return []
  }
}

async function panelRow (env, id) {
  return (await rows(env, 'SELECT * FROM mail_accounts WHERE id = ?', id))[0] || null
}

async function grantRow (env, id) {
  if (!googleConfigured(env)) return null
  return (await rows(env, 'SELECT ref, account, scopes FROM forms_grants WHERE ref = ?', id))[0] || null
}

const context = (id, provider, sender) => `${id}|${provider}|${sender.toLowerCase()}`

// Provider of an account id, or null when no account has that id.
export async function accountProvider (env, id) {
  if (!id || !ACCOUNT_ID.test(id)) return null
  const secret = secretAccounts(env).get(id)
  if (secret) return secret.provider
  if (gmailSecretRefs(env).has(id)) return 'gmail'
  const row = await panelRow(env, id)
  if (row) return row.provider
  return await grantRow(env, id) ? 'gmail' : null
}

// A non-Gmail account with its secret, or null. `secret` is null when the stored
// value can no longer be decrypted (FORMS_GRANT_KEY rotated).
export async function loadAccount (env, id) {
  if (!id || !ACCOUNT_ID.test(id)) return null
  const secret = secretAccounts(env).get(id)
  if (secret) return { ...secret, fingerprint: await accountFingerprint(secret) }
  if (gmailSecretRefs(env).has(id)) return null
  const row = await panelRow(env, id)
  if (!row) return null
  const settings = parseJson(row.settings)
  const value = { id, provider: row.provider, sender: row.sender, senderName: row.sender_name, label: row.label, settings, source: 'panel' }
  return {
    ...value,
    secret: grantKeyConfigured(env) ? await decryptSecret(env, row.secret_enc, context(id, row.provider, row.sender)) : null,
    fingerprint: row.fingerprint
  }
}

const publicSettings = settings => settings.host ? { host: settings.host, port: settings.port, security: settings.security, username: settings.username } : {}

// Every account, without secrets, for the panel and the routing table.
export async function listAccounts (env) {
  const list = new Map()
  for (const account of secretAccounts(env).values()) {
    list.set(account.id, { id: account.id, provider: account.provider, sender: account.sender, senderName: account.senderName, label: account.label, settings: publicSettings(account.settings), source: 'secret' })
  }
  for (const [ref, account] of gmailSecretRefs(env)) {
    if (!list.has(ref)) list.set(ref, { id: ref, provider: 'gmail', sender: account, senderName: '', label: '', settings: {}, source: 'secret', drive: null })
  }
  for (const row of await rows(env, 'SELECT id, provider, label, sender, sender_name, settings, tested_at, test_error, updated_at FROM mail_accounts ORDER BY id')) {
    if (list.has(row.id)) continue
    list.set(row.id, { id: row.id, provider: row.provider, sender: row.sender, senderName: row.sender_name, label: row.label, settings: publicSettings(parseJson(row.settings)), source: 'panel', testedAt: row.tested_at, testError: row.test_error, updatedAt: row.updated_at })
  }
  if (googleConfigured(env)) {
    for (const grant of await listGrants(env).catch(() => [])) {
      if (list.has(grant.ref)) continue
      list.set(grant.ref, { id: grant.ref, provider: 'gmail', sender: grant.account, senderName: '', label: '', settings: {}, source: 'panel', drive: grant.scopes.includes(DRIVE_SCOPE), updatedAt: grant.created_at })
    }
  }
  return [...list.values()]
}

function requireDb (env) {
  if (!env.FORMS_DB) throw new FormsError('forms_unavailable', 503)
  return env.FORMS_DB
}

const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'cuenta'

// Creates or updates a panel account. Leaving the secret empty keeps the stored one.
export async function saveAccount (env, input, now) {
  const db = requireDb(env)
  if (!grantKeyConfigured(env)) throw new FormsError('grant_key_missing', 503)
  const id = String(input?.id || '').trim()
  if (id && !ACCOUNT_ID.test(id)) throw new FormsError('mail_account_id_invalid', 400)
  const existing = id ? await panelRow(env, id) : null
  const account = normalizeAccount(input, { requireSecret: !existing })
  const target = id || `${account.provider}-${slug(account.sender.split('@')[0])}`
  if (secretAccounts(env).has(target) || gmailSecretRefs(env).has(target)) throw new FormsError('account_in_secret', 409)
  if (await grantRow(env, target)) throw new FormsError('account_exists', 409)
  if (!id && await panelRow(env, target)) throw new FormsError('account_exists', 409)
  let secret = account.secret
  if (!secret) {
    secret = await decryptSecret(env, existing.secret_enc, context(target, existing.provider, existing.sender))
    if (!secret) throw new FormsError('mail_secret_required', 400)
  }
  const fingerprint = await accountFingerprint(account)
  const encrypted = await encryptSecret(env, secret, context(target, account.provider, account.sender))
  try {
    await db.prepare(
      `INSERT INTO mail_accounts (id, provider, label, sender, sender_name, settings, secret_enc, fingerprint, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
       ON CONFLICT (id) DO UPDATE SET provider = excluded.provider, label = excluded.label, sender = excluded.sender,
         sender_name = excluded.sender_name, settings = excluded.settings, secret_enc = excluded.secret_enc,
         fingerprint = excluded.fingerprint, updated_at = excluded.updated_at, tested_at = NULL, test_error = NULL`
    ).bind(target, account.provider, account.label, account.sender, account.senderName, JSON.stringify(account.settings), encrypted, fingerprint, now).run()
  } catch {
    throw new FormsError('mail_tables_missing', 503)
  }
  await adoptDefault(env, target, now)
  return target
}

// Removes a panel account (a Gmail one disconnects its grant) and its routes.
export async function deleteAccount (env, id) {
  const db = requireDb(env)
  if (!ACCOUNT_ID.test(id)) throw new FormsError('mail_account_id_invalid', 400)
  if (secretAccounts(env).has(id) || gmailSecretRefs(env).has(id)) throw new FormsError('account_in_secret', 409)
  const results = await db.batch([
    db.prepare('DELETE FROM mail_accounts WHERE id = ?').bind(id),
    db.prepare('DELETE FROM forms_grants WHERE ref = ?').bind(id),
    db.prepare('DELETE FROM mail_routes WHERE account = ?').bind(id)
  ])
  return results[0].meta.changes + results[1].meta.changes > 0
}

export async function recordTest (env, id, error, now) {
  await env.FORMS_DB?.prepare('UPDATE mail_accounts SET tested_at = ?, test_error = ? WHERE id = ?').bind(now, error || null, id).run().catch(() => {})
}

export async function loadRoutes (env) {
  const routes = {}
  for (const row of await rows(env, 'SELECT kind, account FROM mail_routes')) routes[row.kind] = row.account
  return routes
}

// `{ kind: accountId | '' }`; an empty value removes the route.
export async function saveRoutes (env, routes, now) {
  const db = requireDb(env)
  if (!routes || typeof routes !== 'object' || Array.isArray(routes)) throw new FormsError('mail_routes_invalid', 400)
  const statements = []
  for (const [kind, account] of Object.entries(routes)) {
    if (kind !== DEFAULT_ROUTE && !isMailKind(kind)) throw new FormsError('mail_kind_invalid', 400)
    if (account === '' || account === null) {
      statements.push(db.prepare('DELETE FROM mail_routes WHERE kind = ?').bind(kind))
      continue
    }
    const provider = await accountProvider(env, account)
    if (!provider) throw new FormsError('mail_account_missing', 400)
    if (kind === DRIVE_KIND && provider !== 'gmail') throw new FormsError('mail_drive_needs_gmail', 400)
    statements.push(db.prepare('INSERT INTO mail_routes (kind, account, updated_at) VALUES (?, ?, ?) ON CONFLICT (kind) DO UPDATE SET account = excluded.account, updated_at = excluded.updated_at').bind(kind, account, now))
  }
  if (!statements.length) return
  try {
    await db.batch(statements)
  } catch {
    throw new FormsError('mail_tables_missing', 503)
  }
}

// The first account a project configures becomes its default, unless a
// default already exists (a route, or the FORMS_GMAIL_DEFAULT variable).
export async function adoptDefault (env, id, now) {
  if (env.FORMS_GMAIL_DEFAULT) return
  await env.FORMS_DB?.prepare("INSERT INTO mail_routes (kind, account, updated_at) VALUES ('default', ?, ?) ON CONFLICT (kind) DO NOTHING").bind(id, now).run().catch(() => {})
}

// Account for one kind of mail: an explicit choice (`account`: a form's own
// `form.account`), the kind's route, a Worker variable for that feature
// (`fallback`: COMMERCE_NOTIFY_ACCOUNT), the default route, then the legacy
// FORMS_GMAIL_DEFAULT. Returns { id, source } or null.
export async function resolveAccountId (env, kind, { account = '', fallback = '', routes } = {}) {
  routes ||= await loadRoutes(env)
  if (account) return { id: account, source: 'form' }
  if (routes[kind]) return { id: routes[kind], source: 'route' }
  if (fallback) return { id: fallback, source: 'variable' }
  if (routes[DEFAULT_ROUTE]) return { id: routes[DEFAULT_ROUTE], source: 'default' }
  if (env.FORMS_GMAIL_DEFAULT) return { id: env.FORMS_GMAIL_DEFAULT, source: 'variable' }
  return null
}
