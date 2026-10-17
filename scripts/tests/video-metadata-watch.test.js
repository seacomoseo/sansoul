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
