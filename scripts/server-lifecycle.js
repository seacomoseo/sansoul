import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { Lifecycle } from './lifecycle.js'
import { engineDir as themeDir, relativeEnginePath } from './engine-paths.js'
import { startVideoMetadataWatch } from './video-metadata-watch.js'

const projectDir = process.cwd()
const mode = process.argv[2]
const forwardedArgs = process.argv.slice(3)
const corePath = relativeEnginePath(projectDir)
const lifecycle = new Lifecycle({ projectDir, label: mode ? mode.toUpperCase() : 'DEV' })

const configs = {
  dev: [
    `${corePath}/hugo.default.yml`,
    `${corePath}/prebuild/public/hugo.prebuild.yml`,
    'hugo.yml'
  ],
  live: [
    `${corePath}/hugo.default.yml`,
    `${corePath}/hugo.local.yml`,
    `${corePath}/prebuild/public/hugo.prebuild.yml`,
    'hugo.yml'
  ]
}

let receivedSignal
let videoWatcher
let videoFailure = false

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

function log (message) {
  console.log(`\u001b[1;36m${mode.toUpperCase()}\u001b[0m ${message}`)
}

function run (command, args) {
  return new Promise((resolve, reject) => {
    const child = lifecycle.track(spawn(command, args, {
      cwd: projectDir,
      stdio: 'inherit',
      detached: process.platform !== 'win32'
    }))
    let settled = false

    const finish = result => {
      if (settled) return
      settled = true
      resolve(result)
    }

    child.once('error', error => {
      if (!settled) {
        settled = true
        reject(error)
      }
    })
    child.once('exit', (code, signal) => finish({ code, signal }))
  })
}

async function main () {
  if (!configs[mode]) throw new Error(`Unknown development mode: '${mode || ''}'`)
  if (!existsSync(path.join(themeDir, 'prebuild', 'hugo.yml'))) {
    throw new Error(`SanSoul theme not found below ${projectDir}`)
  }

  lifecycle.acquire()
  process.env.SANSOUL_LIFECYCLE_TOKEN = lifecycle.lockToken
  let exitCode = 1

  try {
    lifecycle.removeGeneratedOutputs()

    log('Generating prebuild output…')
    const prebuild = await run('sh', ['do', 'prebuild'])
    if (receivedSignal) {
      exitCode = signalExitCode(receivedSignal)
    } else if (prebuild.code !== 0 || prebuild.signal) {
      exitCode = prebuild.signal ? signalExitCode(prebuild.signal) : (prebuild.code || 1)
    } else {
      videoWatcher = startVideoMetadataWatch({
        projectRoot: projectDir,
        onError: error => {
          console.error(`${mode.toUpperCase()} Video metadata watcher failed: ${error.message}`)
          videoFailure = true
          lifecycle.stopChildren().catch(error => console.error(error.message))
        }
      })
      log('Starting Hugo server…')
      const server = await run('hugo', [
        'server',
        '--disableFastRender',
        '--config',
        configs[mode].join(','),
        ...forwardedArgs
      ])
      exitCode = videoFailure ? 1 : receivedSignal
        ? signalExitCode(receivedSignal)
        : (server.signal ? signalExitCode(server.signal) : (server.code || 0))
      if (exitCode !== 0) {
        console.error(`${mode.toUpperCase()} Hugo stopped with exit code ${exitCode}.`)
      }
    }
  } finally {
    const videosStopped = videoWatcher?.close()
    const stopped = await lifecycle.stopChildren()
    await videosStopped
    if (!stopped) {
      console.error(`${mode.toUpperCase()} Unable to stop child processes safely; leaving generated outputs and lifecycle lock in place.`)
      exitCode = 1
    } else {
      try {
        lifecycle.removeGeneratedOutputs()
      } catch (error) {
        console.error(`${mode.toUpperCase()} Unable to clean generated outputs: ${error.message}`)
        exitCode = 1
      }
      try {
        lifecycle.release()
      } catch (error) {
        console.error(`${mode.toUpperCase()} Unable to release lifecycle lock: ${error.message}`)
        exitCode = 1
      }
    }
  }

  return exitCode
}

for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    receivedSignal = signal
    lifecycle.stopChildren(signal).catch(error => {
      console.error(`${(mode || 'DEV').toUpperCase()} Unable to stop child processes: ${error.message}`)
    })
  })
}

main().then(code => {
  process.exitCode = code
}).catch(error => {
  console.error(`${(mode || 'DEV').toUpperCase()} ${error.stack || error.message}`)
  try {
    lifecycle.release()
  } catch (releaseError) {
    console.error(`${(mode || 'DEV').toUpperCase()} Unable to release lifecycle lock: ${releaseError.message}`)
  }
  process.exitCode = 1
})
