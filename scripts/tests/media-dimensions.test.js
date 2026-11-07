import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

test('Hugo applies authored media dimensions across boxes, Markdown and local/remote media without changing facts', async t => {
  if (spawnSync('hugo', ['version']).status !== 0) return t.skip('Hugo unavailable')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-media-dimensions-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  for (const dir of ['content', 'data', 'assets/u', 'layouts/_default/_markup']) await fs.mkdir(path.join(root, dir), { recursive: true })
  await fs.cp(path.join(engine, 'layouts/partials'), path.join(root, 'layouts/partials'), { recursive: true })
  await fs.cp(path.join(engine, 'layouts/_default/_markup/render-image.html'), path.join(root, 'layouts/_default/_markup/render-image.html'))
  await fs.writeFile(path.join(root, 'layouts/partials/icon.html'), '{{ return "" }}')
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\n')
  await fs.writeFile(path.join(root, 'assets/u/image.svg'), '<svg class="svg-html" xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200"/></svg>')
  // 1x1 raster PNG: dimensions are read by Hugo, no network or image processor fixture needed.
  await fs.writeFile(path.join(root, 'assets/u/image.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6K/8AAAAASUVORK5CYII=', 'base64'))
  await fs.writeFile(path.join(root, 'assets/u/demo.mp4'), 'fixture')
  await fs.writeFile(path.join(root, 'data/video_metadata.json'), JSON.stringify({ entries: { '/u/demo.mp4': { metadata: { width: 320, height: 180, uploadDate: '2025-01-01' } } } }))
  const cases = [
    { key: 'svg-width', img: '/u/image.svg', img_w: 360 },
    { key: 'svg-height', img: '/u/image.svg', img_h: 220 },
    { key: 'ratio-width', img: '/u/image.svg', img_w: 360, ratio: '16/9' },
    { key: 'both', img: '/u/image.svg', img_w: 360, img_h: 220, ratio: '16/9' },
    { key: 'raster', img: '/u/image.png', img_h: 220 },
    { key: 'invalid', img: '/u/image.svg', img_w: 'wrong', img_h: -4 },
    { key: 'zero', img: '/u/image.svg', img_w: 0, img_h: 0 },
    { key: 'remote', img: 'https://unreachable.invalid/image.png', img_w: 360, ratio: '16/9' },
    { key: 'remote-unknown', img: 'https://unreachable.invalid/image.png', img_h: 220 },
    { key: 'video', vid: '/u/demo.mp4', img_w: 360 },
    { key: 'new-video', vid: '/u/demo.mp4', vid_w: 540, vid_h: 960, vid_width: 100, vid_height: 100 },
    { key: 'video-display', vid: '/u/demo.mp4', img_w: 360, img_h: 220, vid_w: 540, vid_h: 960 }
  ]
  await fs.writeFile(path.join(root, 'content/demo.md'), '---\ntitle: Fixture\n---\n![Alt](/u/image.svg "Caption {16/9 w360}")\n\n![Alt](/u/demo.mp4 "Video {h220}")\n\n![Alt](/u/image.svg "Retained {w0}")\n\n![Alt](/u/image.svg "Retained {16/0 w360}")\n')
  await fs.writeFile(path.join(root, 'layouts/index.html'), `{{ range ${JSON.stringify(JSON.stringify(cases))} | transform.Unmarshal }}<section id="{{ .key }}">{{ partial "media/_" (merge . (dict "notschema" true)) }}</section>{{ end }}<section id="box">{{ partial "boxes/img" (dict "img" "/u/image.svg" "img_w" 360 "title" "Box") }}</section>{{ with site.GetPage "/demo" }}{{ .Content }}{{ end }}<div{{ partial "preview/attrs" (dict "item" (dict "img" "/u/image.svg" "img_w" 360 "_preview" (dict "img" (dict "path" "tpl.sections.0.boxes.0.img"))) "field" "img" "kind" "image") }}></div><script id="bindings" type="application/json">{{ page.Store.Get "sansoul.preview.bindings" | jsonify | safeJS }}</script>`)
  const built = spawnSync('hugo', ['--source', root, '--environment', 'development'], { encoding: 'utf8' })
  assert.equal(built.status, 0, built.stdout + built.stderr)
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  function tag (key) { return html.match(new RegExp(`<section id="${key}">(.*?)</section>`, 's'))[1].match(/<(?:svg|img|video)[^>]*>/)[0] }
  for (const [key, width, height] of [['svg-width', 360, 240], ['svg-height', 330, 220], ['ratio-width', 360, 203], ['both', 360, 220], ['raster', 220, 220], ['invalid', 300, 200], ['zero', 300, 200], ['remote', 360, 203], ['video', 360, 203], ['new-video', 540, 960], ['video-display', 360, 220], ['box', 360, 240]]) {
    assert.match(tag(key), new RegExp(`width=['"]${width}['"]`), key)
    assert.match(tag(key), new RegExp(`height=['"]${height}['"]`), key)
  }
  const [binding] = JSON.parse(html.match(/<script id="bindings" type="application\/json">(.*?)<\/script>/s)[1])
  assert.equal(binding.img_w.path, 'tpl.sections.0.boxes.0.img_w')
  assert.equal(binding.img_h.path, 'tpl.sections.0.boxes.0.img_h')
  assert.equal(binding.ratio.path, 'tpl.sections.0.boxes.0.ratio')
  assert.match(tag('remote-unknown'), /height="220"/)
  assert.doesNotMatch(tag('remote-unknown'), /\swidth=/)
  assert.match(html, /width='360' height='203'/)
  assert.match(html, /<video[^>]*height="220"[^>]*width="391"/)
  assert.match(html, /<figcaption[^>]*>Caption<\/figcaption>/)
  assert.match(html, /Retained \{w0\}/)
  assert.match(html, /Retained \{16\/0 w360\}/)
  const facts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(match => JSON.parse(match[1]))
  assert.ok(facts.some(value => value['@type'] === 'ImageObject' && value.width === 300 && value.height === 200))
})


test('production image crops ignore invalid presentation overrides and retain valid authored dimensions', async t => {
  if (spawnSync('hugo', ['version']).status !== 0) return t.skip('Hugo unavailable')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-media-crop-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  for (const dir of ['assets/u', 'layouts']) await fs.mkdir(path.join(root, dir), { recursive: true })
  await fs.cp(path.join(engine, 'layouts/partials'), path.join(root, 'layouts/partials'), { recursive: true })
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\n')
  await fs.writeFile(path.join(root, 'assets/u/crop.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAICAIAAAB/FOjAAAAAFElEQVR4nGP4z8BAEiJN9agGIhEAJMZ/gd5KfaIAAAAASUVORK5CYII=', 'base64'))
  const cases = [{ key: 'absent' }, { key: 'wrong', img_w: 'wrong' }, { key: 'zero', img_w: 0 }, { key: 'negative', img_h: -10 }, { key: 'valid', img_w: 360 }]
  await fs.writeFile(path.join(root, 'layouts/index.html'), `{{ range ${JSON.stringify(JSON.stringify(cases))} | transform.Unmarshal }}<section id="{{ .key }}">{{ partial "media/_" (merge . (dict "img" "/u/crop.png" "ratio" "1/1" "notschema" true)) }}</section>{{ end }}`)
  const built = spawnSync('hugo', ['--source', root, '--environment', 'production'], { encoding: 'utf8' })
  assert.equal(built.status, 0, built.stdout + built.stderr)
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  for (const key of ['absent', 'wrong', 'zero', 'negative', 'valid']) {
    const source = html.match(new RegExp(`<section id="${key}">(.*?)</section>`, 's'))[1].match(/<source[^>]*>/)[0]
    const size = key === 'valid' ? 360 : 8
    assert.match(source, new RegExp(`width="${size}"`), key)
    assert.match(source, new RegExp(`height="${size}"`), key)
  }
})

test('video posters preserve proportions while side media expands and ordinary media stays natural', async () => {
  const vm = await import('node:vm')
  const source = (await fs.readFile(path.join(engine, 'assets/js/video-dimensions.js'), 'utf8')).replace(/^export /gm, '')
  const observers = []
  const context = {
    window: { addEventListener () {}, removeEventListener () {} },
    document: { documentElement: {} },
    ResizeObserver: class { constructor (update) { this.update = update; observers.push(this) } observe () {} disconnect () {} },
    MutationObserver: class { observe () {} disconnect () {} }
  }
  vm.runInNewContext(source + '\nthis.observe = observeVideoDimensions', context)
  for (const side of [false, true]) {
    const element = {
      style: {}, clientWidth: side ? 846 : 180, isConnected: true,
      getAttribute: name => name === 'width' ? '180' : '320',
      closest: selector => selector.startsWith('.box--side') && side ? {} : null
    }
    context.observe(element)
    assert.equal(element.style.width, side ? '100%' : '180px')
    assert.equal(Number.parseFloat(element.style.height), element.clientWidth * 320 / 180)
    element.clientWidth = 390
    observers.at(-1).update()
    assert.equal(Number.parseFloat(element.style.height), 390 * 320 / 180)
  }
})
