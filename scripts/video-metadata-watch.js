import { statSync, watch } from 'node:fs'
import path from 'node:path'
import { refreshVideoMetadata } from './video-metadata.js'

// Update Hugo's watched data cache without restarting its server. The root
// watcher only discovers missing/replaced source directories; it is not recursive.
export function startVideoMetadataWatch ({
  projectRoot = process.cwd(),
  refresh = refreshVideoMetadata,
  debounceMs = 200,
  onError = error => console.error(`Video metadata watcher: ${error.message}`)
} = {}) {
  const root = path.resolve(projectRoot)
  const directories = new Map()
  const directoryIdentities = new Map()
  const controller = new AbortController()
  let timer
  let running
  let pending = false
  let closed = false
  let rootWatcher

  function fail (error) {
    if (!closed) onError(error)
  }

  function schedule () {
    if (closed) return
    pending = true
    clearTimeout(timer)
    timer = setTimeout(run, debounceMs)
  }

  function run () {
    timer = undefined
    if (closed || running || !pending) return
    pending = false
    running = Promise.resolve().then(() => refresh({ projectRoot: root, signal: controller.signal }))
      .catch(fail)
      .finally(() => {
        running = undefined
        if (pending && !closed) schedule()
      })
  }

  function relevant (directory, filename, event) {
    const relative = filename?.toString().replaceAll('\\', '/') || ''
    if (directory === 'uploads' && /^video-posters(?:\/|$)/.test(relative)) return false
    if (directory === 'data' && /^video_metadata\.json(?:\.|$)/.test(relative)) return false
    if (!relative || event === 'rename') return true
    return directory === 'uploads'
      ? /\.(?:mp4|webm|mov|avi|m4v|jpg|jpeg|png|webp|gif|svg)$/i.test(relative)
      : /\.(?:md|ya?ml|json|toml)$/i.test(relative)
  }

  function attach (directory, replace = false) {
    const filename = path.join(root, directory)
    let identity
    try {
      const stat = statSync(filename)
      identity = `${stat.dev}:${stat.ino}`
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    if (directories.has(directory)) {
      // macOS can deliver a delayed rename for the directory already watched.
      if (!replace || directoryIdentities.get(directory) === identity) return false
      directories.get(directory).close()
      directories.delete(directory)
      directoryIdentities.delete(directory)
      if (!identity) return true
    }
    if (!identity) return false
    try {
      const watcher = watch(filename, { recursive: true }, (event, filename) => {
        if (relevant(directory, filename, event)) schedule()
      })
      watcher.on('error', fail)
      directories.set(directory, watcher)
      directoryIdentities.set(directory, identity)
      return true
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      return false
    }
  }

  try {
    rootWatcher = watch(root, (event, filename) => {
      if (event !== 'rename') return
      const directory = filename?.toString()
      if (!['content', 'data', 'uploads'].includes(directory)) return
      try {
        if (attach(directory, true)) schedule()
      } catch (error) { fail(error) }
    })
    rootWatcher.on('error', fail)
    for (const directory of ['content', 'data', 'uploads']) attach(directory)
    // Cover changes made between the startup prebuild and installing watchers.
    schedule()
  } catch (error) {
    closed = true
    rootWatcher?.close()
    for (const watcher of directories.values()) watcher.close()
    throw error
  }

  return {
    async close () {
      closed = true
      controller.abort()
      clearTimeout(timer)
      pending = false
      rootWatcher.close()
      for (const watcher of directories.values()) watcher.close()
      // An in-flight probe owns its child process until it settles. Wait before
      // lifecycle cleanup so no metadata/stat file can reappear after shutdown.
      await running
    }
  }
}
