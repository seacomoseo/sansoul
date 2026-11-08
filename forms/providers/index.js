import { FormsError, sha256Hex } from '../http.js'
import { DeliveryError } from './errors.js'
import { createGmailProvider } from './gmail.js'

export { DeliveryError }

const holdProvider = {
  name: 'hold',
  async authority () {
    return { provider: 'hold' }
  },
  async send () {
    throw new DeliveryError('delivery_disabled', 'hold')
  }
}

export function createProviders ({ fetch = globalThis.fetch } = {}) {
  return { hold: holdProvider, gmail: createGmailProvider({ fetch }) }
}

// Resolve the project's configured provider for one form. Throws (503) when the
// project has no usable delivery configuration: intake then fails closed.
export async function resolveAuthority (env, spec, providers) {
  const provider = providers[env.FORMS_PROVIDER]
  if (!provider) throw new FormsError('forms_unavailable', 503)
  const authority = await provider.authority(env, spec)
  return { ...authority, fingerprint: authority.fingerprint || await sha256Hex(JSON.stringify(authority)) }
}
