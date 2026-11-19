// Site mail: one entry point for forms, commerce and later features. A caller
// resolves the account for its kind of mail into a frozen `authority`
// ({ provider, ref, account, fingerprint }) and sends with it; the authority is
// checked again right before every send.
import { FormsError } from '../forms/http.js'
import { DeliveryError } from '../forms/providers/errors.js'
import { createGmailProvider } from '../forms/providers/gmail.js'
import { accountProvider, loadAccount, loadRoutes, resolveAccountId } from './accounts.js'
import { DRIVE_KIND } from './kinds.js'
import { createBrevoProvider, createSmtp2goProvider } from './providers/http.js'
import { createSmtpProvider } from './providers/smtp.js'

export { DRIVE_KIND, mailKinds, registerMailKind } from './kinds.js'
export { DeliveryError }

const holdProvider = {
  name: 'hold',
  async storeFiles () {
    throw new DeliveryError('delivery_disabled', 'hold')
  },
  async send () {
    throw new DeliveryError('delivery_disabled', 'hold')
  }
}

export function createMailer ({ fetch = (...args) => globalThis.fetch(...args), connect } = {}) {
  const gmail = createGmailProvider({ fetch })
  const providers = {
    hold: holdProvider,
    gmail,
    brevo: createBrevoProvider({ fetch }),
    smtp2go: createSmtp2goProvider({ fetch }),
    smtp: createSmtpProvider({ connect })
  }

  // Authority of one account id. Throws FormsError('mail_account_missing', 503)
  // when no account has that id or its credential is unusable.
  async function authority (env, id) {
    const provider = await accountProvider(env, id)
    if (provider === 'gmail') {
      try {
        return await gmail.authority(env, { account: id })
      } catch {
        throw new FormsError('mail_account_missing', 503)
      }
    }
    const account = provider ? await loadAccount(env, id) : null
    if (!account?.secret) throw new FormsError('mail_account_missing', 503)
    return { provider, ref: id, account: account.sender, fingerprint: account.fingerprint, ...(account.senderName ? { senderName: account.senderName } : {}) }
  }

  // Authority for a kind of mail, or null when the project has no account for it.
  // `account`: an explicit choice (form.account); `fallback`: a feature variable.
  async function resolve (env, kind, options = {}) {
    const choice = await resolveAccountId(env, kind, options)
    if (!choice) return null
    return { ...(await authority(env, choice.id)), kind }
  }

  // Gmail account whose Drive stores files: the `drive` route, else `preferred`
  // when it is a Gmail authority. Null without one.
  async function driveAuthority (env, preferred, routes) {
    routes ||= await loadRoutes(env)
    if (routes[DRIVE_KIND]) {
      const drive = await authority(env, routes[DRIVE_KIND]).catch(() => null)
      if (drive?.provider === 'gmail') return drive
    }
    return preferred?.provider === 'gmail' ? { provider: 'gmail', ref: preferred.ref, account: preferred.account, fingerprint: preferred.fingerprint } : null
  }

  async function send ({ env, authority, message, signal, beforeSend = async () => {} }) {
    const provider = providers[authority.provider]
    if (!provider) throw new DeliveryError('provider_unknown', 'fatal')
    const sender = authority.senderName ? { ...message, fromName: authority.senderName } : message
    return provider.send({ env, authority, message: sender, signal, beforeSend })
  }

  return { providers, gmail, authority, resolve, driveAuthority, send }
}
