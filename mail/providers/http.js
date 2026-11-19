// Brevo and SMTP2GO: transactional mail over HTTPS with an API key.
//
// Outcomes follow forms/providers/errors.js: a rejection that provably sent
// nothing is `retry` (quota, rate, credits) or `fatal` (configuration, invalid
// message); a network error or 5xx after the request left is `ambiguous` and is
// never resent automatically.
import { base64, validAddress } from '../../forms/mime.js'
import { DeliveryError } from '../../forms/providers/errors.js'
import { loadAccount } from '../accounts.js'

// Brevo: 4 MB per attachment and 20 MB per message; SMTP2GO: 50 MB per message
// (base64 included). Inline attachments are capped far lower by the forms
// intake (Workers Free CPU), so these only guard other callers.
export const PROVIDER_LIMITS = Object.freeze({
  brevo: { file: 4 * 1024 * 1024, total: 14 * 1024 * 1024 },
  smtp2go: { file: 36 * 1024 * 1024, total: 36 * 1024 * 1024 },
  smtp: { file: 10 * 1024 * 1024, total: 10 * 1024 * 1024 }
})

// https://developers.brevo.com/reference/send-transac-email
const BREVO_EXTENSIONS = new Set('xlsx xls ods docx docm doc csv pdf txt gif jpg jpeg png tif tiff rtf bmp cgm css shtml html htm zip xml ppt pptx tar ez ics mobi msg pub eps odt mp3 m4a m4v wma ogg flac wav aif aifc aiff mp4 mov avi mkv mpeg mpg wmv pkpass xlsm'.split(' '))
export const brevoAcceptsFiles = files => files.every(file => BREVO_EXTENSIONS.has(/\.([^.]+)$/.exec(file.name)?.[1].toLowerCase()))

const encode = bytes => typeof bytes.toBase64 === 'function' ? bytes.toBase64() : base64(bytes)

// The account behind a frozen authority, checked again right before sending.
export async function accountFor (env, authority) {
  const account = await loadAccount(env, authority.ref)
  if (!account || account.provider !== authority.provider) throw new DeliveryError('mail_account_missing', 'fatal')
  if (account.fingerprint !== authority.fingerprint || account.sender !== authority.account) throw new DeliveryError('authority_drift', 'fatal')
  if (!account.secret) throw new DeliveryError('mail_secret_unreadable', 'fatal')
  return account
}

// Recipients for APIs that require `to`: a bcc-only owner notice goes to the
// sender itself with the owners in bcc (they never see each other's address).
export function recipients (message, sender) {
  const to = (message.to || []).filter(Boolean)
  const bcc = (message.bcc || []).filter(Boolean)
  if (![...to, ...bcc].length || ![...to, ...bcc].every(validAddress)) throw new DeliveryError('mime_address_invalid', 'fatal')
  return { to: to.length ? to : [sender], bcc }
}

export function checkSize (provider, attachments = []) {
  const limit = PROVIDER_LIMITS[provider]
  const total = attachments.reduce((sum, file) => sum + file.bytes.length, 0)
  if (attachments.some(file => file.bytes.length > limit.file) || total > limit.total) throw new DeliveryError('mail_attachments_too_large', 'fatal')
}

const cleanName = name => String(name || '').replace(/[\r\n"\\<>]/g, ' ').trim().slice(0, 80)

async function post (fetch, url, headers, body, signal, prefix) {
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', ...headers }, body: JSON.stringify(body), signal })
    return { response, data: await response.json().catch(() => ({})) }
  } catch {
    throw new DeliveryError(`${prefix}_send_ambiguous`, 'ambiguous')
  }
}

export function createBrevoProvider ({ fetch }) {
  return {
    name: 'brevo',
    async send ({ env, authority, message, signal, beforeSend }) {
      const account = await accountFor(env, authority)
      const { to, bcc } = recipients(message, account.sender)
      checkSize('brevo', message.attachments)
      const body = {
        sender: { email: account.sender, name: cleanName(account.senderName || message.fromName) || undefined },
        to: to.map(email => ({ email })),
        ...(bcc.length ? { bcc: bcc.map(email => ({ email })) } : {}),
        ...(message.replyTo && validAddress(message.replyTo) ? { replyTo: { email: message.replyTo } } : {}),
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
        headers: { 'X-SanSoul-Id': message.messageId },
        ...(message.attachments?.length ? { attachment: message.attachments.map(file => ({ name: file.name, content: encode(file.bytes) })) } : {})
      }
      await beforeSend()
      const { response, data } = await post(fetch, 'https://api.brevo.com/v3/smtp/email', { 'api-key': account.secret }, body, signal, 'brevo')
      if (response.ok && typeof data.messageId === 'string') return { ref: data.messageId.slice(0, 200) }
      if (response.ok) throw new DeliveryError('brevo_send_ambiguous', 'ambiguous')
      if (response.status === 429) throw new DeliveryError('brevo_rate_limited', 'retry')
      // Out of credits (daily free quota): nothing was sent.
      if (response.status === 402) throw new DeliveryError('brevo_quota', 'retry')
      if (response.status === 401) throw new DeliveryError('brevo_unauthorized', 'fatal')
      if (response.status >= 400 && response.status < 500) throw new DeliveryError(`brevo_rejected_${response.status}`, 'fatal')
      throw new DeliveryError(`brevo_send_ambiguous_${response.status}`, 'ambiguous')
    }
  }
}

export function createSmtp2goProvider ({ fetch }) {
  return {
    name: 'smtp2go',
    async send ({ env, authority, message, signal, beforeSend }) {
      const account = await accountFor(env, authority)
      const { to, bcc } = recipients(message, account.sender)
      checkSize('smtp2go', message.attachments)
      const name = cleanName(account.senderName || message.fromName)
      const body = {
        sender: name ? `"${name}" <${account.sender}>` : account.sender,
        to,
        ...(bcc.length ? { bcc } : {}),
        subject: message.subject,
        html_body: message.html,
        text_body: message.text,
        custom_headers: [
          { header: 'X-SanSoul-Id', value: message.messageId },
          ...(message.replyTo && validAddress(message.replyTo) ? [{ header: 'Reply-To', value: message.replyTo }] : [])
        ],
        ...(message.attachments?.length ? { attachments: message.attachments.map(file => ({ filename: file.name, fileblob: encode(file.bytes), mimetype: file.type || 'application/octet-stream' })) } : {})
      }
      await beforeSend()
      const { response, data } = await post(fetch, 'https://api.smtp2go.com/v3/email/send', { 'X-Smtp2go-Api-Key': account.secret }, body, signal, 'smtp2go')
      const result = data?.data || {}
      if (response.ok && result.succeeded > 0 && !result.failed) return { ref: String(result.email_id || '').slice(0, 200) || 'smtp2go' }
      if (response.ok && result.succeeded === 0 && result.failed > 0) throw new DeliveryError('smtp2go_rejected', 'fatal')
      if (response.ok) throw new DeliveryError('smtp2go_send_ambiguous', 'ambiguous')
      if (response.status === 429) throw new DeliveryError('smtp2go_rate_limited', 'retry')
      if (response.status === 401 || response.status === 403) throw new DeliveryError('smtp2go_unauthorized', 'fatal')
      if (response.status >= 400 && response.status < 500) throw new DeliveryError(`smtp2go_rejected_${response.status}`, 'fatal')
      throw new DeliveryError(`smtp2go_send_ambiguous_${response.status}`, 'ambiguous')
    }
  }
}
