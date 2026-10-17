import { existsSync, watch } from 'node:fs'
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
    if (replace) {
      directories.get(directory)?.close()
      directories.delete(directory)
    }
    if (directories.has(directory) || !existsSync(path.join(root, directory))) return
    try {
      const watcher = watch(path.join(root, directory), { recursive: true }, (event, filename) => {
        if (relevant(directory, filename, event)) schedule()
      })
      watcher.on('error', fail)
      directories.set(directory, watcher)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }

  try {
    rootWatcher = watch(root, (event, filename) => {
      if (event !== 'rename') return
      const directory = filename?.toString()
      if (!['content', 'data', 'uploads'].includes(directory)) return
      try { attach(directory, event === 'rename') } catch (error) { fail(error) }
      schedule()
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
