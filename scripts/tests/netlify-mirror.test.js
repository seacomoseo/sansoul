import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { MONTHLY_DEPLOYS, SECRET_NAME, deployDecision, findSite, renderNetlifyToml, syncSecret } from '../netlify-mirror.js'

const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const now = Date.parse('2026-11-20T12:00:00Z')
const deploy = (minutesAgo, extra = {}) => ({ context: 'production', state: 'ready', title: 'SanSoul old', created_at: new Date(now - minutesAgo * 60000).toISOString(), ...extra })

test('netlify.toml proxies /api/* to the Worker with a signed rewrite', () => {
  const toml = renderNetlifyToml({ worker: 'demo', subdomain: 'acme' })
  assert.match(toml, /^from = "\/api\/\*"$/m)
  assert.match(toml, /^to = "https:\/\/demo\.acme\.workers\.dev\/api\/:splat"$/m)
  assert.match(toml, /^status = 200$/m)
  assert.match(toml, /^force = true$/m)
  assert.match(toml, new RegExp(`^signed = "${SECRET_NAME}"$`, 'm'))
  assert.throws(() => renderNetlifyToml({ worker: 'demo', subdomain: '' }), /workers\.dev subdomain/)
})

test('deploy decision: current commit, hourly throttle and monthly budget', () => {
  assert.equal(deployDecision({ deploys: [], sha: 'abc', now }).deploy, true)
  assert.equal(deployDecision({ deploys: [deploy(5, { title: 'SanSoul abc1234' })], sha: 'abc1234', now }).deploy, false)
  const throttled = deployDecision({ deploys: [deploy(20)], sha: 'new', now })
  assert.equal(throttled.deploy, false)
  assert.equal(throttled.throttled, true)
  assert.match(throttled.reason, /in 40 min/)
  // A failed recent deploy does not block a retry, but it counts for the budget.
  assert.equal(deployDecision({ deploys: [deploy(5, { state: 'error' }), deploy(90)], sha: 'new', now }).deploy, true)
  const month = Array.from({ length: MONTHLY_DEPLOYS }, (_, index) => deploy(90 + index * 60))
  assert.match(deployDecision({ deploys: month, sha: 'new', now }).reason, /budget reached/)
  // Last month's deploys and other contexts do not count.
  const old = month.map(item => ({ ...item, created_at: '2026-10-15T00:00:00Z' }))
  assert.equal(deployDecision({ deploys: [...old, deploy(90, { context: 'deploy-preview' })], sha: 'new', now }).deploy, true)
})

function fakeApi (state) {
  const calls = []
  const fetch = async (url, init = {}) => {
    const { pathname, searchParams } = new URL(url)
    const body = init.body ? JSON.parse(init.body) : undefined
    calls.push({ method: init.method, pathname, body })
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status })
    if (pathname === '/api/v1/sites' && init.method === 'GET') return json(state.sites.filter(site => site.name.includes(searchParams.get('name'))))
    if (pathname === '/api/v1/sites' && init.method === 'POST') {
      const site = { id: 'new-site', account_id: 'nf-acc', name: body.name }
      state.sites.push(site)
      return json(site, 201)
    }
    if (pathname === `/api/v1/accounts/nf-acc/env/${SECRET_NAME}`) return state.netlifySecret ? json({ key: SECRET_NAME, values: [{ context: 'all', value: state.netlifySecret }] }) : json({ message: 'Not Found' }, 404)
    if (pathname === '/api/v1/accounts/nf-acc/env') {
      state.netlifySecret = body[0].values[0].value
      return json(body, 201)
    }
    if (pathname === '/client/v4/accounts/cf-acc/workers/scripts/demo/secrets' && init.method === 'GET') return json({ success: true, result: state.workerSecret ? [{ name: SECRET_NAME, type: 'secret_text' }] : [] })
    if (pathname === '/client/v4/accounts/cf-acc/workers/scripts/demo/secrets' && init.method === 'PUT') {
      state.workerSecret = body.text
      return json({ success: true, result: { name: body.name } })
    }
    return json({ message: `unexpected ${init.method} ${pathname}` }, 500)
  }
  return { fetch, calls }
}

test('sites are found by exact name and created only when asked', async () => {
  const state = { sites: [{ id: 'other', name: 'demo-old', account_id: 'nf-acc' }] }
  const { fetch } = fakeApi(state)
  assert.equal(await findSite('demo', { token: 't', fetch }), null)
  const site = await findSite('demo', { token: 't', fetch, create: true })
  assert.equal(site.id, 'new-site')
  assert.equal((await findSite('demo', { token: 't', fetch })).id, 'new-site')
})

test('proxy secret is generated once, copied to the Worker and never rotated', async () => {
  const state = { sites: [] }
  const { fetch, calls } = fakeApi(state)
  const site = { id: 'new-site', account_id: 'nf-acc' }
  const options = { site, worker: 'demo', account: 'cf-acc', netlifyToken: 'n', cloudflareToken: 'c', fetch }
  let generated = 0
  const generate = () => `secret-${++generated}`.padEnd(64, 'x')

  assert.deepEqual(await syncSecret({ ...options, generate }), { netlifyCreated: true, workerUpdated: true })
  assert.equal(state.workerSecret, state.netlifySecret)

  calls.length = 0
  assert.deepEqual(await syncSecret({ ...options, generate }), { netlifyCreated: false, workerUpdated: false })
  assert.equal(generated, 1)
  assert.equal(calls.some(call => call.method !== 'GET'), false)

  // A Worker recreated without secrets gets the existing Netlify value back.
  state.workerSecret = ''
  assert.deepEqual(await syncSecret({ ...options, generate }), { netlifyCreated: false, workerUpdated: true })
  assert.equal(state.workerSecret, state.netlifySecret)

  state.netlifySecret = 'short'
  await assert.rejects(syncSecret({ ...options, generate }), /shorter than 32/)
})

test('root-docs adds the catch-up schedule only for Netlify-mirrored projects', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-netlify-docs-'))
  try {
    fs.symlinkSync(engine, path.join(project, 'core'))
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"site"}\n')
    const workflow = () => {
      const result = spawnSync(process.execPath, ['--preserve-symlinks', '--preserve-symlinks-main', 'core/scripts/root-docs.js', '--force'], { cwd: project, encoding: 'utf8' })
      assert.equal(result.status, 0, result.stderr)
      return fs.readFileSync(path.join(project, '.github/workflows/sansoul.yml'), 'utf8')
    }
    fs.writeFileSync(path.join(project, 'hugo.yml'), 'baseURL: https://example.com/\nparams:\n  owner: acme\n  repo: site\n')
    let text = workflow()
    assert.doesNotMatch(text, /schedule|NETLIFY_SCHEDULE/)
    fs.writeFileSync(path.join(project, 'hugo.yml'), 'baseURL: https://example.com/\nparams:\n  owner: acme\n  repo: site\n  netlify: site\n')
    text = workflow()
    assert.match(text, /\n {2}schedule:\n {4}- cron: '41 \*\/6 \* \* \*'\n/)
    assert.match(text, /types: \[sveltia-cms-publish\]\n {2}# Netlify mirror catch-up/)
  } finally {
    fs.rmSync(project, { recursive: true, force: true })
  }
})
