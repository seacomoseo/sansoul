import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'mirror-to-gitlab.sh')

function target (repository, env = {}) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-gl-'))
  fs.writeFileSync(path.join(bin, 'curl'), '#!/bin/sh\nexit 22\n', { mode: 0o755 })
  let out = ''
  try {
    execFileSync('sh', [script], { encoding: 'utf8', env: { PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: repository, GL_PAT: 'x', GH_PAT: 'x', ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) { out = error.stdout }
  fs.rmSync(bin, { recursive: true, force: true })
  return /Target:\s+gitlab\.com\/(\S+)/.exec(out)?.[1]
}

test('GitLab copy name: <owner> for site, <owner>-<repo> otherwise', () => {
  assert.equal(target('clinicalopezdelamo/site'), 'seacomoseo/clinicalopezdelamo')
  assert.equal(target('clinicalopezdelamo/podologo'), 'seacomoseo/clinicalopezdelamo-podologo')
  assert.equal(target('3dnau/site', { GITLAB_NAMESPACE: 'otro' }), 'otro/3dnau')
  assert.equal(target('acme/site', { GITLAB_REPO: 'seacomoseo/legado' }), 'seacomoseo/legado')
  assert.equal(target('acme/podologo', { GL_PAT: '', GL_DEPLOY_KEY: 'k' }), 'seacomoseo/acme-podologo')
})
