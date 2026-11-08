import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  const sql = readFileSync(join(FORMS_DIR, 'migrations/0001_forms.sql'), 'utf8')
  for (const statement of splitSql(sql)) await proxy.env.FORMS_DB.prepare(statement).run()
  return {
    db: proxy.env.FORMS_DB,
    kv: proxy.env.FORMS_FILES,
    async dispose () {
      await proxy.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

// Fake Google endpoints: records every call; behavior is switchable per test.
export function createFakeGoogle () {
  const state = { sent: [], tokenCalls: 0, sendMode: 'ok', identityOverride: null, sendHook: null }
  const byToken = new Map()
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
  async function fetch (url, init = {}) {
    const href = String(url)
    if (href === 'https://oauth2.googleapis.com/token') {
      state.tokenCalls++
      const body = new URLSearchParams(String(init.body))
      const entry = Object.values(credentials).find(value => value.refresh_token === body.get('refresh_token'))
      if (!entry) return json({ error: 'invalid_grant' }, 400)
      const token = `at-${entry.client_id}-${state.tokenCalls}`
      byToken.set(token, entry.account)
      return json({ access_token: token, expires_in: 3600, scope: 'https://www.googleapis.com/auth/gmail.send openid https://www.googleapis.com/auth/userinfo.email' })
    }
    if (href.startsWith('https://oauth2.googleapis.com/tokeninfo')) {
      const token = new URL(href).searchParams.get('access_token')
      if (state.tokeninfoNoEmail) return json({ scope: 'https://www.googleapis.com/auth/gmail.send' })
      return json({ email: state.identityOverride || byToken.get(token), scope: 'https://www.googleapis.com/auth/gmail.send openid' })
    }
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

export function submitRequest (fields, { origin = ORIGIN, page = '/es/contacto/', form = 'form-contacto', id = crypto.randomUUID(), urlencoded = false, ip = '203.0.113.7' } = {}) {
  const data = new FormData()
  data.append('_form', form)
  data.append('_page', page)
  data.append('_submission_id', id)
  data.append('_gotcha', '')
  for (const [name, value, fileName] of fields) {
    if (value instanceof Blob) data.append(name, value, fileName)
    else data.append(name, value)
  }
  const headers = { origin, 'cf-connecting-ip': ip }
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
