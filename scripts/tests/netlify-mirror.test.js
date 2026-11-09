import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { SECRET_NAME, TEAM_DEPLOYS, deployDecision, findSite, listTeamDeploys, otherRunsActive, parseRedirects, renderNetlifyToml, syncSecret, workerRunsSha } from '../netlify-mirror.js'

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

test('_redirects rules move into netlify.toml after the /api/* proxy', () => {
  const redirects = '# comment\n/index.php / 301\n\nhttps://es.example.com/* /es/:splat 200\n/old /new 302!\n/media/* /m/:splat\n'
  assert.deepEqual(parseRedirects(redirects).map(rule => [rule.from, rule.to, rule.status, rule.force]), [
    ['/index.php', '/', 301, false], ['https://es.example.com/*', '/es/:splat', 200, false], ['/old', '/new', 302, true], ['/media/*', '/m/:splat', 301, false]
  ])
  const toml = renderNetlifyToml({ worker: 'demo', subdomain: 'acme', redirects })
  assert.ok(toml.indexOf('from = "/api/*"') < toml.indexOf('from = "https://es.example.com/*"'))
  assert.match(toml, /from = "\/old"\nto = "\/new"\nstatus = 302\nforce = true/)
  assert.throws(() => parseRedirects('/a /b 301 Country=es\n'), /line 1 is not/)
})

test('deploy decision: current commit, hourly throttle and rolling team budget', () => {
  assert.equal(deployDecision({ deploys: [], sha: 'abc', now }).deploy, true)
  assert.equal(deployDecision({ deploys: [deploy(5, { title: 'SanSoul abc1234' })], sha: 'abc1234', now }).deploy, false)
  const throttled = deployDecision({ deploys: [deploy(20)], sha: 'new', now })
  assert.equal(throttled.deploy, false)
  assert.equal(throttled.throttled, true)
  assert.match(throttled.reason, /in 40 min/)
  // A failed deploy in the last hour also throttles (it may have cost credits).
  assert.equal(deployDecision({ deploys: [deploy(5, { state: 'error' }), deploy(90)], sha: 'new', now }).deploy, false)
  // The budget is shared by every site of the team, over any 31 days.
  const team = Array.from({ length: TEAM_DEPLOYS }, (_, index) => deploy(90 + index * 60 * 24))
  assert.match(deployDecision({ deploys: [deploy(90)], teamDeploys: team, sha: 'new', now }).reason, /team budget reached/)
  const old = team.map(item => ({ ...item, created_at: new Date(now - 32 * 24 * 3600 * 1000).toISOString() }))
  assert.equal(deployDecision({ deploys: [deploy(90)], teamDeploys: [...old, deploy(90, { context: 'deploy-preview' })], sha: 'new', now }).deploy, true)
})

const jsonFetch = routes => async url => {
  const { pathname, searchParams } = new URL(url)
  const body = routes(pathname, searchParams)
  return new Response(JSON.stringify(body ?? { message: 'Not Found' }), { status: body === undefined ? 404 : 200 })
}

test('the catch-up only publishes a commit the Worker runs, and waits for other runs', async () => {
  const deployments = [
    { annotations: { 'workers/triggered_by': 'secret' } },
    { annotations: { 'workers/triggered_by': 'upload', 'workers/message': 'SanSoul abc123' } }
  ]
  const fetch = jsonFetch(pathname => pathname.endsWith('/deployments') ? { success: true, result: { deployments } } : undefined)
  assert.equal(await workerRunsSha({ token: 't', account: 'a', worker: 'demo', sha: 'abc123', fetch }), true)
  assert.equal(await workerRunsSha({ token: 't', account: 'a', worker: 'demo', sha: 'def456', fetch }), false)

  const runs = { queued: [], in_progress: [{ id: 7 }] }
  const github = jsonFetch((pathname, params) => {
    if (pathname === '/repos/acme/site/actions/runs/7') return { workflow_id: 99 }
    if (pathname === '/repos/acme/site/actions/workflows/99/runs') return { workflow_runs: runs[params.get('status')] || [] }
  })
  const options = { token: 'g', repository: 'acme/site', runId: '7', fetch: github }
  assert.equal(await otherRunsActive(options), false)
  runs.queued.push({ id: 8 })
  assert.equal(await otherRunsActive(options), true)
  assert.equal(await otherRunsActive({ ...options, token: '' }), false)
})

test('team deploys cover every site of the same Netlify team', async () => {
  const fetch = jsonFetch(pathname => {
    if (pathname === '/api/v1/sites') return [{ id: 's1', account_id: 'team' }, { id: 's2', account_id: 'team' }, { id: 's3', account_id: 'other' }]
    const site = /\/sites\/(\w+)\/deploys/.exec(pathname)?.[1]
    if (site) return [deploy(10, { site })]
  })
  assert.deepEqual((await listTeamDeploys({ id: 's1', account_id: 'team' }, { token: 't', fetch })).map(item => item.site), ['s1', 's2'])
})

function fakeApi (state) {
  const calls = []
  const fetch = async (url, init = {}) => {
    const { pathname, searchParams } = new URL(url)
    const body = init.body ? JSON.parse(init.body) : undefined
    calls.push({ method: init.method, pathname, body })
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status })
    if (pathname === '/api/v1/sites' && init.method === 'GET') return json(state.sites.filter(site => site.name.includes(searchParams.get('name'))))
    if (pathname.startsWith('/api/v1/sites/') && init.method === 'PATCH') {
      const site = state.sites.find(item => item.id === pathname.split('/').pop())
      Object.assign(site, body)
      return json(site)
    }
    if (pathname === '/api/v1/sites' && init.method === 'POST') {
      const site = { id: 'new-site', account_id: 'nf-acc', name: body.name, built_with_badge_enabled: true }
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
  assert.equal(site.built_with_badge_enabled, false)
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
    assert.doesNotMatch(text, /\n  schedule:|NETLIFY_SCHEDULE/)
    fs.writeFileSync(path.join(project, 'hugo.yml'), 'baseURL: https://example.com/\nparams:\n  owner: acme\n  repo: site\n  netlify: site\n')
    text = workflow()
    assert.match(text, /\n {2}schedule:\n {4}- cron: '41 \*\/6 \* \* \*'\n/)
    assert.match(text, /types: \[sveltia-cms-publish\]\n {2}# Netlify mirror catch-up/)
  } finally {
    fs.rmSync(project, { recursive: true, force: true })
  }
})
