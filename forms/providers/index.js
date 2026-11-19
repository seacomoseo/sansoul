// Compatibility entry: forms now send through the site mailer (mail/index.js),
// which owns every provider (hold, gmail, brevo, smtp2go, smtp).
import { FormsError } from '../http.js'
import { createMailer } from '../../mail/index.js'
import { DeliveryError } from './errors.js'

export { DeliveryError }

export function createProviders ({ fetch = globalThis.fetch, connect } = {}) {
  return createMailer({ fetch, connect })
}

// Authority of the owner channel for one form spec; throws 503 without one.
export async function resolveAuthority (env, spec, mailer) {
  if (env.FORMS_PROVIDER === 'hold') return { provider: 'hold', fingerprint: 'hold' }
  const authority = await mailer.resolve(env, 'forms.owner', { account: spec.account || '' })
  if (!authority) throw new FormsError('forms_unavailable', 503)
  return authority
}
