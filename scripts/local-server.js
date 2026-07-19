import { existsSync, watch } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'

// This script must run from a SanSoul consumer project root. It supervises the
// generated prebuild instead of asking Hugo's cache busters to regenerate it.
const projectDir = process.cwd()
const themeDir = path.join(projectDir, 'themes', 'sansoul')
const debounceMs = 200
const stopTimeoutMs = 3000

const serverArgs = [
  'server',
  '--noHTTPCache',
  '--ignoreCache',
  '--disableFastRender',
  '--config',
  [
    'themes/sansoul/hugo.default.yml',
    'themes/sansoul/hugo.local.yml',
    'themes/sansoul/prebuild/public/hugo.prebuild.yml',
    'hugo.yml'
  ].join(','),
  ...process.argv.slice(2)
]

let serverProcess
let prebuildProcess
let debounceTimer
let rebuilding = false
let rebuildPending = false
let shuttingDown = false
let expectedServerExit = false
const changedPaths = new Set()
const watchers = []

function log (message) {
  console.log(`\u001b[1;36mLOCAL\u001b[0m ${message}`)
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
      stdio: 'inherit'
    })

    prebuildProcess = child
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (prebuildProcess === child) prebuildProcess = undefined
      resolve({ code, signal })
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
    return false
  }

  if (result.code !== 0) {
    const detail = result.signal ? `signal ${result.signal}` : `exit code ${result.code}`
    console.error(`LOCAL Prebuild failed with ${detail}. Waiting for another source change.`)
    return false
  }

  return true
}

function startServer () {
  log('Starting Hugo server…')
  expectedServerExit = false

  const child = spawn('hugo', serverArgs, {
    cwd: projectDir,
    stdio: 'inherit'
  })
  serverProcess = child

  child.once('error', error => {
    console.error(`LOCAL Unable to start Hugo: ${error.message}`)
    reportAsyncFailure(shutdown(1))
  })

  child.once('exit', (code, signal) => {
    if (serverProcess === child) serverProcess = undefined
    if (expectedServerExit || shuttingDown) return

    const detail = signal ? `signal ${signal}` : `exit code ${code}`
    console.error(`LOCAL Hugo stopped unexpectedly with ${detail}.`)
    reportAsyncFailure(shutdown(code || 1))
  })
}

async function stopServer () {
  const child = serverProcess
  if (!child) return

  expectedServerExit = true
  serverProcess = undefined
  child.kill('SIGTERM')

  await new Promise(resolve => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(forceTimer)
      resolve()
    }
    const forceTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      finish()
    }, stopTimeoutMs)

    child.once('exit', finish)
  })
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

  await stopServer()
  const succeeded = await runPrebuild()
  if (succeeded && !shuttingDown) startServer()

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
  const watcher = watch(directory, { recursive: options.recursive !== false }, (event, filename) => {
    const relativePath = filename ? filename.toString().replaceAll('\\', '/') : ''
    if (!filter(relativePath, event)) return

    const absolutePath = relativePath ? path.join(directory, relativePath) : directory
    schedulePrebuild(path.relative(projectDir, absolutePath) || '.')
  })

  watcher.on('error', error => {
    console.error(`LOCAL Watcher failed for ${directory}: ${error.message}`)
  })
  watchers.push(watcher)
}

function startWatchers () {
  addDirectoryWatcher(path.join(projectDir, 'data'))
  addDirectoryWatcher(path.join(projectDir, 'content'), {
    filter: relativePath => /(^|\/)_index(?:\.[^/]+)?\.md$/.test(relativePath)
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

async function shutdown (exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  clearTimeout(debounceTimer)
  for (const watcher of watchers) watcher.close()

  if (prebuildProcess) prebuildProcess.kill('SIGTERM')
  await stopServer()
  process.exitCode = exitCode
}

async function main () {
  if (!existsSync(path.join(themeDir, 'prebuild', 'hugo.yml'))) {
    throw new Error(`SanSoul theme not found below ${projectDir}`)
  }

  const succeeded = await runPrebuild()
  if (!succeeded) {
    process.exitCode = 1
    return
  }

  startWatchers()
  startServer()
}

process.once('SIGINT', () => reportAsyncFailure(shutdown()))
process.once('SIGTERM', () => reportAsyncFailure(shutdown()))

main().catch(error => {
  console.error(`LOCAL ${error.stack || error.message}`)
  reportAsyncFailure(shutdown(1))
})
