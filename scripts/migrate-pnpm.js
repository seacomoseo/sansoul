#!/usr/bin/env node

/*
Purpose: Migrate one or more independent npm projects to pinned pnpm safely.
Run from: Any directory, with one or more explicit --project paths.
Writes: The selected project only when --apply is supplied.
Safety: Dry-run is the default. Apply requires a clean Git tree, keeps a
rollback copy beside the project, and stops the batch after the first failure.
*/

import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const PINNED_PNPM_VERSION = '10.28.2'

const CONFIG_FILE_NAMES = [
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  '.npmrc'
]

const PACKAGE_MANAGER_ENV = {
  npm_config_enable_global_virtual_store: 'false'
}

let activeMigration

export class MigrationError extends Error {
  constructor (message, options = {}) {
    super(message)
    this.name = 'MigrationError'
    this.cause = options.cause
  }
}

export function parseArgs (argv) {
  const options = {
    apply: false,
    help: false,
    projects: [],
    restore: undefined,
    strictBuilds: true,
    strictPnpm: true
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--apply') {
      options.apply = true
    } else if (argument === '--dry-run') {
      options.apply = false
    } else if (argument === '--strict-pnpm' || argument === '--strict-pnpm-version') {
      options.strictPnpm = true
    } else if (argument === '--strict-dep-builds') {
      options.strictBuilds = true
    } else if (argument === '--restore') {
      const backup = argv[++index]
      if (!backup || backup.startsWith('-')) throw new MigrationError('--restore requires a backup directory path.')
      options.restore = backup
    } else if (argument.startsWith('--restore=')) {
      const backup = argument.slice('--restore='.length)
      if (!backup) throw new MigrationError('--restore requires a backup directory path.')
      options.restore = backup
    } else if (argument === '--help' || argument === '-h') {
      options.help = true
    } else if (argument === '--project') {
      const project = argv[++index]
      if (!project || project.startsWith('-')) {
        throw new MigrationError('--project requires a directory path.')
      }
      options.projects.push(project)
    } else if (argument.startsWith('--project=')) {
      const project = argument.slice('--project='.length)
      if (!project) throw new MigrationError('--project requires a directory path.')
      options.projects.push(project)
    } else {
      throw new MigrationError(`Unknown argument: ${argument}`)
    }
  }

  return options
}

export function usage () {
  return `Usage: node <engine>/scripts/migrate-pnpm.js [options]

Options:
  --project <path>       Project to inspect or migrate; repeat for a batch.
  --apply                Apply one project at a time after preflight checks.
  --dry-run              Report the plan without changing files (default).
  --strict-pnpm          Require exactly pnpm ${PINNED_PNPM_VERSION} (default).
  --strict-dep-builds     Require explicit approval for every install script (default).
  --restore <path>       Restore a retained successful-migration backup.
  --help                 Show this help.

The command never scans for projects. A batch stops at the first failed
preflight, migration, validation, or rollback operation.
`
}

export function defaultRunner (command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: { ...process.env, ...PACKAGE_MANAGER_ENV, ...(options.env || {}) },
    stdio: options.stdio || 'pipe'
  })

  if (result.error) throw result.error
  return {
    code: result.status === null ? 1 : result.status,
    signal: result.signal,
    stderr: result.stderr || '',
    stdout: result.stdout || ''
  }
}

export function readJsonFile (filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new MigrationError(`Unable to read JSON file ${filePath}: ${error.message}`, { cause: error })
  }
}

export function detectPackageManager (projectDir, packageJson) {
  const hasPnpmLock = fs.existsSync(path.join(projectDir, 'pnpm-lock.yaml'))
  const hasYarnLock = fs.existsSync(path.join(projectDir, 'yarn.lock'))
  const hasNpmLock = fs.existsSync(path.join(projectDir, 'package-lock.json'))
  const lockManagers = [
    hasPnpmLock && 'pnpm',
    hasYarnLock && 'yarn',
    hasNpmLock && 'npm'
  ].filter(Boolean)

  if (lockManagers.length > 1) {
    throw new MigrationError(`Multiple package-manager lockfiles found in ${projectDir}: ${lockManagers.join(', ')}.`)
  }

  const declaredManager = packageJson.packageManager?.split('@')[0]
  if (packageJson.packageManager && !/^(npm|pnpm|yarn)@\d+\.\d+\.\d+(?:\+.*)?$/.test(packageJson.packageManager)) {
    throw new MigrationError(`Unsupported packageManager ${packageJson.packageManager} in ${projectDir}.`)
  }
  if (declaredManager && lockManagers.length && declaredManager !== lockManagers[0]) {
    throw new MigrationError(`packageManager ${declaredManager} conflicts with ${lockManagers[0]} lockfile in ${projectDir}.`)
  }

  if (lockManagers.length) return lockManagers[0]
  if (declaredManager) return declaredManager
  return 'unknown'
}

export function assertSupportedProject (projectDir, packageJson, packageManager) {
  if (!fs.existsSync(path.join(projectDir, 'package.json'))) {
    throw new MigrationError(`Missing package.json in ${projectDir}.`)
  }

  if (packageJson.workspaces || fs.existsSync(path.join(projectDir, 'pnpm-workspace.yaml'))) {
    throw new MigrationError(`Workspace or monorepo detected in ${projectDir}; this tool handles independent projects only.`)
  }

  if (packageManager === 'unknown') {
    throw new MigrationError(`No supported lockfile found in ${projectDir}; package-lock.json is required for npm migration.`)
  }

  if (packageManager === 'yarn') {
    throw new MigrationError(`Yarn project detected in ${projectDir}; yarn.lock conversion is intentionally unsupported.`)
  }

  if (packageManager === 'npm' && !fs.existsSync(path.join(projectDir, 'package-lock.json'))) {
    throw new MigrationError(`npm project ${projectDir} has no package-lock.json; refusing a non-reproducible import.`)
  }
  if (packageManager === 'npm') {
    const lock = readJsonFile(path.join(projectDir, 'package-lock.json'))
    const workspaceEntry = Object.keys(lock.packages || {}).find(lockPath =>
      lockPath && !lockPath.startsWith('node_modules/'))
    if (workspaceEntry) {
      throw new MigrationError(`Workspace package path ${workspaceEntry} detected in ${projectDir}; independent projects only.`)
    }
  }
}

export function assertCleanGit (projectDir, runner = defaultRunner) {
  let result
  try {
    result = runner('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd: projectDir,
      env: {}
    })
  } catch (error) {
    throw new MigrationError(`Unable to inspect Git state in ${projectDir}: ${error.message}`, { cause: error })
  }

  if (result.code !== 0) {
    throw new MigrationError(`Unable to inspect Git state in ${projectDir}; a Git repository is required.`)
  }
  if ((result.stdout || '').trim()) {
    throw new MigrationError(`Git worktree is not clean in ${projectDir}; commit or stash changes before applying.`)
  }
}

export function checkPnpmVersion (runner = defaultRunner, projectDir = process.cwd(), strict = true) {
  let result
  try {
    result = runner('pnpm', ['--version'], { cwd: projectDir, env: PACKAGE_MANAGER_ENV })
  } catch (error) {
    throw new MigrationError(`Unable to run pnpm: ${error.message}`, { cause: error })
  }

  if (result.code !== 0) {
    throw new MigrationError(`pnpm --version failed in ${projectDir}.`)
  }

  const version = (result.stdout || '').trim().split(/\s+/)[0]
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new MigrationError(`Could not parse pnpm version in ${projectDir}: ${version || '(empty output)'}.`)
  }

  if (strict && version !== PINNED_PNPM_VERSION) {
    throw new MigrationError(`pnpm ${PINNED_PNPM_VERSION} is required by --strict-pnpm; found ${version}.`)
  }
  if (!strict && Number(version.split('.')[0]) !== 10) {
    throw new MigrationError(`pnpm major version 10 is required; found ${version}.`)
  }

  return version
}

function readNpmrcPlan (projectDir) {
  const npmrcPath = path.join(projectDir, '.npmrc')
  const exists = fs.existsSync(npmrcPath)
  const source = exists ? fs.readFileSync(npmrcPath, 'utf8') : ''
  const globalVirtualStore = [...source.matchAll(/^\s*enable-global-virtual-store\s*=\s*(true|false)\s*$/gim)].at(-1)
  const strictBuilds = [...source.matchAll(/^\s*strict-dep-builds\s*=\s*(true|false)\s*$/gim)].at(-1)

  if (globalVirtualStore?.[1].toLowerCase() === 'true') {
    throw new MigrationError(`.npmrc in ${projectDir} enables the experimental global virtual store; refusing to overwrite custom configuration.`)
  }
  if (strictBuilds?.[1].toLowerCase() === 'false') {
    throw new MigrationError(`.npmrc in ${projectDir} disables strict dependency builds; refusing to approve unknown install scripts.`)
  }

  return {
    content: source,
    exists,
    path: npmrcPath,
    needsStableSetting: !globalVirtualStore,
    needsStrictBuilds: !strictBuilds
  }
}

export function buildConfigPlan (projectDir, packageJson) {
  const npmrc = readNpmrcPlan(projectDir)
  const currentPnpm = packageJson.pnpm
  if (currentPnpm !== undefined && (typeof currentPnpm !== 'object' || Array.isArray(currentPnpm) || currentPnpm === null)) {
    throw new MigrationError(`package.json pnpm configuration in ${projectDir} must be an object.`)
  }

  const nextPackage = JSON.parse(JSON.stringify(packageJson))
  let packageChanged = false
  if (nextPackage.packageManager && !/^(npm|pnpm)@/.test(nextPackage.packageManager)) {
    throw new MigrationError(`package.json in ${projectDir} declares unsupported packageManager ${nextPackage.packageManager}.`)
  }
  if (nextPackage.packageManager) {
    if (nextPackage.packageManager.startsWith('pnpm@')) {
      const declaredVersion = nextPackage.packageManager.slice('pnpm@'.length).split('+')[0]
      if (declaredVersion !== PINNED_PNPM_VERSION) {
        throw new MigrationError(`package.json in ${projectDir} pins pnpm ${declaredVersion}; expected ${PINNED_PNPM_VERSION}. Refusing to rewrite the existing pin.`)
      }
    }
  }
  if (!nextPackage.packageManager || nextPackage.packageManager.startsWith('npm@')) {
    nextPackage.packageManager = `pnpm@${PINNED_PNPM_VERSION}`
    packageChanged = true
  }

  const nextPnpm = nextPackage.pnpm ? { ...nextPackage.pnpm } : undefined
  if (nextPnpm?.onlyBuiltDependencies !== undefined && !Array.isArray(nextPnpm.onlyBuiltDependencies)) {
    throw new MigrationError(`package.json pnpm.onlyBuiltDependencies in ${projectDir} must be an array.`)
  }
  if (nextPnpm?.onlyBuiltDependencies?.some(name => name === '*' || name === 'all')) {
    throw new MigrationError(`package.json in ${projectDir} uses a blanket native build allowlist; review individual packages before migrating.`)
  }
  // Build scripts stay denied by default. Existing project allowlists are
  // preserved, but the migration never grants a new native install script.
  if (nextPnpm) nextPackage.pnpm = nextPnpm

  let npmrcContent = npmrc.content
  if (npmrc.needsStableSetting || npmrc.needsStrictBuilds) {
    if (npmrcContent && !npmrcContent.endsWith('\n')) npmrcContent += '\n'
    if (npmrc.needsStableSetting) npmrcContent += 'enable-global-virtual-store=false\n'
    if (npmrc.needsStrictBuilds) npmrcContent += 'strict-dep-builds=true\n'
  }

  return {
    nextPackage,
    npmrcContent,
    npmrcChanged: npmrc.needsStableSetting || npmrc.needsStrictBuilds,
    packageChanged
  }
}

export function getValidationCommands (projectDir, packageJson) {
  const scripts = packageJson.scripts || {}
  const commands = []
  if (scripts.build) commands.push({ args: ['run', 'build'], command: 'pnpm', label: 'build' })
  if (scripts.test) commands.push({ args: ['run', 'test'], command: 'pnpm', label: 'test' })

  if (commands.length === 0 && fs.existsSync(path.join(projectDir, 'do'))) {
    commands.push({ args: ['do', 'check'], command: 'sh', label: 'Hugo check' })
  }

  if (commands.length === 0) {
    throw new MigrationError(`No supported build, test, or Hugo check command found in ${projectDir}; refusing to claim validation.`)
  }
  return commands
}

function getPackageNameFromLockPath (lockPath) {
  const marker = 'node_modules/'
  const markerIndex = lockPath.lastIndexOf(marker)
  if (markerIndex < 0) return undefined
  const name = lockPath.slice(markerIndex + marker.length)
  if (!name || name.startsWith('.')) return undefined
  if (name.startsWith('@')) return name.split('/').slice(0, 2).join('/')
  return name.split('/')[0]
}

export function collectNpmPackages (lock) {
  const packages = new Map()
  const add = (name, version, optional = false) => {
    if (!name || !version) return
    const entry = packages.get(name) || {
      optional: true,
      optionalVersions: new Set(),
      requiredVersions: new Set(),
      versions: new Set()
    }
    entry.optional = entry.optional && optional
    if (optional) entry.optionalVersions.add(version)
    else entry.requiredVersions.add(version)
    entry.versions.add(version)
    packages.set(name, entry)
  }

  if (lock.packages && typeof lock.packages === 'object') {
    for (const [lockPath, entry] of Object.entries(lock.packages)) {
      if (!entry || typeof entry !== 'object') continue
      add(getPackageNameFromLockPath(lockPath), entry.version, entry.optional === true)
    }
  }

  const visit = (dependencies, parentOptional = false) => {
    if (!dependencies || typeof dependencies !== 'object') return
    for (const [name, entry] of Object.entries(dependencies)) {
      if (!entry || typeof entry !== 'object') continue
      add(name, entry.version, parentOptional || entry.optional === true)
      visit(entry.dependencies, parentOptional || entry.optional === true)
    }
  }
  visit(lock.dependencies)
  return packages
}

function parseJsonOutput (output) {
  const source = (output || '').trim()
  const start = Math.min(...['[', '{'].map(character => {
    const index = source.indexOf(character)
    return index < 0 ? Number.MAX_SAFE_INTEGER : index
  }))
  if (!Number.isFinite(start) || start === Number.MAX_SAFE_INTEGER) {
    throw new MigrationError('pnpm list did not return JSON output.')
  }
  try {
    return JSON.parse(source.slice(start))
  } catch (error) {
    throw new MigrationError(`Unable to parse pnpm list output: ${error.message}`, { cause: error })
  }
}

export function collectPnpmPackages (tree) {
  const packages = new Map()
  const visit = (value, fallbackName) => {
    if (!value || typeof value !== 'object') return
    const name = typeof value.name === 'string' ? value.name : fallbackName
    if (typeof name === 'string' && typeof value.version === 'string') {
      const versions = packages.get(name) || new Set()
      versions.add(value.version)
      packages.set(name, versions)
    }
    for (const key of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      const children = value[key]
      if (!children || typeof children !== 'object') continue
      for (const [childName, child] of Object.entries(children)) visit(child, childName)
    }
    if (Array.isArray(value)) for (const child of value) visit(child)
  }
  visit(tree)
  return packages
}

export function compareDependencyVersions (npmLock, pnpmList, projectName) {
  const expected = collectNpmPackages(npmLock)
  const actual = collectPnpmPackages(pnpmList)
  const rootName = projectName || npmLock.name || npmLock.packages?.['']?.name
  if (rootName) actual.delete(rootName)
  const differences = []

  for (const [name, entry] of expected) {
    const versions = actual.get(name) || new Set()
    const changed = [...versions].filter(version => !entry.versions.has(version))
    const missing = [...entry.versions].filter(version =>
      !versions.has(version) && entry.requiredVersions.has(version))
    if (changed.length || missing.length) {
      differences.push({
        name,
        expected: [...entry.versions].sort(),
        actual: [...versions].sort(),
        reason: changed.length ? 'version changed' : 'missing'
      })
    }
  }

  for (const [name, versions] of actual) {
    if (!expected.has(name)) {
      differences.push({
        name,
        expected: [],
        actual: [...versions].sort(),
        reason: 'unexpected package'
      })
    }
  }

  return differences
}

export function parseIgnoredBuildScripts (output) {
  const packages = new Set()
  for (const line of (output || '').split(/\r?\n/)) {
    const match = line.match(/ignored build scripts?:\s*(.+)$/i)
    if (!match) continue
    const list = match[1].replace(/\s+Run\s+['"].*$/i, '').replace(/\.$/, '')
    for (const value of list.split(',')) {
      const name = value.trim().replace(/@\d.*$/, '')
      if (name) packages.add(name)
    }
  }
  return [...packages]
}

function writeJson (filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function commandOutput (result) {
  return `${result.stdout || ''}${result.stderr || ''}`
}

function runChecked (runner, command, args, projectDir, label) {
  let result
  try {
    result = runner(command, args, { cwd: projectDir, env: PACKAGE_MANAGER_ENV })
  } catch (error) {
    throw new MigrationError(`${label} failed to start: ${error.message}`, { cause: error })
  }
  if (result.code !== 0) {
    const detail = commandOutput(result).trim()
    throw new MigrationError(`${label} failed with exit code ${result.code}${detail ? `: ${detail}` : '.'}`)
  }
  return result
}

function createBackup (projectDir) {
  assertProjectInputs(projectDir)
  const backupPrefix = `.${path.basename(projectDir)}-pnpm-backup-`
  const backupDir = fs.mkdtempSync(path.join(path.dirname(projectDir), backupPrefix))
  const files = {}
  const nodeModules = path.join(projectDir, 'node_modules')
  const nodeModulesBackup = path.join(backupDir, 'node_modules')
  let nodeModulesExists = false
  let nodeModulesMoved = false
  try {
    for (const name of CONFIG_FILE_NAMES) {
      const source = path.join(projectDir, name)
      const exists = fs.existsSync(source)
      files[name] = exists
      if (exists) fs.copyFileSync(source, path.join(backupDir, name))
    }

    nodeModulesExists = fs.existsSync(nodeModules) || Boolean(fs.lstatSync(nodeModules, { throwIfNoEntry: false }))
    if (nodeModulesExists) {
      fs.renameSync(nodeModules, nodeModulesBackup)
      nodeModulesMoved = true
    }

    const backup = { backupDir, files, nodeModulesExists, nodeModulesBackup, projectDir }
    writeBackupManifest(backup, null, null)
    return backup
  } catch (error) {
    try {
      if (nodeModulesMoved) fs.renameSync(nodeModulesBackup, nodeModules)
      removePath(backupDir)
    } catch (cleanupError) {
      throw new MigrationError(`Unable to create rollback backup: ${error.message} Cleanup also failed: ${cleanupError.message}`, { cause: cleanupError })
    }
    throw new MigrationError(`Unable to create rollback backup: ${error.message}`, { cause: error })
  }
}

function writeBackupManifest (backup, postFiles, postNodeModulesExists) {
  const manifest = `${JSON.stringify({
    version: 1,
    files: backup.files,
    nodeModulesExists: backup.nodeModulesExists,
    projectDir: backup.projectDir,
    postFiles,
    postNodeModulesExists
  }, null, 2)}\n`
  const manifestPath = path.join(backup.backupDir, 'manifest.json')
  const fileDescriptor = fs.openSync(manifestPath, 'w')
  try {
    fs.writeSync(fileDescriptor, manifest, 0, 'utf8')
    fs.fsyncSync(fileDescriptor)
  } finally {
    fs.closeSync(fileDescriptor)
  }
}

function hashFile (filePath) {
  const stat = fs.lstatSync(filePath, { throwIfNoEntry: false })
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) return undefined
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function snapshotFiles (projectDir) {
  return Object.fromEntries(CONFIG_FILE_NAMES.map(name => {
    const filePath = path.join(projectDir, name)
    return [name, hashFile(filePath) || null]
  }))
}

function removePath (filePath) {
  fs.rmSync(filePath, { force: true, recursive: true })
}

function assertRegularFile (filePath, label) {
  const stat = fs.lstatSync(filePath, { throwIfNoEntry: false })
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) {
    throw new MigrationError(`${label} must be a regular file.`)
  }
}

function assertDirectory (directory, label) {
  const stat = fs.lstatSync(directory, { throwIfNoEntry: false })
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) {
    throw new MigrationError(`${label} must be a real directory.`)
  }
}

function assertProjectInputs (projectDir) {
  for (const name of CONFIG_FILE_NAMES) {
    const filePath = path.join(projectDir, name)
    if (fs.lstatSync(filePath, { throwIfNoEntry: false })) assertRegularFile(filePath, `Project ${name}`)
  }
  assertRegularFile(path.join(projectDir, 'package.json'), 'Project package.json')
  const nodeModules = path.join(projectDir, 'node_modules')
  if (fs.lstatSync(nodeModules, { throwIfNoEntry: false })) {
    assertDirectory(nodeModules, 'Project node_modules')
  }
}

function validatePostSnapshot (projectDir, postFiles, postNodeModulesExists) {
  if (!postFiles || typeof postFiles !== 'object') {
    throw new MigrationError('Backup has no successful-migration file snapshot.')
  }
  if (Object.keys(postFiles).sort().join('\0') !== CONFIG_FILE_NAMES.slice().sort().join('\0')) {
    throw new MigrationError('Backup file snapshot is incomplete.')
  }
  for (const name of CONFIG_FILE_NAMES) {
    const expected = postFiles[name]
    if (expected !== null && typeof expected !== 'string') {
      throw new MigrationError(`Backup file snapshot for ${name} is invalid.`)
    }
    const actual = hashFile(path.join(projectDir, name)) || null
    if (actual !== expected) {
      throw new MigrationError(`Refusing restore: ${name} changed after migration.`)
    }
  }
  if (postNodeModulesExists !== true) {
    throw new MigrationError('Backup does not describe a validated post-migration node_modules directory.')
  }
  assertDirectory(path.join(projectDir, 'node_modules'), 'Current node_modules')
}

export function readBackup (backupDir, projectPath) {
  if (!projectPath) throw new MigrationError('--restore requires the matching --project path.')
  const resolvedBackupDir = path.resolve(backupDir)
  const projectDir = path.resolve(projectPath)
  assertDirectory(projectDir, 'Restore project')
  assertProjectInputs(projectDir)
  const backupName = path.basename(resolvedBackupDir)
  const expectedPrefix = `.${path.basename(projectDir)}-pnpm-backup-`
  if (path.dirname(resolvedBackupDir) !== path.dirname(projectDir) || !backupName.startsWith(expectedPrefix)) {
    throw new MigrationError(`Backup ${resolvedBackupDir} is not a sibling backup for ${projectDir}.`)
  }
  assertDirectory(resolvedBackupDir, 'Migration backup')
  const manifestPath = path.join(resolvedBackupDir, 'manifest.json')
  assertRegularFile(manifestPath, 'Backup manifest')
  const manifest = readJsonFile(manifestPath)
  if (manifest.version !== 1 || manifest.projectDir !== projectDir || !manifest.files || typeof manifest.files !== 'object') {
    throw new MigrationError(`Invalid migration backup manifest in ${resolvedBackupDir}.`)
  }
  if (typeof manifest.nodeModulesExists !== 'boolean' || typeof manifest.postNodeModulesExists !== 'boolean') {
    throw new MigrationError(`Invalid node_modules state in ${resolvedBackupDir}.`)
  }
  if (Object.keys(manifest.files).sort().join('\0') !== CONFIG_FILE_NAMES.slice().sort().join('\0') ||
      Object.values(manifest.files).some(value => typeof value !== 'boolean')) {
    throw new MigrationError(`Invalid backup file manifest in ${resolvedBackupDir}.`)
  }
  for (const name of CONFIG_FILE_NAMES) {
    const backupFile = path.join(resolvedBackupDir, name)
    if (manifest.files[name]) assertRegularFile(backupFile, `Backup ${name}`)
    else if (fs.lstatSync(backupFile, { throwIfNoEntry: false })) throw new MigrationError(`Unexpected backup file ${name} in ${resolvedBackupDir}.`)
  }
  const nodeModulesBackup = path.join(resolvedBackupDir, 'node_modules')
  if (manifest.nodeModulesExists) assertDirectory(nodeModulesBackup, 'Backup node_modules')
  else if (fs.lstatSync(nodeModulesBackup, { throwIfNoEntry: false })) throw new MigrationError(`Unexpected backup node_modules in ${resolvedBackupDir}.`)
  validatePostSnapshot(projectDir, manifest.postFiles, manifest.postNodeModulesExists)
  return {
    backupDir: resolvedBackupDir,
    files: manifest.files,
    nodeModulesBackup,
    nodeModulesExists: manifest.nodeModulesExists === true,
    postFiles: manifest.postFiles,
    postNodeModulesExists: manifest.postNodeModulesExists === true,
    projectDir
  }
}

function restoreProjectFromBackup (projectDir, backup, options = {}) {
  assertProjectInputs(projectDir)
  const operations = {
    copy: fs.copyFileSync,
    mkdir: fs.mkdtempSync,
    remove: removePath,
    rename: fs.renameSync,
    ...(options.operations || {})
  }
  const rescueDir = operations.mkdir(path.join(path.dirname(projectDir), `.${path.basename(projectDir)}-pnpm-restore-rescue-`))
  const movedFiles = []
  const restoredFiles = []
  let movedNodeModules = false
  let restoredNodeModules = false
  try {
    for (const name of CONFIG_FILE_NAMES) {
      const current = path.join(projectDir, name)
      if (!fs.lstatSync(current, { throwIfNoEntry: false })) continue
      assertRegularFile(current, `Current ${name}`)
      operations.rename(current, path.join(rescueDir, name))
      movedFiles.push(name)
    }
    const currentNodeModules = path.join(projectDir, 'node_modules')
    if (fs.lstatSync(currentNodeModules, { throwIfNoEntry: false })) {
      assertDirectory(currentNodeModules, 'Current node_modules')
      operations.rename(currentNodeModules, path.join(rescueDir, 'node_modules'))
      movedNodeModules = true
    }

    for (const name of CONFIG_FILE_NAMES) {
      if (backup.files[name]) {
        operations.copy(path.join(backup.backupDir, name), path.join(projectDir, name))
        restoredFiles.push(name)
      }
    }
    if (backup.nodeModulesExists) {
      operations.rename(backup.nodeModulesBackup, currentNodeModules)
      restoredNodeModules = true
    }
    operations.remove(rescueDir)
    operations.remove(backup.backupDir)
  } catch (error) {
    try {
      for (const name of restoredFiles) {
        const restored = path.join(projectDir, name)
        if (fs.lstatSync(restored, { throwIfNoEntry: false })) {
          assertRegularFile(restored, `Restored ${name}`)
          operations.remove(restored)
        }
      }
      if (restoredNodeModules) {
        operations.rename(path.join(projectDir, 'node_modules'), backup.nodeModulesBackup)
      }
      if (movedNodeModules) operations.rename(path.join(rescueDir, 'node_modules'), path.join(projectDir, 'node_modules'))
      for (const name of movedFiles) operations.rename(path.join(rescueDir, name), path.join(projectDir, name))
      operations.remove(rescueDir)
    } catch (rescueError) {
      throw new MigrationError(`${error.message} Restore rollback failed; retained backup at ${backup.backupDir}: ${rescueError.message}`, { cause: rescueError })
    }
    throw new MigrationError(`Restore failed without changing the project; retained backup: ${backup.backupDir}. ${error.message}`, { cause: error })
  }
  return backup.projectDir
}

export function rollback (projectDir, backup) {
  return restoreProjectFromBackup(projectDir, backup)
}

export function restoreBackup (backupDir, projectPath, options = {}) {
  const backup = readBackup(backupDir, projectPath)
  return restoreProjectFromBackup(backup.projectDir, backup, options)
}

export function preflightProject (projectPath, options = {}) {
  const runner = options.runner || defaultRunner
  const projectDir = path.resolve(projectPath)
  assertDirectory(projectDir, 'Project')
  assertProjectInputs(projectDir)
  const packageFile = path.join(projectDir, 'package.json')
  if (!fs.existsSync(packageFile)) throw new MigrationError(`Missing package.json in ${projectDir}.`)
  const packageJson = readJsonFile(packageFile)
  const packageManager = detectPackageManager(projectDir, packageJson)
  assertSupportedProject(projectDir, packageJson, packageManager)
  if (packageJson.packageManager?.startsWith('pnpm@')) {
    const declaredVersion = packageJson.packageManager.slice('pnpm@'.length).split('+')[0]
    if (declaredVersion !== PINNED_PNPM_VERSION) {
      throw new MigrationError(`package.json in ${projectDir} pins pnpm ${declaredVersion}; expected ${PINNED_PNPM_VERSION}.`)
    }
  }
  assertCleanGit(projectDir, runner)
  const pnpmVersion = checkPnpmVersion(runner, projectDir, options.strictPnpm !== false)

  if (packageManager === 'pnpm') {
    return { packageJson, packageManager, pnpmVersion, projectDir }
  }

  const configPlan = buildConfigPlan(projectDir, packageJson)
  const validations = getValidationCommands(projectDir, packageJson)
  return {
    configPlan,
    lockFile: path.join(projectDir, 'package-lock.json'),
    packageJson,
    packageManager,
    pnpmVersion,
    projectDir,
    validations
  }
}

function reportPlan (context, logger) {
  if (context.packageManager === 'pnpm') {
    logger(`SKIP ${context.projectDir}: pnpm-lock.yaml already exists.`)
    return
  }
  const changes = []
  if (context.configPlan.packageChanged) changes.push('package.json')
  if (context.configPlan.npmrcChanged) changes.push('.npmrc')
  changes.push('pnpm-lock.yaml', 'node_modules')
  logger(`DRY RUN ${context.projectDir}: npm -> pnpm ${PINNED_PNPM_VERSION} (${changes.join(', ')}).`)
  logger(`Validation: ${context.validations.map(validation => validation.label).join(', ')}.`)
}

export function migrateProject (projectPath, options = {}) {
  const runner = options.runner || defaultRunner
  const logger = options.logger || console.log
  const context = preflightProject(projectPath, options)
  if (context.packageManager === 'pnpm' || options.apply !== true) {
    reportPlan(context, logger)
    return { context, applied: false }
  }

  const backup = createBackup(context.projectDir)
  activeMigration = { backup, projectDir: context.projectDir }
  try {
    if (context.configPlan.packageChanged) writeJson(path.join(context.projectDir, 'package.json'), context.configPlan.nextPackage)
    if (context.configPlan.npmrcChanged) fs.writeFileSync(path.join(context.projectDir, '.npmrc'), context.configPlan.npmrcContent, 'utf8')

    const importResult = runChecked(runner, 'pnpm', ['import'], context.projectDir, 'pnpm import')
    const importIgnoredBuilds = parseIgnoredBuildScripts(commandOutput(importResult))
    if (importIgnoredBuilds.length) logger(`pnpm import reported ignored build scripts: ${importIgnoredBuilds.join(', ')}.`)

    const installResult = runChecked(runner, 'pnpm', ['install', '--frozen-lockfile', '--reporter', 'append-only'], context.projectDir, 'pnpm install')
    const allowedBuilds = new Set(context.configPlan.nextPackage.pnpm?.onlyBuiltDependencies || [])
    const ignoredBuilds = [...new Set(parseIgnoredBuildScripts(commandOutput(installResult)))]
      .filter(name => !allowedBuilds.has(name))
    if (ignoredBuilds.length && options.strictBuilds !== false) {
      throw new MigrationError(`pnpm ignored unapproved install scripts: ${ignoredBuilds.join(', ')}. Review and allow each package explicitly before retrying.`)
    }
    if (ignoredBuilds.length) logger(`pnpm ignored unapproved install scripts: ${ignoredBuilds.join(', ')}.`)

    const listResult = runChecked(runner, 'pnpm', ['list', '--json', '--depth', 'Infinity'], context.projectDir, 'pnpm list')
    const differences = compareDependencyVersions(readJsonFile(context.lockFile), parseJsonOutput(listResult.stdout), context.packageJson.name)
    if (differences.length) {
      const summary = differences.map(item => `${item.name} (${item.reason}; npm ${item.expected.join('|') || 'none'}, pnpm ${item.actual.join('|') || 'none'})`).join('; ')
      throw new MigrationError(`Dependency versions changed or are missing after import: ${summary}`)
    }

    for (const validation of context.validations) {
      runChecked(runner, validation.command, validation.args, context.projectDir, validation.label)
    }

    // Keep npm's lockfile available for rollback and version comparison until
    // the pnpm install and project checks have passed. A pnpm project should
    // have one authoritative lockfile after a successful migration.
    removePath(context.lockFile)
    writeBackupManifest(backup, snapshotFiles(context.projectDir), fs.existsSync(path.join(context.projectDir, 'node_modules')))
    logger(`MIGRATED ${context.projectDir}: pnpm ${context.pnpmVersion}.`)
    const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`
    logger(`Rollback backup retained at ${backup.backupDir}. Restore with: node ${quote(fileURLToPath(import.meta.url))} --restore ${quote(backup.backupDir)} --project ${quote(backup.projectDir)}`)
    activeMigration = undefined
    return { backupPath: backup.backupDir, context, applied: true }
  } catch (error) {
    try {
      rollback(context.projectDir, backup)
    } catch (rollbackError) {
      activeMigration = undefined
      throw new MigrationError(`${error.message} Rollback also failed; retained backup at ${backup.backupDir}: ${rollbackError.message}`, { cause: rollbackError })
    }
    activeMigration = undefined
    throw new MigrationError(`${error.message} Original project files and node_modules were restored.`, { cause: error })
  }
}

export function installSignalRollback () {
  const handleSignal = signal => {
    if (activeMigration) {
      const migration = activeMigration
      activeMigration = undefined
      try {
        rollback(migration.projectDir, migration.backup)
        console.error(`Migration interrupted by ${signal}; original project files and node_modules were restored.`)
      } catch (error) {
        console.error(`Migration interrupted by ${signal}; rollback failed: ${error.message}`)
      }
      process.exit(128 + (signal === 'SIGINT' ? 2 : 15))
    }
    process.exit(128 + (signal === 'SIGINT' ? 2 : 15))
  }
  process.once('SIGINT', () => handleSignal('SIGINT'))
  process.once('SIGTERM', () => handleSignal('SIGTERM'))
}

export function main (argv = process.argv.slice(2), io = {}) {
  const log = io.log || console.log
  const error = io.error || console.error
  let options
  try {
    options = parseArgs(argv)
  } catch (failure) {
    error(failure.message)
    return 2
  }

  if (options.help) {
    log(usage())
    return 0
  }
  if (options.restore) {
    if (options.projects.length !== 1) {
      error('--restore requires exactly one matching --project path.')
      return 2
    }
    try {
      const projectDir = restoreBackup(options.restore, options.projects[0])
      log(`RESTORED ${projectDir} from ${path.resolve(options.restore)}.`)
      return 0
    } catch (failure) {
      error(`FAILED restore ${path.resolve(options.restore)}: ${failure.message}`)
      return 1
    }
  }
  if (options.projects.length === 0) {
    error('At least one explicit --project is required. Use --help for usage.')
    return 2
  }

  for (const project of options.projects) {
    try {
      migrateProject(project, { ...options, logger: log })
    } catch (failure) {
      error(`FAILED ${path.resolve(project)}: ${failure.message}`)
      return 1
    }
  }
  return 0
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  installSignalRollback()
  process.exitCode = main()
}
