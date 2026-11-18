import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { parse } from 'yaml'
import { projectName } from '../new/lib.js'
import { adapt } from '../new/repo.js'
import { fill } from '../new/drive.js'
import { context, identityHint, STEPS } from '../new.js'
import { renamable, sameName } from '../new/cloudflare.js'
import { domainTabs, historyPlan, projectFormIds } from '../new/forms-history.js'

const quiet = fn => {
  const log = console.log
  console.log = () => {}
  try { return fn() } finally { console.log = log }
}
const quietAsync = async fn => {
  const log = console.log
  console.log = () => {}
  try { return await fn() } finally { console.log = log }
}

test('project name: <owner> for site, <owner>-<repo> otherwise (GitLab and Drive)', () => {
  assert.equal(projectName('acme', 'site'), 'acme')
  assert.equal(projectName('acme', 'podologo'), 'acme-podologo')
})

test('new project context: defaults, normalized domain and mails', () => {
  const ctx = quiet(() => context({ owner: 'Acme', project: ' Acmé Clínica ', mails: ' a@x.es, b@y.es ' }, ['https://Acme.es/']))
  assert.equal(ctx.project, 'Acmé Clínica')
  assert.equal(ctx.domain, 'acme.es')
  assert.equal(ctx.repo, 'site')
  assert.equal(ctx.name, 'acme')
  assert.equal(ctx.worker, 'site')
  assert.deepEqual(ctx.mails, ['a@x.es', 'b@y.es'])
  assert.equal(ctx.apply, false)
  assert.equal(ctx.dir, path.join(os.homedir(), 'repos', 'acme.es'))
  assert.throws(() => context({}, ['acme.es']), /--owner/)
  assert.throws(() => context({ owner: 'a' }, ['acme.es']), /--project/)
  assert.throws(() => context({ owner: 'a', project: 'A' }, ['nodomain']), /dominio no válido/)
})

test('existing project context reads hugo.yml', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-new-')))
  const cwd = process.cwd()
  t.after(() => { process.chdir(cwd); fs.rmSync(root, { recursive: true, force: true }) })
  fs.mkdirSync(path.join(root, 'core'))
  fs.writeFileSync(path.join(root, 'core/do'), '')
  fs.writeFileSync(path.join(root, 'hugo.yml'), 'baseURL: https://www.acme.es\nparams:\n  owner: acme\n  repo: podologo\n  drive_mails: c@z.es\n  project: Acmé Podología\n')
  process.chdir(root)
  const ctx = quiet(() => context({}, []))
  assert.equal(ctx.domain, 'www.acme.es')
  assert.equal(ctx.name, 'acme-podologo')
  assert.equal(ctx.worker, 'podologo')
  assert.deepEqual(ctx.mails, ['c@z.es'])
  assert.equal(ctx.project, 'Acmé Podología')
  assert.equal(ctx.dir, root)
})

test('scaffold adapts the demo identity without touching other settings', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-new-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'data'))
  fs.writeFileSync(path.join(root, 'hugo.yml'), 'baseURL: https://demo.sansoul.workers.dev\nbuildFuture: true\nparams:\n  owner: seacomoseo\n  drive_url: https://drive.google.com/file/d/x\n  drive_mails: sansoul@seacomoseo.com\n  repo: sansoul-demo\n  worker: demo\n  worker_vars:\n    FORMS_PROVIDER: hold\n    FORMS_SENDER_NAME: SanSoul demo\n')
  fs.writeFileSync(path.join(root, 'data/config.yml'), '# Demo comment\nmail: sansoul@seacomoseo.com\nga4: G-DEMO\ncms_repo: seacomoseo/sansoul-demo\nshow: true\n')
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'sansoul-demo', homepage: 'https://github.com/seacomoseo/sansoul-demo', repository: { url: 'git+https://github.com/seacomoseo/sansoul-demo.git' } }))
  fs.writeFileSync(path.join(root, 'TODO.md'), 'var_domain var_owner var_name\n')
  adapt(root, { domain: 'acme.es', owner: 'acme', repo: 'site', worker: 'acme', name: 'acme', project: 'Acmé', mails: ['a@x.es'], netlify: '' })
  const hugo = parse(fs.readFileSync(path.join(root, 'hugo.yml'), 'utf8'))
  assert.equal(hugo.baseURL, 'https://acme.es')
  assert.equal(hugo.buildFuture, true)
  assert.deepEqual(hugo.params, { project: 'Acmé', owner: 'acme', drive_mails: 'a@x.es', repo: 'site', worker: 'acme', worker_vars: { FORMS_PROVIDER: 'hold', FORMS_SENDER_NAME: 'acme.es' } })
  const config = fs.readFileSync(path.join(root, 'data/config.yml'), 'utf8')
  assert.doesNotMatch(config, /Demo comment|ga4/)
  assert.deepEqual(parse(config), { mail: 'a@x.es', cms_repo: 'acme/site', show: true })
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.name, 'acme')
  assert.equal(pkg.homepage, 'https://github.com/acme/site')
  assert.equal(pkg.repository.url, 'git+https://github.com/acme/site.git')
  assert.equal(fs.readFileSync(path.join(root, 'TODO.md'), 'utf8'), 'acme.es acme acme\n')
})

test('Drive templates are filled without passwords', () => {
  const text = fill('var_domain\tvar_owner\tvar_name\tvar_members\tvar_pw\tvar_cf_email', { domain: 'acme.es', owner: 'acme', name: 'acme', mails: ['a@x.es', 'b@y.es'] })
  assert.equal(text, 'acme.es\tacme\tacme\ta@x.es, b@y.es\t\t')
})

test('steps run in an order where secrets exist before the first push', () => {
  const ids = STEPS.map(s => s.id)
  assert.equal(ids[0], 'repo')
  assert.equal(ids.at(-2), 'publish')
  assert.ok(ids.indexOf('cloudflare') < ids.indexOf('ci-token'))
  assert.ok(ids.indexOf('cloudflare') < ids.indexOf('gsc'))
})

test('`do new` works outside a consumer and prints its help', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-new-'))
  try {
    const result = spawnSync('sh', [new URL('../../do', import.meta.url).pathname, 'new', '--help'], { cwd: root, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /--apply/)
    const missing = spawnSync('sh', [new URL('../../do', import.meta.url).pathname, 'new'], { cwd: root, encoding: 'utf8' })
    assert.equal(missing.status, 1)
    assert.match(missing.stderr, /indica el dominio/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('Cloudflare accounts are renamed only from a default or this domain name', () => {
  assert.ok(renamable("ana@x.es's Account", 'acme.es'))
  assert.ok(renamable('Acme.es', 'www.acme.es'))
  assert.ok(!renamable('cuprico.com', 'technimur.es'))
  assert.ok(!renamable('Cúprico', 'technimur.es'))
  assert.ok(sameName('Cúprico', ' cúprico'.normalize('NFD')))
})

test('retire only runs on request and team mirrors the 3dnau organization', async () => {
  const { TEAMS } = await import('../new/team.js')
  assert.deepEqual(TEAMS.map(t => [t.slug, t.permission]), [['operations', 'admin'], ['clients', 'maintain']])
  const { OWNERS } = await import('../new/team.js')
  assert.deepEqual(OWNERS, ['lorensansol', 'lorensansol2', 'seocomosea'])
  const retire = STEPS.find(s => s.id === 'retire')
  assert.equal(retire.skip({ retire: false }), true)
  assert.equal(retire.skip({ retire: true }), false)
  assert.equal(STEPS.at(-1).id, 'retire')
})

test('API calls retry 429/5xx with backoff; POST retries only rate limits', async t => {
  const { http, retryPolicy, retryDelay } = await import('../new/lib.js')
  const realFetch = globalThis.fetch
  const realSleep = retryPolicy.sleep
  const waits = []
  retryPolicy.sleep = async ms => { waits.push(ms) }
  t.after(() => { globalThis.fetch = realFetch; retryPolicy.sleep = realSleep })
  const reply = (status, body = {}, headers = {}) => new Response(JSON.stringify(body), { status, headers })
  const queue = (...responses) => {
    const calls = []
    globalThis.fetch = async (url, init) => { calls.push(init.method); return responses.shift() }
    return calls
  }

  // GA4 listing hit by a transient 503, then OK.
  let calls = queue(reply(503, { error: { message: 'The service is currently unavailable.' } }), reply(429, {}, { 'retry-after': '2' }), reply(200, { properties: [1] }))
  assert.deepEqual((await http('https://analyticsadmin.googleapis.com/v1beta/properties')).data, { properties: [1] })
  assert.equal(calls.length, 3)
  assert.deepEqual(waits, [retryDelay(0), 2000])

  // A persistent outage fails after the attempt budget with a clear message.
  calls = queue(...Array.from({ length: retryPolicy.attempts }, () => reply(503)))
  await assert.rejects(http('https://analyticsadmin.googleapis.com/v1beta/properties'), new RegExp(`HTTP 503 tras ${retryPolicy.attempts} intentos`))
  assert.equal(calls.length, retryPolicy.attempts)

  // A POST is not repeated after a 5xx (it may have been applied), but is after a 429.
  calls = queue(reply(503))
  await assert.rejects(http('https://x.test/create', { method: 'POST', body: {} }), /HTTP 503 /)
  assert.equal(calls.length, 1)
  calls = queue(reply(429), reply(201, { name: 'properties/1' }))
  assert.equal((await http('https://x.test/create', { method: 'POST', body: {} })).data.name, 'properties/1')

  // Client errors fail at once.
  calls = queue(reply(404))
  await assert.rejects(http('https://x.test/missing'), /HTTP 404/)
  assert.equal(calls.length, 1)
  assert.equal(retryDelay(10, undefined, 1000), 30000)
})

test('a pre-14 project is told to update the engine before sh do new', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-new-')))
  const cwd = process.cwd()
  t.after(() => { process.chdir(cwd); fs.rmSync(root, { recursive: true, force: true }) })
  fs.mkdirSync(path.join(root, 'core'))
  fs.writeFileSync(path.join(root, 'core/do'), '')
  fs.writeFileSync(path.join(root, 'package.json'), '{"version":"13.7.0"}')
  fs.writeFileSync(path.join(root, 'hugo.yml'), 'baseURL: https://cuprico.com\nparams:\n  name: cuprico\n  domain: cuprico.com\n')
  process.chdir(root)
  assert.throws(() => quiet(() => context({}, [])), error => {
    assert.match(error.message, /params\.repo must name the GitHub repository/)
    assert.match(error.message, /SanSoul 13\.7\.0: sh do new necesita el motor 14/)
    assert.match(error.message, /update-project\.sh/)
    assert.match(error.message, /Repite sh do new/)
    return true
  })
  fs.writeFileSync(path.join(root, 'package.json'), '{"version":"14.15.2"}')
  assert.doesNotMatch(identityHint(new Error('x'), root), /update-project/)
  assert.match(identityHint(new Error('x'), root), /Corrige params\.owner y params\.repo/)
})

test('drive_mails from hugo.yml need confirmation before sharing; --mails confirms', async () => {
  const { confirmMails } = await import('../new/mails.js')
  const project = (values = {}) => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-new-')))
    const cwd = process.cwd()
    fs.mkdirSync(path.join(root, 'core'))
    fs.writeFileSync(path.join(root, 'core/do'), '')
    fs.writeFileSync(path.join(root, 'hugo.yml'), 'baseURL: https://acme.es\nparams:\n  owner: acme\n  repo: site\n  drive_mails: cliente@acme.es, exsocio@acme.es\n')
    process.chdir(root)
    try { return quiet(() => context(values, [])) } finally { process.chdir(cwd); fs.rmSync(root, { recursive: true, force: true }) }
  }
  const never = async () => { throw new Error('must not ask') }

  const plan = project()
  assert.equal(plan.mailsSource, 'hugo.yml')
  assert.equal(await confirmMails(plan, { interactive: false, ask: never }), true, 'a plan only lists them')

  const batch = project({ apply: true })
  assert.equal(await confirmMails(batch, { interactive: false, ask: never }), false, 'non-interactive --apply refuses')

  const tty = project({ apply: true })
  let asked = 0
  const yes = async question => { asked++; assert.match(question, /cliente@acme\.es, exsocio@acme\.es/); return true }
  assert.equal(await confirmMails(tty, { interactive: true, ask: yes }), true)
  assert.equal(await confirmMails(tty, { interactive: true, ask: yes }), true)
  assert.equal(asked, 1, 'asked once for drive and ga4')

  const flagged = project({ apply: true, mails: 'cliente@acme.es' })
  assert.equal(flagged.mailsSource, 'flag')
  assert.deepEqual(flagged.mails, ['cliente@acme.es'])
  assert.equal(await confirmMails(flagged, { interactive: false, ask: never }), true)
})

test('drive step never shares with unconfirmed hugo.yml mails in a non-interactive --apply', async t => {
  const { default: drive } = await import('../new/drive.js')
  const { retryPolicy } = await import('../new/lib.js')
  const secrets = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-secrets-'))
  fs.writeFileSync(path.join(secrets, 'google-seacomoseo-oauth-token.json'), JSON.stringify({ refresh_token: 'r', client_id: 'c', client_secret: 's', token_uri: 'https://oauth.test/token' }))
  const realFetch = globalThis.fetch
  const oldDir = process.env.SANSOUL_SECRETS_DIR
  process.env.SANSOUL_SECRETS_DIR = secrets
  retryPolicy.attempts = 1
  t.after(() => { globalThis.fetch = realFetch; process.env.SANSOUL_SECRETS_DIR = oldDir ?? ''; if (oldDir === undefined) delete process.env.SANSOUL_SECRETS_DIR; retryPolicy.attempts = 5; fs.rmSync(secrets, { recursive: true, force: true }) })
  const posts = []
  const me = { emailAddress: 'agency@x.test', permissionId: 'me' }
  const file = (id, name) => ({ id, name, parents: ['folder'], owners: [me] })
  globalThis.fetch = async (url, init = {}) => {
    const json = body => new Response(JSON.stringify(body), { status: 200 })
    if (url.startsWith('https://oauth.test')) return json({ access_token: 't-new-project' })
    if (url.includes('/about')) return json({ user: me })
    if (init.method === 'POST') { posts.push(url); return json({}) }
    if (url.includes('/permissions')) return json({ permissions: [{ emailAddress: 'agency@x.test', role: 'owner' }] })
    const q = decodeURIComponent(new URL(url).searchParams.get('q') || '')
    if (q.includes('_SanSoul Demo accesos.tsv')) return json({ files: [file('tpl-tsv', '_SanSoul Demo accesos.tsv')] })
    if (q.includes('_SanSoul Demo.md')) return json({ files: [file('tpl-md', '_SanSoul Demo.md')] })
    if (q.includes('Acmé accesos.tsv')) return json({ files: [file('tsv', 'Acmé accesos.tsv')] })
    if (q.includes('Acmé.md')) return json({ files: [file('md', 'Acmé.md')] })
    return json({ files: [] })
  }
  const ctx = quiet(() => context({ owner: 'acme', project: 'Acmé', apply: true }, ['acme.es']))
  Object.assign(ctx, { dir: '', mails: ['cliente@acme.es', 'exsocio@acme.es'], mailsSource: 'hugo.yml', confirmMails: async () => false })
  await quietAsync(() => drive.run(ctx))
  assert.deepEqual(posts, [])
  assert.match(ctx.manuals.join('\n'), /sin confirmar params\.drive_mails \(cliente@acme\.es, exsocio@acme\.es\)[\s\S]*--mails "cliente@acme\.es,exsocio@acme\.es" --only ga4,drive --apply/)

  ctx.confirmMails = async () => true
  ctx.manuals.length = 0
  await quietAsync(() => drive.run(ctx))
  assert.equal(posts.filter(url => url.includes('/tsv/permissions')).length, 2)
})

test('forms history takes only this domain\'s tabs and restores cut form ids', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-forms-history-'))
  try {
    fs.mkdirSync(path.join(dir, 'content/single'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'data/section'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'content/single/contacto.es.md'), '---\nform:\n  id: form-presupuesto-instalacion\n---\n')
    fs.writeFileSync(path.join(dir, 'data/section/form.yml'), "boxes:\n  - id: 'form-contacto'\n  - id: form-presupuesto-cargador\n")
    const ids = projectFormIds(dir)
    for (const id of ['form-presupuesto-instalacion', 'form-contacto', 'form-presupuesto-cargador']) assert.ok(ids.has(id), id)

    const head = ['Timestamp', 'URL', 'Nombre']
    const row = ['45849.5', 'https://acme.es/', 'Ana']
    // XLSX caps tab names at 31 characters: 'acme.es#' leaves 23 for the form id.
    const cutTab = 'acme.es#form-presupuesto-instal'
    const unknownTab = 'acme.es#form-presupuesto-xyzwvu'
    assert.equal(cutTab.length, 31)
    assert.equal(unknownTab.length, 31)
    const tabs = new Map([
      ['acme.es#form-contacto', [head, row]],
      ['acme.es#form-vacio', [head]], // header only: nothing to import
      [cutTab, [head, row]],
      [unknownTab, [head, row, row]],
      ['otro.es#form-contacto', [head, row]],
      ['xacme.es#form-contacto', [head, row]]
    ])
    assert.deepEqual(domainTabs(tabs, 'acme.es', ids).map(({ tab, form, cut, rows }) => [tab, form, cut, rows.length]), [
      ['acme.es#form-contacto', 'form-contacto', false, 2],
      [cutTab, 'form-presupuesto-instalacion', false, 2],
      [unknownTab, 'form-presupuesto-xyzwvu', true, 3]
    ])
    // Two declared ids share the cut prefix: keep the tab name and flag it.
    const [ambiguous] = domainTabs(new Map([[cutTab, [head, row]]]), 'acme.es', new Set(['form-presupuesto-instalacion', 'form-presupuesto-instalador']))
    assert.deepEqual([ambiguous.form, ambiguous.cut], ['form-presupuesto-instal', true])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('forms history runs after cloudflare and before publish', () => {
  const ids = STEPS.map(s => s.id)
  assert.ok(ids.indexOf('cloudflare') < ids.indexOf('forms-history'))
  assert.ok(ids.indexOf('forms-history') < ids.indexOf('publish'))
})

test('forms history plan is up to date once every row is imported', () => {
  const base = { name: 'site-forms', total: 56, summary: 'form-contacto 56' }
  assert.deepEqual(historyPlan({ ...base, exists: false, schema: false }), { done: false, text: 'crear la D1 site-forms, aplicar sus migraciones e importar 56 envío(s) (form-contacto 56)' })
  assert.deepEqual(historyPlan({ ...base, exists: true, schema: false }), { done: false, text: 'aplicar las migraciones de site-forms e importar 56 envío(s) (form-contacto 56)' })
  assert.deepEqual(historyPlan({ ...base, exists: true, schema: true, present: 50 }), { done: false, text: 'importar 6 envío(s) nuevo(s) de 56 (form-contacto 56)' })
  assert.deepEqual(historyPlan({ ...base, exists: true, schema: true, present: 56 }), { done: true, text: 'histórico al día en site-forms: 56 envío(s) ya importado(s) (form-contacto 56)' })
})
