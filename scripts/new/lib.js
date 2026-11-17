/*
Purpose: Shared helpers for `sh do new` steps: naming rules, credentials,
  HTTP and the GitHub CLI. No secret is ever printed or written to a project.
Credentials: an environment variable, else a file in SANSOUL_SECRETS_DIR
  (default ~/.config/agentes/secrets, the agents' VPS folder).
*/
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const GITLAB_NAMESPACE = 'seacomoseo'

// One name per project (GitLab copy, Drive files): <owner> when the repository
// is `site`, else <owner>-<repo>. Same rule as scripts/mirror-to-gitlab.sh.
export function projectName (owner, repo) {
  return repo === 'site' ? owner : `${owner}-${repo}`
}

export function secretsDir () {
  return process.env.SANSOUL_SECRETS_DIR || path.join(os.homedir(), '.config', 'agentes', 'secrets')
}

// Value of an env variable, else of a secrets file (raw, or KEY=value line).
export function secret (envName, file, key) {
  if (process.env[envName]) return process.env[envName].trim()
  const full = path.join(secretsDir(), file)
  if (!fs.existsSync(full)) throw new Error(`missing credential: set ${envName} or create ${full}`)
  const text = fs.readFileSync(full, 'utf8')
  if (!key) return text.trim()
  const line = text.split('\n').find(l => l.startsWith(`${key}=`))
  if (!line) throw new Error(`missing ${key} in ${full}`)
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '')
}

export function hasSecret (envName, file) {
  return Boolean(process.env[envName]) || fs.existsSync(path.join(secretsDir(), file))
}

// JSON request; throws with the API's own message (never the request headers).
export async function http (url, { method = 'GET', headers = {}, body, ok = [200, 201, 204] } = {}) {
  const response = await fetch(url, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const text = await response.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!ok.includes(response.status)) {
    const detail = typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data?.errors || data?.error || data).slice(0, 300)
    const error = new Error(`${method} ${url.split('?')[0]}: HTTP ${response.status} ${detail}`)
    error.status = response.status
    throw error
  }
  return { status: response.status, data }
}

export function gh (args, { input, cwd, allowFail = false } = {}) {
  try {
    return execFileSync('gh', args, { cwd, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch (error) {
    if (allowFail) return null
    throw new Error(`gh ${args.slice(0, 3).join(' ')}: ${String(error.stderr || error.message).trim().slice(0, 300)}`)
  }
}

export function git (args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

export function repoSecrets (slug) {
  const out = gh(['secret', 'list', '-R', slug, '--json', 'name'], { allowFail: true })
  return out ? JSON.parse(out).map(s => s.name) : []
}

// Store a GitHub Actions secret from memory (stdin), never from argv or disk.
export function setRepoSecret (slug, name, value) {
  gh(['secret', 'set', name, '-R', slug], { input: value })
}

// Google OAuth access token from an authorized_user JSON (google-auth format).
const googleTokens = new Map()
export async function googleAccessToken (file) {
  if (googleTokens.has(file)) return googleTokens.get(file)
  const full = path.join(secretsDir(), file)
  if (!fs.existsSync(full)) throw new Error(`missing Google grant ${full}`)
  const saved = JSON.parse(fs.readFileSync(full, 'utf8'))
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: saved.refresh_token,
    client_id: saved.client_id,
    client_secret: saved.client_secret
  })
  const response = await fetch(saved.token_uri || 'https://oauth2.googleapis.com/token', { method: 'POST', body })
  const data = await response.json()
  if (!data.access_token) throw new Error(`Google grant ${file}: ${data.error || response.status} (renew it)`)
  googleTokens.set(file, data.access_token)
  return data.access_token
}

export function bearer (token) {
  return { authorization: `Bearer ${token}` }
}
