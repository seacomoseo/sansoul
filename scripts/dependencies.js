#!/usr/bin/env node

/* Run from the consumer root. Install with its declared manager and lockfile;
 * never fall back to a different manager or change machine-wide settings. */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

export function dependencyManager (directory = process.cwd(), { allowMissingLock = false } = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'))
  const declared = manifest.packageManager || ''
  const pnpmLock = fs.existsSync(path.join(directory, 'pnpm-lock.yaml'))
  const npmLock = fs.existsSync(path.join(directory, 'package-lock.json'))
  if (declared && !/^(npm|pnpm)@/.test(declared)) throw new Error(`Unsupported packageManager: ${declared}`)
  if (pnpmLock && npmLock) throw new Error('Two package-manager lockfiles exist. Keep one authoritative lockfile before installing.')
  if ((declared.startsWith('npm@') && pnpmLock) || (declared.startsWith('pnpm@') && npmLock)) {
    throw new Error('The lockfile does not match the declared packageManager. Resolve the mismatch before installing.')
  }
  const name = declared.startsWith('pnpm@') || (!declared && pnpmLock) ? 'pnpm' : 'npm'
  if (name === 'pnpm' && !/^pnpm@\d+\.\d+\.\d+(?:\+sha\d+\..+)?$/.test(declared)) {
    throw new Error('Pin pnpm to an exact version in packageManager before installing.')
  }
  if (name === 'pnpm' && !pnpmLock && !allowMissingLock) throw new Error('Missing pnpm-lock.yaml. Refusing a non-reproducible pnpm build.')
  return { name, declared, hasLock: name === 'pnpm' ? pnpmLock : npmLock }
}

export function checkDependencyManager (directory = process.cwd(), options = {}) {
  const manager = dependencyManager(directory, options)
  const result = spawnSync(manager.name, ['--version'], { cwd: directory, encoding: 'utf8' })
  if (result.error || result.status !== 0) throw new Error(`${manager.name} is unavailable. Install the version declared in package.json first.`)
  const pinned = manager.declared.split('@')[1]?.split('+')[0]
  if (pinned && /^\d+\.\d+\.\d+$/.test(pinned) && result.stdout.trim() !== pinned) {
    throw new Error(`Expected ${manager.declared}; found ${manager.name}@${result.stdout.trim()}. Activate the pinned version first.`)
  }
  return manager
}

export function installDependencies ({ directory = process.cwd(), updateLockfile = false, allowMissingLock = updateLockfile } = {}) {
  const manager = checkDependencyManager(directory, { allowMissingLock })
  if (manager.name === 'pnpm' && !manager.hasLock && !updateLockfile) throw new Error('Missing pnpm-lock.yaml. Refusing a non-reproducible pnpm build.')
  const args = manager.name === 'pnpm'
    ? ['install', updateLockfile ? '--no-frozen-lockfile' : '--frozen-lockfile', '--config.enable-global-virtual-store=false']
    : manager.hasLock && !updateLockfile ? ['ci'] : ['install']
  const result = spawnSync(manager.name, args, { cwd: directory, stdio: 'inherit' })
  if (result.error || result.status !== 0) throw new Error(`${manager.name} ${args.join(' ')} failed${result.error ? `: ${result.error.message}` : ` (exit ${result.status ?? result.signal})`}.`)
}

// Commands that run before any build (`sh do new`) need the engine's runtime
// packages. Resolve them from the engine scripts; when missing, install them
// with the pinned manager in the directory whose node_modules Node will search:
// the consumer root when run from one, else the engine checkout itself.
export function ensureRuntimeDependencies ({ engineDir, projectDir = process.cwd(), packages = ['yaml'], install = installDependencies, log = console.error } = {}) {
  const resolver = createRequire(path.join(engineDir, 'scripts', 'noop.js'))
  const missing = () => packages.filter(name => { try { resolver.resolve(name); return false } catch { return true } })
  let absent = missing()
  if (!absent.length) return null
  const engineInsideProject = path.relative(projectDir, engineDir) && !path.relative(projectDir, engineDir).startsWith('..')
  const directory = engineInsideProject && fs.existsSync(path.join(projectDir, 'package.json')) ? projectDir : engineDir
  log(`SanSoul: faltan dependencias (${absent.join(', ')}); se instalan con el gestor fijado en ${directory}.`)
  try {
    install({ directory })
  } catch (error) {
    throw new Error(`${error.message}\nInstala las dependencias a mano y repite: cd ${JSON.stringify(directory)} && pnpm install --frozen-lockfile`)
  }
  absent = missing()
  if (absent.length) throw new Error(`Siguen faltando ${absent.join(', ')} tras instalar en ${directory}.`)
  return directory
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args[0] === '--runtime') {
      ensureRuntimeDependencies({ engineDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') })
      process.exit(0)
    }
    if (args.some(arg => arg !== '--update-lockfile')) throw new Error('Usage: sh do hugo (or node <engine>/scripts/dependencies.js [--update-lockfile | --runtime])')
    installDependencies({ updateLockfile: args.includes('--update-lockfile') })
  } catch (error) {
    console.error(`SanSoul dependencies: ${error.message}`)
    process.exitCode = 1
  }
}
