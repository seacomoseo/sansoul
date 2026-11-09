import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'
import { createFormsWorker } from '../worker.js'
import { ADMIN_TOKEN, createBindings, createFakeGoogle, credentials, manifest, submitRequest, uploadRequest, withLength } from './helpers.js'

const REPO = 'acme/web'
const PUSH = 'gho_push_access_token_000000000000'
const READ = 'gho_read_only_token_00000000000000'

let bindings
let google
let github
let clock
let worker
let env

const now = () => clock
const footer = { page: '/es/', form: 'form-footer' }
const cv = { page: '/es/empleo/', form: 'form-cv' }

// GitHub REST: repository permissions per token; counts calls.
function fakeFetch (url, init = {}) {
  const href = String(url)
  if (!href.startsWith('https://api.github.com/')) return google.fetch(url, init)
  github.calls.push(href)
  if (github.down) return Promise.reject(new TypeError('fetch failed'))
  const token = String(init.headers?.authorization).replace('Bearer ', '')
  const permissions = { [PUSH]: { pull: true, push: true }, [READ]: { pull: true, push: false } }[token]
  if (!permissions) return Promise.resolve(new Response('{"message":"Bad credentials"}', { status: 401 }))
  if (href !== `https://api.github.com/repos/${REPO}`) return Promise.resolve(new Response('{}', { status: 404 }))
  return Promise.resolve(Response.json({ full_name: REPO, permissions }))
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
    await worker.fetch(await uploadRequest(value, { ...options, id: submissionId, field: name, index, fileName }), env, null)
    plain.push([name, String(index++)])
  }
  const { request } = submitRequest(plain, { ...options, id: submissionId, ip: `198.51.100.${Math.floor(Math.random() * 250)}` })
  const response = await worker.fetch(await withLength(request), env, null)
  assert.equal(response.status, 200)
  return submissionId
}

const call = async (path, { method = 'GET', auth = `GitHub ${PUSH}` } = {}) => {
  const response = await worker.fetch(new Request(`https://example.test/api/forms/admin/${path}`, { method, headers: auth ? { authorization: auth } : {} }), env, null)
  return { status: response.status, headers: response.headers, body: response.headers.get('content-type')?.startsWith('application/json') ? await response.json() : await response.arrayBuffer() }
}
const jobState = async (id, channel = 'owner') => (await bindings.db.prepare('SELECT state, last_error FROM forms_jobs WHERE id = ?').bind(`${id}:${channel}`).first())

before(async () => { bindings = await createBindings() })
after(async () => { await bindings.dispose() })
beforeEach(async () => {
  for (const table of ['forms_drive_files', 'forms_drive_folders', 'forms_uploads', 'forms_jobs', 'forms_submissions', 'forms_rate']) await bindings.db.prepare(`DELETE FROM ${table}`).run()
  google = createFakeGoogle()
  github = { calls: [], down: false }
  clock += 3_600_000 // a new hour per test: the GitHub cache never leaks between tests
  worker = createFormsWorker({ ...manifest, repo: REPO }, { fetch: fakeFetch, now })
  env = {
    FORMS_DB: bindings.db,
    FORMS_FILES: bindings.kv,
    FORMS_PROVIDER: 'gmail',
    FORMS_GMAIL_CREDENTIALS: JSON.stringify(credentials),
    FORMS_GMAIL_DEFAULT: 'main',
    FORMS_ADMIN_TOKEN: ADMIN_TOKEN
  }
})
clock = 1_800_000_000_000

describe('panel auth', () => {
  test('GitHub push access or the admin token; nothing else', async () => {
    assert.equal((await call('summary', { auth: null })).status, 401)
    assert.equal((await call('summary', { auth: `GitHub ${READ}` })).status, 401)
    assert.equal((await call('summary', { auth: 'GitHub gho_unknown_token_000000000000000' })).status, 401)
    assert.equal((await call('summary', { auth: `Bearer ${PUSH}` })).status, 401)
    const person = await call('summary')
    assert.equal(person.status, 200)
    assert.equal(person.body.actor, 'github')
    assert.equal(person.headers.get('cache-control'), 'private, no-store')
    // The automation token drains and decides; it cannot read or delete data.
    assert.equal((await call('summary', { auth: `Bearer ${ADMIN_TOKEN}` })).status, 403)
    assert.equal((await call('dispatch', { method: 'POST', auth: `Bearer ${ADMIN_TOKEN}` })).status, 200)
  })

  test('a positive check is cached for minutes; GitHub down is 503, not access', async () => {
    await call('summary')
    await call('submissions')
    assert.equal(github.calls.length, 1)
    clock += 6 * 60 * 1000
    github.down = true
    assert.equal((await call('summary')).status, 503)
    assert.equal((await call('dispatch', { method: 'POST', auth: `Bearer ${ADMIN_TOKEN}` })).status, 200)
  })

  test('the repository comes from the manifest or FORMS_ADMIN_REPO', async () => {
    env.FORMS_ADMIN_REPO = 'acme/other'
    assert.equal((await call('summary')).status, 401)
    delete env.FORMS_ADMIN_REPO
    worker = createFormsWorker(manifest, { fetch: fakeFetch, now })
    assert.equal((await call('summary')).status, 503)
    assert.equal((await call('summary')).body.error, 'admin_repo_unset')
  })
})

describe('panel data', () => {
  test('summary, views and detail show what needs a person', async () => {
    const ok = await send([['Email', 'a@example.org']], footer)
    const spam = await send([['Email', 'b@example.org'], ['Mensaje', 'casino']], { page: '/es/contacto/', form: 'form-contacto' })
    google.state.sendMode = '503'
    const ambiguous = await send([['Email', 'c@example.org']], footer)
    assert.equal((await jobState(ambiguous)).state, 'held')

    const summary = (await call('summary')).body
    assert.equal(summary.submissions, 3)
    assert.equal(summary.attention, 1)
    assert.equal(summary.review, 1)
    assert.deepEqual(summary.sent24h, [{ account: 'sender@example.test', sent: 1 }])
    assert.equal(summary.retentionDays, null)

    const all = (await call('submissions')).body
    assert.deepEqual(all.items.map(item => item.id).sort(), [ok, spam, ambiguous].sort())
    assert.equal(all.next, null)
    assert.deepEqual((await call('submissions?view=attention')).body.items.map(item => item.id), [ambiguous])
    assert.deepEqual((await call('submissions?view=review')).body.items.map(item => item.id), [spam])
    assert.equal((await call('submissions?view=review')).body.items[0].preview, 'b@example.org · casino')

    const detail = (await call(`submissions/${spam}`)).body
    assert.deepEqual(detail.fields, [['Email', 'b@example.org'], ['Mensaje', 'casino']])
    assert.deepEqual(detail.jobs.map(job => [job.channel, job.state, job.reason]), [['owner', 'held', 'review']])
    assert.deepEqual(detail.jobs[0].recipients, ['owner@example.test'])
    assert.equal((await call('submissions/00000000-0000-4000-8000-000000000000')).status, 404)
  })

  test('pages of 50 with a stable cursor', async () => {
    env.FORMS_PROVIDER = 'hold'
    for (let index = 0; index < 52; index++) {
      clock += 1
      await send([['Email', `p${index}@example.org`]], footer)
    }
    const first = (await call('submissions')).body
    assert.equal(first.items.length, 50)
    const second = (await call(`submissions?before=${encodeURIComponent(first.next)}`)).body
    assert.equal(second.items.length, 2)
    assert.equal(second.next, null)
    assert.equal(second.items[1].preview, 'p0@example.org')
  })

  test('attachments download while stored, as a sandboxed attachment', async () => {
    env.FORMS_PROVIDER = 'hold'
    const id = await send([['Nombre', 'Ana'], ['CV', new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' }), 'cv <1>.pdf']], cv)
    const detail = (await call(`submissions/${id}`)).body
    assert.deepEqual(detail.files.map(file => [file.name, file.size, file.stored]), [['cv <1>.pdf', 3, true]])
    const file = await call(`submissions/${id}/files/0`)
    assert.equal(file.status, 200)
    assert.deepEqual([...new Uint8Array(file.body)], [1, 2, 3])
    assert.equal(file.headers.get('content-type'), 'application/octet-stream')
    assert.match(file.headers.get('content-disposition'), /^attachment; filename\*=UTF-8''cv%20%3C1%3E\.pdf$/)
    assert.match(file.headers.get('content-security-policy'), /sandbox/)
    assert.equal((await call(`submissions/${id}/files/1`)).status, 404)
    assert.equal((await call(`jobs/${id}:owner/discard`, { method: 'POST' })).status, 200)
    assert.equal((await call(`submissions/${id}/files/0`)).status, 410)
  })
})

describe('panel actions', () => {
  test('release sends at once; discard closes; neither reopens a sent job', async () => {
    const spam = await send([['Email', 'b@example.org'], ['Mensaje', 'casino']], { page: '/es/contacto/', form: 'form-contacto' })
    assert.equal((await call(`jobs/${spam}:owner/release`, { method: 'POST' })).status, 200)
    assert.equal((await jobState(spam)).state, 'sent')
    assert.equal(google.state.sent.length, 1)
    assert.equal((await call(`jobs/${spam}:owner/release`, { method: 'POST' })).status, 409)
    assert.equal((await call(`jobs/${spam}:owner/discard`, { method: 'POST' })).status, 409)
    assert.equal((await call(`jobs/${spam}:owner/release`, { auth: `GitHub ${READ}`, method: 'POST' })).status, 401)
  })

  test('delete removes the record and its bytes, never while a job is in flight', async () => {
    env.FORMS_PROVIDER = 'hold'
    const id = await send([['Nombre', 'Ana'], ['CV', new Blob([new Uint8Array([7])], { type: 'application/pdf' }), 'a.pdf']], cv)
    const key = JSON.parse((await bindings.db.prepare('SELECT files FROM forms_submissions WHERE id = ?').bind(id).first()).files)[0].key
    await bindings.db.prepare("UPDATE forms_jobs SET state = 'pending' WHERE id = ?").bind(`${id}:owner`).run()
    assert.equal((await call(`submissions/${id}/delete`, { method: 'POST' })).status, 409)
    await bindings.db.prepare("UPDATE forms_jobs SET state = 'held' WHERE id = ?").bind(`${id}:owner`).run()
    assert.equal((await call(`submissions/${id}/delete`, { method: 'POST' })).status, 200)
    assert.equal(await bindings.kv.get(key), null)
    assert.equal(await bindings.db.prepare('SELECT 1 FROM forms_submissions WHERE id = ?').bind(id).first(), null)
    assert.equal(await bindings.db.prepare('SELECT 1 FROM forms_jobs WHERE submission_id = ?').bind(id).first(), null)
    assert.equal((await call(`submissions/${id}/delete`, { method: 'POST' })).status, 404)
  })

  test('retention deletes old closed submissions only, also from the drain', async () => {
    const old = await send([['Email', 'old@example.org']], footer)
    google.state.sendMode = '503'
    const oldHeld = await send([['Email', 'held@example.org']], footer)
    google.state.sendMode = 'ok'
    clock += 31 * 24 * 3600 * 1000
    const recent = await send([['Email', 'new@example.org']], footer)

    assert.deepEqual((await call('retention', { method: 'POST' })).body, { deleted: 0, retentionDays: null })
    env.FORMS_RETENTION_DAYS = '30'
    const drain = await call('dispatch', { method: 'POST', auth: `Bearer ${ADMIN_TOKEN}` })
    assert.equal(drain.body.pruned, 1)
    assert.equal(drain.body.attention, 1)
    const left = (await bindings.db.prepare('SELECT id FROM forms_submissions').all()).results.map(row => row.id).sort()
    assert.deepEqual(left, [oldHeld, recent].sort())
    assert.equal(left.includes(old), false)
  })

  test('retention keeps submissions whose delivery failed until a person decides', async () => {
    const failed = await send([['Email', 'failed@example.org']], footer)
    await bindings.db.prepare("UPDATE forms_jobs SET state = 'failed', last_error = 'network_error' WHERE submission_id = ?").bind(failed).run()
    clock += 31 * 24 * 3600 * 1000
    env.FORMS_RETENTION_DAYS = '30'
    assert.equal((await call('retention', { method: 'POST' })).body.deleted, 0)
    assert.ok(await bindings.db.prepare('SELECT 1 FROM forms_submissions WHERE id = ?').bind(failed).first())
    await bindings.db.prepare("UPDATE forms_jobs SET last_error = 'discarded' WHERE submission_id = ?").bind(failed).run()
    assert.equal((await call('retention', { method: 'POST' })).body.deleted, 1)
  })

  test('table view: forms with counts, and one form\'s submissions with their fields', async () => {
    const first = await send([['Nombre', 'Ana'], ['Email', 'ana@example.org']], footer)
    clock += 1000
    const second = await send([['Nombre', 'Luis'], ['Teléfono', '600'], ['Mensaje', 'x'.repeat(500)]], footer)
    clock += 1000
    await send([['Email', 'otro@example.org']], { page: '/es/contacto/', form: 'form-contacto' })
    const forms = (await call('forms')).body.forms
    assert.equal(forms.length, 2)
    assert.equal(forms[0].form, '/es/contacto/#form-contacto')
    assert.equal(forms.find(entry => entry.form === '/es/#form-footer').total, 2)
    const rows = (await call(`submissions?view=all&form=${encodeURIComponent('/es/#form-footer')}`)).body.items
    assert.deepEqual(rows.map(row => row.id), [second, first])
    assert.deepEqual(rows[1].fields, [['Nombre', 'Ana'], ['Email', 'ana@example.org']])
    assert.equal(rows[0].fields.find(([name]) => name === 'Mensaje')[1].length, 300)
    assert.equal((await call('submissions?view=all')).body.items.every(row => row.fields === undefined), true)
    assert.equal((await call('forms', { auth: `Bearer ${ADMIN_TOKEN}` })).status, 403)
  })
})
