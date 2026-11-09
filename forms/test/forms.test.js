import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, beforeEach, describe, test } from 'node:test'
import { createFormsWorker } from '../worker.js'
import { dispatch } from '../dispatch.js'
import { createProviders } from '../providers/index.js'
import { LEASE_MS, recoverExpiredLeases, sweepOrphanUploads } from '../store.js'
import { ADMIN_TOKEN, createBindings, createFakeGoogle, credentials, decodeMime, manifest, netlifySign, submitRequest, uploadRequest, withLength } from './helpers.js'

let bindings
let google
let clock
let worker
let env

const now = () => clock
const contactFields = [
  ['Nombre', 'Ñandú Ölçü 😀'],
  ['Email', 'visitor@example.org'],
  ['Mensaje', ''],
  ['Intereses', 'uno'],
  ['Intereses', 'dos']
]

// Like the browser: every Blob is uploaded raw first and replaced by its index.
async function send (fields, options = {}) {
  const submissionId = options.id || crypto.randomUUID()
  const plain = []
  let index = 0
  for (const [name, value, fileName] of fields) {
    if (!(value instanceof Blob)) {
      plain.push([name, value])
      continue
    }
    const response = await worker.fetch(await uploadRequest(value, { ...options, id: submissionId, field: name, index, fileName }), env, null)
    if (!response.ok && response.status !== 409) return { id: submissionId, response, body: await response.json() }
    plain.push([name, String(index++)])
  }
  const { id, request } = submitRequest(plain, { ...options, id: submissionId })
  const response = await worker.fetch(await withLength(request), env, null)
  return { id, response, body: await response.json() }
}

const jobs = async id => (await bindings.db.prepare('SELECT id, channel, state, last_error, attempts FROM forms_jobs WHERE submission_id = ? ORDER BY channel').bind(id).all()).results
const job = async (id, channel) => (await jobs(id)).find(row => row.channel === channel)
const adminRequest = (path, token = ADMIN_TOKEN) => new Request(`https://example.test/api/forms/admin/${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}` } })

before(async () => { bindings = await createBindings() })
after(async () => { await bindings.dispose() })
beforeEach(async () => {
  for (const table of ['forms_drive_files', 'forms_drive_folders', 'forms_uploads', 'forms_jobs', 'forms_submissions', 'forms_rate']) await bindings.db.prepare(`DELETE FROM ${table}`).run()
  google = createFakeGoogle()
  clock = 1_800_000_000_000
  worker = createFormsWorker(manifest, { fetch: google.fetch, now })
  env = {
    FORMS_DB: bindings.db,
    FORMS_FILES: bindings.kv,
    FORMS_PROVIDER: 'gmail',
    FORMS_GMAIL_CREDENTIALS: JSON.stringify(credentials),
    FORMS_GMAIL_DEFAULT: 'main',
    FORMS_SENDER_NAME: 'Web Ejemplo',
    FORMS_ADMIN_TOKEN: ADMIN_TOKEN
  }
})

describe('intake and receipts', () => {
  test('accepted submission is durable, ordered and notifies owner and sender', async () => {
    const { id, response, body } = await send(contactFields)
    assert.equal(response.status, 200)
    assert.deepEqual(body, { result: 'success', persisted: true, submissionId: id, status: 'accepted' })
    const row = await bindings.db.prepare('SELECT fields, status FROM forms_submissions WHERE id = ?').bind(id).first()
    assert.deepEqual(JSON.parse(row.fields), contactFields)
    assert.deepEqual((await jobs(id)).map(row => [row.channel, row.state]), [['confirmation', 'sent'], ['owner', 'sent']])
    assert.equal(google.state.sent.length, 2)

    const owner = decodeMime(google.state.sent.find(mail => /^To: owner@/m.test(mail.mime)).mime)
    assert.match(owner.headers, /^From: Web Ejemplo <sender@example\.test>/m)
    assert.match(owner.headers, /^Reply-To: visitor@example\.org/m)
    assert.match(owner.headers, /^Subject: =\?UTF-8\?B\?/m)
    const ownerText = owner.parts.find(part => /text\/plain/.test(part.head)).body.toString()
    assert.match(ownerText, /Nombre: Ñandú Ölçü 😀\nEmail: visitor@example\.org\nMensaje: \nIntereses: uno\nIntereses: dos/)

    const confirmation = decodeMime(google.state.sent.find(mail => /^To: visitor@/m.test(mail.mime)).mime)
    assert.match(confirmation.headers, /^Reply-To: owner@example\.test/m)
    const html = confirmation.parts.find(part => /text\/html/.test(part.head)).body.toString()
    assert.match(html, /<p>Hola Ñandú Ölçü 😀, gracias\.<\/p>/)
    assert.doesNotMatch(html, /<script/)
  })

  test('retries are idempotent and conflicting reuse of an ID is refused', async () => {
    const id = crypto.randomUUID()
    const first = await send(contactFields, { id })
    const again = await send(contactFields, { id })
    assert.deepEqual(again.body, first.body)
    assert.equal(google.state.sent.length, 2)
    const conflict = await send([['Nombre', 'otro']], { id })
    assert.equal(conflict.response.status, 409)
    assert.equal(conflict.body.error, 'submission_conflict')
  })

  test('urlencoded retry body (pending queue) matches the multipart digest', async () => {
    const id = crypto.randomUUID()
    const multipart = await send(contactFields, { id })
    const encoded = await send(contactFields, { id, urlencoded: true })
    assert.equal(multipart.response.status, 200)
    assert.deepEqual(encoded.body, multipart.body)
  })

  test('rejects cross-origin, unknown forms, bad IDs and missing length', async () => {
    assert.equal((await send(contactFields, { origin: 'https://evil.test' })).response.status, 403)
    assert.equal((await send(contactFields, { form: 'form-nope' })).response.status, 404)
    assert.equal((await send(contactFields, { id: 'short' })).response.status, 400)
    const { request } = submitRequest(contactFields)
    const headers = new Headers(request.headers)
    headers.delete('content-length')
    const noLength = new Request(request.url, { method: 'POST', headers, body: await request.arrayBuffer(), duplex: 'half' })
    assert.equal((await worker.fetch(noLength, env, null)).status, 411)
    const count = await bindings.db.prepare('SELECT COUNT(*) AS n FROM forms_submissions').first()
    assert.equal(count.n, 0)
  })

  test('fails closed without a delivery configuration', async () => {
    delete env.FORMS_PROVIDER
    const { response, body } = await send(contactFields)
    assert.equal(response.status, 503)
    assert.equal(body.error, 'forms_unavailable')
    assert.equal((await bindings.db.prepare('SELECT COUNT(*) AS n FROM forms_submissions').first()).n, 0)
  })

  test('hold provider stores the submission without effects', async () => {
    env.FORMS_PROVIDER = 'hold'
    const { id, body } = await send(contactFields)
    assert.equal(body.status, 'accepted')
    assert.deepEqual((await jobs(id)).map(row => [row.state, row.last_error]), [['held', 'delivery_disabled'], ['held', 'delivery_disabled']])
    assert.equal(google.state.sent.length, 0)
  })

  test('rate limit applies to new submissions per IP, not to retries', async () => {
    const ids = []
    for (let index = 0; index < 6; index++) ids.push((await send([['Email', `n${index}@example.org`]], { page: '/es/', form: 'form-footer' })).id)
    const blocked = await send([['Email', 'n7@example.org']], { page: '/es/', form: 'form-footer' })
    assert.equal(blocked.response.status, 429)
    const retry = await send([['Email', 'n0@example.org']], { page: '/es/', form: 'form-footer', id: ids[0] })
    assert.equal(retry.response.status, 200)
    clock += 11 * 60 * 1000
    assert.equal((await send([['Email', 'n8@example.org']], { page: '/es/', form: 'form-footer' })).response.status, 200)
  })
})

describe('Netlify mirror (signed proxy)', () => {
  const secret = 'proxy-secret-for-tests-only-0123456789abcdef'
  const footer = { page: '/es/', form: 'form-footer', origin: 'https://site.test' }
  const proxied = (visitor, sign = netlifySign(secret, { exp: Math.floor(clock / 1000) + 60 })) =>
    ({ ...footer, ip: '198.51.100.1', headers: { 'x-nf-sign': sign, 'x-nf-client-connection-ip': visitor } })

  test('the public site origin from the manifest is accepted besides the Worker origin', async () => {
    assert.equal((await send([['Email', 'a@example.org']], footer)).response.status, 403)
    worker = createFormsWorker({ ...manifest, origins: ['https://site.test'] }, { fetch: google.fetch, now })
    assert.equal((await send([['Email', 'a@example.org']], footer)).response.status, 200)
  })

  test('rate limits use the visitor IP only behind a verified signature', async () => {
    worker = createFormsWorker({ ...manifest, origins: ['https://site.test'] }, { fetch: google.fetch, now })
    env.SANSOUL_PROXY_SECRET = secret
    // Seven visitors behind the same Netlify egress IP are not one bucket.
    for (let index = 0; index < 7; index++) {
      assert.equal((await send([['Email', `v${index}@example.org`]], proxied(`203.0.113.${index + 10}`))).response.status, 200)
    }
    // Forged or expired signatures fall back to the connecting IP (Netlify's).
    const forged = netlifySign('another-secret-of-sufficient-length-000000')
    const expired = netlifySign(secret, { exp: Math.floor(clock / 1000) - 1 })
    const statuses = []
    for (let index = 0; index < 6; index++) statuses.push((await send([['Email', `f${index}@example.org`]], proxied('203.0.113.99', index % 2 ? forged : expired))).response.status)
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200])
    assert.equal((await send([['Email', 'f7@example.org']], proxied('203.0.113.98', forged))).response.status, 429)
  })
})

describe('policy and antispam', () => {
  test('review submissions are stored without effects until an admin releases them', async () => {
    const { id, body } = await send([...contactFields.slice(0, 2), ['Mensaje', 'buy now at the casino']])
    assert.equal(body.status, 'review')
    assert.deepEqual((await jobs(id)).map(row => [row.channel, row.state, row.last_error]), [['owner', 'held', 'review']])
    assert.equal(google.state.sent.length, 0)

    assert.equal((await worker.fetch(adminRequest(`jobs/${id}:owner/release`, 'wrong-token-wrong-token-wrong-token'), env)).status, 401)
    assert.equal((await worker.fetch(adminRequest(`jobs/${id}:owner/release`), env)).status, 200)
    assert.equal((await worker.fetch(adminRequest('dispatch'), env)).status, 200)
    assert.equal((await job(id, 'owner')).state, 'sent')
    assert.equal(google.state.sent.length, 1)
  })

  test('honeypot and unknown fields go to review', async () => {
    const honeypot = submitRequest(contactFields)
    const data = await honeypot.request.formData()
    data.set('_gotcha', 'bot')
    const request = new Request(honeypot.request.url, { method: 'POST', headers: { origin: 'https://example.test' }, body: data })
    assert.equal((await (await worker.fetch(await withLength(request), env)).json()).status, 'review')
    assert.equal((await send([...contactFields, ['Injected', 'x']])).body.status, 'review')
  })

  test('multiple owners are private (Bcc) and visitor fields cannot add recipients', async () => {
    await send([['Email', 'v@example.org'], ['CC', 'attacker@evil.test']], { page: '/es/', form: 'form-footer' })
    // Unknown CC field → review; nothing is sent to anyone.
    assert.equal(google.state.sent.length, 0)
    await send([['Email', 'v@example.org']], { page: '/es/', form: 'form-footer' })
    const mail = decodeMime(google.state.sent[0].mime)
    assert.match(mail.headers, /^Bcc: a@example\.test,\r\n b@example\.test/m)
    assert.doesNotMatch(mail.headers, /^To:/m)
    assert.doesNotMatch(google.state.sent[0].mime, /attacker/)
  })
})

describe('attachments', () => {
  const pdf = new Uint8Array(300 * 1024).map((_, index) => (index * 7) % 256)
  const png = new Uint8Array([137, 80, 78, 71, 0, 1, 2, 255])

  test('files reach the owner byte-for-byte and KV is purged afterwards', async () => {
    const { id, body } = await send([
      ['Nombre', 'Ana'],
      ['CV', new Blob([pdf], { type: 'application/pdf' }), 'cv ñ.pdf'],
      ['CV', new Blob([png], { type: 'image/png' }), 'foto.png']
    ], { page: '/es/empleo/', form: 'form-cv' })
    assert.equal(body.status, 'accepted')
    const mail = decodeMime(google.state.sent[0].mime)
    const attachments = mail.parts.filter(part => /Content-Disposition: attachment/.test(part.head))
    assert.equal(attachments.length, 2)
    assert.equal(createHash('sha256').update(attachments[0].body).digest('hex'), createHash('sha256').update(pdf).digest('hex'))
    assert.deepEqual(new Uint8Array(attachments[1].body), png)
    assert.match(attachments[0].head, /filename="=\?UTF-8\?B\?/)
    const row = await bindings.db.prepare('SELECT files, files_purged_at FROM forms_submissions WHERE id = ?').bind(id).first()
    assert.ok(row.files_purged_at)
    for (const file of JSON.parse(row.files)) assert.equal(await bindings.kv.get(file.key), null)
  })

  test('file policy comes from the manifest', async () => {
    const page = { page: '/es/empleo/', form: 'form-cv' }
    const exe = await send([['CV', new Blob([png], { type: 'application/x-msdownload' }), 'x.exe']], page)
    assert.equal(exe.response.status, 415)
    const many = await send([1, 2, 3].map(index => ['CV', new Blob([png], { type: 'image/png' }), `${index}.png`]), page)
    assert.equal(many.body.error, 'too_many_files')
    const wrongField = await send([['Nombre', new Blob([png], { type: 'image/png' }), 'a.png']], page)
    assert.equal(wrongField.body.error, 'file_not_allowed')
    assert.equal((await bindings.db.prepare('SELECT COUNT(*) AS n FROM forms_submissions').first()).n, 0)
  })

  test('missing attachment bytes hold the job instead of sending without them', async () => {
    google.state.sendMode = '429'
    const { id } = await send([['Nombre', 'Ana'], ['CV', new Blob([png], { type: 'image/png' }), 'a.png']], { page: '/es/empleo/', form: 'form-cv' })
    const files = JSON.parse((await bindings.db.prepare('SELECT files FROM forms_submissions WHERE id = ?').bind(id).first()).files)
    await bindings.kv.delete(files[0].key)
    google.state.sendMode = 'ok'
    clock += 61000
    await worker.fetch(adminRequest('dispatch'), env)
    // KV may lag across locations: a young submission retries first.
    assert.deepEqual([(await job(id, 'owner')).state, (await job(id, 'owner')).last_error], ['pending', 'files_missing'])
    clock += 310000
    await worker.fetch(adminRequest('dispatch'), env)
    assert.deepEqual([(await job(id, 'owner')).state, (await job(id, 'owner')).last_error], ['held', 'files_missing'])
    assert.equal(google.state.sent.length, 0)
  })
})

describe('accounts and providers', () => {
  test('each form uses its own configured account; identity is attested', async () => {
    await send([['Name', 'Bo'], ['CV', new Blob([new Uint8Array([1])], { type: 'application/pdf' }), 'a.pdf']], { page: '/en/jobs/', form: 'form-cv' })
    await send([['Nombre', 'Ana']], { page: '/es/empleo/', form: 'form-cv' })
    assert.deepEqual(google.state.sent.map(mail => mail.account), ['other@example.test', 'sender@example.test'])
    assert.match(google.state.sent[0].mime, /^From: Web Ejemplo <other@example\.test>/m)

    google.state.identityOverride = 'intruder@example.test'
    worker = createFormsWorker(manifest, { fetch: google.fetch, now })
    const { id } = await send([['Nombre', 'Cy']], { page: '/es/empleo/', form: 'form-cv' })
    assert.deepEqual([(await job(id, 'owner')).state, (await job(id, 'owner')).last_error], ['held', 'gmail_identity_mismatch'])
    assert.equal(google.state.sent.length, 2)
  })

  test('credential changes after acceptance hold the job (no silent re-routing)', async () => {
    env.FORMS_PROVIDER = 'hold'
    const { id } = await send([['Nombre', 'Ana']], { page: '/es/empleo/', form: 'form-cv' })
    assert.equal((await job(id, 'owner')).state, 'held')
    env.FORMS_PROVIDER = 'gmail'
    const accepted = await send([['Nombre', 'Eva']], { page: '/es/empleo/', form: 'form-cv' })
    google.state.sent.length = 0
    await bindings.db.prepare("UPDATE forms_jobs SET state = 'pending' WHERE id = ?").bind(`${accepted.id}:owner`).run()
    env.FORMS_GMAIL_CREDENTIALS = JSON.stringify({ ...credentials, main: { ...credentials.main, client_id: 'another-client' } })
    await dispatch({ env, db: bindings.db, kv: bindings.kv, providers: createProviders({ fetch: google.fetch }), now })
    assert.deepEqual([(await job(accepted.id, 'owner')).state, (await job(accepted.id, 'owner')).last_error], ['held', 'authority_drift'])
    assert.equal(google.state.sent.length, 0)
  })
})

describe('review fixes', () => {
  const footer = { page: '/es/', form: 'form-footer' }

  test('a rotated refresh token keeps the same authority and delivers', async () => {
    google.state.sendMode = '429'
    const { id } = await send([['Email', 'a@example.org']], footer)
    credentials.main.refresh_token = 'rt-main-rotated'
    try {
      env.FORMS_GMAIL_CREDENTIALS = JSON.stringify(credentials)
      google.state.sendMode = 'ok'
      clock += 61000
      worker = createFormsWorker(manifest, { fetch: google.fetch, now })
      await worker.fetch(adminRequest('dispatch'), env)
      assert.equal((await job(id, 'owner')).state, 'sent')
    } finally {
      credentials.main.refresh_token = 'rt-main'
    }
  })

  test('a grant without the email scope cannot be attested and is held', async () => {
    google.state.tokeninfoNoEmail = true
    const { id } = await send([['Email', 'a@example.org']], footer)
    assert.deepEqual([(await job(id, 'owner')).state, (await job(id, 'owner')).last_error], ['held', 'gmail_identity_unverified'])
    assert.equal(google.state.sent.length, 0)
    google.state.tokeninfoNoEmail = false
    assert.equal((await worker.fetch(adminRequest(`jobs/${id}:owner/release`), env)).status, 200)
    worker = createFormsWorker(manifest, { fetch: google.fetch, now })
    await worker.fetch(adminRequest('dispatch'), env)
    assert.equal((await job(id, 'owner')).state, 'sent')
  })

  test('Gmail quota (403) is retried with backoff, not held', async () => {
    google.state.sendMode = '403quota'
    const { id } = await send([['Email', 'a@example.org']], footer)
    assert.deepEqual([(await job(id, 'owner')).state, (await job(id, 'owner')).last_error], ['pending', 'gmail_quota'])
  })

  test('addresses the MIME writer rejects are review, not a silently lost lead', async () => {
    const { id, body } = await send([['Nombre', 'José'], ['Email', 'josé@example.org'], ['Mensaje', 'hola']])
    assert.equal(body.status, 'review')
    assert.deepEqual((await jobs(id)).map(row => [row.channel, row.last_error]), [['owner', 'review']])
  })

  test('CRLF (multipart) and LF (local retry) produce the same receipt', async () => {
    const id = crypto.randomUUID()
    const first = await send([['Nombre', 'A'], ['Email', 'a@example.org'], ['Mensaje', 'uno\r\ndos']], { id })
    const retry = await send([['Nombre', 'A'], ['Email', 'a@example.org'], ['Mensaje', 'uno\ndos']], { id, urlencoded: true })
    assert.equal(retry.response.status, 200)
    assert.deepEqual(retry.body, first.body)
  })

  test('one confirmation per recipient and day', async () => {
    await send(contactFields)
    const second = await send(contactFields)
    assert.equal(second.body.status, 'accepted')
    assert.deepEqual((await jobs(second.id)).map(row => row.channel), ['owner'])
    assert.equal(google.state.sent.filter(mail => /^To: visitor@/m.test(mail.mime)).length, 1)
  })

  test('KV failures answer 503 and store nothing', async () => {
    env.FORMS_FILES = { put: async () => { throw new Error('KV PUT failed: 429') }, delete: async () => {}, get: async () => null }
    const { response, body } = await send([['Nombre', 'Ana'], ['CV', new Blob([new Uint8Array([1, 2])], { type: 'image/png' }), 'a.png']], { page: '/es/empleo/', form: 'form-cv' })
    assert.equal(response.status, 503)
    assert.equal(body.error, 'files_unavailable')
    assert.equal((await bindings.db.prepare('SELECT COUNT(*) AS n FROM forms_submissions').first()).n, 0)
  })

  test('a job that keeps dying before the provider stops after the attempt budget', async () => {
    env.FORMS_PROVIDER = 'hold'
    const { id } = await send([['Email', 'a@example.org']], footer)
    await bindings.db.prepare("UPDATE forms_jobs SET state = 'leased', attempts = 6, lease_token = 'dead', lease_until = ?, sending_at = NULL WHERE id = ?").bind(clock - 1, `${id}:owner`).run()
    await recoverExpiredLeases(bindings.db, clock)
    assert.deepEqual([(await job(id, 'owner')).state, (await job(id, 'owner')).last_error], ['held', 'lease_expired_repeatedly'])
  })

  test('discarding the owner job purges its attachments; failed jobs can be released, discarded ones not', async () => {
    env.FORMS_PROVIDER = 'hold'
    const { id } = await send([['Nombre', 'Ana'], ['CV', new Blob([new Uint8Array([9])], { type: 'image/png' }), 'a.png']], { page: '/es/empleo/', form: 'form-cv' })
    const files = JSON.parse((await bindings.db.prepare('SELECT files FROM forms_submissions WHERE id = ?').bind(id).first()).files)
    assert.ok(await bindings.kv.get(files[0].key))
    assert.equal((await worker.fetch(adminRequest(`jobs/${id}:owner/discard`), env)).status, 200)
    assert.equal(await bindings.kv.get(files[0].key), null)
    assert.equal((await job(id, 'owner')).state, 'failed')
    assert.equal((await worker.fetch(adminRequest(`jobs/${id}:owner/release`), env)).status, 409)
    await bindings.db.prepare("UPDATE forms_jobs SET last_error = 'network_error' WHERE id = ?").bind(`${id}:owner`).run()
    assert.equal((await worker.fetch(adminRequest(`jobs/${id}:owner/release`), env)).status, 200)
    assert.equal((await job(id, 'owner')).state, 'pending')
  })
})

describe('delivery failures and leases', () => {
  const footer = { page: '/es/', form: 'form-footer' }

  test('ambiguous provider answers are held and never resent automatically', async () => {
    google.state.sendMode = 'network'
    const network = await send([['Email', 'a@example.org']], footer)
    google.state.sendMode = '503'
    const unavailable = await send([['Email', 'b@example.org']], footer)
    assert.equal((await job(network.id, 'owner')).state, 'held')
    assert.equal((await job(unavailable.id, 'owner')).last_error, 'gmail_send_ambiguous_503')
    google.state.sendMode = 'ok'
    clock += 24 * 3600 * 1000
    await worker.fetch(adminRequest('dispatch'), env)
    assert.equal(google.state.sent.length, 0)
  })

  test('rate-limited sends retry with backoff', async () => {
    google.state.sendMode = '429'
    const { id } = await send([['Email', 'a@example.org']], footer)
    assert.deepEqual([(await job(id, 'owner')).state, (await job(id, 'owner')).attempts], ['pending', 1])
    google.state.sendMode = 'ok'
    await worker.fetch(adminRequest('dispatch'), env)
    assert.equal(google.state.sent.length, 0, 'not due yet')
    clock += 61000
    await worker.fetch(adminRequest('dispatch'), env)
    assert.equal((await job(id, 'owner')).state, 'sent')
    assert.equal(google.state.sent.length, 1)
  })

  test('a lease that expires during the provider call is held, and the late result cannot overwrite it', async () => {
    google.state.sendHook = async () => {
      google.state.sendHook = null
      clock += LEASE_MS + 1000
      await recoverExpiredLeases(bindings.db, clock)
    }
    const { id } = await send([['Email', 'a@example.org']], footer)
    assert.deepEqual([(await job(id, 'owner')).state, (await job(id, 'owner')).last_error], ['held', 'lease_expired_ambiguous'])
    await worker.fetch(adminRequest('dispatch'), env)
    assert.equal(google.state.sent.length, 1)
  })

  test('with too little time left before the waitUntil cut, the send waits for the next drain', async () => {
    const { id } = await send([['Email', 'a@example.org']], footer)
    await bindings.db.prepare("UPDATE forms_jobs SET state = 'pending', sending_at = NULL, attempts = 1 WHERE id = ?").bind(`${id}:owner`).run()
    const sentBefore = google.state.sent.length
    const providers = createProviders({ fetch: google.fetch })
    await dispatch({ env, db: bindings.db, kv: bindings.kv, providers, now, submissionId: id, deadline: clock + 5000 })
    const deferred = await job(id, 'owner')
    assert.deepEqual([deferred.state, deferred.last_error, deferred.attempts], ['pending', 'deferred', 1])
    assert.equal(google.state.sent.length, sentBefore)
    await dispatch({ env, db: bindings.db, kv: bindings.kv, providers, now, submissionId: id, deadline: clock + 28000 })
    assert.equal((await job(id, 'owner')).state, 'sent')
    assert.equal(google.state.sent.length, sentBefore + 1)
  })

  test('a lease lost before the provider call sends nothing', async () => {
    const { id } = await send([['Email', 'b@example.org']], footer)
    assert.equal((await job(id, 'owner')).state, 'sent')
    await bindings.db.prepare("UPDATE forms_jobs SET state = 'pending', sending_at = NULL WHERE id = ?").bind(`${id}:owner`).run()
    const providers = createProviders({ fetch: google.fetch })
    const original = providers.gmail.send
    // A competing owner takes the lease between the claim and the final fence.
    providers.gmail.send = async options => {
      await bindings.db.prepare("UPDATE forms_jobs SET lease_token = 'stolen' WHERE id = ?").bind(`${id}:owner`).run()
      return original(options)
    }
    await dispatch({ env, db: bindings.db, kv: bindings.kv, providers, now })
    assert.equal(google.state.sent.length, 1)
    assert.equal((await job(id, 'owner')).state, 'leased')
  })

  test('a lease that expires before sending returns to pending and is sent once', async () => {
    const accepted = await send([['Email', 'c@example.org']], footer)
    await bindings.db.prepare("UPDATE forms_jobs SET state = 'leased', lease_token = 'dead', lease_until = ?, sending_at = NULL WHERE id = ?").bind(clock - 1, `${accepted.id}:owner`).run()
    const before = google.state.sent.length
    await worker.fetch(adminRequest('dispatch'), env)
    assert.deepEqual([(await job(accepted.id, 'owner')).state, (await job(accepted.id, 'owner')).last_error], ['pending', 'lease_expired'])
    clock += 61000
    await worker.fetch(adminRequest('dispatch'), env)
    assert.equal((await job(accepted.id, 'owner')).state, 'sent')
    assert.equal(google.state.sent.length, before + 1)
  })

  test('stored submissions and authorities are immutable', async () => {
    const { id } = await send([['Email', 'a@example.org']], footer)
    await assert.rejects(bindings.db.prepare("UPDATE forms_submissions SET fields = '[]' WHERE id = ?").bind(id).run(), /forms_submission_immutable/)
    await assert.rejects(bindings.db.prepare("UPDATE forms_jobs SET authority = '{}' WHERE submission_id = ?").bind(id).run(), /forms_job_authority_immutable/)
  })
})

describe('raw uploads and Drive', () => {
  const big = () => {
    const bytes = new Uint8Array(2.5 * 1024 * 1024)
    for (let index = 0; index < bytes.length; index += 4096) bytes[index] = index % 251
    return bytes
  }
  const cvPage = { page: '/es/empleo/', form: 'form-cv' }
  const ownerMail = () => google.state.sent.find(mail => /rrhh@example\.test/.test(mail.mime))
  const driveFiles = () => [...google.state.drive.values()].filter(file => !file.folder)
  const folderNamed = name => [...google.state.drive.values()].find(file => file.folder && file.name === name)

  test('large attachments go to Drive (Forms/<project>/<form>) and the email links them', async () => {
    env.FORMS_DRIVE = 'true'
    const bytes = big()
    const { id, body } = await send([['Nombre', 'Ana'], ['CV', new Blob([bytes], { type: 'application/pdf' }), 'cv grande.pdf']], cvPage)
    assert.equal(body.status, 'accepted')
    assert.equal((await job(id, 'owner')).state, 'sent')
    const [file] = driveFiles()
    assert.equal(file.id, 'gen1')
    assert.deepEqual(Buffer.from(file.bytes), Buffer.from(bytes))
    assert.match(file.name, new RegExp(`^${id}-CV-1-[0-9a-f]{16}-cv grande\\.pdf$`))
    const forms = folderNamed('Forms')
    const project = folderNamed('acme-web')
    const form = folderNamed('form-cv')
    assert.deepEqual([forms.parents, project.parents, form.parents, file.parents], [['root'], [forms.id], [project.id], [form.id]])
    const mail = decodeMime(ownerMail().mime)
    assert.equal(mail.parts.filter(part => /Content-Disposition: attachment/.test(part.head)).length, 0)
    assert.ok(mail.parts.some(part => part.body.toString().includes('https://drive.google.com/file/d/gen1/view')))
    const row = await bindings.db.prepare('SELECT files, files_purged_at FROM forms_submissions WHERE id = ?').bind(id).first()
    assert.ok(row.files_purged_at)
    assert.equal(await bindings.kv.get(JSON.parse(row.files)[0].key), null)
    assert.equal((await bindings.db.prepare('SELECT COUNT(*) AS n FROM forms_uploads').first()).n, 0)

    // The folder tree is resolved once per account and reused.
    const before = google.state.driveCalls.length
    clock += 1000
    await send([['Nombre', 'Bea'], ['CV', new Blob([big()], { type: 'application/pdf' }), 'otro.pdf']], { ...cvPage, ip: '203.0.113.8' })
    const calls = google.state.driveCalls.slice(before)
    assert.equal(calls.filter(call => call === 'GET /drive/v3/files').length, 0)
    assert.equal(calls.filter(call => call === 'POST /drive/v3/files').length, 1)
  })

  test('small totals stay inline even with Drive enabled', async () => {
    env.FORMS_DRIVE = 'true'
    const { id } = await send([['Nombre', 'Ana'], ['CV', new Blob([new Uint8Array(1000).fill(7)], { type: 'image/png' }), 'a.png']], cvPage)
    assert.equal((await job(id, 'owner')).state, 'sent')
    assert.equal(google.state.driveCalls.length, 0)
    const mail = decodeMime(ownerMail().mime)
    assert.equal(mail.parts.filter(part => /Content-Disposition: attachment/.test(part.head)).length, 1)
  })

  test('without Drive the inline budget caps each file', async () => {
    env.FORMS_DRIVE = 'false'
    const { response, body } = await send([['CV', new Blob([big()], { type: 'application/pdf' }), 'a.pdf']], cvPage)
    assert.equal(response.status, 413)
    assert.equal(body.error, 'file_too_large')
  })

  test('a lost Drive upload is retried on the same reserved file ID', async () => {
    env.FORMS_DRIVE = 'true'
    google.state.uploadMode = 'network'
    const { id } = await send([['Nombre', 'Ana'], ['CV', new Blob([big()], { type: 'application/pdf' }), 'a.pdf']], cvPage)
    assert.deepEqual([(await job(id, 'owner')).state, (await job(id, 'owner')).last_error], ['pending', 'drive_upload_unreachable'])
    assert.equal(ownerMail(), undefined)
    clock += 61000
    await worker.fetch(adminRequest('dispatch'), env, null)
    assert.equal((await job(id, 'owner')).state, 'sent')
    assert.deepEqual(driveFiles().map(file => file.id), ['gen1'])
    assert.equal(google.state.driveCalls.filter(call => call === 'GET /drive/v3/files/generateIds').length, 1)
  })

  test('a declared checksum that Drive does not confirm holds the job', async () => {
    env.FORMS_DRIVE = 'true'
    const id = crypto.randomUUID()
    const bytes = big()
    const upload = await worker.fetch(await uploadRequest(new Blob([bytes], { type: 'application/pdf' }), { ...cvPage, id, field: 'CV', index: 0, fileName: 'a.pdf', sha256: 'a'.repeat(64) }), env, null)
    assert.equal(upload.status, 200)
    const { request } = submitRequest([['Nombre', 'Ana'], ['CV', '0']], { ...cvPage, id })
    await worker.fetch(await withLength(request), env, null)
    assert.deepEqual([(await job(id, 'owner')).state, (await job(id, 'owner')).last_error], ['held', 'drive_checksum_mismatch'])
    assert.equal(ownerMail(), undefined)
  })

  test('a grant without drive.file or a full Drive holds the job before mailing', async () => {
    env.FORMS_DRIVE = 'true'
    google.state.driveScope = false
    const first = await send([['Nombre', 'Ana'], ['CV', new Blob([big()], { type: 'application/pdf' }), 'a.pdf']], cvPage)
    assert.deepEqual([(await job(first.id, 'owner')).state, (await job(first.id, 'owner')).last_error], ['held', 'drive_scope_missing'])
    assert.equal(google.state.driveCalls.length, 0)
    google.state.driveScope = true
    google.state.uploadMode = 'quota'
    worker = createFormsWorker(manifest, { fetch: google.fetch, now })
    const second = await send([['Nombre', 'Bo'], ['CV', new Blob([big()], { type: 'application/pdf' }), 'b.pdf']], { ...cvPage, ip: '203.0.113.9' })
    assert.deepEqual([(await job(second.id, 'owner')).state, (await job(second.id, 'owner')).last_error], ['held', 'drive_storage_full'])
    assert.equal(ownerMail(), undefined)
  })

  test('FORMS_DRIVE_FOLDER replaces the Forms base folder', async () => {
    env.FORMS_DRIVE = 'true'
    env.FORMS_DRIVE_FOLDER = 'shared1'
    google.state.drive.set('shared1', { id: 'shared1', owner: credentials.main.account, name: 'Cliente', parents: ['root'], folder: true, bytes: new Uint8Array(0) })
    const { id } = await send([['Nombre', 'Ana'], ['CV', new Blob([big()], { type: 'application/pdf' }), 'a.pdf']], cvPage)
    assert.equal((await job(id, 'owner')).state, 'sent')
    assert.equal(folderNamed('Forms'), undefined)
    assert.deepEqual(folderNamed('acme-web').parents, ['shared1'])
  })

  test('upload guards: origin, checksum, committed submission, missing reference, multipart files', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' })
    const id = crypto.randomUUID()
    const status = async request => { const response = await worker.fetch(request, env, null); return [response.status, (await response.json()).error] }
    assert.deepEqual(await status(await uploadRequest(blob, { ...cvPage, id, field: 'CV', index: 0, origin: 'https://evil.test' })), [403, 'origin_forbidden'])
    const noChecksum = await uploadRequest(blob, { ...cvPage, id, field: 'CV', index: 0 })
    noChecksum.headers.delete('x-file-sha256')
    assert.deepEqual(await status(noChecksum), [400, 'file_checksum_required'])
    assert.deepEqual(await status(await uploadRequest(blob, { ...cvPage, id, field: 'CV', index: 10 })), [400, 'file_reference_invalid'])

    const missing = submitRequest([['Nombre', 'Ana'], ['CV', '3']], { ...cvPage, id })
    assert.deepEqual(await status(await withLength(missing.request)), [400, 'file_missing'])
    const multipart = submitRequest([['Nombre', 'Ana'], ['CV', blob, 'a.pdf']], { ...cvPage, id })
    assert.deepEqual(await status(await withLength(multipart.request)), [400, 'upload_required'])

    const done = await send([['Nombre', 'Ana'], ['CV', blob, 'a.pdf']], { ...cvPage, id })
    assert.equal(done.body.status, 'accepted')
    assert.deepEqual(await status(await uploadRequest(blob, { ...cvPage, id, field: 'CV', index: 0, fileName: 'a.pdf' })), [409, 'submission_committed'])
  })

  test('uploads of abandoned forms are swept with their bytes after a day', async () => {
    const id = crypto.randomUUID()
    await worker.fetch(await uploadRequest(new Blob([new Uint8Array([5])], { type: 'application/pdf' }), { ...cvPage, id, field: 'CV', index: 0, fileName: 'a.pdf' }), env, null)
    const row = await bindings.db.prepare('SELECT kv_key FROM forms_uploads WHERE submission_id = ?').bind(id).first()
    assert.ok(await bindings.kv.get(row.kv_key))
    clock += 25 * 3600 * 1000
    assert.equal(await sweepOrphanUploads(bindings.db, bindings.kv, clock), 1)
    assert.equal(await bindings.kv.get(row.kv_key), null)
    assert.equal((await bindings.db.prepare('SELECT COUNT(*) AS n FROM forms_uploads').first()).n, 0)
  })

  test('a retry after commit with files gets the original receipt', async () => {
    const id = crypto.randomUUID()
    const fields = [['Nombre', 'Ana'], ['CV', new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' }), 'a.pdf']]
    const first = await send(fields, { ...cvPage, id })
    const again = await send(fields, { ...cvPage, id })
    assert.equal(again.response.status, 200)
    assert.deepEqual(again.body, first.body)
    assert.equal((await bindings.db.prepare('SELECT COUNT(*) AS n FROM forms_uploads').first()).n, 0)
  })

  test('a failed re-upload keeps the bytes of the earlier upload', async () => {
    const id = crypto.randomUUID()
    const bytes = new Uint8Array([7, 7, 7, 7])
    const blob = new Blob([bytes], { type: 'application/pdf' })
    assert.equal((await worker.fetch(await uploadRequest(blob, { ...cvPage, id, field: 'CV', index: 0, fileName: 'a.pdf' }), env, null)).status, 200)
    const failing = { ...env, FORMS_FILES: { ...bindings.kv, get: bindings.kv.get.bind(bindings.kv), delete: bindings.kv.delete.bind(bindings.kv), put: async () => { throw new Error('kv down') } } }
    assert.equal((await worker.fetch(await uploadRequest(blob, { ...cvPage, id, field: 'CV', index: 0, fileName: 'a.pdf' }), failing, null)).status, 503)
    const { request } = submitRequest([['Nombre', 'Ana'], ['CV', '0']], { ...cvPage, id })
    assert.equal((await worker.fetch(await withLength(request), env, null)).status, 200)
    assert.equal((await job(id, 'owner')).state, 'sent')
    const attachment = decodeMime(ownerMail().mime).parts.find(part => /Content-Disposition: attachment/.test(part.head))
    assert.deepEqual([...attachment.body], [...bytes])
  })

  test('the sweep never touches a committed submission and late uploads are refused', async () => {
    const id = crypto.randomUUID()
    // Unknown field → review: the files stay in KV until a human decides.
    const { body } = await send([['Nombre', 'Ana'], ['Extra', 'x'], ['CV', new Blob([new Uint8Array([4])], { type: 'application/pdf' }), 'a.pdf']], { ...cvPage, id })
    assert.equal(body.status, 'review')
    const [file] = JSON.parse((await bindings.db.prepare('SELECT files FROM forms_submissions WHERE id = ?').bind(id).first()).files)
    const late = await worker.fetch(await uploadRequest(new Blob([new Uint8Array([9])], { type: 'application/pdf' }), { ...cvPage, id, field: 'CV', index: 0, fileName: 'b.pdf' }), env, null)
    assert.equal(late.status, 409)
    assert.equal((await bindings.db.prepare('SELECT COUNT(*) AS n FROM forms_uploads').first()).n, 0)
    clock += 25 * 3600 * 1000
    await sweepOrphanUploads(bindings.db, bindings.kv, clock)
    assert.ok(await bindings.kv.get(file.key))
  })

  test('staged uploads of one submission cannot exceed its total', async () => {
    env.FORMS_DRIVE = 'false'
    const id = crypto.randomUUID()
    const part = size => new Blob([new Uint8Array(size)], { type: 'application/pdf' })
    assert.equal((await worker.fetch(await uploadRequest(part(1.5 * 1024 * 1024), { ...cvPage, id, field: 'CV', index: 0, fileName: 'a.pdf' }), env, null)).status, 200)
    const second = await worker.fetch(await uploadRequest(part(1024 * 1024), { ...cvPage, id, field: 'CV', index: 1, fileName: 'b.pdf' }), env, null)
    assert.deepEqual([second.status, (await second.json()).error], [413, 'files_too_large'])
  })

  test('Google-native MIME types are stored as plain binary', async () => {
    const id = crypto.randomUUID()
    const blob = new Blob([new Uint8Array([1])], { type: 'application/vnd.google-apps.folder' })
    assert.equal((await worker.fetch(await uploadRequest(blob, { ...cvPage, id, field: 'CV', index: 0, fileName: 'x.pdf' }), env, null)).status, 200)
    assert.equal((await bindings.db.prepare('SELECT type FROM forms_uploads WHERE submission_id = ?').bind(id).first()).type, 'application/octet-stream')
  })
})
