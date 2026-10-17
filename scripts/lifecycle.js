import { lstatSync, mkdirSync, readFileSync, rmdirSync, unlinkSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { findEnginePath } from './engine-paths.js'

const lockName = '.sansoul-dev.lock'

// These paths are Hugo and SanSoul generated outputs. They are deliberately
// explicit so lifecycle cleanup cannot derive a deletion target from input.
const generatedPaths = [
  'public',
  'resources',
  '.hugo_build.lock'
]

const stopTimeoutMs = 3000

function isProcessAlive (pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false

  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

function isProcessGroupAlive (pid) {
  if (process.platform === 'win32' || !pid) return false

  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

function readLock (lockPath) {
  try {
    const content = readFileSync(lockPath, 'utf8')
    const lock = JSON.parse(content)
    if (lock && lock.version === 1 && Number.isInteger(lock.pid) && lock.token && typeof lock.mode === 'string') {
      return lock
    }
  } catch {}

  return undefined
}

export class Lifecycle {
  constructor ({ projectDir = process.cwd(), label = 'DEV' } = {}) {
    this.projectDir = projectDir
    this.label = label
    this.lockPath = path.join(projectDir, lockName)
    this.ownerPath = path.join(this.lockPath, 'owner')
    this.lockToken = `${process.pid}:${randomUUID()}`
    this.children = new Set()
    this.acquired = false
  }

  acquire () {
    const lock = {
      version: 1,
      pid: process.pid,
      token: this.lockToken,
      mode: this.label,
      startedAt: new Date().toISOString()
    }

    try {
      mkdirSync(this.lockPath, { mode: 0o700 })
      try {
        writeFileSync(this.ownerPath, `${JSON.stringify(lock)}\n`, { flag: 'wx', mode: 0o600 })
      } catch (error) {
        rmdirSync(this.lockPath)
        throw error
      }
      this.acquired = true
      return
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }

    let lockStats
    try {
      lockStats = lstatSync(this.lockPath)
    } catch (error) {
      if (error.code === 'ENOENT') return this.acquire()
      throw error
    }
    if (!lockStats.isDirectory() || lockStats.isSymbolicLink()) {
      throw new Error(`Cannot acquire ${this.label.toLowerCase()} lifecycle lock at ${this.lockPath}`)
    }

    const existing = readLock(this.ownerPath)
    if (!existing) {
      throw new Error(`Cannot acquire ${this.label.toLowerCase()} lifecycle lock at ${this.lockPath}`)
    }

    if (isProcessAlive(existing.pid)) {
      throw new Error(`Another SanSoul ${existing.mode.toLowerCase()} process is already running (pid ${existing.pid})`)
    }

    throw new Error(`Stale SanSoul lifecycle lock at ${this.lockPath}; verify no development or build process is running, then remove the lock directory manually`)
  }

  track (child) {
    this.children.add(child)
    return child
  }

  stopChild (child, signal = 'SIGTERM') {
    const childExited = child.exitCode !== null || child.signalCode !== null
    const groupAlive = isProcessGroupAlive(child.pid)
    if (childExited && !groupAlive) return

    if (groupAlive) {
      try {
        process.kill(-child.pid, signal)
        return
      } catch {}
    }
    child.kill(signal)
  }

  waitForChild (child) {
    return new Promise(resolve => {
      let settled = false
      const timers = {}
      const finish = stopped => {
        if (settled) return
        settled = true
        clearTimeout(timers.force)
        clearTimeout(timers.kill)
        clearInterval(timers.poll)
        if (stopped) this.children.delete(child)
        resolve(stopped)
      }
      const check = () => {
        if (!isProcessGroupAlive(child.pid) && (child.exitCode !== null || child.signalCode !== null)) {
          finish(true)
        }
      }

      check()
      if (settled) return
      timers.poll = setInterval(check, 25)
      timers.force = setTimeout(() => {
        this.stopChild(child, 'SIGKILL')
        timers.kill = setTimeout(() => {
          check()
          if (!settled) finish(false)
        }, stopTimeoutMs)
      }, stopTimeoutMs)

      child.once('exit', check)
      child.once('error', check)
    })
  }

  async stopChildAndWait (child, signal = 'SIGTERM') {
    this.stopChild(child, signal)
    return this.waitForChild(child)
  }

  async stopChildren (signal = 'SIGTERM') {
    const children = [...this.children]
    const results = await Promise.all(children.map(child => this.stopChildAndWait(child, signal)))

    return results.every(Boolean)
  }

  removeGeneratedOutputs () {
    // Resolve only the two supported engine locations, never a caller-supplied
    // recursive deletion target. Missing engines have no prebuild output.
    let paths = generatedPaths
    try {
      paths = [...paths, `${findEnginePath(this.projectDir)}/prebuild/public`]
    } catch (error) {
      if (!/is not initialized/.test(error.message)) throw error
    }
    const targets = paths.map(relativePath => {
      const absolutePath = path.join(this.projectDir, relativePath)
      let currentPath = this.projectDir
      let stats
      let missing = false
      for (const component of relativePath.split(path.sep)) {
        currentPath = path.join(currentPath, component)
        let currentStats
        try {
          currentStats = lstatSync(currentPath)
        } catch (error) {
          if (error.code === 'ENOENT') {
            missing = true
            break
          }
          throw error
        }
        if (currentStats.isSymbolicLink()) {
          throw new Error(`Refusing to remove symlinked generated path: ${relativePath}`)
        }
      }
      if (!missing) stats = lstatSync(absolutePath)
      return { absolutePath, stats }
    })

    for (const target of targets) {
      if (target.stats) rmSync(target.absolutePath, { recursive: target.stats.isDirectory(), force: true })
    }
  }

  release () {
    if (!this.acquired) return

    const existing = readLock(this.ownerPath)
    if (existing && existing.token === this.lockToken) {
      try {
        unlinkSync(this.ownerPath)
        rmdirSync(this.lockPath)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    this.acquired = false
  }
}

export { generatedPaths, lockName }

export function validateToken (projectDir, token) {
  if (!token) return false
  const ownerPath = path.join(projectDir, lockName, 'owner')
  const lock = readLock(ownerPath)
  return Boolean(lock && lock.token === token && isProcessAlive(lock.pid))
}

async function guardCommand (commandArgs) {
  if (!commandArgs.length) throw new Error('Lifecycle guard requires a command')

  const lifecycle = new Lifecycle({ projectDir: process.cwd(), label: 'BUILD' })
  lifecycle.acquire()
  const child = lifecycle.track(spawn(commandArgs[0], commandArgs.slice(1), {
    cwd: lifecycle.projectDir,
    env: { ...process.env, SANSOUL_LIFECYCLE_TOKEN: lifecycle.lockToken },
    stdio: 'inherit',
    detached: process.platform !== 'win32'
  }))
  let receivedSignal

  for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      receivedSignal = signal
      lifecycle.stopChildren(signal).catch(error => {
        console.error(`BUILD Unable to stop child processes: ${error.message}`)
      })
    })
  }

  let exitCode = 1
  try {
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => resolve({ code, signal }))
    })
    const signalNumber = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 }[receivedSignal || result.signal]
    exitCode = signalNumber ? 128 + signalNumber : (result.code || 0)
    if (receivedSignal || result.signal) exitCode = signalNumber ? 128 + signalNumber : 1
  } finally {
    const stopped = await lifecycle.stopChildren()
    if (!stopped) {
      console.error('BUILD Unable to stop the guarded command safely; leaving the lifecycle lock in place.')
      exitCode = 1
    } else {
      lifecycle.release()
    }
  }

  return exitCode
}

const lifecycleAction = process.argv[2]
if (lifecycleAction === 'validate') {
  process.exitCode = validateToken(process.cwd(), process.argv[3]) ? 0 : 1
} else if (lifecycleAction === 'guard') {
  const commandArgs = process.argv.slice(3)
  if (commandArgs[0] === '--') commandArgs.shift()
  guardCommand(commandArgs).then(code => {
    process.exitCode = code
  }).catch(error => {
    console.error(`BUILD ${error.stack || error.message}`)
    process.exitCode = 1
  })
}
