import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { migrateHugoConfig, migrateProjectConfig, isHistoricalWrapper, universalWrapper } from '../migrations/8.0.0-project-config.js'

for (const [layout, name, directory] of [['core', 'core', '.'], ['themes/sansoul', 'sansoul', 'themes']]) {
  test(`recognized engine selectors migrate conservatively (${layout})`, () => {
    for (const theme of [`theme: [${name}]`, `theme: ['${name}'] # engine`, `theme: "${name}"`, `theme:\n  - '${name}' # engine`, `theme:\n- ${name}`]) {
      const source = `# Site\nbaseURL: https://example.test/\nthemesDir: '${directory}' # location\n${theme}\n# Project settings\nparams:\n  owner: fixture # owner\n  domain: example.test # domain\n  name: demo\n  extra: true\n`
      const result = migrateHugoConfig(source, layout)
      assert.deepEqual(result.warnings, [])
      assert.doesNotMatch(result.source, /^theme(?:sDir)?:/m)
      assert.match(result.source, /# location/)
      assert.match(result.source, /params:\n  domain: example.test # domain\n  owner: fixture # owner\n  name: demo\n  extra: true/)
      assert.equal(migrateHugoConfig(result.source, layout).source, result.source)
    }
  })
}

test('custom selectors remain intact, including multiple themes and YAML anchors', () => {
  for (const selectors of [
    'theme: [core, extra]\nthemesDir: .\n',
    'theme: [core]\nthemesDir: custom\n',
    'theme: &chosen [core]\nthemesDir: .\n',
    'theme: [core]\ntheme: [core]\n',
    'theme:\n  - core\n  - extra\n',
    'theme: [sansoul]\nthemesDir: themes\n'
  ]) {
    const result = migrateHugoConfig(selectors, 'core')
    assert.equal(result.source, selectors)
    assert.equal(result.warnings.length, 1)
  }
  const source = '---\nbaseURL: https://example.test\n---\ntheme: [core]\n'
  assert.equal(migrateHugoConfig(source, 'core').source, source)
})

test('parameter ordering preserves formatting, nested values and absent final newline', () => {
  const source = 'params:\r\n  owner: "owner"\r\n  domain: \'example.test\'\r\n  extra:\r\n    name: nested\r\n  name: demo'
  const expected = 'params:\r\n  domain: \'example.test\'\r\n  owner: "owner"\r\n  extra:\r\n    name: nested\r\n  name: demo'
  assert.equal(migrateHugoConfig(source, 'core').source, expected)
  const nested = 'params:\n  extra:\n    owner: nested\n    domain: nested\n    name: nested\n'
  assert.equal(migrateHugoConfig(nested, 'core').source, nested)
})

test('historical wrappers upgrade while custom commands remain untouched', () => {
  for (const wrapper of ['sh ./themes/sansoul/do $1', '#!/bin/sh\nsh themes/sansoul/do "$@"\n', '#!/bin/sh\r\nexec sh ./core/do "$1"\r\n']) assert.ok(isHistoricalWrapper(wrapper))
  for (const wrapper of ['sh ./themes/sansoul/do $1\necho custom\n', '# Custom wrapper\nsh ./themes/sansoul/do "$@"', 'sh ./themes/sansoul/do "$@"; echo custom']) assert.equal(isHistoricalWrapper(wrapper), false)
  assert.equal(spawnSync('sh', ['-n'], { input: universalWrapper }).status, 0)
})

test('project migration supports dry runs, idempotence and refuses symlinks', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-config-migration-'))
  try {
    const config = 'theme: [core]\nthemesDir: .\nparams:\n  owner: fixture\n  domain: example.test\n  name: demo\n'
    const wrapper = '#!/bin/sh\nsh ./themes/sansoul/do $1\n'
    fs.writeFileSync(path.join(project, 'hugo.yml'), config)
    fs.writeFileSync(path.join(project, 'do'), wrapper, { mode: 0o755 })
    assert.deepEqual(migrateProjectConfig(project, { check: true, enginePath: 'core' }).changed, ['hugo.yml', 'do'])
    assert.equal(fs.readFileSync(path.join(project, 'hugo.yml'), 'utf8'), config)
    assert.equal(fs.readFileSync(path.join(project, 'do'), 'utf8'), wrapper)
    assert.deepEqual(migrateProjectConfig(project, { enginePath: 'core' }).changed, ['hugo.yml', 'do'])
    assert.equal(fs.statSync(path.join(project, 'do')).mode & 0o777, 0o755)
    assert.deepEqual(migrateProjectConfig(project, { enginePath: 'core' }), { changed: [], warnings: [] })
    fs.writeFileSync(path.join(project, 'outside.yml'), config)
    fs.unlinkSync(path.join(project, 'hugo.yml'))
    fs.symlinkSync('outside.yml', path.join(project, 'hugo.yml'))
    const result = migrateProjectConfig(project, { enginePath: 'core' })
    assert.equal(result.warnings.length, 1)
    assert.equal(fs.readFileSync(path.join(project, 'outside.yml'), 'utf8'), config)
    fs.writeFileSync(path.join(project, 'do'), '#!/bin/sh\necho custom\n')
    assert.equal(migrateProjectConfig(project, { enginePath: 'core' }).warnings.length, 2)
  } finally {
    fs.rmSync(project, { recursive: true, force: true })
  }
})
