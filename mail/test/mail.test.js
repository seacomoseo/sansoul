import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'
import { createFormsWorker } from '../../forms/worker.js'
import { relayCallback, startConnect } from '../../forms/grants.js'
import { createMailer } from '../index.js'
import { createBindings, createFakeGoogle, credentials, decodeMime, manifest, submitRequest, uploadRequest, withLength } from '../../forms/test/helpers.js'

const REPO = 'acme/web'
const PUSH = 'gho_pushAccessToken0000000000000000000'
const KEY = Buffer.alloc(32, 9).toString('base64url')
const BREVO_KEY = 'xkeysib-local-test-key-not-a-secret'
const SMTP2GO_KEY = 'api-local-test-key-not-a-secret'

let bindings
let google
let providers
let smtp
let clock
let worker
let env

const now = () => clock
const contactFields = [['Nombre', 'Ana'], ['Email', 'visitor@example.org'], ['Mensaje', 'Hola']]

// Brevo and SMTP2GO endpoints; everything else goes to the fake Google.
function createFakeProviders () {
  const state = { brevo: [], smtp2go: [], brevoMode: 'ok', smtp2goMode: 'ok' }
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
  async function fetch (url, init = {}) {
    const href = String(url)
    if (href === 'https://api.brevo.com/v3/smtp/email') {
      const mode = state.brevoMode
      if (mode === 'network') throw new TypeError('fetch failed')
      if (mode === '503') return json({ message: 'down' }, 503)
      if (mode === '400') return json({ code: 'invalid_parameter' }, 400)
      if (mode === '402') return json({ code: 'not_enough_credits' }, 402)
      if (init.headers['api-key'] !== state.brevoKey) return json({ code: 'unauthorized' }, 401)
      state.brevo.push(JSON.parse(init.body))
      return json({ messageId: `<brevo-${state.brevo.length}@smtp-relay.mailin.fr>` }, 201)
    }
    if (href === 'https://api.smtp2go.com/v3/email/send') {
      if (state.smtp2goMode === '429') return json({ data: { error: 'rate' } }, 429)
      if (init.headers['X-Smtp2go-Api-Key'] !== SMTP2GO_KEY) return json({ data: { error: 'auth' } }, 401)
      state.smtp2go.push(JSON.parse(init.body))
      return json({ data: { succeeded: 1, failed: 0, failures: [], email_id: `s2g-${state.smtp2go.length}` } })
    }
    return google.fetch(url, init)
  }
  return { fetch, state }
}

// In-memory SMTP server behind a cloudflare:sockets-like connect().
function createFakeSmtp (options = {}) {
  const log = { connects: [], commands: [], messages: [], tls: false }
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  function makeSocket ({ tls, greet }) {
    let controller
    const readable = new ReadableStream({ start (c) { controller = c } })
    const reply = text => controller.enqueue(encoder.encode(text))
    let buffer = ''
    let inData = false
    let envelope = null
    const handle = line => {
      const verb = line.split(' ')[0].toUpperCase()
      log.commands.push(verb === 'AUTH' ? 'AUTH' : line)
      if (verb === 'EHLO') return reply(`250-smtp.test\r\n${!tls ? '250-STARTTLS\r\n' : ''}250 AUTH PLAIN LOGIN\r\n`)
      if (verb === 'STARTTLS') return reply('220 Ready\r\n')
      if (verb === 'AUTH') {
        const ok = Buffer.from(line.split(' ')[2], 'base64').toString() === `\0${options.user || 'user@example.test'}\0${options.pass || 'smtp-pass'}`
        return reply(ok ? '235 2.7.0 ok\r\n' : '535 5.7.8 bad credentials\r\n')
      }
      if (verb === 'MAIL') {
        envelope = { from: line.match(/<(.*)>/)[1], rcpt: [] }
        return reply('250 ok\r\n')
      }
      if (verb === 'RCPT') {
        envelope.rcpt.push(line.match(/<(.*)>/)[1])
        return reply('250 ok\r\n')
      }
      if (verb === 'DATA') {
        inData = true
        return reply('354 go ahead\r\n')
      }
      if (verb === 'QUIT') return reply('221 bye\r\n')
      reply('500 unknown\r\n')
    }
    const writable = new WritableStream({
      write (chunk) {
        buffer += decoder.decode(chunk, { stream: true })
        for (;;) {
          if (inData) {
            const end = buffer.indexOf('\r\n.\r\n')
            if (end < 0) return
            log.messages.push({ ...envelope, data: buffer.slice(0, end) })
            buffer = buffer.slice(end + 5)
            inData = false
            if (options.afterDot === 'drop') return controller.error(new Error('connection reset'))
            reply(`${options.afterDot || 250} 2.0.0 Ok: queued as Q${log.messages.length}XYZ\r\n`)
            continue
          }
          const end = buffer.indexOf('\r\n')
          if (end < 0) return
          const line = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          handle(line)
        }
      }
    })
    if (greet) reply('220 smtp.test ESMTP\r\n')
    return {
      readable,
      writable,
      opened: Promise.resolve({}),
      startTls () {
        log.tls = true
        return makeSocket({ tls: true, greet: false })
      },
      async close () {
        try {
          controller.close()
        } catch {}
      }
    }
  }
  const connect = (address, tls) => {
    log.connects.push({ address, tls })
    if (options.refuse) throw new Error('connection refused')
    return makeSocket({ tls: tls.secureTransport === 'on', greet: true })
  }
  return { connect, log }
}

function fakeFetch (url, init = {}) {
  const href = String(url)
  if (href === `https://api.github.com/repos/${REPO}`) {
    const ok = String(init.headers?.authorization) === `Bearer ${PUSH}`
    return Promise.resolve(ok ? Response.json({ full_name: REPO, permissions: { push: true } }, { headers: { 'x-oauth-scopes': 'repo' } }) : new Response('{}', { status: 401 }))
  }
  return providers.fetch(url, init)
}

async function send (fields, options = {}) {
  const submissionId = crypto.randomUUID()
  const plain = []
  let index = 0
  for (const [name, value, fileName] of fields) {
    if (!(value instanceof Blob)) {
      plain.push([name, value])
      continue
    }
    const upload = await worker.fetch(await uploadRequest(value, { ...options, id: submissionId, field: name, index, fileName }), env, null)
    assert.equal(upload.status, 200, await upload.clone().text())
    plain.push([name, String(index++)])
  }
  const { request } = submitRequest(plain, { ...options, id: submissionId, ip: `198.51.100.${Math.floor(Math.random() * 250)}` })
  const response = await worker.fetch(await withLength(request), env, null)
  assert.equal(response.status, 200, await response.clone().text())
  return submissionId
}

const call = async (path, { method = 'GET', auth = `GitHub ${PUSH}`, json, panel = 'mail' } = {}) => {
  const headers = { ...(auth ? { authorization: auth } : {}), ...(json ? { 'content-type': 'application/json', origin: 'https://example.test' } : {}) }
  const response = await worker.fetch(new Request(`https://example.test/api/${panel}/admin/${path}`, { method, headers, body: json ? JSON.stringify(json) : undefined }), env, null)
  return { status: response.status, body: await response.json() }
}
const release = (id, channel = 'owner') => call(`jobs/${id}:${channel}/release`, { method: 'POST', panel: 'forms' })
const jobs = async id => (await bindings.db.prepare('SELECT channel, state, last_error, authority FROM forms_jobs WHERE submission_id = ? ORDER BY channel').bind(id).all()).results
  .map(row => ({ ...row, authority: JSON.parse(row.authority) }))
const owner = async id => (await jobs(id)).find(row => row.channel === 'owner')
const brevoAccount = (extra = {}) => ({ provider: 'brevo', id: 'brevo', sender: 'web@example.test', senderName: 'Web Brevo', secret: BREVO_KEY, ...extra })
const smtpAccount = (extra = {}) => ({ provider: 'smtp', id: 'smtp', sender: 'web@example.test', host: 'smtp.example.test', port: 587, username: 'user@example.test', secret: 'smtp-pass', ...extra })
const dispatchNow = () => worker.fetch(new Request('https://example.test/api/forms/admin/dispatch', { method: 'POST', headers: { authorization: `Bearer ${'local-forms-admin-token-not-a-secret-0123456789'}` } }), env, null)

before(async () => { bindings = await createBindings() })
after(async () => { await bindings.dispose() })
clock = 1_900_000_000_000
beforeEach(async () => {
  for (const table of ['forms_drive_files', 'forms_drive_folders', 'forms_uploads', 'forms_jobs', 'forms_submissions', 'forms_rate', 'forms_grants', 'mail_accounts', 'mail_routes']) await bindings.db.prepare(`DELETE FROM ${table}`).run()
  google = createFakeGoogle()
  providers = createFakeProviders()
  providers.state.brevoKey = BREVO_KEY
  smtp = createFakeSmtp()
  clock += 3_600_000
  worker = createFormsWorker({ ...manifest, repo: REPO }, { fetch: fakeFetch, connect: (...args) => smtp.connect(...args), now })
  env = {
    FORMS_DB: bindings.db,
    FORMS_FILES: bindings.kv,
    FORMS_PROVIDER: 'gmail',
    FORMS_GMAIL_CREDENTIALS: JSON.stringify(credentials),
    FORMS_GMAIL_DEFAULT: 'main',
    FORMS_SENDER_NAME: 'Web Ejemplo',
    FORMS_GRANT_KEY: KEY,
    FORMS_ADMIN_TOKEN: 'local-forms-admin-token-not-a-secret-0123456789'
  }
})

describe('mail panel API', () => {
  test('only people with push access; the probe answers 401 JSON', async () => {
    const probe = await call('summary', { auth: null })
    assert.equal(probe.status, 401)
    assert.equal(probe.body.error, 'unauthorized')
    assert.equal((await call('summary', { auth: `Bearer ${env.FORMS_ADMIN_TOKEN}` })).status, 403)
    const { status, body } = await call('summary')
    assert.equal(status, 200)
    assert.deepEqual(body.accounts.map(account => [account.id, account.provider, account.source]), [['main', 'gmail', 'secret'], ['second', 'gmail', 'secret']])
    assert.deepEqual(body.effective['forms.owner'], { id: 'main', source: 'variable' })
    assert.ok(body.kinds.some(kind => kind.id === 'commerce.buyer'))
  })

  test('accounts are stored encrypted, listed without secrets and validated', async () => {
    assert.equal((await call('accounts', { method: 'POST', json: brevoAccount() })).status, 200)
    const row = await bindings.db.prepare('SELECT * FROM mail_accounts WHERE id = ?').bind('brevo').first()
    assert.doesNotMatch(JSON.stringify(row), new RegExp(BREVO_KEY))
    const { body } = await call('summary')
    const listed = body.accounts.find(account => account.id === 'brevo')
    assert.equal(listed.sender, 'web@example.test')
    assert.doesNotMatch(JSON.stringify(body), new RegExp(BREVO_KEY))
    // FORMS_GMAIL_DEFAULT decides the default: the new account does not take it.
    assert.equal(body.routes.default, undefined)
    assert.equal((await call('accounts', { method: 'POST', json: brevoAccount({ id: 'main' }) })).body.error, 'account_in_secret')
    assert.equal((await call('accounts', { method: 'POST', json: smtpAccount({ port: 25 }) })).body.error, 'mail_port_invalid')
    assert.equal((await call('accounts', { method: 'POST', json: brevoAccount({ id: 'b2', secret: '' }) })).body.error, 'mail_secret_required')
    // Editing without the secret keeps the stored one.
    assert.equal((await call('accounts', { method: 'POST', json: brevoAccount({ senderName: 'Otro', secret: '' }) })).status, 200)
    assert.equal((await call('accounts/brevo/test', { method: 'POST', json: { to: 'achucore@example.test' } })).body.ok, true)
    assert.equal(providers.state.brevo.at(-1).sender.name, 'Otro')
    assert.equal((await call('routes', { method: 'POST', json: { routes: { drive: 'brevo' } } })).body.error, 'mail_drive_needs_gmail')
    assert.equal((await call('routes', { method: 'POST', json: { routes: { 'forms.owner': 'nope' } } })).body.error, 'mail_account_missing')
    assert.equal((await call('accounts/brevo/delete', { method: 'POST', json: {} })).status, 200)
    assert.equal((await call('accounts/main/delete', { method: 'POST', json: {} })).body.error, 'account_in_secret')
  })

  test('test send reports provider errors and records them', async () => {
    await call('accounts', { method: 'POST', json: brevoAccount() })
    providers.state.brevoKey = 'rotated-elsewhere'
    const result = await call('accounts/brevo/test', { method: 'POST', json: { to: 'achucore@example.test' } })
    assert.deepEqual([result.body.ok, result.body.error], [false, 'brevo_unauthorized'])
    const row = await bindings.db.prepare('SELECT tested_at, test_error FROM mail_accounts WHERE id = ?').bind('brevo').first()
    assert.equal(row.test_error, 'brevo_unauthorized')
    assert.equal((await call('accounts/brevo/test', { method: 'POST', json: { to: 'not an address' } })).body.error, 'mail_to_invalid')
  })
})

describe('routing', () => {
  test('default route sends form mail through Brevo; the visitor kind can use SMTP2GO', async () => {
    await call('accounts', { method: 'POST', json: brevoAccount() })
    await call('accounts', { method: 'POST', json: { provider: 'smtp2go', id: 's2g', sender: 'hola@example.test', senderName: 'Hola', secret: SMTP2GO_KEY } })
    await call('routes', { method: 'POST', json: { routes: { default: 'brevo', 'forms.visitor': 's2g' } } })
    const id = await send(contactFields, { page: '/es/contacto/', form: 'form-contacto' })
    assert.deepEqual((await jobs(id)).map(row => [row.channel, row.state, row.authority.provider]), [['confirmation', 'sent', 'smtp2go'], ['owner', 'sent', 'brevo']])
    assert.equal(google.state.sent.length, 0)
    const ownerMail = providers.state.brevo[0]
    assert.deepEqual(ownerMail.to, [{ email: 'owner@example.test' }])
    assert.deepEqual(ownerMail.replyTo, { email: 'visitor@example.org' })
    assert.deepEqual(ownerMail.sender, { email: 'web@example.test', name: 'Web Brevo' })
    const confirmation = providers.state.smtp2go[0]
    assert.deepEqual(confirmation.to, ['visitor@example.org'])
    assert.equal(confirmation.sender, '"Hola" <hola@example.test>')
  })

  test('several owners go in bcc to the sender; form.account still wins', async () => {
    await call('accounts', { method: 'POST', json: brevoAccount() })
    await call('routes', { method: 'POST', json: { routes: { 'forms.owner': 'brevo' } } })
    await send([['Email', 'v@example.org']], { page: '/es/', form: 'form-footer' })
    assert.deepEqual(providers.state.brevo[0].to, [{ email: 'web@example.test' }])
    assert.deepEqual(providers.state.brevo[0].bcc, [{ email: 'a@example.test' }, { email: 'b@example.test' }])
    // cv-other-account declares form.account: second (Gmail).
    const id = await send([['Name', 'Ann'], ['CV', new Blob(['%PDF-1'], { type: 'application/pdf' }), 'cv.pdf']], { page: '/en/jobs/', form: 'form-cv' })
    assert.equal((await owner(id)).authority.ref, 'second')
    assert.equal(google.state.sent.at(-1).account, 'other@example.test')
  })

  test('commerce kinds: the kind route, then COMMERCE_NOTIFY_ACCOUNT, then the default', async () => {
    const mailer = createMailer({ fetch: fakeFetch })
    await call('accounts', { method: 'POST', json: brevoAccount() })
    const commerceEnv = { ...env, COMMERCE_NOTIFY_ACCOUNT: 'second' }
    assert.equal((await mailer.resolve(commerceEnv, 'commerce.buyer', { fallback: 'second' })).ref, 'second')
    await call('routes', { method: 'POST', json: { routes: { 'commerce.buyer': 'brevo', default: 'main' } } })
    assert.equal((await mailer.resolve(commerceEnv, 'commerce.buyer', { fallback: 'second' })).provider, 'brevo')
    assert.equal((await mailer.resolve(commerceEnv, 'commerce.merchant', { fallback: 'second' })).ref, 'second')
    assert.equal((await mailer.resolve(env, 'commerce.merchant', {})).ref, 'main')
  })
})

describe('delivery states', () => {
  test('a manual resend preserves the first acceptance and can use a new or the same account', async () => {
    const submission = await send([['Nombre', 'Ana'], ['CV', new Blob(['test'], { type: 'application/pdf' }), 'cv.pdf']], { page: '/es/empleo/', form: 'form-cv' })
    const detail = async () => (await call(`submissions/${submission}`, { panel: 'forms' })).body
    const original = (await detail()).jobs[0]
    assert.equal(original.state, 'sent')
    await call('routes', { method: 'POST', json: { routes: { 'forms.owner': 'second' } } })
    const resend = async (source, json, auth) => call(`jobs/${source}/resend`, { method: 'POST', panel: 'forms', json, auth })
    const target = (await detail()).resend
    assert.deepEqual([target.account, target.missingFiles], ['other@example.test', true])
    const body = { ...target, id: crypto.randomUUID() }
    assert.equal((await resend(original.id, body, `Bearer ${env.FORMS_ADMIN_TOKEN}`)).status, 403)
    assert.equal((await resend(original.id, { ...body, account: 'not-current@example.test' })).body.error, 'resend_account_changed')
    const raced = await Promise.all([resend(original.id, body), resend(original.id, body)])
    assert.deepEqual(raced.map(result => result.status), [200, 200])
    const after = await detail()
    assert.deepEqual(after.jobs.find(job => job.id === original.id), original)
    assert.equal(after.jobs[0].account, 'other@example.test')
    assert.equal(after.jobs[0].state, 'sent')
    assert.equal(google.state.sent.length, 2)
    const resent = decodeMime(google.state.sent.at(-1).mime)
    assert.ok(resent.parts.some(part => part.body.toString().includes('Original attachments')))
    assert.equal((await resend(original.id, { ...body, id: crypto.randomUUID() })).status, 409)
    assert.equal((await resend(after.resend.job, { ...after.resend, id: crypto.randomUUID() })).status, 200)
    assert.equal(google.state.sent.length, 3)
  })

  test('a confirmed Brevo rejection can be retried with the current Gmail route', async () => {
    assert.equal((await call('accounts', { method: 'POST', json: brevoAccount() })).status, 200)
    await call('routes', { method: 'POST', json: { routes: { default: 'brevo' } } })
    providers.state.brevoMode = '400'
    const id = await send([['Nombre', 'Ana'], ['CV', new Blob(['test'], { type: 'application/pdf' }), 'cv.pdf']], { page: '/es/empleo/', form: 'form-cv' })
    assert.deepEqual([(await owner(id)).state, (await owner(id)).last_error], ['held', 'brevo_rejected_400'])
    await call('routes', { method: 'POST', json: { routes: { default: 'main' } } })
    const attempts = await Promise.all([release(id), release(id)])
    assert.deepEqual(attempts.map(result => result.status).sort(), [200, 409])
    const delivered = await owner(id)
    assert.deepEqual([delivered.state, delivered.authority.provider, delivered.authority.ref, delivered.authority.to], ['sent', 'gmail', 'main', ['rrhh@example.test']])
    assert.equal(google.state.sent.length, 1)
  })

  test('Formularios can release historical holds through the current route of each channel', async () => {
    env.FORMS_PROVIDER = 'hold'
    delete env.FORMS_GMAIL_DEFAULT
    const id = await send(contactFields, { page: '/es/contacto/', form: 'form-contacto' })
    const held = await jobs(id)
    // Older hold jobs did not capture the form's account choice.
    assert.deepEqual(held.map(row => [row.channel, row.state, row.last_error]), [
      ['confirmation', 'held', 'delivery_disabled'], ['owner', 'held', 'delivery_disabled']
    ])
    if (Object.hasOwn(held[0].authority, 'choice')) {
      for (const row of held) {
        const { choice, ...authority } = row.authority
        const jobId = `${id}:${row.channel}`
        await bindings.db.batch([
          bindings.db.prepare('DELETE FROM forms_jobs WHERE id = ?').bind(jobId),
          bindings.db.prepare(`INSERT INTO forms_jobs (id, submission_id, channel, state, authority, next_attempt_at, last_error, updated_at)
            VALUES (?, ?, ?, 'held', ?, ?, 'delivery_disabled', ?)`).bind(jobId, id, row.channel, JSON.stringify(authority), clock, clock)
        ])
      }
    }
    assert.equal((await release(id)).body.error, 'delivery_disabled')
    delete env.FORMS_PROVIDER
    assert.equal((await release(id)).body.error, 'mail_unconfigured')

    await call('accounts', { method: 'POST', json: brevoAccount() })
    await call('accounts', { method: 'POST', json: { provider: 'smtp2go', id: 'smtp2go', sender: 'hola@example.test', secret: SMTP2GO_KEY } })
    await call('routes', { method: 'POST', json: { routes: { 'forms.owner': 'brevo', 'forms.visitor': 'smtp2go' } } })
    assert.deepEqual((await call('pending/release', { method: 'POST', json: {} })).body, { released: 0, remaining: 0 })
    const results = await Promise.all([release(id), release(id)])
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409])
    assert.equal((await owner(id)).authority.subject, manifest.specs.contact.subject)
    assert.deepEqual((await jobs(id)).map(row => [row.state, row.authority.provider]), [['held', 'hold'], ['sent', 'brevo']])
    assert.equal(providers.state.brevo.length, 1)
    assert.equal(providers.state.smtp2go.length, 0)

    assert.equal((await release(id, 'confirmation')).status, 200)
    assert.deepEqual((await jobs(id)).map(row => [row.state, row.authority.provider]), [['sent', 'smtp2go'], ['sent', 'brevo']])
    assert.deepEqual(providers.state.smtp2go[0].to, ['visitor@example.org'])
    assert.equal((await release(id, 'confirmation')).status, 409)
    assert.equal(providers.state.smtp2go.length, 1)
  })

  test('quota retries; a 5xx is ambiguous and held; key rotation keeps the authority, a new sender drifts', async () => {
    await call('accounts', { method: 'POST', json: brevoAccount() })
    await call('routes', { method: 'POST', json: { routes: { 'forms.owner': 'brevo' } } })
    providers.state.brevoMode = '402'
    const quota = await send([['Email', 'v@example.org']], { page: '/es/', form: 'form-footer' })
    assert.deepEqual([(await owner(quota)).state, (await owner(quota)).last_error], ['pending', 'brevo_quota'])
    // Rotating the key (same sender) is the same authority.
    providers.state.brevoMode = 'ok'
    providers.state.brevoKey = 'xkeysib-rotated'
    await call('accounts', { method: 'POST', json: brevoAccount({ secret: 'xkeysib-rotated' }) })
    clock += 3_600_000
    await dispatchNow()
    assert.equal((await owner(quota)).state, 'sent')

    providers.state.brevoMode = '503'
    const ambiguous = await send([['Email', 'v@example.org']], { page: '/es/', form: 'form-footer' })
    assert.deepEqual([(await owner(ambiguous)).state, (await owner(ambiguous)).last_error], ['held', 'brevo_send_ambiguous_503'])

    providers.state.brevoMode = '402'
    const drifting = await send([['Email', 'v@example.org']], { page: '/es/', form: 'form-footer' })
    await call('accounts', { method: 'POST', json: brevoAccount({ sender: 'otra@example.test', secret: 'xkeysib-rotated' }) })
    providers.state.brevoMode = 'ok'
    clock += 3_600_000
    await dispatchNow()
    assert.deepEqual([(await owner(drifting)).state, (await owner(drifting)).last_error], ['held', 'authority_drift'])
  })

  test('SMTP: STARTTLS, AUTH PLAIN, bcc only in the envelope, and the outcome after DATA', async () => {
    await call('accounts', { method: 'POST', json: smtpAccount() })
    await call('routes', { method: 'POST', json: { routes: { 'forms.owner': 'smtp' } } })
    const id = await send([['Email', 'v@example.org']], { page: '/es/', form: 'form-footer' })
    assert.equal((await owner(id)).state, 'sent')
    assert.deepEqual(smtp.log.connects[0], { address: { hostname: 'smtp.example.test', port: 587 }, tls: { secureTransport: 'starttls', allowHalfOpen: false } })
    assert.equal(smtp.log.tls, true)
    assert.deepEqual(smtp.log.commands.slice(0, 4), ['EHLO example.test', 'STARTTLS', 'EHLO example.test', 'AUTH'])
    const message = smtp.log.messages[0]
    assert.deepEqual(message.rcpt, ['a@example.test', 'b@example.test'])
    const mime = decodeMime(message.data)
    assert.doesNotMatch(mime.headers, /^Bcc:/m)
    assert.match(mime.headers, /^To: undisclosed-recipients:;/m)
    assert.match(mime.headers, /^From: Web Ejemplo <web@example\.test>/m)

    smtp = createFakeSmtp({ afterDot: 'drop' })
    const dropped = await send([['Email', 'v@example.org']], { page: '/es/', form: 'form-footer' })
    assert.deepEqual([(await owner(dropped)).state, (await owner(dropped)).last_error], ['held', 'smtp_send_ambiguous'])

    smtp = createFakeSmtp({ afterDot: 451 })
    const deferred = await send([['Email', 'v@example.org']], { page: '/es/', form: 'form-footer' })
    assert.deepEqual([(await owner(deferred)).state, (await owner(deferred)).last_error], ['pending', 'smtp_deferred_451'])

    smtp = createFakeSmtp({ pass: 'other' })
    const denied = await send([['Email', 'v@example.org']], { page: '/es/', form: 'form-footer' })
    assert.deepEqual([(await owner(denied)).state, (await owner(denied)).last_error], ['held', 'smtp_auth_failed'])

    smtp = createFakeSmtp({ refuse: true })
    const down = await send([['Email', 'v@example.org']], { page: '/es/', form: 'form-footer' })
    assert.deepEqual([(await owner(down)).state, (await owner(down)).last_error], ['pending', 'smtp_unreachable'])
  })

  test('implicit TLS on 465', async () => {
    await call('accounts', { method: 'POST', json: smtpAccount({ port: 465 }) })
    const result = await call('accounts/smtp/test', { method: 'POST', json: { to: 'achucore@example.test' } })
    assert.equal(result.body.ok, true, JSON.stringify(result.body))
    assert.equal(smtp.log.connects[0].tls.secureTransport, 'on')
    assert.ok(!smtp.log.commands.includes('STARTTLS'))
  })
})

test('presentation names can change on Brevo and Gmail without changing their routing IDs', async () => {
  const { id: _, ...autoAccount } = brevoAccount({ displayName: 'Public website', label: 'Keep this note' })
  const created = await call('accounts', { method: 'POST', json: autoAccount })
  assert.equal(created.status, 200)
  const id = created.body.id
  assert.match(id, /^brevo-web-/)
  assert.equal((await call('accounts', { method: 'POST', json: { ...autoAccount, id, secret: '', displayName: 'Sales website' } })).status, 200)
  env.FORMS_GOOGLE_CLIENT_ID = 'fake-client-id'
  env.FORMS_GOOGLE_CLIENT_SECRET = 'fake-client-secret'
  await bindings.db.prepare('INSERT INTO forms_grants (ref, account, scopes, token_enc, client_fp, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind('gmail-2', 'test@example.test', 'https://www.googleapis.com/auth/drive.file', 'encrypted', 'fingerprint', clock).run()
  assert.equal((await call('accounts/gmail-2/name', { method: 'POST', json: { displayName: 'Operations' } })).status, 200)
  assert.equal((await call('accounts/main/name', { method: 'POST', json: { displayName: 'Protected' } })).status, 409)
  await call('routes', { method: 'POST', json: { routes: { default: id, drive: 'gmail-2' } } })
  const summary = (await call('summary')).body
  assert.deepEqual([summary.routes.default, summary.routes.drive], [id, 'gmail-2'])
  assert.deepEqual(summary.accounts.filter(account => [id, 'gmail-2'].includes(account.id)).map(account => [account.id, account.displayName, account.label]), [[id, 'Sales website', 'Keep this note'], ['gmail-2', 'Operations', '']])
})

describe('without an account', () => {
  test('the submission is stored, waits and is released once an account exists', async () => {
    delete env.FORMS_PROVIDER
    delete env.FORMS_GMAIL_DEFAULT
    const id = await send(contactFields, { page: '/es/contacto/', form: 'form-contacto' })
    assert.deepEqual((await jobs(id)).map(row => [row.channel, row.state, row.last_error, row.authority.provider]), [['owner', 'held', 'mail_unconfigured', 'pending']])
    assert.equal((await call('summary')).body.unconfigured, 1)
    assert.equal((await call('pending/release', { method: 'POST', json: {} })).body.error, 'mail_unconfigured')
    // The first account becomes the default (no FORMS_GMAIL_DEFAULT).
    await call('accounts', { method: 'POST', json: brevoAccount() })
    assert.equal((await call('summary')).body.routes.default, 'brevo')
    const released = await call('pending/release', { method: 'POST', json: {} })
    assert.deepEqual(released.body, { released: 1, remaining: 0 })
    const job = await owner(id)
    assert.deepEqual([job.state, job.authority.provider, job.authority.ref, job.authority.subject], ['sent', 'brevo', 'brevo', manifest.specs.contact.subject])
    assert.equal(providers.state.brevo.length, 1)
  })
})

describe('files', () => {
  const big = size => new Blob([new Uint8Array(size).fill(65)], { type: 'application/pdf' })

  test('Brevo sends an admin link for a WebP that cannot be attached', async () => {
    await call('accounts', { method: 'POST', json: brevoAccount() })
    await call('routes', { method: 'POST', json: { routes: { 'forms.owner': 'brevo' } } })
    const id = await send([['Nombre', 'Ana'], ['CV', new Blob(['RIFFdataWEBP'], { type: 'image/webp' }), 'foto.WebP']], { page: '/es/empleo/', form: 'form-cv' })
    const job = await owner(id)
    assert.deepEqual([job.state, job.authority.files.mode], ['sent', 'panel'])
    assert.equal(providers.state.brevo[0].attachment, undefined)
    assert.match(providers.state.brevo[0].textContent, /example\.test\/admin\/forms\//)
  })

  test('releasing a hold replans a large file using the real delivery account', async () => {
    env.FORMS_PROVIDER = 'hold'
    await call('accounts', { method: 'POST', json: brevoAccount() })
    await call('routes', { method: 'POST', json: { routes: { 'forms.owner': 'brevo' } } })
    const id = await send([['Nombre', 'Ana'], ['CV', big(1.5 * 1024 * 1024), 'cv.pdf']], { page: '/es/empleo/', form: 'form-cv' })
    assert.equal((await owner(id)).authority.files.mode, 'drive')

    delete env.FORMS_PROVIDER
    assert.equal((await release(id)).status, 200)
    const job = await owner(id)
    assert.deepEqual([job.state, job.authority.files.mode], ['sent', 'panel'])
    assert.match(providers.state.brevo[0].textContent, /https:\/\/example\.test\/admin\/forms\//)
    assert.equal(google.state.driveCalls.length, 0)
    const submission = await bindings.db.prepare('SELECT files, files_purged_at FROM forms_submissions WHERE id = ?').bind(id).first()
    assert.equal(submission.files_purged_at, null)
    assert.equal((await bindings.kv.get(JSON.parse(submission.files)[0].key, 'arrayBuffer')).byteLength, 1.5 * 1024 * 1024)
  })

  test('without a Gmail account, large files stay in the panel and the notice links to it', async () => {
    await call('accounts', { method: 'POST', json: brevoAccount() })
    await call('routes', { method: 'POST', json: { routes: { 'forms.owner': 'brevo' } } })
    const id = await send([['Nombre', 'Ana'], ['CV', big(2.5 * 1024 * 1024), 'cv.pdf']], { page: '/es/empleo/', form: 'form-cv' })
    const job = await owner(id)
    assert.deepEqual([job.state, job.authority.files.mode], ['sent', 'panel'])
    const mail = providers.state.brevo[0]
    assert.equal(mail.attachment, undefined)
    assert.match(mail.textContent, /https:\/\/example\.test\/admin\/forms\//)
    const row = await bindings.db.prepare('SELECT files_purged_at FROM forms_submissions WHERE id = ?').bind(id).first()
    assert.equal(row.files_purged_at, null)

    // Above 1 MB the encoding alone passes the Free CPU budget: panel too.
    const medium = await send([['Nombre', 'Ana'], ['CV', big(1.5 * 1024 * 1024), 'cv.pdf']], { page: '/es/empleo/', form: 'form-cv' })
    assert.equal((await owner(medium)).authority.files.mode, 'panel')
    const small = await send([['Nombre', 'Ana'], ['CV', big(900 * 1024), 'cv.pdf']], { page: '/es/empleo/', form: 'form-cv' })
    assert.equal((await owner(small)).authority.files.mode, 'inline')
    assert.equal(providers.state.brevo[2].attachment[0].name, 'cv.pdf')
  })

  test('the drive route stores large files in that Gmail while the mail goes through Brevo', async () => {
    await call('accounts', { method: 'POST', json: brevoAccount() })
    await call('routes', { method: 'POST', json: { routes: { 'forms.owner': 'brevo', drive: 'main' } } })
    const id = await send([['Nombre', 'Ana'], ['CV', big(1.5 * 1024 * 1024), 'cv.pdf']], { page: '/es/empleo/', form: 'form-cv' })
    const job = await owner(id)
    assert.deepEqual([job.state, job.authority.files.mode, job.authority.files.drive.ref], ['sent', 'drive', 'main'])
    assert.ok(google.state.driveCalls.some(call => call.startsWith('PATCH /upload/drive')))
    assert.match(providers.state.brevo[0].htmlContent, /drive\.google\.com/)
  })
})

describe('Worker secrets and the OAuth relay', () => {
  test('MAIL_ACCOUNTS accounts send and are read-only', async () => {
    env.MAIL_ACCOUNTS = JSON.stringify({ relay: { provider: 'smtp2go', sender: 'web@example.test', api_key: SMTP2GO_KEY } })
    env.FORMS_GMAIL_DEFAULT = 'relay'
    const id = await send([['Email', 'v@example.org']], { page: '/es/', form: 'form-footer' })
    assert.deepEqual([(await owner(id)).state, (await owner(id)).authority.provider], ['sent', 'smtp2go'])
    assert.equal((await call('accounts/relay/delete', { method: 'POST', json: {} })).body.error, 'account_in_secret')
    const listed = (await call('summary')).body.accounts.find(account => account.id === 'relay')
    assert.deepEqual([listed.source, listed.provider], ['secret', 'smtp2go'])
  })

  test('the relay forwards code and state only to allowed sites', async () => {
    const siteEnv = { FORMS_DB: bindings.db, FORMS_GRANT_KEY: KEY, FORMS_GOOGLE_CLIENT_ID: 'cid', FORMS_GOOGLE_CLIENT_SECRET: 'cs', FORMS_GOOGLE_REDIRECT: 'https://relay.example.dev/api/forms/google/relay' }
    const { url } = await startConnect({ request: new Request('https://shop.example.test/api/forms/admin/google/connect', { method: 'POST', body: '{}' }), env: siteEnv, now: () => 1000 })
    const params = new URL(url).searchParams
    assert.equal(params.get('redirect_uri'), 'https://relay.example.dev/api/forms/google/relay')
    const relayed = new Request(`https://relay.example.dev/api/forms/google/relay?code=abc&state=${encodeURIComponent(params.get('state'))}`)
    assert.equal(relayCallback({ request: relayed, env: {} }).status, 404)
    assert.equal(relayCallback({ request: relayed, env: { FORMS_OAUTH_RELAY_HOSTS: 'other.example.test' } }).status, 400)
    const response = relayCallback({ request: relayed, env: { FORMS_OAUTH_RELAY_HOSTS: '*.example.test' } })
    assert.equal(response.status, 302)
    const target = new URL(response.headers.get('location'))
    assert.equal(target.origin + target.pathname, 'https://shop.example.test/api/forms/admin/google/callback')
    assert.equal(target.searchParams.get('code'), 'abc')
    assert.equal(target.searchParams.get('state'), params.get('state'))
  })
})
