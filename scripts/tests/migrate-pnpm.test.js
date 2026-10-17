import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  PINNED_PNPM_VERSION,
  collectNpmPackages,
  checkPnpmVersion,
  compareDependencyVersions,
  detectPackageManager,
  installSignalRollback,
  migrateProject,
  parseIgnoredBuildScripts,
  restoreBackup
} from '../migrate-pnpm.js'

function makeProject () {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-pnpm-test-'))
  const packageJson = {
    name: 'fixture-project',
    version: '1.0.0',
    dependencies: { fixtureDependency: '1.0.0' },
    scripts: { build: 'echo build' }
  }
  const packageLock = {
    name: packageJson.name,
    version: packageJson.version,
    lockfileVersion: 3,
    packages: {
      '': { name: packageJson.name, version: packageJson.version, dependencies: packageJson.dependencies },
      'node_modules/fixtureDependency': { version: '1.0.0', resolved: 'https://registry.example/fixtureDependency-1.0.0.tgz', integrity: 'sha512-fixture' }
    }
  }
  fs.writeFileSync(path.join(projectDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`)
  fs.writeFileSync(path.join(projectDir, 'package-lock.json'), `${JSON.stringify(packageLock, null, 2)}\n`)
  fs.writeFileSync(path.join(projectDir, '.npmrc'), 'registry=https://registry.example\n')
  fs.mkdirSync(path.join(projectDir, 'node_modules'))
  fs.writeFileSync(path.join(projectDir, 'node_modules', 'original.txt'), 'original')
  return { packageJson, packageLock, projectDir }
}

function fakeRunner (projectDir, { failInstall = false, ignoredBuilds } = {}) {
  return (command, args, options) => {
    assert.equal(options.cwd, projectDir)
    if (command === 'git') return { code: 0, stdout: '', stderr: '' }
    if (command !== 'pnpm') throw new Error(`unexpected command ${command}`)
    if (args[0] === '--version') return { code: 0, stdout: `${PINNED_PNPM_VERSION}\n`, stderr: '' }
    if (args[0] === 'import') {
      fs.writeFileSync(path.join(projectDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
      return { code: 0, stdout: '', stderr: '' }
    }
    if (args[0] === 'install') {
      if (failInstall) return { code: 1, stdout: '', stderr: 'simulated install failure' }
      fs.mkdirSync(path.join(projectDir, 'node_modules'))
      return { code: 0, stdout: '', stderr: ignoredBuilds ? `Ignored build scripts: ${ignoredBuilds}` : '' }
    }
    if (args[0] === 'list') {
      return {
        code: 0,
        stdout: JSON.stringify([{
          name: 'fixture-project',
          version: '1.0.0',
          dependencies: {
            fixtureDependency: { name: 'fixtureDependency', version: '1.0.0' }
          }
        }]),
        stderr: ''
      }
    }
    if (args[0] === 'run' && args[1] === 'build') return { code: 0, stdout: '', stderr: '' }
    throw new Error(`unexpected pnpm args ${args.join(' ')}`)
  }
}

test('collects npm lockfile packages without counting the root package', () => {
  const packages = collectNpmPackages({
    packages: {
      '': { name: 'root', version: '1.0.0' },
      'node_modules/@scope/one': { version: '2.0.0' },
      'node_modules/one/node_modules/two': { version: '3.0.0', optional: true }
    }
  })

  assert.deepEqual([...packages.get('@scope/one').versions], ['2.0.0'])
  assert.deepEqual([...packages.get('two').versions], ['3.0.0'])
  assert.equal(packages.get('two').optional, true)
  assert.equal(packages.has('root'), false)
})

test('requires the pinned pnpm version by default', () => {
  const runner = () => ({ code: 0, stdout: '10.29.0\n', stderr: '' })
  assert.throws(() => checkPnpmVersion(runner, '/tmp/project'), /10\.28\.2/)
})

test('rejects ambiguous lockfiles and manifest-lockfile mismatches', () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-pnpm-manager-test-'))
  try {
    fs.writeFileSync(path.join(projectDir, 'package-lock.json'), '{}')
    fs.writeFileSync(path.join(projectDir, 'pnpm-lock.yaml'), '')
    assert.throws(() => detectPackageManager(projectDir, {}), /Multiple package-manager lockfiles/)
    fs.rmSync(path.join(projectDir, 'pnpm-lock.yaml'))
    assert.throws(() => detectPackageManager(projectDir, { packageManager: 'pnpm@10.28.2' }), /conflicts with npm lockfile/)
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true })
  }
})

test('rejects dependency version changes and accepts exact pnpm resolution', () => {
  const lock = { packages: { 'node_modules/one': { version: '1.0.0' } } }
  const exact = [{ dependencies: { one: { from: 'one@1.0.0', version: '1.0.0', path: 'one' } } }]
  const changed = [{ name: 'one', version: '1.1.0' }]
  assert.deepEqual(compareDependencyVersions(lock, exact), [])
  assert.equal(compareDependencyVersions(lock, changed)[0].reason, 'version changed')
})

test('detects missing required versions and unexpected packages', () => {
  const lock = {
    packages: {
      'node_modules/one': { version: '1.0.0' },
      'node_modules/parent/node_modules/one': { version: '2.0.0' }
    }
  }
  const actual = [{ dependencies: { one: { version: '1.0.0' }, extra: { version: '3.0.0' } } }]
  const differences = compareDependencyVersions(lock, actual)
  assert.equal(differences.find(item => item.name === 'one').reason, 'missing')
  assert.equal(differences.find(item => item.name === 'extra').reason, 'unexpected package')
})

test('does not treat a version as optional when another lock entry requires it', () => {
  const lock = {
    packages: {
      'node_modules/one': { version: '1.0.0' },
      'node_modules/optional-parent/node_modules/one': { version: '1.0.0', optional: true }
    }
  }
  const differences = compareDependencyVersions(lock, [])
  assert.equal(differences.find(item => item.name === 'one').reason, 'missing')
})

test('parses ignored build scripts for explicit allowlist checks', () => {
  assert.deepEqual(
    parseIgnoredBuildScripts('Ignored build scripts: sharp-ico, native-addon. Run "pnpm approve-builds"'),
    ['sharp-ico', 'native-addon']
  )
})

test('dry run is the default and leaves the project untouched', () => {
  const fixture = makeProject()
  const packageBefore = fs.readFileSync(path.join(fixture.projectDir, 'package.json'), 'utf8')
  const messages = []

  migrateProject(fixture.projectDir, {
    logger: message => messages.push(message),
    runner: fakeRunner(fixture.projectDir),
    strictPnpm: true
  })

  assert.equal(fs.readFileSync(path.join(fixture.projectDir, 'package.json'), 'utf8'), packageBefore)
  assert.equal(fs.existsSync(path.join(fixture.projectDir, 'pnpm-lock.yaml')), false)
  assert.match(messages[0], /^DRY RUN /)
  fs.rmSync(fixture.projectDir, { recursive: true, force: true })
})

test('rolls back package files, lockfiles, and node_modules after install failure', () => {
  const fixture = makeProject()
  const packageBefore = fs.readFileSync(path.join(fixture.projectDir, 'package.json'), 'utf8')
  const npmrcBefore = fs.readFileSync(path.join(fixture.projectDir, '.npmrc'), 'utf8')

  assert.throws(
    () => migrateProject(fixture.projectDir, {
      apply: true,
      runner: fakeRunner(fixture.projectDir, { failInstall: true }),
      strictPnpm: true
    }),
    /Original project files and node_modules were restored/
  )

  assert.equal(fs.readFileSync(path.join(fixture.projectDir, 'package.json'), 'utf8'), packageBefore)
  assert.equal(fs.readFileSync(path.join(fixture.projectDir, '.npmrc'), 'utf8'), npmrcBefore)
  assert.equal(fs.existsSync(path.join(fixture.projectDir, 'pnpm-lock.yaml')), false)
  assert.equal(fs.readFileSync(path.join(fixture.projectDir, 'node_modules', 'original.txt'), 'utf8'), 'original')
  fs.rmSync(fixture.projectDir, { recursive: true, force: true })
})

test('fails and rolls back when pnpm reports an unapproved install script', () => {
  const fixture = makeProject()
  assert.throws(
    () => migrateProject(fixture.projectDir, {
      apply: true,
      runner: fakeRunner(fixture.projectDir, { ignoredBuilds: 'unknown-addon' }),
      strictPnpm: true
    }),
    /ignored unapproved install scripts/
  )
  assert.equal(fs.readFileSync(path.join(fixture.projectDir, 'node_modules', 'original.txt'), 'utf8'), 'original')
  fs.rmSync(fixture.projectDir, { recursive: true, force: true })
})

test('applies a validated migration with an explicit runner', () => {
  const fixture = makeProject()
  const messages = []

  const result = migrateProject(fixture.projectDir, {
    apply: true,
    logger: message => messages.push(message),
    runner: fakeRunner(fixture.projectDir),
    strictPnpm: true
  })

  const migratedPackage = JSON.parse(fs.readFileSync(path.join(fixture.projectDir, 'package.json'), 'utf8'))
  assert.equal(migratedPackage.packageManager, `pnpm@${PINNED_PNPM_VERSION}`)
  assert.equal(migratedPackage.pnpm, undefined)
  assert.match(fs.readFileSync(path.join(fixture.projectDir, '.npmrc'), 'utf8'), /enable-global-virtual-store=false/)
  assert.match(fs.readFileSync(path.join(fixture.projectDir, '.npmrc'), 'utf8'), /strict-dep-builds=true/)
  assert.equal(fs.existsSync(path.join(fixture.projectDir, 'pnpm-lock.yaml')), true)
  assert.equal(fs.existsSync(path.join(fixture.projectDir, 'package-lock.json')), false)
  assert.equal(messages.some(message => /^MIGRATED /.test(message)), true)
  assert.equal(fs.existsSync(path.join(result.backupPath, 'manifest.json')), true)
  const migratedPackageText = fs.readFileSync(path.join(fixture.projectDir, 'package.json'), 'utf8')
  fs.appendFileSync(path.join(fixture.projectDir, 'package.json'), '\n')
  assert.throws(
    () => restoreBackup(result.backupPath, fixture.projectDir),
    /changed after migration/
  )
  fs.writeFileSync(path.join(fixture.projectDir, 'package.json'), migratedPackageText)
  restoreBackup(result.backupPath, fixture.projectDir)
  assert.equal(fs.existsSync(path.join(fixture.projectDir, 'package-lock.json')), true)
  assert.equal(fs.existsSync(path.join(fixture.projectDir, 'pnpm-lock.yaml')), false)
  assert.equal(fs.readFileSync(path.join(fixture.projectDir, 'node_modules', 'original.txt'), 'utf8'), 'original')
  assert.equal(messages.some(message => message.includes(`--project '${fixture.projectDir}'`)), true)
  fs.rmSync(fixture.projectDir, { recursive: true, force: true })
})

test('rejects a symlinked config file without touching its external target', () => {
  const fixture = makeProject()
  const sentinel = path.join(os.tmpdir(), `migrate-pnpm-sentinel-${Date.now()}`)
  fs.writeFileSync(sentinel, 'sentinel')
  fs.rmSync(path.join(fixture.projectDir, '.npmrc'))
  fs.symlinkSync(sentinel, path.join(fixture.projectDir, '.npmrc'))

  try {
    assert.throws(
      () => migrateProject(fixture.projectDir, { apply: true, runner: fakeRunner(fixture.projectDir) }),
      /Project \.npmrc must be a regular file/
    )
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'sentinel')
    assert.equal(fs.readFileSync(path.join(fixture.projectDir, 'node_modules', 'original.txt'), 'utf8'), 'original')
  } finally {
    fs.rmSync(fixture.projectDir, { recursive: true, force: true })
    fs.rmSync(sentinel, { force: true })
  }
})

test('retains a recoverable backup when restore copy or rename fails', () => {
  for (const failure of ['copy', 'rename']) {
    const fixture = makeProject()
    const result = migrateProject(fixture.projectDir, {
      apply: true,
      runner: fakeRunner(fixture.projectDir),
      strictPnpm: true
    })
    const migratedPackageText = fs.readFileSync(path.join(fixture.projectDir, 'package.json'), 'utf8')
    const operations = {
      copy: (source, target) => {
        if (failure === 'copy' && source.endsWith('package-lock.json')) throw new Error('injected restore copy failure')
        fs.copyFileSync(source, target)
      },
      rename: (source, target) => {
        if (failure === 'rename' && source.includes('-pnpm-backup-') && source.endsWith(path.join('node_modules'))) throw new Error('injected restore rename failure')
        fs.renameSync(source, target)
      }
    }

    assert.throws(
      () => restoreBackup(result.backupPath, fixture.projectDir, { operations }),
      /retained backup/
    )
    assert.equal(fs.readFileSync(path.join(fixture.projectDir, 'package.json'), 'utf8'), migratedPackageText)
    assert.equal(fs.existsSync(path.join(fixture.projectDir, 'package-lock.json')), false)
    assert.equal(fs.readFileSync(path.join(result.backupPath, 'node_modules', 'original.txt'), 'utf8'), 'original')
    assert.equal(fs.existsSync(path.join(result.backupPath, 'manifest.json')), true)

    restoreBackup(result.backupPath, fixture.projectDir)
    assert.equal(fs.readFileSync(path.join(fixture.projectDir, 'node_modules', 'original.txt'), 'utf8'), 'original')
    fs.rmSync(fixture.projectDir, { recursive: true, force: true })
  }
})

test('signal handler exits promptly when a batch has no active migration', async () => {
  const moduleUrl = new URL('../migrate-pnpm.js', import.meta.url).href
  const child = spawn(process.execPath, [
    '--input-type=module',
    '-e',
    `import { installSignalRollback } from ${JSON.stringify(moduleUrl)}; installSignalRollback(); setInterval(() => {}, 1000)`
  ], { stdio: 'ignore' })
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('signal handler did not exit promptly'))
    }, 2000)
    child.once('exit', (code, signal) => {
      clearTimeout(timeout)
      resolve({ code, signal })
    })
    setTimeout(() => child.kill('SIGTERM'), 100)
  })
  assert.equal(result.code, 143)
  assert.equal(result.signal, null)
})
