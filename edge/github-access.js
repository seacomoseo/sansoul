// GitHub session of the CMS as the credential of project panels (forms, orders):
// a person is admitted when the token has push access to the site repository, the
// same permission the CMS needs to publish. Shared by the forms and commerce admins.

// A positive check is reused for a few minutes per isolate (one subrequest instead
// of one per panel call): a revoked permission keeps working until it expires.
// Denials are kept for a minute, so a junk token costs one GitHub call per isolate
// and minute at most.
const GITHUB_TTL_MS = 5 * 60 * 1000
const GITHUB_DENY_MS = 60 * 1000
const cache = new Map()
// Token formats GitHub issues (OAuth, PAT, app); anything else is refused without asking GitHub.
export const GITHUB_TOKEN = /^(gh[opsu]_[A-Za-z0-9]{30,250}|github_pat_\w{40,250}|[0-9a-f]{40})$/

async function digest (value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

// Resolves true (push access) or false (anything else). Throws Error('github_unavailable')
// when GitHub itself cannot answer: down or rate limited is not a verdict on the person.
export async function hasPushAccess (repo, credential, { fetch = globalThis.fetch, now = () => Date.now(), userAgent = 'sansoul' } = {}) {
  if (!GITHUB_TOKEN.test(credential)) return false
  const key = await digest(`${repo}\n${credential}`)
  const cached = cache.get(key)
  if (cached && cached.until > now()) return cached.ok
  let response
  try {
    response = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { authorization: `Bearer ${credential}`, accept: 'application/vnd.github+json', 'user-agent': userAgent, 'x-github-api-version': '2022-11-28' },
      signal: AbortSignal.timeout(8000)
    })
  } catch {
    throw new Error('github_unavailable')
  }
  if (response.status >= 500 || response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) throw new Error('github_unavailable')
  const data = response.ok ? await response.json().catch(() => null) : null
  const permissions = data?.permissions || {}
  // permissions are the person's; OAuth and classic tokens also list their own
  // scopes: a token without repo access (another app's) is not enough.
  const scopes = response.headers.get('x-oauth-scopes')
  const scoped = scopes === null || /(^|[\s,])(public_)?repo([\s,]|$)/.test(scopes)
  const ok = scoped && Boolean(permissions.push || permissions.maintain || permissions.admin)
  if (cache.size >= 200) for (const old of [...cache.keys()].slice(0, 50)) cache.delete(old)
  cache.set(key, { ok, until: now() + (ok ? GITHUB_TTL_MS : GITHUB_DENY_MS) })
  return ok
}
