import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

test('real Hugo handles Markdown video alt/caption and separates display fallbacks from factual schema', async t => {
  if (spawnSync('hugo', ['version']).status !== 0) return t.skip('Hugo unavailable')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-video-presentation-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  for (const dir of ['content', 'data', 'assets/u', 'layouts/_default/_markup']) await fs.mkdir(path.join(root, dir), { recursive: true })
  await fs.cp(path.join(engine, 'layouts/partials'), path.join(root, 'layouts/partials'), { recursive: true })
  await fs.cp(path.join(engine, 'layouts/_default/_markup/render-image.html'), path.join(root, 'layouts/_default/_markup/render-image.html'))
  await fs.writeFile(path.join(root, 'layouts/partials/icon.html'), '{{ return "" }}')
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\ndefaultContentLanguage: es\ntimeZone: Europe/Madrid\n')
  await fs.writeFile(path.join(root, 'assets/u/poster.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200"/></svg>')
  await fs.writeFile(path.join(root, 'assets/u/inline-poster.svg'), '<svg class="svg-html" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><rect width="300" height="200"/></svg>')
  await fs.writeFile(path.join(root, 'assets/u/video demo.mp4'), 'fixture')
  const md = '![Ejemplo de alt](/u/video%20demo.mp4 "Ejemplo de caption {3/2}")\n\n![Sin proporción](/u/video%20demo.mp4)'
  await fs.writeFile(path.join(root, 'content/demo.md'), `---\ntitle: Videos\n---\n${md}`)
  await fs.writeFile(path.join(root, 'data/video_metadata.json'), JSON.stringify({ entries: {
    '/u/video demo.mp4': { metadata: { width: 320, height: 180, uploadDate: '2025-01-01', thumbnailUrl: '/u/poster.svg', duration: 'PT1S' } },
    'youtube:ratio': { metadata: { ratio: '9/16', thumbnailUrl: '/u/poster.svg', uploadDate: '2025-01-01' } },
    'youtube:zero': { metadata: { width: 0, height: 0, ratio: 0 } },
    'youtube:square': { metadata: { ratio: 1 } }
  } }))
  const cases = [
    { key: 'known', vid: '/u/video%20demo.mp4', poster: '/u/poster.svg' },
    { key: 'ratio', vid: 'https://youtu.be/ratio', poster: '/u/poster.svg' },
    { key: 'authored', vid: 'https://youtu.be/authored', img: '/u/poster.svg', poster: '/u/poster.svg' },
    { key: 'provider', vid: 'https://youtu.be/provider', poster: '/u/poster.svg' },
    { key: 'zero', vid: 'https://youtu.be/zero' },
    { key: 'short', vid: 'https://www.youtube.com/shorts/vertical' },
    { key: 'shortSquare', vid: 'https://www.youtube.com/shorts/square' },
    { key: 'shortPoster', vid: 'https://www.youtube.com/shorts/author-poster', img: '/u/poster.svg', poster: '/u/poster.svg' },
    { key: 'manual', vid: 'https://www.youtube.com/shorts/manual', vid_width: 540, vid_height: 960 }

  ]
  await fs.writeFile(path.join(root, 'layouts/index.html'), `<script id="dimensions" type="application/json">{{ $r := dict }}{{ range ${JSON.stringify(JSON.stringify(cases))} | transform.Unmarshal }}{{ $r = merge $r (dict .key (partial "media/vid-data" .).presentation) }}{{ end }}{{ $r | jsonify | safeJS }}</script>
{{ with site.GetPage "/demo" }}{{ .Content }}{{ end }}
<div id="no-poster">{{ partial "media/_" (dict "vid" "/u/unknown.mp4" "class" "img__in" "notlazy" true) }}</div>
<div id="inline-poster">{{ partial "media/_" (dict "vid" "/u/video%20demo.mp4" "img" "/u/inline-poster.svg" "notschema" true) }}</div>
<div id="manual-metadata">{{ partial "media/_" (dict "vid" "/u/video%20demo.mp4" "img" "/u/poster.svg" "alt" "Accessible label" "vid_width" 540 "vid_height" 960 "vid_duration" "PT12S" "vid_upload" "2025-01-01 00:00:00" "vid_title" "Manual video title" "vid_desc" "Manual description") }}</div>
<div id="no-date">{{ partial "media/_" (dict "vid" "/u/video%20demo.mp4" "img" "/u/poster.svg" "upload" "invalid-date") }}</div>`)
  const built = spawnSync('hugo', ['--source', root, '--environment', 'development'], { encoding: 'utf8' })
  assert.equal(built.status, 0, built.stdout + built.stderr)
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  const dimensions = JSON.parse(html.match(/<script id="dimensions" type="application\/json">(.*?)<\/script>/s)[1])
  assert.deepEqual(dimensions, { known: { width: 320, height: 180 }, ratio: { width: 608, height: 1080 }, authored: { width: 300, height: 200 }, provider: { width: 1080, height: 608 }, zero: { width: 1080, height: 608 }, short: { width: 608, height: 1080 }, shortSquare: { width: 1080, height: 1080 }, shortPoster: { width: 300, height: 200 }, manual: { width: 540, height: 960 } })
  assert.match(html, /aria-label="Ejemplo de alt"/)
  assert.match(html, /<figcaption[^>]*>Ejemplo de caption<\/figcaption>/)
  assert.equal((html.match(/class="img img--ratio"/g) || []).length, 1)
  assert.equal((html.match(/--img-ratio:3\/2/g) || []).length, 1)
  assert.doesNotMatch(html, /<(?:img|picture|video|iframe|svg)[^>]*style="[^"]*aspect-ratio/)
  const video = html.match(/<div id="no-poster">\s*(<video[^>]*>)/)[1]
  assert.match(video, /width="1080"/)
  assert.match(video, /height="608"/)
  assert.match(video, /controls/)
  assert.doesNotMatch(video, /autoplay|muted|loop/)
  const inline = html.match(/<div id="inline-poster">(.*?)<\/div>/s)[1]
  const svg = inline.match(/<svg[^>]*>/)[0]
  assert.equal((svg.match(/\swidth=/g) || []).length, 1)
  assert.equal((svg.match(/\sheight=/g) || []).length, 1)
  assert.match(svg, /width=['"]320['"]/)
  assert.match(svg, /height=['"]180['"]/)
  const rectangle = inline.match(/<rect[^>]*>/)[0]
  assert.match(rectangle, /\sheight=["']200["']/)
  assert.match(rectangle, /\swidth=["']300["']/)
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(match => JSON.parse(match[1])).filter(schema => schema['@type'] === 'VideoObject')
  assert.equal(schemas.length, 3)
  assert.equal(schemas[0].name, 'Ejemplo de alt')
  assert.equal(schemas[0].duration, 'PT1S')
  assert.equal(schemas[0].width, 320)
  const manual = schemas.find(schema => schema.name === 'Manual video title')
  assert.equal(manual.description, 'Manual description')
  assert.equal(manual.uploadDate, '2025-01-01T00:00:00Z')
  assert.equal(manual.duration, 'PT12S')
  assert.equal(manual.width, 540)
  assert.equal(manual.height, 960)
  const manualMarkup = html.match(/<div id="manual-metadata">(.*?)<\/div>/s)[1]
  assert.match(manualMarkup, /width="540"/)
  assert.match(manualMarkup, /height="960"/)
  assert.doesNotMatch(manualMarkup, /img--ratio|--img-ratio|aspect-ratio/)

  assert.match(built.stdout + built.stderr, /VideoObject omitted/)
})
