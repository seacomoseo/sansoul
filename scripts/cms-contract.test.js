// Run from a consumer root after sh do hugo; CMS_EXPECT_REPO tests opt-in/fallback.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { parse } from 'yaml'

const configPath = fs.readdirSync('public/admin').find(name => /^config\..*\.yml$/.test(name))
// Generated theme YAML intentionally reuses many trusted local anchors.
const config = parse(fs.readFileSync(path.join('public/admin', configPath), 'utf8'), { maxAliasCount: -1 })

test('CMS repository override does not change skip-ci or public URL', () => {
  assert.equal(config.backend.repo, process.env.CMS_EXPECT_REPO || '3dnau/site')
  assert.equal(config.backend.skip_ci, true)
  assert.equal(config.backend.branch, 'main')
  if (process.env.CMS_EXPECT_URL) assert.equal(config.site_url, process.env.CMS_EXPECT_URL)
  const fields = []
  const visit = value => {
    if (!value || typeof value !== 'object') return
    if (value.name === 'cms_repo') fields.push(value)
    for (const child of Object.values(value)) visit(child)
  }
  visit(config)
  assert.ok(fields.length > 0)
  for (const field of fields) assert.equal(field.required, false)
})

test('consumer and theme package/lock compatibility versions are synchronized', () => {
  for (const base of ['.', 'themes/sansoul']) {
    const pkg = JSON.parse(fs.readFileSync(path.join(base, 'package.json')))
    const lock = JSON.parse(fs.readFileSync(path.join(base, 'package-lock.json')))
    assert.equal(pkg.version, '8.0.0')
    assert.equal(lock.version, pkg.version)
    assert.equal(lock.packages[''].version, pkg.version)
  }
})


test('inert workflow verifies pushes but deploys only explicit protected main publish/dispatch', () => {
  const file = '.github/workflows/deploy-workers.yml.disabled'
  assert.equal(fs.existsSync(file.replace('.disabled', '')), false)
  const workflow = parse(fs.readFileSync(file, 'utf8'))
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  assert.deepEqual(workflow.on.push.branches, ['main', 'feat/workers-free-local'])
  assert.equal(workflow.on.workflow_dispatch.inputs.deploy.default, false)
  assert.deepEqual(workflow.on.repository_dispatch.types, ['sveltia-cms-publish'])
  assert.match(workflow.jobs.deploy.if, /needs.verify.outputs.deploy_allowed == 'true'/)
  assert.match(workflow.jobs.deploy.if, /github.event.action == 'sveltia-cms-publish'/)
  assert.equal(workflow.jobs.deploy.environment, 'workers-free-reviewed')
  assert.match(workflow.jobs.deploy.if, /github.event_name == 'workflow_dispatch'/)
  assert.match(workflow.jobs.deploy.if, /inputs.deploy == true/)
  assert.match(workflow.jobs.deploy.if, /refs\/heads\/main/)
  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps) {
      if (step.uses?.startsWith('actions/checkout@')) {
        assert.equal(step.with['persist-credentials'], false)
        assert.equal(step.with.ref, '${{ github.sha }}')
      }
    }
  }
  assert.ok(workflow.jobs.verify.steps.some(step => step.run?.includes('--test-concurrency=1')))
  assert.ok(workflow.jobs.verify.steps.some(step => step.run?.includes('sha256sum --check --strict')))
  assert.equal(JSON.stringify(workflow.jobs.verify).includes('secrets.'), false)
})
