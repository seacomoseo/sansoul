// Compose the FORMS_GMAIL_CREDENTIALS secret from protected OAuth grant files
// without printing values. Pipe it straight into Wrangler:
//
//   node core/forms/scripts/gmail-credentials.js sansoulsend=/path/token.json \
//     | node core/node_modules/wrangler/bin/wrangler.js secret put FORMS_GMAIL_CREDENTIALS --config wrangler.workers.toml
//
// `--check` prints only references, accounts and scopes. The JSON goes to
// stdout only when stdout is a pipe, never to a terminal. Drive (drive.file) is
// required unless `--no-drive` (then set FORMS_DRIVE = "false" in the Worker).
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'

const REQUIRED = ['https://www.googleapis.com/auth/gmail.send', 'openid', 'https://www.googleapis.com/auth/userinfo.email']
const DRIVE = 'https://www.googleapis.com/auth/drive.file'
const REF = /^[A-Za-z0-9_.-]{1,64}$/

export function composeCredentials (pairs, { drive = true, read = path => readFileSync(path, 'utf8') } = {}) {
  const credentials = {}
  const report = []
  for (const pair of pairs) {
    const [ref, ...rest] = pair.split('=')
    const path = rest.join('=').replace(/^~(?=\/)/, homedir())
    if (!REF.test(ref) || !path) throw new Error(`invalid argument: use <ref>=<grant file> (${ref || pair})`)
    let grant
    try {
      grant = JSON.parse(read(path))
    } catch (error) {
      // Parser messages can quote file content: report the kind only.
      throw new Error(`${ref}: ${error.code === 'ENOENT' ? 'grant file not found' : 'grant file unreadable or not JSON'}`)
    }
    for (const key of ['account', 'client_id', 'client_secret', 'refresh_token']) {
      if (typeof grant[key] !== 'string' || !grant[key]) throw new Error(`${ref}: grant file lacks ${key}`)
    }
    const scopes = Array.isArray(grant.scopes) ? grant.scopes : String(grant.scope || grant.scopes || '').split(' ').filter(Boolean)
    const missing = [...REQUIRED, ...(drive ? [DRIVE] : [])].filter(scope => !scopes.includes(scope))
    if (missing.length) throw new Error(`${ref}: grant lacks ${missing.join(', ')}`)
    credentials[ref] = { account: grant.account, client_id: grant.client_id, client_secret: grant.client_secret, refresh_token: grant.refresh_token }
    report.push(`${ref}: ${grant.account} [${scopes.join(' ')}]`)
  }
  if (!report.length) throw new Error('no grant files given')
  return { json: JSON.stringify(credentials), report }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  try {
    const { json, report } = composeCredentials(args.filter(arg => !arg.startsWith('--')), { drive: !args.includes('--no-drive') })
    process.stderr.write(`${report.join('\n')}\n`)
    if (args.includes('--check')) process.exit(0)
    if (process.stdout.isTTY) throw new Error('refusing to print the secret to a terminal: pipe it to `wrangler secret put`')
    process.stdout.write(json)
  } catch (error) {
    console.error(`gmail credentials: ${error.message}`)
    process.exit(1)
  }
}
