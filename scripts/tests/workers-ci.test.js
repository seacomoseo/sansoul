import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { parse } from 'yaml'
import { readProject } from '../project.js'
import { findDatabase, hasHistory, planWorker, renderConfig, renderEntry, resolveAccount, resolveResources } from '../worker-config.js'
import { migrateProject } from '../migrations/14.0.0-workers-ci.js'
import { LEGACY_GAS_ACTION, migrateProject as migrateFormsDefault } from '../migrations/14.18.0-forms-worker-default.js'

function project (files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-workers-'))
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true })
    fs.writeFileSync(path.join(directory, file), content)
  }
  return directory
}

const formsManifest = 'export const manifest = {\n  "forms": {\n    "a#b": "x"\n  }\n}\n'

test('project identity comes from flat params with derived defaults', () => {
  const directory = project({ 'hugo.yml': 'baseURL: https://www.example.com/\nparams:\n  owner: acme\n  repo: Site\n' })
  try {
    const result = readProject(directory)
    assert.equal(result.worker, 'site')
    assert.equal(result.domain, 'www.example.com')
    fs.writeFileSync(path.join(directory, 'hugo.yml'), 'baseURL: https://x.dev\nparams:\n  owner: acme\n  repo: example.com\n')
    assert.throws(() => readProject(directory), /Worker name "example.com" is invalid/)
    fs.writeFileSync(path.join(directory, 'hugo.yml'), 'baseURL: https://x.dev\nparams:\n  owner: acme\n  repo: site\n  worker_vars:\n    bad: 1\n')
    assert.throws(() => readProject(directory), /UPPER_SNAKE_CASE/)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('Worker config: assets-only without backends, bindings and cron with forms', () => {
  const directory = project({ 'hugo.yml': 'baseURL: https://demo.example.dev\nparams:\n  owner: acme\n  repo: site\n  worker: demo\n  worker_vars:\n    FORMS_PROVIDER: hold\n    FORMS_RETENTION_DAYS: 30\n' })
  try {
    let plan = planWorker(directory, { core: 'core' })
    let config = JSON.parse(renderConfig(plan).replace(/^\/\/.*\n/, ''))
    assert.equal(config.name, 'demo')
    assert.equal(config.main, undefined)
    assert.equal(config.assets.binding, undefined)
    assert.deepEqual(config.d1_databases, [])
    assert.equal(config.triggers, undefined)
    assert.deepEqual(config.vars, { FORMS_PROVIDER: 'hold', FORMS_RETENTION_DAYS: '30' })

    // An empty manifest (no worker forms) still needs no bindings.
    fs.mkdirSync(path.join(directory, 'worker'))
    fs.writeFileSync(path.join(directory, 'worker/forms.generated.js'), 'export const manifest = {\n  "forms": {}\n}\n')
    assert.equal(planWorker(directory, { core: 'core' }).forms, false)

    fs.writeFileSync(path.join(directory, 'worker/forms.generated.js'), formsManifest)
    plan = planWorker(directory, { core: 'core' })
    config = JSON.parse(renderConfig(plan, { account: 'acc', ids: { 'demo-forms': 'db-id', 'demo-files': 'kv-id' } }).replace(/^\/\/.*\n/, ''))
    assert.equal(config.account_id, 'acc')
    assert.equal(config.main, 'entry.generated.js')
    assert.deepEqual(config.assets.run_worker_first, ['/api/forms/*', '/api/mail/*'])
    assert.deepEqual(config.d1_databases, [{ binding: 'FORMS_DB', database_name: 'demo-forms', migrations_dir: '../core/forms/migrations', database_id: 'db-id' }])
    assert.deepEqual(config.kv_namespaces, [{ binding: 'FORMS_FILES', id: 'kv-id' }])
    assert.deepEqual(config.triggers.crons, ['*/15 * * * *'])
    const entry = renderEntry(plan)
    assert.match(entry, /from '\.\.\/core\/forms\/worker\.js'/)
    assert.match(entry, /scheduled: forms\.scheduled/)
    assert.doesNotMatch(entry, /commerce/)
    assert.match(entry, /const forms = createFormsWorker\(manifest\)\n/)

    fs.mkdirSync(path.join(directory, 'functions/_commerce'), { recursive: true })
    fs.writeFileSync(path.join(directory, 'functions/_commerce/catalog.generated.js'), '')
    plan = planWorker(directory, { core: 'core' })
    assert.deepEqual(plan.databases.map(db => db.database_name), ['demo-forms', 'demo-commerce'])
    const both = renderEntry(plan)
    assert.match(both, /return commerce\.fetch\(request, env, ctx\)/)
    assert.match(both, /import \{ createQuoteRequestEnricher \} from '\.\.\/core\/commerce\/quote-request\.js'/)
    assert.match(both, /createFormsWorker\(manifest, \{ enrichers: \{ commerce_quote: createQuoteRequestEnricher\(catalog\) \} \}\)/)
    assert.match(both, /commerce\.scheduled\(event, env, ctx\)\n    return forms\.scheduled\(event, env, ctx\)/)
    assert.deepEqual(JSON.parse(renderConfig(plan).replace(/^\/\/.*\n/, '')).triggers.crons, ['*/15 * * * *'])
    assert.match(renderEntry({ core: 'core', forms: false, commerce: true }), /scheduled: commerce\.scheduled/)
    assert.match(both, /\(forms\|mail\)/)

    // Commerce alone still binds the forms D1/KV: the site mail lives there.
    fs.writeFileSync(path.join(directory, 'worker/forms.generated.js'), 'export const manifest = {\n  "forms": {}\n}\n')
    plan = planWorker(directory, { core: 'core' })
    assert.equal(plan.forms, true)
    assert.deepEqual(plan.databases.map(db => db.database_name), ['demo-forms', 'demo-commerce'])
    assert.deepEqual(JSON.parse(renderConfig(plan).replace(/^\/\/.*\n/, '')).assets.run_worker_first, ['/api/forms/*', '/api/mail/*', '/api/commerce/*'])
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('resource resolution reuses resources by exact name and creates the missing ones', async () => {
  const calls = []
  const responses = {
    'GET /accounts': [{ id: 'acc' }],
    'GET /accounts/acc/d1/database': [{ name: 'demo-forms-old', uuid: 'no' }, { name: 'demo-forms', uuid: 'db-id' }],
    'GET /accounts/acc/storage/kv/namespaces': [{ title: 'other', id: 'no' }],
    'POST /accounts/acc/storage/kv/namespaces': { title: 'demo-files', id: 'kv-new' },
    'GET /accounts/acc/workers/subdomain': { subdomain: 'acme' }
  }
  const fetch = async (url, { method, headers }) => {
    assert.equal(headers.authorization, 'Bearer t')
    const route = `${method} ${new URL(url).pathname.replace('/client/v4', '')}`
    calls.push(route)
    return new Response(JSON.stringify({ success: true, result: responses[route], result_info: { total_pages: 1 } }))
  }
  const plan = { databases: [{ binding: 'FORMS_DB', database_name: 'demo-forms' }], kv: [{ binding: 'FORMS_FILES', title: 'demo-files' }] }
  const result = await resolveResources(plan, { token: 't', account: '', fetch })
  assert.deepEqual(result, { account: 'acc', ids: { 'demo-forms': 'db-id', 'demo-files': 'kv-new' }, created: ['demo-files'], subdomain: 'acme' })
  assert.ok(!calls.includes('POST /accounts/acc/d1/database'))

  const twoAccounts = async () => new Response(JSON.stringify({ success: true, result: [{ id: 'a' }, { id: 'b' }] }))
  await assert.rejects(resolveResources(plan, { token: 't', account: '', fetch: twoAccounts }), /CLOUDFLARE_ACCOUNT_ID/)
})

test('14.0.0 migration flattens params and removes only stock engine files', () => {
  const directory = project({
    'hugo.yml': '# Project\nbaseURL: https://demo.example.dev\nparams:\n  domain: demo.example.dev # host\n  owner: acme\n  name: demo-site\n  netlify_id: abc\n  netlify_hook: hook\n  cloudflare_id: \'\'\n  drive_url: https://drive\n',
    'worker.js': "import { createFormsWorker } from './core/forms/worker.js'\n",
    'wrangler.workers.toml': 'name = "demo"\nmain = "worker.js"\n\n[vars]\nFORMS_PROVIDER = "hold" # TEST\n\n[[d1_databases]]\nbinding = "FORMS_DB"\n',
    '.github/workflows/backup.yml': 'run: sh core/scripts/mirror-to-gitlab.sh\n',
    '.github/workflows/forms-dispatch.yml': 'custom: true\n',
    '.gitignore': 'node_modules\nworker/forms.generated.js\n',
    'netlify.toml': '[build]\n'
  })
  try {
    spawnSync('git', ['init', '-q'], { cwd: directory })
    spawnSync('git', ['remote', 'add', 'origin', 'https://github.com/acme/demo.example.git'], { cwd: directory })
    const dry = migrateProject(directory, { check: true })
    assert.deepEqual(dry.removed, ['worker.js', 'wrangler.workers.toml', '.github/workflows/backup.yml'])
    assert.equal(fs.existsSync(path.join(directory, 'worker.js')), true)

    const result = migrateProject(directory)
    const hugo = fs.readFileSync(path.join(directory, 'hugo.yml'), 'utf8')
    assert.match(hugo, /^# Project/)
    assert.match(hugo, /repo: demo\.example\n/)
    assert.match(hugo, /worker: demo\n/)
    assert.match(hugo, /netlify: demo-site\n/)
    assert.match(hugo, /FORMS_PROVIDER: hold/)
    assert.doesNotMatch(hugo, /domain:|name:|netlify_id|netlify_hook|cloudflare_id/)
    assert.equal(fs.existsSync(path.join(directory, 'worker.js')), false)
    assert.equal(fs.existsSync(path.join(directory, '.github/workflows/forms-dispatch.yml')), true)
    assert.ok(result.warnings.some(warning => /forms-dispatch\.yml is customized/.test(warning)))
    assert.ok(result.warnings.some(warning => /netlify\.toml still serves/.test(warning)))
    assert.equal(fs.readFileSync(path.join(directory, '.gitignore'), 'utf8'), 'node_modules\n/worker/\n.wrangler\n.dev.vars\n')
    const again = migrateProject(directory)
    assert.deepEqual([again.changed, again.removed], [[], []])
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('14.0.0 migration takes the owner from the GitHub remote of a transferred repository', () => {
  const directory = project({ 'hugo.yml': 'baseURL: https://shop.example\nparams:\n  owner: agency\n  name: shop\n' })
  try {
    spawnSync('git', ['init', '-q'], { cwd: directory })
    spawnSync('git', ['remote', 'add', 'origin', 'https://github.com/client/site.git'], { cwd: directory })
    const result = migrateProject(directory)
    const hugo = fs.readFileSync(path.join(directory, 'hugo.yml'), 'utf8')
    assert.match(hugo, /owner: client\n/)
    assert.match(hugo, /repo: site\n/)
    assert.doesNotMatch(hugo, /worker:/)
    assert.ok(result.warnings.some(warning => /params\.owner = client \(was agency/.test(warning)))
    assert.ok(result.warnings.some(warning => /Worker will be named site .* called shop/.test(warning)))
    assert.deepEqual(migrateProject(directory).changed, [])
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('forms history keeps the forms backend without Worker forms', async () => {
  const directory = project({ 'hugo.yml': 'baseURL: https://demo.example.dev\nparams:\n  owner: acme\n  repo: site\n  worker: demo\n' })
  try {
    const plain = planWorker(directory, { core: 'core' })
    assert.equal(plain.forms, false)
    const plan = planWorker(directory, { core: 'core', history: true })
    assert.equal(plan.forms, true)
    assert.deepEqual(plan.databases.map(db => db.database_name), ['demo-forms'])
    assert.deepEqual(plan.kv.map(kv => kv.title), ['demo-files'])
    assert.match(renderEntry(plan), /createFormsWorker\(manifest\)/)

    const seen = []
    const reply = (result, status = 200) => async url => {
      seen.push(new URL(url).pathname.replace('/client/v4', '') + new URL(url).search)
      return new Response(JSON.stringify({ success: status === 200, result, errors: status === 200 ? [] : [{ code: 10000, message: 'Authentication error' }] }), { status })
    }
    assert.equal(await resolveAccount({ token: 't', account: 'given', fetch: reply([]) }), 'given')
    assert.equal(await resolveAccount({ token: 't', account: '', fetch: reply([{ id: 'acc' }]) }), 'acc')
    // Exact name only: a longer name that contains it is not the database.
    assert.equal(await findDatabase('demo-forms', { token: 't', account: 'acc', fetch: reply([{ name: 'demo-forms-old', uuid: 'x' }]) }), null)
    assert.deepEqual(await findDatabase('demo-forms', { token: 't', account: 'acc', fetch: reply([{ name: 'demo-forms', uuid: 'db' }]) }), { name: 'demo-forms', uuid: 'db' })
    assert.match(seen.at(-1), /^\/accounts\/acc\/d1\/database\?name=demo-forms/)

    assert.equal(await hasHistory(plain, { token: 't', account: 'acc', fetch: reply([{ name: 'demo-forms', uuid: 'db' }]) }), true)
    assert.equal(await hasHistory(plain, { token: 't', account: 'acc', fetch: reply([]) }), false)
    // Worker forms already bind the database: no lookup.
    const before = seen.length
    assert.equal(await hasHistory(plan, { token: 't', account: 'acc', fetch: reply([{ name: 'demo-forms' }]) }), false)
    assert.equal(seen.length, before)
    // A CI token without D1 access must not stop an assets-only deploy.
    const warnings = []
    assert.equal(await hasHistory(plain, { token: 't', account: 'acc', fetch: reply(null, 403), warn: message => warnings.push(message) }), false)
    assert.match(warnings[0], /forms history check skipped .*Authentication error/)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('14.18.0 migration pins the legacy Apps Script only where no action is set', () => {
  const read = directory => fs.readFileSync(path.join(directory, 'data/styles.yml'), 'utf8')
  const unset = project({ 'data/styles.yml': '# Design tokens\ncolors:\n  main: red # brand\ninputs:\n  ajax: true\n' })
  const missing = project({})
  const empty = project({ 'data/styles.yml': 'inputs:\n  action: \'\'\n' })
  const own = project({ 'data/styles.yml': 'inputs:\n  action: https://formsubmit.co/x # own\n' })
  const broken = project({ 'data/styles.yml': 'inputs: [\n' })
  try {
    assert.deepEqual(migrateFormsDefault(unset, { check: true }), { changed: true, action: LEGACY_GAS_ACTION })
    assert.doesNotMatch(read(unset), /script\.google/)

    assert.deepEqual(migrateFormsDefault(unset), { changed: true, action: LEGACY_GAS_ACTION })
    const text = read(unset)
    assert.match(text, /^# Design tokens\n/)
    assert.match(text, /main: red # brand/)
    assert.match(text, /# Legacy shared Apps Script \(pinned by SanSoul 14\.18\.0\)/)
    const styles = parse(text)
    assert.equal(styles.inputs.action, LEGACY_GAS_ACTION)
    assert.equal(styles.inputs.ajax, true)
    // Repeating is a no-op.
    assert.deepEqual(migrateFormsDefault(unset), { changed: false, action: LEGACY_GAS_ACTION })
    assert.equal(read(unset), text)

    migrateFormsDefault(missing)
    assert.equal(parse(read(missing)).inputs.action, LEGACY_GAS_ACTION)
    migrateFormsDefault(empty)
    assert.equal(parse(read(empty)).inputs.action, LEGACY_GAS_ACTION)

    assert.deepEqual(migrateFormsDefault(own), { changed: false, action: 'https://formsubmit.co/x' })
    assert.equal(read(own), 'inputs:\n  action: https://formsubmit.co/x # own\n')
    assert.throws(() => migrateFormsDefault(broken), /data\/styles\.yml/)
  } finally {
    for (const directory of [unset, missing, empty, own, broken]) fs.rmSync(directory, { recursive: true, force: true })
  }
})
