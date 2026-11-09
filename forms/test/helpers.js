import { createHash, createHmac } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPlatformProxy, unstable_splitSqlQuery as splitSql } from 'wrangler'

export const FORMS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const ORIGIN = 'https://example.test'
export const ADMIN_TOKEN = 'local-forms-admin-token-not-a-secret-0123456789'

export const manifest = {
  version: 1,
  site: 'example.test',
  project: 'acme-web',
  forms: {
    '/es/contacto/#form-contacto': 'contact',
    '/es/#form-footer': 'footer',
    '/es/empleo/#form-cv': 'cv',
    '/en/jobs/#form-cv': 'cv-other-account'
  },
  specs: {
    contact: {
      id: 'form-contacto',
      lang: 'es',
      subject: 'Formulario 📩 Contacto',
      to: ['owner@example.test'],
      account: '',
      confirm: { enabled: true, fields: true, subject: 'Hemos recibido tu mensaje', introHtml: '<p>Hola [[Nombre]], gracias.</p><script>x</script>', noticeHtml: '<p>No respondas.</p>' },
      fields: [
        { name: 'Nombre', type: 'text' },
        { name: 'Email', type: 'email' },
        { name: 'Mensaje', type: 'area' },
        { name: 'Intereses', type: 'checkbox' }
      ]
    },
    footer: {
      id: 'form-footer',
      lang: 'es',
      subject: 'Footer',
      to: ['a@example.test', 'b@example.test'],
      account: '',
      confirm: null,
      fields: [{ name: 'Email', type: 'email' }]
    },
    cv: {
      id: 'form-cv',
      lang: 'es',
      subject: 'CV',
      to: ['rrhh@example.test'],
      account: '',
      confirm: null,
      fields: [{ name: 'Nombre', type: 'text' }, { name: 'CV', type: 'file', max: 2, accept: '.pdf,image/*' }]
    },
    'cv-other-account': {
      id: 'form-cv',
      lang: 'en',
      subject: 'CV (EN)',
      to: ['hr@example.test'],
      account: 'second',
      confirm: null,
      fields: [{ name: 'Name', type: 'text' }, { name: 'CV', type: 'file', max: 1, accept: '.pdf' }]
    }
  }
}

export const credentials = {
  main: { account: 'sender@example.test', client_id: 'cid-main', client_secret: 'cs-main', refresh_token: 'rt-main' },
  second: { account: 'other@example.test', client_id: 'cid-second', client_secret: 'cs-second', refresh_token: 'rt-second' }
}

// Isolated local D1 + KV backed by workerd (same SQLite engine as production D1).
export async function createBindings () {
  const directory = mkdtempSync(join(tmpdir(), 'sansoul-forms-'))
  writeFileSync(join(directory, 'wrangler.json'), JSON.stringify({
    name: 'forms-test',
    compatibility_date: '2025-12-10',
    d1_databases: [{ binding: 'FORMS_DB', database_name: 'forms-test', database_id: '00000000-0000-0000-0000-0000000000f1' }],
    kv_namespaces: [{ binding: 'FORMS_FILES', id: '000000000000000000000000000000f2' }]
  }))
  const proxy = await getPlatformProxy({ configPath: join(directory, 'wrangler.json'), persist: { path: join(directory, 'state') } })
  for (const file of readdirSync(join(FORMS_DIR, 'migrations')).filter(name => name.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(FORMS_DIR, 'migrations', file), 'utf8')
    for (const statement of splitSql(sql)) await proxy.env.FORMS_DB.prepare(statement).run()
  }
  return {
    db: proxy.env.FORMS_DB,
    kv: proxy.env.FORMS_FILES,
    async dispose () {
      await proxy.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

// Fake Google endpoints (OAuth, Gmail, Drive): records every call; behavior
// is switchable per test.
export function createFakeGoogle () {
  const state = {
    sent: [],
    tokenCalls: 0,
    sendMode: 'ok',
    identityOverride: null,
    sendHook: null,
    driveScope: true,
    drive: new Map(),
    driveCalls: [],
    uploadMode: 'ok',
    checksumOverride: null,
    nextId: 0
  }
  const byToken = new Map()
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
  const scopes = () => ['https://www.googleapis.com/auth/gmail.send', 'openid', 'https://www.googleapis.com/auth/userinfo.email', ...(state.driveScope ? ['https://www.googleapis.com/auth/drive.file'] : [])].join(' ')
  const meta = file => ({
    id: file.id,
    size: String(file.bytes.length),
    ...(file.bytes.length ? { sha256Checksum: state.checksumOverride || file.sha256 } : {}),
    parents: file.parents,
    trashed: false,
    webViewLink: `https://drive.google.com/file/d/${file.id}/view?usp=drivesdk`
  })
  async function drive (href, init) {
    const url = new URL(href)
    const account = byToken.get(String(init.headers?.authorization).replace('Bearer ', ''))
    state.driveCalls.push(`${init.method || 'GET'} ${url.pathname}`)
    if (!account) return json({ error: { code: 401 } }, 401)
    if (url.pathname === '/drive/v3/files/generateIds') {
      return json({ ids: Array.from({ length: Number(url.searchParams.get('count')) }, () => `gen${++state.nextId}`) })
    }
    if (url.pathname === '/drive/v3/files' && (init.method || 'GET') === 'GET') {
      const q = url.searchParams.get('q')
      const [, name, parent] = q.match(/^name = '(.*)' and '(.*)' in parents/)
      const files = [...state.drive.values()].filter(file => file.owner === account && file.folder && file.name === name.replace(/\\'/g, "'") && file.parents.includes(parent))
      return json({ files: files.map(file => ({ id: file.id })) })
    }
    if (url.pathname === '/drive/v3/files' && init.method === 'POST') {
      const body = JSON.parse(init.body)
      const id = body.id || `auto${++state.nextId}`
      if (state.drive.has(id)) return json({ error: { code: 409 } }, 409)
      if (body.parents[0] !== 'root' && !state.drive.has(body.parents[0])) return json({ error: { code: 404 } }, 404)
      state.drive.set(id, { id, owner: account, name: body.name, parents: body.parents, folder: body.mimeType === 'application/vnd.google-apps.folder', bytes: new Uint8Array(0) })
      return json({ id })
    }
    const fileMatch = url.pathname.match(/^\/(upload\/)?drive\/v3\/files\/([\w-]+)$/)
    if (fileMatch) {
      const file = state.drive.get(fileMatch[2])
      if (!file || file.owner !== account) return json({ error: { code: 404 } }, 404)
      if (fileMatch[1]) {
        if (state.uploadMode === 'network') {
          state.uploadMode = 'ok'
          throw new TypeError('fetch failed')
        }
        if (state.uploadMode === 'quota') return json({ error: { code: 403, errors: [{ reason: 'storageQuotaExceeded' }] } }, 403)
        const bytes = new Uint8Array(await new Response(init.body).arrayBuffer())
        Object.assign(file, { bytes, sha256: createHash('sha256').update(bytes).digest('hex') })
      }
      return json(meta(file))
    }
    throw new Error(`unexpected drive call ${href}`)
  }
  async function fetch (url, init = {}) {
    const href = String(url)
    if (href === 'https://oauth2.googleapis.com/token') {
      state.tokenCalls++
      const body = new URLSearchParams(String(init.body))
      const entry = Object.values(credentials).find(value => value.refresh_token === body.get('refresh_token'))
      if (!entry) return json({ error: 'invalid_grant' }, 400)
      const token = `at-${entry.client_id}-${state.tokenCalls}`
      byToken.set(token, entry.account)
      return json({ access_token: token, expires_in: 3600, scope: scopes() })
    }
    if (href.startsWith('https://oauth2.googleapis.com/tokeninfo')) {
      const token = new URL(href).searchParams.get('access_token')
      if (state.tokeninfoNoEmail) return json({ scope: 'https://www.googleapis.com/auth/gmail.send' })
      return json({ email: state.identityOverride || byToken.get(token), scope: scopes() })
    }
    if (href.startsWith('https://www.googleapis.com/drive/') || href.startsWith('https://www.googleapis.com/upload/drive/')) return drive(href, init)
    if (href.startsWith('https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send')) {
      if (state.sendHook) await state.sendHook()
      const account = byToken.get(String(init.headers.authorization).replace('Bearer ', ''))
      if (state.sendMode === 'network') throw new TypeError('fetch failed')
      if (state.sendMode === '503') return json({ error: 'backend' }, 503)
      if (state.sendMode === '429') return json({ error: 'rate' }, 429)
      if (state.sendMode === '403quota') return json({ error: { code: 403, errors: [{ reason: 'userRateLimitExceeded' }] } }, 403)
      state.sent.push({ account, mime: new TextDecoder().decode(init.body) })
      return json({ id: `msg-${state.sent.length}` })
    }
    throw new Error(`unexpected fetch ${href}`)
  }
  return { fetch, state }
}

// Raw upload of one file, as form-send.js does before the submission.
export async function uploadRequest (blob, { fileName = 'file', field, index, id, page = '/es/empleo/', form = 'form-cv', origin = ORIGIN, ip = '203.0.113.7', sha256 } = {}) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const query = new URLSearchParams({ submission: id, page, form, field, index: String(index) })
  return new Request(`${ORIGIN}/api/forms/upload?${query}`, {
    method: 'POST',
    headers: {
      origin,
      'cf-connecting-ip': ip,
      'content-type': blob.type || 'application/octet-stream',
      'content-length': String(bytes.byteLength),
      'x-file-name': encodeURIComponent(fileName),
      'x-file-sha256': sha256 || createHash('sha256').update(bytes).digest('hex')
    },
    body: bytes
  })
}

export function submitRequest (fields, { origin = ORIGIN, page = '/es/contacto/', form = 'form-contacto', id = crypto.randomUUID(), urlencoded = false, ip = '203.0.113.7', headers: extra = {} } = {}) {
  const data = new FormData()
  data.append('_form', form)
  data.append('_page', page)
  data.append('_submission_id', id)
  data.append('_gotcha', '')
  for (const [name, value, fileName] of fields) {
    if (value instanceof Blob) data.append(name, value, fileName)
    else data.append(name, value)
  }
  const headers = { origin, 'cf-connecting-ip': ip, ...extra }
  let body = data
  if (urlencoded) {
    body = new URLSearchParams(data).toString()
    headers['content-type'] = 'application/x-www-form-urlencoded'
  }
  return { id, request: new Request(`${ORIGIN}/api/forms/submit`, { method: 'POST', headers, body }) }
}

// Node's Request computes content-length lazily; mimic the browser header.
export async function withLength (request) {
  const bytes = new Uint8Array(await request.clone().arrayBuffer())
  const headers = new Headers(request.headers)
  headers.set('content-length', String(bytes.byteLength))
  return new Request(request.url, { method: request.method, headers, body: bytes })
}

export function decodeMime (raw) {
  const parts = raw.split(/\r\n--sf-[^\r\n]*\r\n/)
  const decoded = parts.map(part => {
    const [head, ...rest] = part.split('\r\n\r\n')
    if (/Content-Transfer-Encoding: base64/i.test(head)) return { head, body: Buffer.from(rest.join('').replace(/\r\n/g, ''), 'base64') }
    return { head, body: Buffer.from(rest.join('\r\n')) }
  })
  return { headers: raw.split('\r\n\r\n')[0], parts: decoded }
}

// Netlify signed-proxy header (JWS HS256), as netlify.toml `signed` produces.
export function netlifySign (secret, { exp = Math.floor(Date.now() / 1000) + 60, iss = 'netlify' } = {}) {
  const part = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ iss, exp, site_url: 'https://site.test' })}`
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`
}
