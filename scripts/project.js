/*
Purpose: Read the project identity that deployment tooling derives from the
  consumer hugo.yml (the single source; Wrangler/Netlify configs are generated).
Run from: A consumer root.
Side effects: None.
Contract (flat params, 14.0.0): owner, repo, worker (default repo), netlify
  (optional mirror site), gitlab (optional GitLab project path of the backup,
  e.g. seacomoseo/3dnau.com; read by core/ci/run with sed, default
  <namespace>/<repo>), domain (optional; default the baseURL host),
  worker_vars (optional map of Worker environment variables).
*/
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

// Cloudflare script names: lowercase letters, digits and dashes (63 max).
const WORKER_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const GITHUB_NAME = /^[A-Za-z0-9_.-]+$/
const VAR_NAME = /^[A-Z][A-Z0-9_]*$/

export function readProject (projectDir = process.cwd()) {
  const file = path.join(projectDir, 'hugo.yml')
  const config = parse(fs.readFileSync(file, 'utf8')) || {}
  const params = config.params || {}
  const baseURL = String(config.baseURL || '')
  let host = ''
  try { host = new URL(baseURL).host } catch {}
  const repo = text(params.repo)
  const owner = text(params.owner)
  const worker = text(params.worker) || repo.toLowerCase()
  const project = {
    baseURL,
    owner,
    repo,
    worker,
    netlify: text(params.netlify),
    gitlab: text(params.gitlab),
    domain: text(params.domain) || host,
    workerVars: params.worker_vars || {}
  }
  const errors = []
  if (!GITHUB_NAME.test(owner)) errors.push('params.owner must name the GitHub owner')
  if (!GITHUB_NAME.test(repo)) errors.push('params.repo must name the GitHub repository')
  if (!WORKER_NAME.test(worker)) errors.push(`Worker name "${worker}" is invalid: set params.worker to lowercase letters, digits and dashes`)
  if (project.netlify && !WORKER_NAME.test(project.netlify)) errors.push('params.netlify must be the Netlify site name')
  if (project.gitlab && !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(project.gitlab)) errors.push('params.gitlab must be the GitLab project path, e.g. namespace/project')
  if (typeof project.workerVars !== 'object' || Array.isArray(project.workerVars)) errors.push('params.worker_vars must be a map')
  else {
    for (const [key, value] of Object.entries(project.workerVars)) {
      if (!VAR_NAME.test(key)) errors.push(`params.worker_vars.${key}: use UPPER_SNAKE_CASE names`)
      if (!['string', 'number', 'boolean'].includes(typeof value)) errors.push(`params.worker_vars.${key}: use a scalar value`)
    }
  }
  if (errors.length) throw new Error(`hugo.yml: ${errors.join('; ')}.`)
  return project
}

function text (value) {
  return value === undefined || value === null ? '' : String(value).trim()
}
