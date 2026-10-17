import { existsSync, watch } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { Lifecycle } from './lifecycle.js'
import { engineDir as themeDir, relativeEnginePath } from './engine-paths.js'
import { startVideoMetadataWatch } from './video-metadata-watch.js'

// This script must run from a SanSoul consumer project root. It supervises the
// generated configuration. A valid refresh restarts Hugo to avoid partial
// content-adapter state after configuration changes or a failed data rebuild.
const projectDir = process.cwd()
const corePath = relativeEnginePath(projectDir)
const debounceMs = 200
const lifecycle = new Lifecycle({ projectDir, label: 'LIVE' })

const serverArgs = [
  'server',
  '--config',
  [
    `${corePath}/hugo.default.yml`,
    `${corePath}/hugo.local.yml`,
    `${corePath}/prebuild/public/hugo.prebuild.yml`,
    'hugo.yml'
  ].join(','),
  ...process.argv.slice(2)
]

let serverProcess
let prebuildProcess
let videoWatcher
let debounceTimer
let removedPageTimer
let rebuilding = false
let rebuildPending = false
let restartingServer = false
let shuttingDown = false
let expectedServerExit = false
let serverRecoveryPending = false
let prebuildFailureCode = 1
const changedPaths = new Set()
const possiblePageRemovals = new Set()
const watchers = []

function log (message) {
  console.log(`\u001b[1;36mLOCAL\u001b[0m ${message}`)
}

function signalExitCode (signal) {
  const signalNumber = {
    SIGHUP: 1,
    SIGINT: 2,
    SIGQUIT: 3,
    SIGTERM: 15,
    SIGKILL: 9
  }[signal]
  return signalNumber ? 128 + signalNumber : 1
}

function reportAsyncFailure (promise) {
  promise.catch(error => {
    console.error(`LOCAL ${error.stack || error.message}`)
    process.exitCode = 1
  })
}

function run (command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectDir,
      env: { ...process.env, ...(videoWatcher ? { SANSOUL_VIDEO_METADATA_WATCH: '1' } : {}) },
      stdio: 'inherit',
      detached: process.platform !== 'win32'
    })

    prebuildProcess = lifecycle.track(child)
    child.once('error', reject)
    child.once('exit', async (code, signal) => {
      const stopped = await lifecycle.waitForChild(child)
      if (prebuildProcess === child) prebuildProcess = undefined
      resolve({ code, signal, stopped })
    })
  })
}

async function runPrebuild () {
  log('Regenerating prebuild output…')
  let result
  try {
    result = await run('sh', ['do', 'prebuild'])
  } catch (error) {
    console.error(`LOCAL Unable to run the prebuild: ${error.message}`)
    prebuildFailureCode = 1
    return false
  }

  if (result.stopped === false) {
    console.error('LOCAL Prebuild process group did not stop safely.')
    prebuildFailureCode = 1
    return false
  }

  if (result.code !== 0) {
    const detail = result.signal ? `signal ${result.signal}` : `exit code ${result.code}`
    console.error(`LOCAL Prebuild failed with ${detail}. Waiting for another source change.`)
    prebuildFailureCode = result.signal ? signalExitCode(result.signal) : (result.code || 1)
    return false
  }

  prebuildFailureCode = 0
  return true
}

function startServer () {
  log('Starting Hugo server…')
  expectedServerExit = false

  const child = spawn('hugo', serverArgs, {
    cwd: projectDir,
    stdio: 'inherit',
    detached: process.platform !== 'win32'
  })
  serverProcess = lifecycle.track(child)

  child.once('error', error => {
    console.error(`LOCAL Unable to start Hugo: ${error.message}`)
    if (rebuilding || restartingServer) {
      serverRecoveryPending = true
      return
    }
    reportAsyncFailure(shutdown(1))
  })

  child.once('exit', (code, signal) => {
    if (serverProcess === child) serverProcess = undefined
    if (expectedServerExit || shuttingDown) return

    const detail = signal ? `signal ${signal}` : `exit code ${code}`
    if (rebuilding || restartingServer) {
      serverRecoveryPending = true
      console.error(`LOCAL Hugo stopped unexpectedly with ${detail}; waiting for the prebuild refresh.`)
      return
    }
    console.error(`LOCAL Hugo stopped unexpectedly with ${detail}.`)
    reportAsyncFailure(shutdown(signal ? signalExitCode(signal) : (code || 1)))
  })
}

async function stopServer () {
  const child = serverProcess
  if (!child) return true

  expectedServerExit = true
  serverProcess = undefined
  return lifecycle.stopChildAndWait(child)
}

async function restartServerAfterPageRemoval (removedPaths) {
  if (shuttingDown || restartingServer) return
  if (rebuilding) {
    serverRecoveryPending = true
    return
  }

  restartingServer = true
  log(`Restarting Hugo after page removal: ${removedPaths.join(', ')}`)
  try {
    const stopped = await stopServer()
    if (stopped && !shuttingDown) startServer()
  } finally {
    restartingServer = false
  }
}

async function restartServerAfterPrebuild () {
  if (shuttingDown || restartingServer) return

  restartingServer = true
  try {
    const recoveringServer = serverRecoveryPending
    const serverStopped = recoveringServer ? true : await stopServer()
    const childrenStopped = await lifecycle.stopChildren()
    if (!serverStopped || !childrenStopped) {
      await shutdown(1)
      return
    }

    serverRecoveryPending = false
    if (!shuttingDown) startServer()
  } finally {
    restartingServer = false
  }
}

function schedulePageRemovalCheck (absolutePath) {
  if (shuttingDown) return
  possiblePageRemovals.add(absolutePath)
  clearTimeout(removedPageTimer)
  removedPageTimer = setTimeout(() => {
    const removedPaths = [...possiblePageRemovals]
      .filter(filePath => !existsSync(filePath))
      .map(filePath => path.relative(projectDir, filePath))
    possiblePageRemovals.clear()

    if (removedPaths.length) {
      reportAsyncFailure(restartServerAfterPageRemoval(removedPaths))
    }
  }, debounceMs)
}

function schedulePrebuild (changedPath) {
  if (shuttingDown) return
  changedPaths.add(changedPath)

  if (rebuilding) {
    rebuildPending = true
    return
  }

  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => reportAsyncFailure(refreshPrebuild()), debounceMs)
}

async function refreshPrebuild () {
  if (shuttingDown || rebuilding) {
    rebuildPending = true
    return
  }

  rebuilding = true
  rebuildPending = false
  debounceTimer = undefined

  const reasons = [...changedPaths]
  changedPaths.clear()
  log(`Prebuild input changed: ${reasons.join(', ')}`)

  const succeeded = await runPrebuild()
  if (succeeded) {
    log('Prebuild configuration refreshed.')
    await restartServerAfterPrebuild()
  }

  rebuilding = false
  if (rebuildPending || changedPaths.size) {
    rebuildPending = false
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => reportAsyncFailure(refreshPrebuild()), debounceMs)
  }
}

function addDirectoryWatcher (directory, options = {}) {
  if (!existsSync(directory)) return

  const filter = options.filter || (() => true)
  const onChange = options.onChange || ((relativePath, event, absolutePath) => {
    schedulePrebuild(path.relative(projectDir, absolutePath) || '.')
  })
  const watcher = watch(directory, { recursive: options.recursive !== false }, (event, filename) => {
    const relativePath = filename ? filename.toString().replaceAll('\\', '/') : ''
    if (!filter(relativePath, event)) return

    const absolutePath = relativePath ? path.join(directory, relativePath) : directory
    onChange(relativePath, event, absolutePath)
  })

  watcher.on('error', error => {
    console.error(`LOCAL Watcher failed for ${directory}: ${error.message}`)
    reportAsyncFailure(shutdown(1))
  })
  watchers.push(watcher)
}

function startWatchers () {
  addDirectoryWatcher(path.join(projectDir, 'data'), {
    filter: relativePath =>
      /^(config|customs|defaults|langs)\.yml$/.test(relativePath) ||
      /^types\/[^/]+\.yml$/.test(relativePath)
  })
  addDirectoryWatcher(path.join(projectDir, 'content'), {
    filter: (relativePath, event) =>
      /(^|\/)_index(?:\.[^/]+)?\.md$/.test(relativePath) ||
      event === 'rename',
    onChange: (relativePath, event, absolutePath) => {
      if (/(^|\/)_index(?:\.[^/]+)?\.md$/.test(relativePath)) {
        schedulePrebuild(path.relative(projectDir, absolutePath) || '.')
      } else if (event === 'rename') {
        schedulePageRemovalCheck(absolutePath)
      }
    }
  })
  addDirectoryWatcher(path.join(themeDir, 'data'))
  addDirectoryWatcher(path.join(themeDir, 'i18n'))
  addDirectoryWatcher(path.join(themeDir, 'prebuild', 'layouts'))
  addDirectoryWatcher(path.join(themeDir, 'layouts', 'partials', 'func'))
  addDirectoryWatcher(projectDir, {
    recursive: false,
    filter: relativePath => relativePath === 'hugo.yml'
  })
  addDirectoryWatcher(path.join(themeDir, 'prebuild'), {
    recursive: false,
    filter: relativePath => relativePath === 'hugo.yml'
  })
}

let shutdownPromise

async function shutdown (exitCode = 0) {
  if (shutdownPromise) return shutdownPromise

  shuttingDown = true
  shutdownPromise = (async () => {
    clearTimeout(debounceTimer)
    clearTimeout(removedPageTimer)
    possiblePageRemovals.clear()
    for (const watcher of watchers) watcher.close()

    const videosStopped = videoWatcher?.close()

    if (prebuildProcess) lifecycle.stopChild(prebuildProcess)
    const serverStopped = await stopServer()
    const childrenStopped = await lifecycle.stopChildren()
    await videosStopped

    let finalExitCode = exitCode
    if (!serverStopped || !childrenStopped) {
      console.error('LIVE Unable to stop child processes safely; leaving generated outputs and lifecycle lock in place.')
      finalExitCode = 1
    } else {
      try {
        if (lifecycle.acquired) lifecycle.removeGeneratedOutputs()
      } catch (error) {
        console.error(`LIVE Unable to clean generated outputs: ${error.message}`)
        finalExitCode = 1
      }
      try {
        lifecycle.release()
      } catch (error) {
        console.error(`LIVE Unable to release lifecycle lock: ${error.message}`)
        finalExitCode = 1
      }
    }
    process.exitCode = finalExitCode
  })()

  return shutdownPromise
}

async function main () {
  if (!existsSync(path.join(themeDir, 'prebuild', 'hugo.yml'))) {
    throw new Error(`SanSoul theme not found below ${projectDir}`)
  }

  lifecycle.acquire()
  process.env.SANSOUL_LIFECYCLE_TOKEN = lifecycle.lockToken
  lifecycle.removeGeneratedOutputs()

  const succeeded = await runPrebuild()
  if (!succeeded) {
    await shutdown(prebuildFailureCode || 1)
    return
  }

  startWatchers()
  videoWatcher = startVideoMetadataWatch({
    projectRoot: projectDir,
    onError: error => {
      console.error(`LOCAL Video metadata watcher failed: ${error.message}`)
      reportAsyncFailure(shutdown(1))
    }
  })
  startServer()
}

process.once('SIGINT', () => reportAsyncFailure(shutdown()))
process.once('SIGTERM', () => reportAsyncFailure(shutdown()))
process.once('SIGHUP', () => reportAsyncFailure(shutdown()))

main().catch(error => {
  console.error(`LOCAL ${error.stack || error.message}`)
  reportAsyncFailure(shutdown(1))
})
