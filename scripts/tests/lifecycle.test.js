import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, copyFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Lifecycle } from '../lifecycle.js'

const sourceTheme = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
let fixtureEnginePath = 'core'
const lifecycleScripts = [
  'engine-paths.js',
  'prebuild-config.js',
  'lifecycle.js',
  'server-lifecycle.js',
  'local-server.js',
  'video-metadata.js',
  'video-metadata-watch.js'
]

function createFixture () {
  const fixture = mkdtempSync(path.join(tmpdir(), 'sansoul-lifecycle-'))
  const themeRoot = path.join(fixture, fixtureEnginePath)
  const scriptRoot = path.join(themeRoot, 'scripts')
  mkdirSync(path.join(themeRoot, 'prebuild'), { recursive: true })
  mkdirSync(path.join(scriptRoot), { recursive: true })

  // Keep the consumer wrapper independent of where this suite is installed.
  writeFileSync(path.join(fixture, 'do'), `#!/bin/sh\nexec sh "./${fixtureEnginePath}/do" "$@"\n`)
  chmodSync(path.join(fixture, 'do'), 0o755)
  copyFileSync(path.join(sourceTheme, 'do'), path.join(themeRoot, 'do'))
  for (const script of lifecycleScripts) {
    copyFileSync(path.join(sourceTheme, 'scripts', script), path.join(scriptRoot, script))
  }

  for (const directory of [
    'data',
    'content',
    `${fixtureEnginePath}/data`,
    `${fixtureEnginePath}/i18n`,
    `${fixtureEnginePath}/prebuild/layouts`,
    `${fixtureEnginePath}/layouts/partials/func`,
    'bin'
  ]) mkdirSync(path.join(fixture, directory), { recursive: true })

  for (const file of ['hugo.yml', 'hugo.default.yml', 'hugo.local.yml']) {
    writeFileSync(path.join(themeRoot, file), 'baseURL: http://localhost/\n')
  }
  writeFileSync(path.join(fixture, 'hugo.yml'), 'baseURL: http://localhost/\n')
  writeFileSync(path.join(themeRoot, 'prebuild', 'hugo.yml'), 'baseURL: http://localhost/\n')
  writeFileSync(path.join(fixture, 'data', 'langs.yml'), 'langs: []\n')

  const hugo = `#!/bin/sh
printf '%s\\n' "$*" >> "$LIFECYCLE_LOG"
if [ "$1" = "version" ]; then
  exit 0
fi
destination=
previous=
for argument in "$@"; do
  if [ "$previous" = "--destination" ]; then destination=$argument; fi
  previous=$argument
done
if [ -n "$destination" ]; then
  if [ -n "$HUGO_PREBUILD_STARTED_FILE" ]; then
    printf 'started\\n' >> "$HUGO_PREBUILD_STARTED_FILE"
  fi
  if [ -n "$HUGO_PREBUILD_DELAY_FILE" ] && [ -f "$HUGO_PREBUILD_DELAY_FILE" ]; then
    sleep 0.5
  fi
  if [ -f "$SANSOUL_TEST_PROJECT/data/langs.yml" ] && grep -q '^broken:' "$SANSOUL_TEST_PROJECT/data/langs.yml"; then
    exit 19
  fi
  mkdir -p "$destination"
  printf 'generated: true\\n' > "$destination/hugo.prebuild.yml"
  exit "\${HUGO_PREBUILD_EXIT:-0}"
fi
mkdir -p public resources "$SANSOUL_TEST_ENGINE_PATH/prebuild/public"
printf 'generated\\n' > public/generated.txt
touch resources/generated.txt .hugo_build.lock
if [ -n "$HUGO_GRANDCHILD_FILE" ]; then
  (
    trap '' INT TERM
    while :; do
      printf 'x' >> "$HUGO_GRANDCHILD_FILE"
      sleep 0.02
    done
  ) &
fi
if [ -n "$HUGO_SERVER_EXIT_FILE" ]; then
  while [ ! -f "$HUGO_SERVER_EXIT_FILE" ] || [ "$(wc -l < "$HUGO_PREBUILD_STARTED_FILE" 2>/dev/null || echo 0)" -lt 2 ]; do
    sleep 0.02
  done
  exit 2
fi
if [ -n "$HUGO_EXIT" ]; then exit "$HUGO_EXIT"; fi
trap 'exit 0' INT TERM
while :; do sleep 1; done
`
  writeFileSync(path.join(fixture, 'bin', 'hugo'), hugo)
  chmodSync(path.join(fixture, 'bin', 'hugo'), 0o755)

  return fixture
}

function environment (fixture, extra = {}) {
  const fixtureBin = path.join(fixture, 'bin')
  const cleanEnvironment = { ...process.env }
  delete cleanEnvironment.SANSOUL_LIFECYCLE_TOKEN
  return {
    ...cleanEnvironment,
    ...extra,
    PATH: `${fixtureBin}:${process.env.PATH}`,
    LIFECYCLE_LOG: path.join(fixture, 'lifecycle.log'),
    SANSOUL_TEST_PROJECT: fixture,
    SANSOUL_TEST_ENGINE_PATH: fixtureEnginePath
  }
}

function output (fixture) {
  try {
    return readFileSync(path.join(fixture, 'lifecycle.log'), 'utf8')
  } catch {
    return ''
  }
}

function countLines (fixture, pattern) {
  return output(fixture).split('\n').filter(line => pattern.test(line)).length
}

function waitFor (condition, message) {
  const deadline = Date.now() + 5000
  return new Promise((resolve, reject) => {
    const check = () => {
      if (condition()) return resolve()
      if (Date.now() > deadline) return reject(new Error(`Timed out waiting for ${message}`))
      setTimeout(check, 25)
    }
    check()
  })
}

function waitForExit (child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode })
  }
  return new Promise(resolve => {
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
}

function spawnLifecycle (fixture, mode, args = [], extra = {}) {
  const script = mode === 'live' ? 'local-server.js' : 'server-lifecycle.js'
  const scriptArgs = mode === 'live' ? args : [mode, ...args]
  const child = spawn(process.execPath, [path.join(fixture, `${fixtureEnginePath}/scripts`, script), ...scriptArgs], {
    cwd: fixture,
    env: environment(fixture, extra),
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.testOutput = ''
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', chunk => { child.testOutput += chunk.toString() })
  }
  return child
}

async function stop (child, signal = 'SIGTERM') {
  if (child.exitCode !== null || child.signalCode !== null) return waitForExit(child)
  child.kill(signal)
  return waitForExit(child)
}

async function runAlias (fixture, alias, args, extra) {
  const child = spawn('sh', ['do', alias, ...args], {
    cwd: fixture,
    env: environment(fixture, extra),
    stdio: 'ignore'
  })
  return waitForExit(child)
}

function assertClean (fixture) {
  for (const relativePath of generatedFixturePaths()) {
    assert.equal(existsSync(path.join(fixture, relativePath)), false, relativePath)
  }
}

const generatedFixturePaths = () => [
  'public',
  'resources',
  '.hugo_build.lock',
  '.sansoul-dev.lock',
  `${fixtureEnginePath}/prebuild/public`
]

function isClean (fixture) {
  return generatedFixturePaths().every(relativePath => !existsSync(path.join(fixture, relativePath)))
}

async function testSignalCleanup (mode, signal = 'SIGTERM') {
  const fixture = createFixture()
  let child
  try {
    child = spawnLifecycle(fixture, mode, ['--port', mode === 'dev' ? '1313' : '1414'])
    const serverStart = mode === 'dev' ? 'server --disableFastRender --config' : 'server --config'
    await waitFor(() => output(fixture).includes(serverStart), `${mode} Hugo start`).catch(error => { throw new Error(`${error.message}\n${child.testOutput}`) })
    assert.equal(existsSync(path.join(fixture, '.sansoul-dev.lock')), true)
    const result = await stop(child, signal)
    assert.equal(result.code, mode === 'dev' ? (signal === 'SIGHUP' ? 129 : 143) : 0)
    assert.match(output(fixture), mode === 'dev' ? /1313/ : /1414/)
    await waitFor(() => isClean(fixture), `${mode} generated output cleanup`)
    assertClean(fixture)
  } finally {
    if (child) await stop(child)
    rmSync(fixture, { recursive: true, force: true })
  }
}

async function testGrandchildCleanup (mode) {
  const fixture = createFixture()
  const grandchildFile = path.join(fixture, 'grandchild.log')
  let child
  try {
    child = spawnLifecycle(fixture, mode, [], { HUGO_GRANDCHILD_FILE: grandchildFile })
    const serverStart = mode === 'dev' ? 'server --disableFastRender' : 'server --config'
    await waitFor(() => output(fixture).includes(serverStart) && existsSync(grandchildFile), `${mode} server with grandchild`)
    const result = await stop(child)
    assert.equal(result.code, mode === 'dev' ? 143 : 0)
    await waitFor(() => isClean(fixture), 'grandchild generated output cleanup')
    const sizeAfterStop = readFileSync(grandchildFile, 'utf8').length
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(readFileSync(grandchildFile, 'utf8').length, sizeAfterStop)
  } finally {
    if (child) await stop(child)
    rmSync(fixture, { recursive: true, force: true })
  }
}

async function testInitialFailure () {
  const fixture = createFixture()
  try {
    const result = await runAlias(fixture, 'dev', ['--port', '1515'], { HUGO_PREBUILD_EXIT: '23' })
    assert.equal(result.code, 23)
    assert.equal(output(fixture).includes('server --disableFastRender'), false)
    assertClean(fixture)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}

async function testLiveInitialFailure () {
  const fixture = createFixture()
  try {
    const result = await runAlias(fixture, 'live', [], { HUGO_PREBUILD_EXIT: '19' })
    assert.equal(result.code, 19)
    assertClean(fixture)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}

async function testChildFailure (alias) {
  const fixture = createFixture()
  try {
    const result = await runAlias(fixture, alias, ['--port', alias === 'server' ? '1616' : '1717'], { HUGO_EXIT: '17' })
    assert.equal(result.code, 17)
    assert.match(output(fixture), alias === 'server' ? /1616/ : /1717/)
    assertClean(fixture)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}

async function testSuccessfulRefreshRestart () {
  const fixture = createFixture()
  let child
  try {
    child = spawnLifecycle(fixture, 'live')
    await waitFor(() => countLines(fixture, /^server --config/) === 1, 'initial live server')
    writeFileSync(path.join(fixture, 'data', 'langs.yml'), 'langs: [updated]\n')
    try {
      await waitFor(() => countLines(fixture, /^server --config/) >= 2, 'live server restart after prebuild')
    } catch (error) {
      throw new Error(`${error.message}\n${child.testOutput}`)
    }
    assert.equal(child.exitCode, null)
  } finally {
    if (child) await stop(child)
    assertClean(fixture)
    rmSync(fixture, { recursive: true, force: true })
  }
}

async function testRecoveryAfterRefreshFailure () {
  const fixture = createFixture()
  const startedFile = path.join(fixture, 'prebuild-started.log')
  const delayFile = path.join(fixture, 'prebuild-delay')
  const serverExitFile = path.join(fixture, 'server-exit')
  let child
  try {
    writeFileSync(delayFile, '')
    child = spawnLifecycle(fixture, 'live', [], {
      HUGO_PREBUILD_STARTED_FILE: startedFile,
      HUGO_PREBUILD_DELAY_FILE: delayFile,
      HUGO_SERVER_EXIT_FILE: serverExitFile
    })
    await waitFor(() => countLines(fixture, /^server --config/) === 1, 'initial live server')

    writeFileSync(path.join(fixture, 'data', 'langs.yml'), 'broken: [\n')
    writeFileSync(serverExitFile, '')
    await waitFor(() => countLines(fixture, /^--destination/) >= 2, 'refresh prebuild start')
    await new Promise(resolve => setTimeout(resolve, 650))
    assert.equal(child.exitCode, null)
    assert.equal(countLines(fixture, /^--destination/) >= 2, true)

    rmSync(serverExitFile)
    writeFileSync(path.join(fixture, 'data', 'langs.yml'), 'langs: [restored]\n')
    await waitFor(() => countLines(fixture, /^server --config/) >= 2, 'live recovery after valid refresh')
    assert.equal(child.exitCode, null)
  } finally {
    if (child) await stop(child)
    assertClean(fixture)
    rmSync(fixture, { recursive: true, force: true })
  }
}

async function testConcurrentRefusal () {
  const fixture = createFixture()
  let first
  try {
    first = spawnLifecycle(fixture, 'dev')
    await waitFor(() => output(fixture).includes('server --disableFastRender'), 'first dev server')
    const build = spawn('sh', ['do', 'prebuild'], {
      cwd: fixture,
      env: environment(fixture),
      stdio: 'ignore'
    })
    const buildResult = await waitForExit(build)
    assert.equal(buildResult.code, 1)
    const second = spawnLifecycle(fixture, 'live')
    const secondResult = await waitForExit(second)
    assert.equal(secondResult.code, 1)
    const firstResult = await stop(first)
    assert.equal(firstResult.code, 143)
    await waitFor(() => isClean(fixture), 'concurrent dev generated output cleanup')
    assertClean(fixture)
  } finally {
    if (first) await stop(first)
    rmSync(fixture, { recursive: true, force: true })
  }
}

async function testVideoRefreshWithoutRestart (mode) {
  const fixture = createFixture()
  const probe = path.join(fixture, 'bin', 'ffprobe')
  const cache = path.join(fixture, 'data', 'video_metadata.json')
  mkdirSync(path.join(fixture, 'uploads'))
  writeFileSync(probe, `#!/bin/sh
for argument in "$@"; do filename=$argument; done
width=$(cat "$filename")
printf '{"streams":[{"codec_type":"video","width":%s,"height":100}]}\\n' "$width"
`)
  chmodSync(probe, 0o755)
  let child
  const width = () => {
    try { return JSON.parse(readFileSync(cache, 'utf8')).entries['/u/sample.mp4']?.metadata?.width } catch { return undefined }
  }
  try {
    child = spawnLifecycle(fixture, mode, [], { FFPROBE_BIN: probe })
    await waitFor(() => countLines(fixture, /^server /) === 1, `${mode} initial server`)
    writeFileSync(path.join(fixture, 'uploads', 'sample.mp4'), '200')
    writeFileSync(path.join(fixture, 'content', 'video.es.md'), 'video: /u/sample.mp4\n')
    await waitFor(() => width() === 200, `${mode} new video metadata`)
    writeFileSync(path.join(fixture, 'uploads', 'sample.mp4'), '300')
    await waitFor(() => width() === 300, `${mode} modified video metadata`)
    assert.equal(countLines(fixture, /^server /), 1)
    assert.equal(countLines(fixture, /^--destination/), 1)
    assert.equal(child.exitCode, null)
    const result = await stop(child)
    assert.equal(result.code, mode === 'dev' ? 143 : 0)
    assertClean(fixture)
    assert.equal(width(), 300)
  } finally {
    if (child) await stop(child)
    rmSync(fixture, { recursive: true, force: true })
  }
}

function testSymlinkSafety () {
  const fixture = mkdtempSync(path.join(tmpdir(), 'sansoul-lifecycle-symlink-'))
  try {
    const generatedParent = path.join(fixture, fixtureEnginePath, 'prebuild')
    const external = path.join(fixture, 'outside')
    mkdirSync(generatedParent, { recursive: true })
    writeFileSync(path.join(fixture, fixtureEnginePath, 'do'), '#!/bin/sh\n')
    mkdirSync(external, { recursive: true })
    writeFileSync(path.join(external, 'keep.txt'), 'keep\n')
    symlinkSync(external, path.join(generatedParent, 'public'), 'dir')

    const lifecycle = new Lifecycle({ projectDir: fixture, label: 'DEV' })
    const report = console.error
    console.error = () => {}
    try {
      lifecycle.acquire()
      assert.throws(
        () => lifecycle.removeGeneratedOutputs(),
        /Refusing to remove symlinked generated path/
      )
      lifecycle.release()
    } finally {
      console.error = report
    }

    assert.equal(existsSync(path.join(external, 'keep.txt')), true)
    assert.equal(existsSync(path.join(generatedParent, 'public')), true)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}

function testStaleLockRefusal () {
  const fixture = mkdtempSync(path.join(tmpdir(), 'sansoul-lifecycle-stale-'))
  try {
    const lockPath = path.join(fixture, '.sansoul-dev.lock')
    mkdirSync(lockPath)
    writeFileSync(path.join(lockPath, 'owner'), JSON.stringify({
      version: 1,
      pid: Number.MAX_SAFE_INTEGER,
      token: 'stale-token',
      mode: 'DEV'
    }))

    const lifecycle = new Lifecycle({ projectDir: fixture, label: 'LIVE' })
    assert.throws(
      () => lifecycle.acquire(),
      /Stale SanSoul lifecycle lock/
    )
    assert.equal(existsSync(path.join(lockPath, 'owner')), true)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}

async function main () {
  for (const layout of ['core', 'themes/sansoul']) {
    fixtureEnginePath = layout
    await testSignalCleanup('dev')
    await testSignalCleanup('live')
    await testSignalCleanup('dev', 'SIGHUP')
    await testSignalCleanup('live', 'SIGHUP')
    await testGrandchildCleanup('dev')
    await testGrandchildCleanup('live')
    await testInitialFailure()
    await testLiveInitialFailure()
    await testChildFailure('server')
    await testChildFailure('local')
    await testSuccessfulRefreshRestart()
    await testRecoveryAfterRefreshFailure()
    await testConcurrentRefusal()
    await testVideoRefreshWithoutRestart('dev')
    await testVideoRefreshWithoutRestart('live')
    testSymlinkSafety()
    testStaleLockRefusal()
    console.log(`Lifecycle tests passed (${layout})`)
  }
}

main().catch(error => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
