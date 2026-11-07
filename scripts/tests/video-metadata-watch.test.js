import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { startVideoMetadataWatch } from '../video-metadata-watch.js'
import { refreshVideoMetadata } from '../video-metadata.js'

function notifications () {
  const listeners = new Set()
  return {
    emit (value) { for (const listener of listeners) listener(value) },
    next (matches = () => true) {
      return new Promise((resolve, reject) => {
        const listener = value => {
          if (!matches(value)) return
          clearTimeout(timer)
          listeners.delete(listener)
          resolve(value)
        }
        const timer = setTimeout(() => {
          listeners.delete(listener)
          reject(new Error('Timed out waiting for metadata refresh'))
        }, 5000)
        listeners.add(listener)
      })
    }
  }
}

test('video watcher discovers missing directories and refreshes referenced modified local videos', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'sansoul-video-watch-'))
  const changes = notifications()
  const failures = []
  let probes = 0
  const watcher = startVideoMetadataWatch({
    projectRoot,
    debounceMs: 20,
    onError: error => failures.push(error),
    refresh: async options => {
      const result = await refreshVideoMetadata({
        ...options,
        probe: async filename => {
          probes++
          const width = Number(await readFile(filename, 'utf8'))
          return { streams: [{ codec_type: 'video', width, height: 100 }] }
        }
      })
      changes.emit(result)
      return result
    }
  })
  try {
    await changes.next(result => result.sources.length === 0)
    const added = changes.next(result => result.changed && result.sources.includes('/u/nested/sample.mp4'))
    await mkdir(path.join(projectRoot, 'uploads/nested'), { recursive: true })
    await mkdir(path.join(projectRoot, 'content/single'), { recursive: true })
    await writeFile(path.join(projectRoot, 'uploads/nested/sample.mp4'), '200')
    await writeFile(path.join(projectRoot, 'content/single/video.es.md'), 'video: /u/nested/sample.mp4\n')
    await added
    assert.equal(JSON.parse(await readFile(path.join(projectRoot, 'data/video_metadata.json'))).entries['/u/nested/sample.mp4'].metadata.width, 200)

    const modified = changes.next(result => result.changed)
    await writeFile(path.join(projectRoot, 'uploads/nested/sample.mp4'), '300')
    await modified
    assert.equal(JSON.parse(await readFile(path.join(projectRoot, 'data/video_metadata.json'))).entries['/u/nested/sample.mp4'].metadata.width, 300)
    assert.equal(probes, 2)
    assert.deepEqual(failures, [])
  } finally {
    await watcher.close()
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test('video watcher serializes refreshes and aborts in-flight work before close resolves', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'sansoul-video-watch-close-'))
  const changes = notifications()
  let active = 0
  let maximum = 0
  let calls = 0
  let aborted = false
  let release
  await mkdir(path.join(projectRoot, 'content'))
  const watcher = startVideoMetadataWatch({
    projectRoot,
    debounceMs: 10,
    refresh: async ({ signal }) => {
      active++
      maximum = Math.max(maximum, active)
      calls++
      const call = calls
      changes.emit(call)
      try {
        await new Promise((resolve, reject) => {
          release = resolve
          signal.addEventListener('abort', () => {
            aborted = true
            reject(signal.reason)
          }, { once: true })
        })
      } finally { active-- }
    },
    onError: error => assert.fail(error.message)
  })
  try {
    await changes.next(value => value === 1)
    await writeFile(path.join(projectRoot, 'content/a.md'), 'first')
    await writeFile(path.join(projectRoot, 'content/b.md'), 'second')
    // Let the source event request a second run while the first is still active.
    const second = changes.next(value => value === 2)
    const firstRelease = release
    setTimeout(firstRelease, 40)
    await second
    assert.equal(maximum, 1)
    await watcher.close()
    assert.equal(aborted, true)
    assert.equal(active, 0)
    assert.equal(calls, 2)
  } finally {
    await watcher.close()
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test('video watcher surfaces refresh failures to its supervisor', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'sansoul-video-watch-error-'))
  const failures = notifications()
  const watcher = startVideoMetadataWatch({
    projectRoot,
    debounceMs: 10,
    refresh: async () => { throw new Error('invalid public metadata cache') },
    onError: error => failures.emit(error)
  })
  try {
    assert.match((await failures.next()).message, /invalid public metadata cache/)
  } finally {
    await watcher.close()
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test('video watcher ignores its own atomic metadata cache writes', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'sansoul-video-watch-cache-'))
  await mkdir(path.join(projectRoot, 'data'))
  const changes = notifications()
  let calls = 0
  const watcher = startVideoMetadataWatch({
    projectRoot,
    debounceMs: 10,
    refresh: async () => { changes.emit(++calls) }
  })
  try {
    await changes.next()
    await writeFile(path.join(projectRoot, 'data/video_metadata.json'), '{}')
    await writeFile(path.join(projectRoot, 'data/video_metadata.json.123.tmp'), '{}')
    // Observe several debounce windows: cache writes must not schedule a refresh.
    await new Promise(resolve => setTimeout(resolve, 80))
    assert.equal(calls, 1)
  } finally {
    await watcher.close()
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test('video watcher ignores delayed root renames but detects replaced and new directories', async () => {
  const { default: vm } = await import('node:vm')
  const source = (await readFile(new URL('../video-metadata-watch.js', import.meta.url), 'utf8'))
    .replace(/^import .+\n/gm, '').replace('export function ', 'function ')
  const root = path.resolve('/fixture')
  const identities = new Map([[path.join(root, 'data'), { dev: 1, ino: 10 }]])
  const watchers = []
  const timers = new Map()
  let timerId = 0
  let calls = 0
  const api = vm.runInNewContext(source + '\n;({ startVideoMetadataWatch })', {
    path,
    AbortController,
    refreshVideoMetadata: async () => {},
    statSync: filename => {
      if (identities.has(filename)) return identities.get(filename)
      throw Object.assign(new Error('Missing directory'), { code: 'ENOENT' })
    },
    watch: (filename, options, callback) => {
      const watcher = { filename, callback: callback || options, closed: false, on () {}, close () { this.closed = true } }
      watchers.push(watcher)
      return watcher
    },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId },
    clearTimeout: id => timers.delete(id)
  })
  const watcher = api.startVideoMetadataWatch({ projectRoot: root, refresh: async () => { calls++ } })
  async function flush () {
    const queued = [...timers.values()]
    timers.clear()
    queued.forEach(callback => callback())
    // Let the refresh promise and its finally handler settle.
    for (let i = 0; i < 8; i++) await Promise.resolve()
  }
  try {
    await flush()
    assert.equal(calls, 1)
    const rootWatcher = watchers[0]
    const original = watchers[1]
    rootWatcher.callback('rename', 'data')
    assert.equal(timers.size, 0)
    assert.equal(watchers.length, 2)
    assert.equal(original.closed, false)

    identities.set(path.join(root, 'data'), { dev: 1, ino: 11 })
    rootWatcher.callback('rename', 'data')
    assert.equal(original.closed, true)
    assert.equal(watchers.length, 3)
    await flush()
    assert.equal(calls, 2)

    identities.set(path.join(root, 'uploads'), { dev: 1, ino: 12 })
    rootWatcher.callback('rename', 'uploads')
    assert.equal(watchers.length, 4)
    await flush()
    assert.equal(calls, 3)
    rootWatcher.callback('rename', 'uploads')
    assert.equal(timers.size, 0)

    const originalUploads = watchers[3]
    identities.delete(path.join(root, 'uploads'))
    rootWatcher.callback('rename', 'uploads')
    assert.equal(originalUploads.closed, true)
    await flush()
    assert.equal(calls, 4)

    identities.set(path.join(root, 'uploads'), { dev: 1, ino: 13 })
    rootWatcher.callback('rename', 'uploads')
    assert.equal(watchers.length, 5)
    assert.equal(watchers[4].filename, path.join(root, 'uploads'))
    assert.equal(watchers[4].closed, false)
    await flush()
    assert.equal(calls, 5)
  } finally {
    await watcher.close()
    assert.ok(watchers.every(item => item.closed))
  }
})
