/* Discover referenced videos from a consumer root; persist public metadata only. */
import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execute = promisify(execFile)
const localStats = new Map()
const extensions = /\.(?:mp4|webm|mov|avi)(?:[?#].*)?$/i
const youtubeApiVersion = 1

export function videoSource (value) {
  const source = String(value).replace(/&amp;/g, '&')
  if (/^https?:\/\//i.test(source)) {
    let url
    try { url = new URL(source) } catch { return null }
    const host = url.hostname.toLowerCase()
    const youtube = host === 'youtu.be' ? url.pathname.slice(1) : /^(?:www\.|m\.)?youtube(?:-nocookie)?\.com$/.test(host) ? (url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1]) : null
    if (youtube && /^[\w-]+$/.test(youtube)) return { key: `youtube:${youtube}`, provider: 'youtube', id: youtube, url: `https://www.youtube.com/watch?v=${youtube}` }
    const vimeo = /^(?:www\.|player\.)?vimeo\.com$/.test(host) && url.pathname.match(/^\/(?:video\/)?(\d+)(?:\/([\w-]+))?\/?$/)
    if (vimeo) {
      const hash = url.searchParams.get('h') || vimeo[2]
      return { key: `vimeo:${vimeo[1]}${hash ? `:${hash}` : ''}`, provider: 'vimeo', id: vimeo[1], url: `https://vimeo.com/${vimeo[1]}${hash ? `/${hash}` : ''}` }
    }
    return null // Never probe/download remote video files.
  }
  if (!extensions.test(source) || !source.startsWith('/u/')) return null
  let clean
  try { clean = decodeURIComponent(source.split(/[?#]/)[0]) } catch { return null }
  if (clean.split('/').some(segment => segment === '..' || segment === '.')) return null
  return { key: clean, provider: 'local', url: clean }
}

async function walk (directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  const files = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(filename))
    else if (/\.(?:md|ya?ml|json|toml)$/i.test(entry.name) && entry.name !== 'video_metadata.json') files.push(filename)
  }
  return files
}

export async function discoverVideos (projectRoot) {
  const videos = new Map()
  for (const directory of ['content', 'data']) {
    for (const filename of await walk(path.join(projectRoot, directory))) {
      const text = await fs.readFile(filename, 'utf8')
      // Scan authored scalar values and Markdown URLs without parsing/reformatting content.
      for (const match of text.matchAll(/https?:\/\/[^\s<>"'\])}]+|\/u\/[^\s<>"'\])}]+/g)) {
        const source = videoSource(match[0])
        if (source) {
          const previous = videos.get(source.key)
          source.needsPoster = source.provider === 'local' && (!/[#&?]poster=/i.test(match[0]) || previous?.needsPoster)
          videos.set(source.key, source)
        }
      }
    }
  }
  return [...videos.values()].sort((a, b) => a.key.localeCompare(b.key))
}

function localVideoName (filename) {
  const name = path.basename(filename).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function positive (value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

export function durationISO (seconds) {
  return positive(seconds) ? `PT${Math.round(Number(seconds) * 1000) / 1000}S` : undefined
}

export function probeMetadata (probe) {
  const stream = probe.streams?.find(item => item.codec_type === 'video' && !item.disposition?.attached_pic) || {}
  let width = positive(stream.width)
  let height = positive(stream.height)
  const rotation = Number(stream.side_data_list?.find(item => item.rotation !== undefined)?.rotation || stream.tags?.rotate || 0)
  if (Math.abs(rotation) % 180 === 90) [width, height] = [height, width]
  const sample = String(stream.sample_aspect_ratio || '1:1').split(':').map(Number)
  let ratio = width && height ? width / height : undefined
  if (ratio && sample[0] > 0 && sample[1] > 0) ratio *= Math.abs(rotation) % 180 === 90 ? sample[1] / sample[0] : sample[0] / sample[1]
  const tags = { ...probe.format?.tags, ...stream.tags }
  const created = tags.creation_time && Date.parse(tags.creation_time)
  return compact({ width, height, ratio, duration: durationISO(stream.duration || probe.format?.duration), description: tags.description || tags.comment, dateCreated: Number.isFinite(created) ? new Date(created).toISOString() : undefined })
}

function compact (object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== ''))
}

async function externalMetadata (source, fetchImpl, apiKey, signal) {
  const request = async url => {
    const timeout = AbortSignal.timeout(8000)
    const response = await fetchImpl(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, headers: { Accept: 'application/json' }, redirect: 'error' })
    if (!response.ok) throw new Error(`metadata endpoint returned HTTP ${response.status}`)
    const text = await response.text()
    if (text.length > 1024 * 1024) throw new Error('metadata response is too large')
    return JSON.parse(text)
  }
  const endpoint = source.provider === 'vimeo' ? 'https://vimeo.com/api/oembed.json' : 'https://www.youtube.com/oembed'
  const info = await request(`${endpoint}?url=${encodeURIComponent(source.url)}&format=json`)
  const metadata = compact({ name: info.title, thumbnailUrl: info.thumbnail_url, provider: info.provider_name, author: info.author_name })
  if (source.provider === 'vimeo') {
    // Vimeo exposes display dimensions. YouTube oEmbed dimensions describe the
    // requested player box, not the source video, and must not become intrinsic size.
    Object.assign(metadata, compact({ width: positive(info.width), height: positive(info.height), ratio: positive(info.width) && positive(info.height) ? info.width / info.height : undefined, duration: durationISO(info.duration), description: info.description, uploadDate: info.upload_date && Number.isFinite(Date.parse(info.upload_date)) ? new Date(info.upload_date).toISOString() : undefined }))
  } else if (apiKey) {
    const data = await request(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,player&maxWidth=8192&maxHeight=8192&id=${encodeURIComponent(source.id)}&key=${encodeURIComponent(apiKey)}`)
    const video = data.items?.[0]
    if (video) {
      // These public dimensions describe the scaled player, not the encoded
      // video. YouTube returns both only when it knows the video's display
      // aspect ratio. Never infer a ratio from embedHtml's unknown-ratio 4:3 box.
      const width = positive(video.player?.embedWidth)
      const height = positive(video.player?.embedHeight)
      Object.assign(metadata, compact({ name: video.snippet?.title, description: video.snippet?.description, uploadDate: video.snippet?.publishedAt, duration: video.contentDetails?.duration, ratio: width && height ? width / height : undefined }))
    }
  }
  return metadata
}

// Only local, referenced files reach this helper. Generated JPEGs are public,
// versionable source assets, unlike disposable resources/ optimization stats.
async function localPoster ({ root, localFile, fingerprint, ffmpeg, signal, logger, warnings }) {
  const uploads = await fs.realpath(path.join(root, 'uploads'))
  const stem = localFile.replace(/\.[^.]+$/, '')
  for (const extension of ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg']) {
    const sibling = `${stem}.${extension}`
    const resolved = await fs.realpath(sibling).catch(() => null)
    if (resolved?.startsWith(`${uploads}${path.sep}`) && (await fs.stat(resolved)).isFile()) return undefined
  }
  const directory = path.join(root, 'uploads/video-posters')
  let temporary
  try {
    await fs.mkdir(directory, { recursive: true })
    const resolved = await fs.realpath(directory)
    if (!resolved.startsWith(`${uploads}${path.sep}`)) throw new Error('poster directory is outside uploads')
    const name = `${fingerprint}-first-frame-v1.jpg`
    const filename = path.join(directory, name)
    const existing = await fs.lstat(filename).catch(() => null)
    if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw new Error('unsafe poster output')
    if (!existing?.size) {
      temporary = path.join(directory, `.${name}.${process.pid}.tmp.jpg`)
      const handle = await fs.open(temporary, 'wx')
      await handle.close()
      await execute(ffmpeg, ['-v', 'error', '-nostdin', '-protocol_whitelist', 'file,pipe', '-i', localFile, '-frames:v', '1', '-vf', "scale=w='min(1080,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease", '-q:v', '3', '-f', 'image2', '-y', temporary], { timeout: 20000, maxBuffer: 1024 * 1024, signal })
      signal?.throwIfAborted()
      if (!(await fs.stat(temporary)).size) throw new Error('empty first frame')
      await fs.rename(temporary, filename)
    }
    return `/u/video-posters/${name}`
  } catch (error) {
    signal?.throwIfAborted()
    const warning = `Video poster: /u/${path.relative(uploads, localFile)}: first frame unavailable (FFmpeg/file/access); supply img, #poster or a sibling image.`
    warnings.push(warning)
    logger?.(warning)
  } finally {
    if (temporary) await fs.rm(temporary, { force: true })
  }
}

export async function refreshVideoMetadata ({ projectRoot = process.cwd(), force = false, fetchImpl = globalThis.fetch, ffprobe = process.env.FFPROBE_BIN || 'ffprobe', ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg', apiKey = process.env.YOUTUBE_API_KEY, probe = undefined, logger = console.warn, signal, now = Date.now() } = {}) {
  signal?.throwIfAborted()
  const root = path.resolve(projectRoot)
  const filename = path.join(root, 'data/video_metadata.json')
  const statFilename = path.join(root, 'resources/_gen/video-metadata/stats.json')
  let persistedStats = {}
  try { persistedStats = JSON.parse(await fs.readFile(statFilename, 'utf8')) } catch { /* Generated optimization cache is disposable. */ }
  let cache = { version: 1, entries: {} }
  try {
    cache = JSON.parse(await fs.readFile(filename, 'utf8'))
    if (cache.version !== 1 || !cache.entries || Array.isArray(cache.entries) || typeof cache.entries !== 'object') throw new Error('unsupported video metadata cache')
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Cannot read ${filename}: ${error.message}`)
  }
  const before = JSON.stringify(cache)
  const sources = await discoverVideos(root)
  const warnings = []
  for (const source of sources) {
    signal?.throwIfAborted()
    const previous = cache.entries[source.key]
    let fingerprint = source.key
    try {
      let localFile
      if (source.provider === 'local') {
        localFile = path.join(root, 'uploads', source.url.slice(3))
        const uploads = await fs.realpath(path.join(root, 'uploads'))
        const resolved = await fs.realpath(localFile)
        if (!resolved.startsWith(`${uploads}${path.sep}`)) throw new Error('video path is outside uploads')
        const stat = await fs.stat(resolved)
        const signature = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`
        const memo = localStats.get(resolved) || persistedStats[source.key]
        if (memo?.signature === signature) fingerprint = memo.hash
        else {
          const hash = createHash('sha256')
          for await (const chunk of createReadStream(resolved, { signal })) hash.update(chunk)
          fingerprint = hash.digest('hex')
        }
        localStats.set(resolved, { signature, hash: fingerprint })
        persistedStats[source.key] = { signature, hash: fingerprint }
        const poster = source.needsPoster ? await localPoster({ root, localFile: resolved, fingerprint, ffmpeg, signal, logger, warnings }) : undefined
        source.poster = poster
        if (!force && previous?.fingerprint === fingerprint) {
          const metadata = { ...previous.metadata, name: localVideoName(source.url) }
          if (poster) metadata.thumbnailUrl = poster
          cache.entries[source.key] = { ...previous, metadata }
          continue
        }
      } else {
        const retryPending = previous?.retryAfter && Date.parse(previous.retryAfter) > now
        const needsYoutubeApi = source.provider === 'youtube' && apiKey && previous?.youtubeApiVersion !== youtubeApiVersion
        if (!force && previous?.fingerprint === fingerprint && (!needsYoutubeApi || retryPending) && (!previous.retryAfter || retryPending)) continue
      }
      let metadata
      if (source.provider === 'local') {
        const result = probe ? await probe(localFile) : JSON.parse((await execute(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_format', '-show_streams', '-of', 'json', localFile], { timeout: 15000, maxBuffer: 1024 * 1024, signal })).stdout)
        metadata = compact({ ...probeMetadata(result), name: localVideoName(source.url), thumbnailUrl: source.poster })
      } else metadata = await externalMetadata(source, fetchImpl, apiKey, signal)
      cache.entries[source.key] = { ...previous, fingerprint, metadata }
      if (source.provider === 'youtube') cache.entries[source.key].fetchedAt = new Date(now).toISOString()
      if (source.provider === 'youtube' && apiKey) cache.entries[source.key].youtubeApiVersion = youtubeApiVersion
      delete cache.entries[source.key].retryAfter
    } catch (error) {
      signal?.throwIfAborted()
      // Never log endpoint URLs/errors containing environment credentials.
      const reason = error.code === 'ENOENT' ? (source.provider === 'local' ? 'file or FFprobe unavailable' : 'metadata unavailable') : source.provider === 'local' ? 'FFprobe could not inspect this file' : 'provider metadata unavailable (network/API/access)'
      const warning = `Video metadata: ${source.key}: ${reason}; keeping cached/manual values.`
      warnings.push(warning)
      logger?.(warning)
      if (source.provider === 'local' && source.poster) cache.entries[source.key] = { ...previous, metadata: { ...previous?.metadata, name: localVideoName(source.url), thumbnailUrl: source.poster } }
      if (source.provider !== 'local') cache.entries[source.key] = { ...previous, fingerprint, metadata: previous?.metadata || {}, retryAfter: new Date(now + 86400000).toISOString() }
    }
  }
  const changed = JSON.stringify(cache) !== before
  signal?.throwIfAborted()
  if (changed) {
    cache.entries = Object.fromEntries(Object.entries(cache.entries).sort(([a], [b]) => a.localeCompare(b)))
    await fs.mkdir(path.dirname(filename), { recursive: true })
    const temporary = `${filename}.${process.pid}.tmp`
    try {
      await fs.writeFile(temporary, `${JSON.stringify(cache, null, 2)}\n`)
      await fs.rename(temporary, filename)
    } finally { await fs.rm(temporary, { force: true }) }
  }
  if (sources.some(source => source.provider === 'local')) {
    await fs.mkdir(path.dirname(statFilename), { recursive: true })
    const value = `${JSON.stringify(persistedStats)}\n`
    if (value !== await fs.readFile(statFilename, 'utf8').catch(() => '')) await fs.writeFile(statFilename, value)
  }
  return { changed, sources: sources.map(source => source.key), warnings }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  refreshVideoMetadata({ force: process.argv.includes('--refresh') }).then(result => console.log(`Video metadata: ${result.sources.length} referenced, ${result.changed ? 'cache updated' : 'unchanged'}.`)).catch(error => { console.error(error.message); process.exitCode = 1 })
}
