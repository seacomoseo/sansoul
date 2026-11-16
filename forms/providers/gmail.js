import { FormsError, sha256Hex } from '../http.js'
import { buildMime, validAddress } from '../mime.js'
import { DRIVE_SCOPE, createDrive } from './drive.js'
import { DeliveryError } from './errors.js'
import { loadGrant } from '../grants.js'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo'
const SEND_URL = 'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media'
const SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'
const REF = /^[A-Za-z0-9_.-]{1,64}$/
// Rejections that sent nothing: a dead credential, a wrong account, or quota.
const FALLBACK_CODES = new Set(['gmail_grant_invalid', 'gmail_scope_missing', 'gmail_identity_mismatch', 'gmail_identity_unverified', 'gmail_token_failed', 'gmail_quota', 'gmail_rate_limited'])

// FORMS_GMAIL_CREDENTIALS (secret) maps a reference to one Google identity:
// { "<ref>": { "account", "client_id", "client_secret", "refresh_token" } }.
// The form selects a reference (author config) or FORMS_GMAIL_DEFAULT applies.
// A reference not in the secret is looked up among the grants connected from the panel.
async function credential (env, ref) {
  let credentials
  try {
    credentials = JSON.parse(env.FORMS_GMAIL_CREDENTIALS || '{}')
  } catch {
    throw new FormsError('forms_unavailable', 503)
  }
  const value = REF.test(ref) && Object.hasOwn(credentials, ref) ? credentials[ref] : await loadGrant(env, ref)
  if (!value || !validAddress(value.account) || !['client_id', 'client_secret', 'refresh_token'].every(key => typeof value[key] === 'string' && value[key])) {
    throw new FormsError('forms_unavailable', 503)
  }
  return value
}

export function createGmailProvider ({ fetch }) {
  const tokens = new Map()

  const drive = createDrive({ fetch })

  // Returns the attested access token and its granted scopes.
  async function accessToken (value, fingerprint, signal) {
    const cached = tokens.get(fingerprint)
    if (cached && cached.expiresAt > Date.now() + 60000) return cached
    let response
    try {
      response = await fetch(TOKEN_URL, {
        method: 'POST',
        body: new URLSearchParams({ grant_type: 'refresh_token', client_id: value.client_id, client_secret: value.client_secret, refresh_token: value.refresh_token }),
        signal
      })
    } catch {
      throw new DeliveryError('gmail_token_unreachable', 'retry')
    }
    const data = await response.json().catch(() => ({}))
    if (!response.ok || typeof data.access_token !== 'string') {
      throw new DeliveryError(response.status === 400 || response.status === 401 ? 'gmail_grant_invalid' : 'gmail_token_failed', response.status >= 500 ? 'retry' : 'fatal')
    }
    if (typeof data.scope === 'string' && !data.scope.split(' ').includes(SEND_SCOPE)) throw new DeliveryError('gmail_scope_missing', 'fatal')
    // Attest the account behind the grant; a reference alone proves nothing.
    let info
    try {
      const check = await fetch(`${TOKENINFO_URL}?access_token=${encodeURIComponent(data.access_token)}`, { signal })
      info = check.ok ? await check.json() : null
    } catch {
      throw new DeliveryError('gmail_identity_unreachable', 'retry')
    }
    // tokeninfo only returns `email` when the grant includes the email scope.
    if (!info?.email) throw new DeliveryError('gmail_identity_unverified', 'fatal')
    if (String(info.email).toLowerCase() !== value.account.toLowerCase()) throw new DeliveryError('gmail_identity_mismatch', 'fatal')
    if (!String(info.scope || '').split(' ').includes(SEND_SCOPE)) throw new DeliveryError('gmail_scope_missing', 'fatal')
    const expiresIn = Number(data.expires_in) > 0 ? Number(data.expires_in) : 600
    const grant = { token: data.access_token, scopes: String(info.scope || '').split(' '), expiresAt: Date.now() + expiresIn * 1000 }
    tokens.set(fingerprint, grant)
    return grant
  }

  return {
    name: 'gmail',
    async authority (env, spec) {
      const ref = spec.account || env.FORMS_GMAIL_DEFAULT || ''
      const value = await credential(env, ref)
      return {
        provider: 'gmail',
        ref,
        account: value.account,
        // A rotated refresh token for the same client and account is the same
        // authority; another OAuth client or account is not.
        fingerprint: (await sha256Hex(`${value.client_id}\n${value.account.toLowerCase()}`)).slice(0, 32)
      }
    },
    // Large attachments: same account and grant as the mail (drive.file).
    async storeFiles ({ env, db, kv, authority, submission, signal, now }) {
      const { token, scopes } = await accessToken(await credential(env, authority.ref), authority.fingerprint, signal)
      if (!scopes.includes(DRIVE_SCOPE)) throw new DeliveryError('drive_scope_missing', 'fatal')
      try {
        return await drive.store({ db, kv, token, authority, submission, signal, now })
      } catch (error) {
        if (error.unauthorized) tokens.delete(authority.fingerprint)
        throw error
      }
    },
    // Files a document in the account's Drive (same grant as the mail; drive.file).
    async archiveFile ({ env, authority, path, name, type, bytes, signal }) {
      if (!env.FORMS_DB) throw new DeliveryError('drive_unavailable', 'fatal')
      const { token, scopes } = await accessToken(await credential(env, authority.ref), authority.fingerprint, signal)
      if (!scopes.includes(DRIVE_SCOPE)) throw new DeliveryError('drive_scope_missing', 'fatal')
      try {
        return await drive.archive({ db: env.FORMS_DB, token, account: authority.account, path, name, type, bytes, signal })
      } catch (error) {
        if (error.unauthorized) tokens.delete(authority.fingerprint)
        throw error
      }
    },
    async send ({ env, authority, message, signal, beforeSend }) {
      try {
        return await deliver({ env, authority, value: await credential(env, authority.ref), message, signal, beforeSend })
      } catch (error) {
        // Only a rejection that provably sent nothing may move to the backup account.
        const backup = env.FORMS_GMAIL_FALLBACK
        if (!backup || backup === authority.ref || !FALLBACK_CODES.has(error?.code)) throw error
        const value = await credential(env, backup)
        const fallback = { ...authority, ref: backup, account: value.account, fingerprint: (await sha256Hex(`${value.client_id}\n${value.account.toLowerCase()}`)).slice(0, 32) }
        const result = await deliver({ env, authority: fallback, value, message, signal, beforeSend })
        await env.FORMS_DB?.prepare("INSERT INTO forms_meta (key, value) VALUES ('gmail_fallback', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
          .bind(JSON.stringify({ at: Date.now(), from: authority.ref, via: backup, reason: error.code })).run().catch(() => {})
        return { ...result, via: 'fallback' }
      }
    }
  }

  async function deliver ({ authority, value, message, signal, beforeSend }) {
    const { token } = await accessToken(value, authority.fingerprint, signal)
    let mime
    try {
      mime = buildMime({ ...message, from: authority.account })
    } catch (error) {
      throw new DeliveryError(String(error.message || 'mime_invalid'), 'fatal')
    }
    // Last fence: the lease and authority are rechecked after every await.
    await beforeSend()
    let response
    try {
      response = await fetch(SEND_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'message/rfc822' },
        body: mime,
        signal
      })
    } catch {
      throw new DeliveryError('gmail_send_ambiguous', 'ambiguous')
    }
    const data = await response.json().catch(() => ({}))
    if (response.ok && typeof data.id === 'string') return { ref: data.id }
    if (response.status === 429) throw new DeliveryError('gmail_rate_limited', 'retry')
    if (response.status === 401) {
      tokens.delete(authority.fingerprint)
      throw new DeliveryError('gmail_unauthorized', 'retry')
    }
    // Quota answers are rejections (nothing was sent): retry with backoff.
    const reason = data?.error?.errors?.[0]?.reason || data?.error?.status || ''
    if (response.status === 403 && /rateLimitExceeded|userRateLimitExceeded|dailyLimitExceeded|quotaExceeded|RESOURCE_EXHAUSTED/.test(reason)) {
      throw new DeliveryError('gmail_quota', 'retry')
    }
    if (response.status >= 400 && response.status < 500) throw new DeliveryError(`gmail_rejected_${response.status}`, 'fatal')
    throw new DeliveryError(`gmail_send_ambiguous_${response.status}`, 'ambiguous')
  }
}
