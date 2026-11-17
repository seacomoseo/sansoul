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
import { context, STEPS } from '../new.js'
import { renamable, sameName } from '../new/cloudflare.js'

const quiet = fn => {
  const log = console.log
  console.log = () => {}
  try { return fn() } finally { console.log = log }
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
  assert.equal(ctx.worker, 'acme')
  assert.deepEqual(ctx.mails, ['a@x.es', 'b@y.es'])
  assert.equal(ctx.apply, false)
  assert.equal(ctx.dir, path.join(os.homedir(), 'repos', 'acme.es'))
  assert.throws(() => context({}, ['acme.es']), /--owner/)
  assert.throws(() => context({ owner: 'a' }, ['acme.es']), /--project/)
  assert.throws(() => context({ owner: 'a', project: 'A' }, ['nodomain']), /dominio no válido/)
})

test('existing project context reads hugo.yml', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-new-'))
  const cwd = process.cwd()
  t.after(() => { process.chdir(cwd); fs.rmSync(root, { recursive: true, force: true }) })
  fs.mkdirSync(path.join(root, 'core'))
  fs.writeFileSync(path.join(root, 'core/do'), '')
  fs.writeFileSync(path.join(root, 'hugo.yml'), 'baseURL: https://www.acme.es\nparams:\n  owner: acme\n  repo: podologo\n  drive_mails: c@z.es\n  project: Acmé Podología\n')
  process.chdir(root)
  const ctx = quiet(() => context({}, []))
  assert.equal(ctx.domain, 'www.acme.es')
  assert.equal(ctx.name, 'acme-podologo')
  assert.equal(ctx.worker, 'acme-podologo')
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
  assert.equal(ids.at(-1), 'publish')
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
