/*
Purpose: `ci-token` step. A Cloudflare API token limited to the project's
  account (Workers Scripts, D1, KV write; Account Settings read), stored as
  the CLOUDFLARE_API_TOKEN Actions secret. The value only travels from the
  Cloudflare response to `gh secret set` stdin. --rotate replaces it; older
  tokens with the same name are deleted only after the new secret is stored.
Credentials: CLOUDFLARE_TOKEN_MANAGER or secrets file
  cloudflare-account-token-manager (Account API Tokens Edit).
*/
import { bearer, http, repoSecrets, secret, setRepoSecret } from './lib.js'

const CF = 'https://api.cloudflare.com/client/v4'
export const PERMISSIONS = [
  'e086da7e2179491d91ee5f35b3ca210a', // Workers Scripts Write
  '09b2857d1c31407795e75e3fed8617a1', // D1 Write
  'f7f0eda5697f475c90846e879bab8666', // Workers KV Storage Write
  'c1fde68c7bcc44588cbb6ddbc16d6480' // Account Settings Read
]

export default {
  id: 'ci-token',
  title: 'Token de CI de Cloudflare',
  async run (ctx) {
    const slug = `${ctx.owner}/${ctx.repo}`
    if (!ctx.cfAccount) return ctx.todo('token de CI: falta la cuenta de Cloudflare')
    const name = `CI ${slug} (Achu)`
    const auth = bearer(secret('CLOUDFLARE_TOKEN_MANAGER', 'cloudflare-account-token-manager'))
    const base = `${CF}/accounts/${ctx.cfAccount}/tokens`
    const tokens = (await http(`${base}?per_page=100`, { headers: auth })).data.result
    const previous = tokens.filter(t => t.name === name)
    const stored = ctx.created ? false : repoSecrets(slug).includes('CLOUDFLARE_API_TOKEN')
    if (previous.length && stored && !ctx.rotate) return ctx.done(`token «${name}» y secreto CLOUDFLARE_API_TOKEN`)
    if (!ctx.apply) return ctx.todo(`${previous.length ? 'rotar' : 'crear'} el token «${name}» y guardarlo como CLOUDFLARE_API_TOKEN`)
    const created = (await http(base, {
      method: 'POST',
      headers: auth,
      body: {
        name,
        policies: [{
          effect: 'allow',
          resources: { [`com.cloudflare.api.account.${ctx.cfAccount}`]: '*' },
          permission_groups: PERMISSIONS.map(id => ({ id }))
        }]
      }
    })).data.result
    try {
      setRepoSecret(slug, 'CLOUDFLARE_API_TOKEN', created.value)
    } catch (error) {
      await http(`${base}/${created.id}`, { method: 'DELETE', headers: auth })
      throw new Error(`${error.message}; token nuevo borrado`)
    }
    for (const old of previous) await http(`${base}/${old.id}`, { method: 'DELETE', headers: auth })
    ctx.done(`token «${name}» guardado como CLOUDFLARE_API_TOKEN${previous.length ? ` (${previous.length} anterior(es) borrado(s))` : ''}`)
  }
}
