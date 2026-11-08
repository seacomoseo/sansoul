/*
Purpose: Bring a consumer to the mandatory SanSoul layout: the engine at core/
  and dependencies managed by the pinned pnpm release.
Run from: A consumer root, called by `sh do update`.
Writes: package.json, .npmrc, pnpm-lock.yaml, deployment TOML files and tracked
  text references; `git mv` stages only the engine move. Never commits.
Safety: Preflight functions change nothing. Dependency conversion restores the
  files it touched when any step fails.
*/
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { installDependencies } from './dependencies.js'
import { PINNED_PNPM_VERSION, buildConfigPlan, checkPnpmVersion, defaultRunner } from './migrate-pnpm.js'

export const LEGACY_ENGINE_PATH = 'themes/sansoul'
export const ENGINE_PATH = 'core'
const PNPM_FLAGS = '--frozen-lockfile --config.enable-global-virtual-store=false'
const TEXT_LIMIT = 1024 * 1024
const SKIPPED_REFERENCE_FILES = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/

function git (projectDir, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', ['-C', projectDir, ...args], { encoding: 'utf8' })
  if (result.error || (result.status !== 0 && !allowFailure)) {
    throw new Error(result.error?.message || result.stderr.trim() || `git ${args.join(' ')} failed.`)
  }
  return result.status === 0 ? result.stdout : ''
}

function readPackage (projectDir) {
  return JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'))
}

// ---------------------------------------------------------------- engine path

export function preflightEngineMove (projectDir, engineRel) {
  if (engineRel === ENGINE_PATH) return { needed: false }
  if (fs.existsSync(path.join(projectDir, ENGINE_PATH))) {
    throw new Error(`Cannot move ${engineRel} to ${ENGINE_PATH}: ${ENGINE_PATH}/ already exists.`)
  }
  const declared = git(projectDir, ['config', '-z', '-f', '.gitmodules', '--get-regexp', '^submodule\\..*\\.(path|url)$'], { allowFailure: true })
    .split('\0').filter(Boolean)
  if (declared.some(record => /^submodule\.core\./.test(record))) {
    throw new Error('.gitmodules already has a [submodule "core"] section; resolve it before the engine can move to core.')
  }
  return { needed: true }
}

export function relocateEngine (projectDir, { engineRel, submoduleKey, log = console.log }) {
  if (engineRel === ENGINE_PATH) return { engineDir: path.join(projectDir, engineRel), changed: [], leftovers: [] }
  preflightEngineMove(projectDir, engineRel)

  git(projectDir, ['mv', engineRel, ENGINE_PATH])
  const parent = path.dirname(path.join(projectDir, engineRel))
  if (parent !== projectDir && fs.existsSync(parent) && fs.readdirSync(parent).length === 0) fs.rmdirSync(parent)
  if (submoduleKey !== 'submodule.core') {
    git(projectDir, ['config', '-f', '.gitmodules', '--rename-section', submoduleKey, 'submodule.core'])
  }
  log(`Moved the SanSoul submodule from ${engineRel} to ${ENGINE_PATH} and normalized .gitmodules.`)

  const pattern = new RegExp(engineRel.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '(?=/|\\b)', 'g')
  const changed = []
  const leftovers = []
  const tracked = git(projectDir, ['ls-files', '-z']).split('\0').filter(Boolean)
  for (const file of tracked) {
    if (file === ENGINE_PATH || file.startsWith(`${ENGINE_PATH}/`) || file.startsWith('uploads/') || SKIPPED_REFERENCE_FILES.test(file)) continue
    const target = path.join(projectDir, file)
    let stat
    try { stat = fs.lstatSync(target) } catch { continue }
    if (!stat.isFile() || stat.size > TEXT_LIMIT) continue
    const buffer = fs.readFileSync(target)
    if (buffer.includes(0)) continue
    const source = buffer.toString('utf8')
    if (!source.includes(engineRel)) continue
    if (file === 'do' && source.includes('./core/do')) continue // canonical wrapper supports both paths
    const next = source.replace(pattern, ENGINE_PATH)
    if (next === source) { leftovers.push(file); continue }
    fs.writeFileSync(target, next)
    changed.push(file)
  }
  if (changed.length) log(`Updated ${engineRel} references in: ${changed.join(', ')}.`)
  return { engineDir: path.join(projectDir, ENGINE_PATH), changed, leftovers }
}

// ---------------------------------------------------------------------- pnpm

export function preflightPnpm (projectDir) {
  const packageJson = readPackage(projectDir)
  if (packageJson.workspaces || fs.existsSync(path.join(projectDir, 'pnpm-workspace.yaml'))) {
    throw new Error('Workspace projects are not supported by the automatic pnpm conversion.')
  }
  const hasNpm = fs.existsSync(path.join(projectDir, 'package-lock.json'))
  const hasPnpm = fs.existsSync(path.join(projectDir, 'pnpm-lock.yaml'))
  if (fs.existsSync(path.join(projectDir, 'yarn.lock'))) throw new Error('yarn.lock found; convert the project to npm or pnpm manually first.')
  if (hasNpm && hasPnpm) throw new Error('Both package-lock.json and pnpm-lock.yaml exist. Keep one authoritative lockfile.')
  if (/^pnpm@/.test(packageJson.packageManager || '') && packageJson.packageManager.split('@')[1].split('+')[0] !== PINNED_PNPM_VERSION) {
    throw new Error(`package.json pins ${packageJson.packageManager}; SanSoul requires pnpm@${PINNED_PNPM_VERSION}.`)
  }
  checkPnpmVersion(defaultRunner, projectDir, true)
  buildConfigPlan(projectDir, packageJson)
  const alreadyPnpm = /^pnpm@/.test(packageJson.packageManager || '') && hasPnpm
  return { needsConversion: !alreadyPnpm, hasNpmLock: hasNpm }
}

function snapshot (projectDir, files) {
  return files.map(file => {
    const target = path.join(projectDir, file)
    return { target, content: fs.existsSync(target) ? fs.readFileSync(target) : undefined }
  })
}

function restore (entries) {
  for (const { target, content } of entries) {
    if (content === undefined) fs.rmSync(target, { force: true })
    else fs.writeFileSync(target, content)
  }
}

export function ensurePnpm (projectDir, { log = console.log } = {}) {
  const state = preflightPnpm(projectDir)
  const files = ['package.json', '.npmrc', 'package-lock.json', 'pnpm-lock.yaml', 'netlify.toml', 'wrangler.toml']
  const saved = snapshot(projectDir, files)
  try {
    const packageJson = readPackage(projectDir)
    const plan = buildConfigPlan(projectDir, packageJson)
    const nextPackage = plan.nextPackage
    if (nextPackage.scripts) {
      for (const [name, command] of Object.entries(nextPackage.scripts)) {
        if (typeof command !== 'string') continue
        nextPackage.scripts[name] = command
          .replace(/\bnpx\b/g, 'pnpm dlx')
          .replace(/\bnpm (run|install|ci|test)\b/g, 'pnpm $1')
      }
    }
    if (JSON.stringify(nextPackage) !== JSON.stringify(packageJson)) {
      fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify(nextPackage, null, 2) + '\n')
    }
    if (plan.npmrcChanged) fs.writeFileSync(path.join(projectDir, '.npmrc'), plan.npmrcContent)

    if (state.needsConversion) {
      if (state.hasNpmLock) {
        const imported = spawnSync('pnpm', ['import'], { cwd: projectDir, stdio: 'inherit', env: { ...process.env, npm_config_enable_global_virtual_store: 'false' } })
        if (imported.status !== 0) throw new Error('pnpm import failed.')
        fs.rmSync(path.join(projectDir, 'package-lock.json'))
        installDependencies({ directory: projectDir, updateLockfile: true })
      } else {
        installDependencies({ directory: projectDir, updateLockfile: true })
      }
      log(`Converted the project to pnpm@${PINNED_PNPM_VERSION}.`)
    } else {
      // Migrations may just have added dependencies; an unchanged lockfile stays byte-identical.
      installDependencies({ directory: projectDir, updateLockfile: true })
    }
    syncDeploymentConfig(projectDir, log)
  } catch (error) {
    restore(saved)
    throw new Error(`pnpm conversion failed; package.json, lockfiles and deployment files were restored. ${error.message}`)
  }
}

// ------------------------------------------------------- deployment settings

function ensureTomlKey (file, section, key, value, log) {
  if (!fs.existsSync(file)) return
  const source = fs.readFileSync(file, 'utf8')
  const line = `${key} = "${value}"`
  const keyPattern = new RegExp(`^${key}\\s*=.*$`, 'm')
  let next
  if (keyPattern.test(source)) {
    next = source.replace(keyPattern, line)
  } else {
    const header = new RegExp(`^\\[${section.replace('.', '\\.')}\\]\\s*$`, 'm')
    next = header.test(source)
      ? source.replace(header, match => `${match}\n${line}`)
      : `${source.replace(/\n*$/, '\n')}\n[${section}]\n${line}\n`
  }
  if (next !== source) {
    fs.writeFileSync(file, next)
    log(`Set ${key} in ${path.basename(file)}.`)
  }
}

export function syncDeploymentConfig (projectDir, log = console.log) {
  ensureTomlKey(path.join(projectDir, 'netlify.toml'), 'build.environment', 'PNPM_FLAGS', PNPM_FLAGS, log)
  ensureTomlKey(path.join(projectDir, 'wrangler.toml'), 'vars', 'PNPM_VERSION', PINNED_PNPM_VERSION, log)
  const ignore = path.join(projectDir, '.gitignore')
  if (fs.existsSync(ignore)) {
    const source = fs.readFileSync(ignore, 'utf8')
    if (!/^\.pnpm-store\/?$/m.test(source)) fs.writeFileSync(ignore, `${source.replace(/\n*$/, '\n')}.pnpm-store\n`)
  }
}
