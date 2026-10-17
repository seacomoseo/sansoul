import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { refreshVideoMetadata, videoSource, probeMetadata, discoverVideos } from '../video-metadata.js'

async function fixture (t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-video-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'content'), { recursive: true })
  await fs.mkdir(path.join(root, 'uploads'), { recursive: true })
  return root
}

test('video normalization supports providers, variants and safe local paths', () => {
  assert.equal(videoSource('https://youtu.be/abc?t=5').key, 'youtube:abc')
  assert.equal(videoSource('https://www.youtube.com/shorts/abc').key, 'youtube:abc')
  assert.equal(videoSource('https://www.youtube.com/embed/abc?start=12').key, 'youtube:abc')
  assert.equal(videoSource('https://www.youtube-nocookie.com/embed/abc').key, 'youtube:abc')
  assert.equal(videoSource('https://player.vimeo.com/video/123?h=secret').key, 'vimeo:123:secret')
  assert.equal(videoSource('/u/video.mp4#mute').key, '/u/video.mp4')
  for (const unsafe of ['https://evil.example/youtube.com/watch?v=x', 'https://example.com/a.mp4', '/u/../x.mp4', '/u/%2e%2e/x.mp4']) assert.equal(videoSource(unsafe), null)
  const metadata = probeMetadata({ streams: [{ codec_type: 'video', width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] }], format: { duration: '3.125', tags: { creation_time: '2025-01-01T00:00:00Z' } } })
  assert.equal(metadata.width, 1080)
  assert.equal(metadata.height, 1920)
  assert.equal(metadata.ratio, 1080 / 1920)
  assert.equal(metadata.duration, 'PT3.125S')
  assert.equal(metadata.dateCreated, '2025-01-01T00:00:00.000Z')
  assert.equal(metadata.uploadDate, undefined)
})

test('local cache avoids reprobing, writes only changes, refreshes changed content and preserves on failure', async t => {
  const root = await fixture(t)
  await fs.writeFile(path.join(root, 'content/a.md'), 'vid: /u/demo.mp4\nunused: /u/missing.mp4')
  await fs.writeFile(path.join(root, 'uploads/demo.mp4'), 'first')
  let calls = 0
  const probe = async () => { calls++; return { streams: [{ codec_type: 'video', width: 320, height: 240 }], format: calls === 1 ? { duration: '2', tags: { title: 'Previous video title' } } : {} } }
  const run = opts => refreshVideoMetadata({ projectRoot: root, probe, logger: null, ...opts })
  assert.equal((await run()).changed, true)
  const file = path.join(root, 'data/video_metadata.json')
  const authored = JSON.parse(await fs.readFile(file, 'utf8'))
  authored.entries['/u/demo.mp4'].overrides = { name: 'Manual name', uploadDate: '2025-02-01' }
  await fs.writeFile(file, `${JSON.stringify(authored, null, 2)}\n`)
  const initial = await fs.readFile(file, 'utf8')
  const stat = await fs.stat(file)
  assert.equal((await run()).changed, false)
  assert.equal(calls, 1)
  assert.equal((await fs.stat(file)).mtimeMs, stat.mtimeMs)
  await fs.writeFile(path.join(root, 'uploads/demo.mp4'), 'second content')
  assert.equal((await run()).changed, true)
  assert.equal(calls, 2)
  const latest = await fs.readFile(file, 'utf8')
  assert.notEqual(latest, initial)
  const replaced = JSON.parse(latest).entries['/u/demo.mp4']
  assert.equal(replaced.metadata.name, 'Demo')
  assert.equal(replaced.metadata.duration, undefined)
  assert.deepEqual(replaced.overrides, authored.entries['/u/demo.mp4'].overrides)
  assert.equal((await run({ force: true, probe: async () => { throw new Error('no ffprobe') } })).changed, false)
  assert.equal(await fs.readFile(file, 'utf8'), latest)
  await run({ force: true })
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')).entries['/u/demo.mp4'].overrides, replaced.overrides)
})

test('external cache avoids requests; YouTube embed size is never represented as source size', async t => {
  const root = await fixture(t)
  await fs.writeFile(path.join(root, 'content/a.md'), 'vid: https://youtu.be/abc\nvid: https://vimeo.com/123')
  let calls = 0
  const fetchImpl = async url => {
    calls++
    assert.ok(!url.includes('evil'))
    return { ok: true, text: async () => JSON.stringify(url.startsWith('https://vimeo') ? { width: 720, height: 1280, duration: 12, title: 'Portrait' } : { width: 200, height: 113, title: 'YouTube', thumbnail_url: 'https://i.ytimg.com/a.jpg' }) }
  }
  const run = opts => refreshVideoMetadata({ projectRoot: root, fetchImpl, logger: null, ...opts })
  await run()
  assert.equal(calls, 2)
  await run()
  assert.equal(calls, 2)
  const entries = JSON.parse(await fs.readFile(path.join(root, 'data/video_metadata.json'))).entries
  assert.equal(entries['youtube:abc'].metadata.width, undefined)
  assert.equal(entries['youtube:abc'].metadata.duration, undefined)
  assert.equal(entries['vimeo:123'].metadata.ratio, 720 / 1280)
  assert.equal(entries['vimeo:123'].metadata.duration, 'PT12S')
  entries['youtube:abc'].overrides = { name: 'Manual external title' }
  await fs.writeFile(path.join(root, 'data/video_metadata.json'), JSON.stringify({ version: 1, entries }))
  await run({ force: true, fetchImpl: async () => { throw new Error('key=PRIVATE') } })
  assert.ok(!(await fs.readFile(path.join(root, 'data/video_metadata.json'), 'utf8')).includes('PRIVATE'))
  await run({ force: true, fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify({ title: 'Replacement external title' }) }) })
  const refreshed = JSON.parse(await fs.readFile(path.join(root, 'data/video_metadata.json'), 'utf8')).entries
  assert.equal(refreshed['youtube:abc'].metadata.thumbnailUrl, undefined)
  assert.equal(refreshed['vimeo:123'].metadata.duration, undefined)
  assert.equal(refreshed['vimeo:123'].metadata.width, undefined)
  assert.equal(refreshed['youtube:abc'].metadata.name, 'Replacement external title')
  assert.deepEqual(refreshed['youtube:abc'].overrides, entries['youtube:abc'].overrides)
  assert.equal(refreshed['youtube:abc'].retryAfter, undefined)
  assert.equal((await discoverVideos(root)).length, 2)
})

test('real FFprobe reads a generated local video and does not infer an upload date', async t => {
  if (spawnSync('ffmpeg', ['-version']).status !== 0 || spawnSync('ffprobe', ['-version']).status !== 0) return t.skip('FFmpeg/FFprobe optional when a valid cache is committed')
  const root = await fixture(t)
  const video = path.join(root, 'uploads/demo.mp4')
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x120:d=0.4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video], { encoding: 'utf8' })
  assert.equal(generated.status, 0, generated.stderr)
  await fs.writeFile(path.join(root, 'content/a.md'), 'vid: /u/demo.mp4')
  const result = await refreshVideoMetadata({ projectRoot: root, logger: null })
  assert.deepEqual(result.warnings, [])
  const metadata = JSON.parse(await fs.readFile(path.join(root, 'data/video_metadata.json'))).entries['/u/demo.mp4'].metadata
  assert.equal(metadata.width, 160)
  assert.equal(metadata.height, 120)
  assert.equal(metadata.duration, 'PT0.4S')
  assert.equal(metadata.uploadDate, undefined)
})

test('real Hugo resolves decoded local cache keys for encoded paths without changing literal plus signs', async t => {
  if (spawnSync('hugo', ['version']).status !== 0) return t.skip('Hugo unavailable')
  const root = await fixture(t)
  const sources = [
    '/u/clip%20demo.mp4?download=1#mute',
    '/u/caf%C3%A9.mp4',
    '/u/clip+demo.mp4',
    '/u/clip%2Bdemo.mp4',
    '/u/nested%2Fclip.mp4',
    '/u/question%3Fclip%23demo.mp4'
  ]
  for (const source of sources) {
    const file = path.join(root, 'uploads', videoSource(source).url.slice(3))
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, 'fixture')
  }
  await fs.writeFile(path.join(root, 'content/a.md'), sources.map(source => `vid: ${source}`).join('\n'))
  await refreshVideoMetadata({ projectRoot: root, logger: null, probe: async () => ({ streams: [{ codec_type: 'video', width: 320, height: 180 }] }) })
  const cacheFile = path.join(root, 'data/video_metadata.json')
  const cache = JSON.parse(await fs.readFile(cacheFile, 'utf8'))
  cache.entries['/u/clip demo.mp4'].overrides = { name: 'Manual path title', width: 640 }
  cache.entries['/u/../secret.mp4'] = { metadata: { width: 999 } }
  await fs.writeFile(cacheFile, JSON.stringify(cache))
  const invalid = ['/u/bad%.mp4', '/u/bad%2.mp4', '/u/bad%zz.mp4', '/u/%2e%2e/secret.mp4', 'https://fixture.example/u/clip%20demo.mp4']
  const cases = [...sources, ...invalid]
  await fs.mkdir(path.join(root, 'layouts/partials/func'), { recursive: true })
  const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  await fs.cp(path.join(engine, 'layouts/partials/func/video-metadata.html'), path.join(root, 'layouts/partials/func/video-metadata.html'))
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\n')
  await fs.writeFile(path.join(root, 'layouts/index.html'), `{{ $result := dict }}{{ range slice ${cases.map(value => JSON.stringify(value)).join(' ')} }}{{ $result = merge $result (dict . (partial "func/video-metadata" .)) }}{{ end }}{{ $result | jsonify | safeHTML }}`)
  const result = spawnSync('hugo', ['--source', root, '--quiet'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  const rendered = JSON.parse(await fs.readFile(path.join(root, 'public/index.html'), 'utf8'))
  for (const source of sources) {
    const entry = cache.entries[videoSource(source).key]
    assert.deepEqual(rendered[source], { ...entry.metadata, ...entry.overrides })
  }
  for (const source of invalid) assert.deepEqual(rendered[source], {})
})

test('real Hugo uses video presentation dimensions, author ratios and complete truthful schema', async t => {
  if (spawnSync('hugo', ['version']).status !== 0) return t.skip('Hugo unavailable')
  const root = await fixture(t)
  const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  await fs.cp(path.join(engine, 'layouts/partials'), path.join(root, 'layouts/partials'), { recursive: true })
  await fs.mkdir(path.join(root, 'data'), { recursive: true })
  await fs.mkdir(path.join(root, 'assets/u'), { recursive: true })
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\ndefaultContentLanguage: es\n')
  await fs.writeFile(path.join(root, 'assets/u/poster.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64'))
  const remoteTitle = 'A " onerror=\'alert(1)\' <tag> & Z'
  await fs.writeFile(path.join(root, 'data/video_metadata.json'), JSON.stringify({ entries: {
    '/u/demo.mp4': { metadata: { width: 1080, height: 1920, ratio: 0.5625, duration: 'PT4S', name: 'Original video', dateCreated: '2025-01-02T00:00:00.000Z' } },
    'youtube:abc': { metadata: { name: remoteTitle, thumbnailUrl: 'https://fixture.example/title-poster.png' } },
    'vimeo:456:privatehash': { metadata: { name: 'Private Vimeo', width: 720, height: 1280, ratio: 0.5625 } }
  } }))
  // A tiny icon stub isolates media behavior from the full icon/font pipeline.
  await fs.writeFile(path.join(root, 'layouts/partials/icon.html'), '{{ return "" }}')
  await fs.writeFile(path.join(root, 'layouts/index.html'), `{{ partial "boxes/img" (dict "vid" "/u/demo.mp4" "img" "/u/poster.png") }}
{{ partial "boxes/img" (dict "vid" "/u/demo.mp4" "img" "/u/poster.png" "ratio" "1/1" "duration" "PT8S" "width" 720 "height" 1280 "upload" "2025-01-01" "video_title" "Manual title") }}
{{ partial "media/_" (dict "vid" "https://vimeo.com/123" "mute" true) }}
{{ partial "media/_" (dict "img" "/u/poster.png" "alt" "Plain local image") }}
{{ partial "media/_" (dict "img" "https://fixture.example/remote.png" "alt" "Plain remote image") }}
{{ partial "media/_" (dict "vid" "https://youtu.be/abc") }}
<script id="video-aliases" type="application/json">{{ dict
  "youtubeEmbed" (partial "media/vid-data" (dict "vid" "https://www.youtube.com/embed/abc?start=12"))
  "youtubeNoCookie" (partial "media/vid-data" (dict "vid" "https://www.youtube-nocookie.com/embed/abc"))
  "vimeoQuery" (partial "media/vid-data" (dict "vid" "https://player.vimeo.com/video/456?h=privatehash"))
  "vimeoPath" (partial "media/vid-data" (dict "vid" "https://vimeo.com/456/privatehash"))
  "isNoCookie" (not (not (partial "func/is-vid" "https://www.youtube-nocookie.com/embed/abc")))
  "isVimeoPrivate" (not (not (partial "func/is-vid" "https://vimeo.com/456/privatehash")))
  "isUnsafe" (not (not (partial "func/is-vid" "https://evil.example/youtube.com/watch?v=abc")))
  | jsonify | safeJS }}</script>`)
  const result = spawnSync('hugo', ['--source', root, '--environment', 'development'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  assert.doesNotMatch(html, /--img-ratio:0.5625/)
  assert.doesNotMatch(html, /<(?:img|picture|video|iframe)[^>]+style="[^"]*aspect-ratio/)
  assert.match(html, /--img-ratio:1\/1/)
  assert.match(html, /<img[^>]+height="1"[^>]+width="2"/)
  assert.match(html, /data-height="1920"/)
  assert.match(html, /data-width="720"/)
  assert.doesNotMatch(html, /"duration":"PT4S"/)
  assert.match(html, /"duration":"PT8S"/)
  assert.match(html, /"name":"Manual title"/)
  assert.equal((html.match(/"uploadDate"/g) || []).length, 1)
  assert.equal((html.match(/"dateCreated":"2025-01-02T00:00:00Z"/g) || []).length, 1)
  assert.match(html, /<iframe/)
  const remoteImage = html.match(/<img\b[^>]*src="https:\/\/fixture\.example\/title-poster\.png"[^>]*>/)?.[0]
  assert.ok(remoteImage)
  const attributes = new Map([...remoteImage.matchAll(/([^\s=<>]+)(?:="([^"]*)")?/g)].map(match => [match[1], match[2]]))
  assert.equal(attributes.has('onerror'), false)
  const decodedAlt = attributes.get('alt').replace(/&#(?:x([\da-f]+)|(\d+));|&(amp|lt|gt|quot|apos);/gi, (_, hex, decimal, named) => hex || decimal ? String.fromCodePoint(parseInt(hex || decimal, hex ? 16 : 10)) : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[named])
  assert.equal(decodedAlt, remoteTitle)
  const aliases = JSON.parse(html.match(/<script id="video-aliases" type="application\/json">(.*?)<\/script>/s)[1])
  assert.equal(aliases.youtubeEmbed.ifr, true)
  assert.equal(aliases.youtubeNoCookie.ifr, true)
  assert.match(aliases.youtubeEmbed.src, /^https:\/\/www\.youtube-nocookie\.com\/embed\/abc\?/)
  assert.match(aliases.youtubeEmbed.src, /&start=12(?:&|$)/)
  assert.equal(aliases.youtubeNoCookie.meta.name, remoteTitle)
  for (const name of ['vimeoQuery', 'vimeoPath']) {
    assert.equal(aliases[name].ifr, true)
    assert.match(aliases[name].src, /^https:\/\/player\.vimeo\.com\/video\/456\?/)
    assert.match(aliases[name].src, /&h=privatehash(?:&|$)/)
    assert.equal(aliases[name].url, 'https://vimeo.com/456/privatehash')
    assert.equal(aliases[name].meta.name, 'Private Vimeo')
  }
  assert.equal(aliases.isNoCookie, true)
  assert.equal(aliases.isVimeoPrivate, true)
  assert.equal(aliases.isUnsafe, false)
})

test('aborted refresh does not publish partial cache or retry state', async t => {
  const root = await fixture(t)
  await fs.writeFile(path.join(root, 'content/a.md'), 'vid: https://youtu.be/abc')
  const controller = new AbortController()
  const fetchImpl = async () => {
    controller.abort()
    throw controller.signal.reason
  }
  await assert.rejects(refreshVideoMetadata({ projectRoot: root, fetchImpl, signal: controller.signal, logger: null }), { name: 'AbortError' })
  await assert.rejects(fs.stat(path.join(root, 'data/video_metadata.json')), { code: 'ENOENT' })
})

test('first-frame fallback is versionable, incremental, safe and optional', async t => {
  if (spawnSync('ffmpeg', ['-version']).status !== 0 || spawnSync('ffprobe', ['-version']).status !== 0) return t.skip('FFmpeg/FFprobe unavailable')
  const root = await fixture(t)
  const video = path.join(root, 'uploads/humanized-name.mp4')
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x120:d=0.4', '-metadata', 'title=Embedded title to ignore', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]).status, 0)
  await fs.writeFile(path.join(root, 'content/a.md'), 'vid: /u/humanized-name.mp4')
  const run = options => refreshVideoMetadata({ projectRoot: root, logger: null, ...options })
  assert.deepEqual((await run()).warnings, [])
  const cacheFile = path.join(root, 'data/video_metadata.json')
  let cached = JSON.parse(await fs.readFile(cacheFile, 'utf8'))
  const entry = cached.entries['/u/humanized-name.mp4']
  assert.equal(entry.metadata.name, 'Humanized name')
  assert.match(entry.metadata.thumbnailUrl, /^\/u\/video-posters\/[a-f0-9]{64}-first-frame-v1\.jpg$/)
  const posterFile = path.join(root, 'uploads', entry.metadata.thumbnailUrl.slice(3))
  const stat = await fs.stat(posterFile)
  // Cache-hit upgrades old embedded titles without probing or extracting again.
  entry.metadata.name = 'Old embedded title'
  await fs.writeFile(cacheFile, JSON.stringify(cached))
  const second = await run({ ffmpeg: '/not-installed', ffprobe: '/not-installed' })
  assert.deepEqual(second.warnings, [])
  cached = JSON.parse(await fs.readFile(cacheFile, 'utf8'))
  assert.equal(cached.entries['/u/humanized-name.mp4'].metadata.name, 'Humanized name')
  assert.equal((await fs.stat(posterFile)).mtimeMs, stat.mtimeMs)
  assert.equal((await run()).changed, false)
  await fs.rm(posterFile)
  // A cache hit recreates a deleted frame without re-running FFprobe.
  assert.deepEqual((await run({ ffprobe: '/not-installed' })).warnings, [])
  assert.ok((await fs.stat(posterFile)).size > 0)
  await fs.rm(posterFile)
  await fs.writeFile(path.join(root, 'uploads/humanized-name.png'), 'authored sibling')
  assert.deepEqual((await run({ ffmpeg: '/not-installed' })).warnings, [])
  await assert.rejects(fs.stat(posterFile), { code: 'ENOENT' })
  await fs.rm(path.join(root, 'uploads/humanized-name.png'))
  await fs.writeFile(path.join(root, 'content/a.md'), 'vid: /u/humanized-name.mp4#poster=/u/authored.jpg')
  assert.deepEqual((await run({ ffmpeg: '/not-installed' })).warnings, [])
})

test('local poster output cannot follow a symlink outside uploads', async t => {
  const root = await fixture(t)
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-poster-outside-'))
  t.after(() => fs.rm(outside, { recursive: true, force: true }))
  await fs.writeFile(path.join(root, 'content/a.md'), 'vid: /u/demo.mp4')
  await fs.writeFile(path.join(root, 'uploads/demo.mp4'), 'fixture')
  await fs.symlink(outside, path.join(root, 'uploads/video-posters'))
  const result = await refreshVideoMetadata({ projectRoot: root, logger: null, probe: async () => ({}) })
  assert.match(result.warnings.join('\n'), /first frame unavailable/)
  assert.deepEqual(await fs.readdir(outside), [])
})

test('YouTube Data API supplies duration and publication while oEmbed dimensions stay excluded', async t => {
  const root = await fixture(t)
  await fs.writeFile(path.join(root, 'content/a.md'), 'vid: https://youtu.be/abc')
  const calls = []
  await refreshVideoMetadata({ projectRoot: root, apiKey: 'test-fixture-key', logger: null, fetchImpl: async url => {
    calls.push(url)
    return { ok: true, text: async () => JSON.stringify(url.includes('/youtube/v3/') ? { items: [{ snippet: { title: 'API title', publishedAt: '2025-01-02T03:04:05Z' }, contentDetails: { duration: 'PT1S' } }] } : { width: 200, height: 113, title: 'oEmbed title' }) }
  } })
  const metadata = JSON.parse(await fs.readFile(path.join(root, 'data/video_metadata.json'))).entries['youtube:abc'].metadata
  assert.equal(calls.length, 2)
  assert.equal(metadata.duration, 'PT1S')
  assert.equal(metadata.uploadDate, '2025-01-02T03:04:05Z')
  assert.equal(metadata.width, undefined)
  assert.ok(!JSON.stringify(metadata).includes('test-fixture-key'))
})

test('YouTube public player dimensions supply only a known display ratio', async t => {
  const root = await fixture(t)
  await fs.writeFile(path.join(root, 'content/a.md'), 'vid: https://www.youtube.com/shorts/portrait\nvid: https://youtu.be/landscape\nvid: https://youtu.be/unknown\nvid: https://youtu.be/partial\nvid: https://youtu.be/invalid')
  const players = {
    portrait: { embedWidth: '4608', embedHeight: '8192' },
    landscape: { embedWidth: 8192, embedHeight: 4608 },
    unknown: { embedHtml: '<iframe width="480" height="360"></iframe>' },
    partial: { embedWidth: 8192 },
    invalid: { embedWidth: 'NaN', embedHeight: 8192 }
  }
  await refreshVideoMetadata({ projectRoot: root, apiKey: 'fixture-secret', logger: null, fetchImpl: async value => {
    const url = new URL(value)
    let info = { width: 113, height: 200, thumbnail_width: 480, thumbnail_height: 360 }
    if (url.hostname === 'www.googleapis.com') {
      assert.equal(url.searchParams.get('part'), 'snippet,contentDetails,player')
      assert.equal(url.searchParams.get('maxWidth'), '8192')
      assert.equal(url.searchParams.get('maxHeight'), '8192')
      info = { items: [{ player: players[url.searchParams.get('id')] }] }
    }
    return { ok: true, text: async () => JSON.stringify(info) }
  } })
  const text = await fs.readFile(path.join(root, 'data/video_metadata.json'), 'utf8')
  const entries = JSON.parse(text).entries
  assert.equal(entries['youtube:portrait'].metadata.ratio, 9 / 16)
  assert.equal(entries['youtube:landscape'].metadata.ratio, 16 / 9)
  for (const id of ['unknown', 'partial', 'invalid']) assert.equal(entries[`youtube:${id}`].metadata.ratio, undefined)
  for (const entry of Object.values(entries)) {
    assert.equal(entry.metadata.width, undefined)
    assert.equal(entry.metadata.height, undefined)
    assert.equal(entry.metadata.isShort, undefined)
  }
  assert.ok(!text.includes('fixture-secret'))
})

test('existing YouTube cache upgrades once when a Data API key becomes available and respects failure backoff', async t => {
  const root = await fixture(t)
  await fs.writeFile(path.join(root, 'content/a.md'), 'vid: https://youtu.be/abc')
  let calls = 0
  const run = options => refreshVideoMetadata({ projectRoot: root, logger: null, apiKey: undefined, fetchImpl: async value => {
    calls++
    const info = value.includes('/youtube/v3/') ? { items: [{ player: { embedWidth: 4608, embedHeight: 8192 } }] } : { title: 'oEmbed title' }
    return { ok: true, text: async () => JSON.stringify(info) }
  }, ...options })
  await run()
  assert.equal(calls, 1)
  const file = path.join(root, 'data/video_metadata.json')
  const cache = JSON.parse(await fs.readFile(file, 'utf8'))
  cache.entries['youtube:abc'].overrides = { name: 'Manual title' }
  await fs.writeFile(file, JSON.stringify(cache))
  await run({ apiKey: 'fixture-key', fetchImpl: async () => { throw new Error('temporary failure') } })
  assert.equal(calls, 1)
  await run({ apiKey: 'fixture-key' })
  assert.equal(calls, 1) // A new capability must not bypass provider failure backoff.
  const failed = JSON.parse(await fs.readFile(file, 'utf8'))
  delete failed.entries['youtube:abc'].retryAfter
  await fs.writeFile(file, JSON.stringify(failed))
  await run({ apiKey: 'fixture-key' })
  assert.equal(calls, 3)
  const updated = JSON.parse(await fs.readFile(file, 'utf8')).entries['youtube:abc']
  assert.equal(updated.metadata.ratio, 9 / 16)
  assert.deepEqual(updated.overrides, { name: 'Manual title' })
  await run({ apiKey: 'fixture-key' })
  await run() // Removing a key must not downgrade the valid public cached facts.
  assert.equal(calls, 3)
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).entries['youtube:abc'].metadata.ratio, 9 / 16)
})

test('YouTube cache persists by ID regardless of age or missing timestamp until explicitly refreshed', async t => {
  const root = await fixture(t)
  const now = Date.parse('2026-10-17T00:00:00Z')
  await fs.writeFile(path.join(root, 'content/a.md'), 'vid: https://youtu.be/abc\nvid: https://youtu.be/undated')
  const file = path.join(root, 'data/video_metadata.json')
  const cache = { version: 1, entries: {
    'youtube:abc': { fingerprint: 'youtube:abc', fetchedAt: '2020-01-01T00:00:00Z', youtubeApiVersion: 1, metadata: { name: 'Original title', duration: 'PT10S', ratio: 9 / 16 }, overrides: { name: 'Authored title' } },
    'youtube:undated': { fingerprint: 'youtube:undated', youtubeApiVersion: 1, metadata: { name: 'Undated title' } },
    'youtube:unused': { fingerprint: 'youtube:unused', fetchedAt: '2020-01-01T00:00:00Z', metadata: { name: 'Unreferenced title' }, overrides: { ratio: 1 } }
  } }
  await fs.mkdir(path.dirname(file), { recursive: true })
  const initial = JSON.stringify(cache)
  await fs.writeFile(file, initial)
  let calls = 0
  const fetchImpl = async url => {
    calls++
    const info = url.includes('/youtube/v3/') ? { items: [{ snippet: { title: 'Updated title' }, contentDetails: { duration: 'PT8S' }, player: { embedWidth: 4608, embedHeight: 8192 } }] } : { title: 'oEmbed title' }
    return { ok: true, text: async () => JSON.stringify(info) }
  }
  const run = options => refreshVideoMetadata({ projectRoot: root, now, apiKey: 'fixture-key', fetchImpl, logger: null, ...options })
  assert.equal((await run()).changed, false)
  assert.equal((await run({ now: now + 365 * 86400000 })).changed, false)
  assert.equal(calls, 0)
  assert.equal(await fs.readFile(file, 'utf8'), initial)

  assert.equal((await run({ force: true })).changed, true)
  assert.equal(calls, 4)
  const refreshed = JSON.parse(await fs.readFile(file, 'utf8')).entries
  assert.equal(refreshed['youtube:abc'].metadata.name, 'Updated title')
  assert.equal(refreshed['youtube:abc'].metadata.duration, 'PT8S')
  assert.equal(refreshed['youtube:abc'].metadata.ratio, 9 / 16)
  assert.equal(refreshed['youtube:abc'].fetchedAt, new Date(now).toISOString())
  assert.deepEqual(refreshed['youtube:abc'].overrides, cache.entries['youtube:abc'].overrides)
  assert.equal(refreshed['youtube:undated'].fetchedAt, new Date(now).toISOString())
  assert.deepEqual(refreshed['youtube:unused'], cache.entries['youtube:unused'])

  let failures = 0
  const offline = async () => { failures++; throw new Error('Offline') }
  await run({ force: true, fetchImpl: offline })
  assert.equal(failures, 2)
  const failed = JSON.parse(await fs.readFile(file, 'utf8')).entries
  assert.deepEqual(failed['youtube:abc'].metadata, refreshed['youtube:abc'].metadata)
  assert.equal(failed['youtube:abc'].fetchedAt, refreshed['youtube:abc'].fetchedAt)
  assert.deepEqual(failed['youtube:abc'].overrides, refreshed['youtube:abc'].overrides)
  assert.equal((await run({ fetchImpl: offline })).changed, false)
  assert.equal(failures, 2)
  await run({ now: now + 86400001 })
  assert.equal(calls, 8) // A failed explicit refresh is retried after the backoff.
})
