import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
function run (command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd })
    let output = ''
    child.stdout.on('data', value => { output += value })
    child.stderr.on('data', value => { output += value })
    child.on('error', reject)
    child.on('close', code => resolve({ code, output }))
  })
}

test('opted-in remote images use local responsive derivatives, preserve originals and degrade on download failure', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-remote-images-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  let image = await sharp({ create: { width: 600, height: 300, channels: 3, background: '#7290ab' } }).png().toBuffer()
  const counts = new Map()
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://fixture.local')
    counts.set(url.pathname, (counts.get(url.pathname) || 0) + 1)
    if (url.pathname === '/image') {
      response.writeHead(200, { 'Content-Type': 'image/png' })
      response.end(image)
    } else if (url.pathname === '/vector.svg') {
      response.writeHead(200, { 'Content-Type': 'image/svg+xml' })
      response.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -20 80 40"><rect width="80" height="40" fill="red"/></svg>')
    } else if (url.pathname === '/broken.png') {
      response.writeHead(200, { 'Content-Type': 'image/png' })
      response.end('not an image')
    } else if (url.pathname === '/not-image') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end('{"error":"not an image"}')
    } else {
      response.writeHead(404)
      response.end('missing')
    }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const origin = `http://127.0.0.1:${server.address().port}`
  for (const dir of ['layouts', 'data']) await fs.mkdir(path.join(root, dir), { recursive: true })
  await fs.cp(path.join(engine, 'layouts/partials'), path.join(root, 'layouts/partials'), { recursive: true })
  await fs.writeFile(path.join(root, 'layouts/partials/icon.html'), '{{ return "" }}')
  await fs.writeFile(path.join(root, 'hugo.yml'), `baseURL: https://fixture.example/\ncaches:\n  getresource:\n    maxAge: 0\nsecurity:\n  http:\n    urls: ['^${origin}/']\n`)
  const cases = [
    { id: 'first', img: `${origin}/image`, ratio: '1/1' },
    { id: 'duplicate', img: `${origin}/image`, ratio: '1/1' },
    { id: 'svg', img: `${origin}/vector.svg` },
    { id: 'missing', img: `${origin}/missing.png` },
    { id: 'mime', img: `${origin}/not-image` },
    { id: 'broken', img: `${origin}/broken.png` },
    { id: 'video', img: `${origin}/movie.mp4` }
  ]
  await fs.writeFile(path.join(root, 'layouts/index.html'), `{{ range ${JSON.stringify(JSON.stringify(cases))} | transform.Unmarshal }}<section id="{{ .id }}">{{ partial "media/_" (merge . (dict "class" "img__in" "alt" .id "lazy" "lazy")) }}</section>{{ end }}<aside>{{ partial "blocks/gallery-item" (dict "img" "${origin}/image" "url" "${origin}/image" "type" "rows" "cols" 3) }}</aside><script id="image-api" type="application/json">{{ $p := dict "Params" (dict "img" "${origin}/image") "Permalink" "https://fixture.example/" "Title" "Remote" "Lang" "en" }}{{ dict "og" (partial "func/img-og" $p) "schema" (partial "schema/img-main" $p) "imgs" (partial "schema/imgs" (slice "${origin}/image" "${origin}/vector.svg")) | jsonify | safeJS }}</script>`)
  async function build (settings) {
    await fs.writeFile(path.join(root, 'data/config.yml'), settings)
    const result = await run('hugo', ['--source', root], root)
    assert.equal(result.code, 0, result.output)
    return { html: await fs.readFile(path.join(root, 'public/index.html'), 'utf8'), output: result.output }
  }
  await build('')
  assert.equal(counts.size, 0, 'absent option must not request external images')
  const disabled = await build('imgs_remote: false\n')
  assert.equal(counts.size, 0, 'disabled mode must not request external images')
  assert.ok(disabled.html.includes(`${origin}/image`))
  const enabled = await build('imgs_remote: true\nimgs_webp: true\nimgs_quality: 47\n')
  assert.equal(counts.get('/image'), 1, 'one fetch per source even when it appears more than once')
  const part = (html, id) => html.match(new RegExp(`<section id="${id}">([\\s\\S]*?)</section>`))[1]
  assert.equal(counts.get('/movie.mp4'), undefined, 'video binaries must not be downloaded as images')
  const first = part(enabled.html, 'first')
  assert.doesNotMatch(first, /127\.0\.0\.1/)
  assert.match(enabled.html, /data-lightbox="\/u\/remote\/[^"]+\.png"/)
  assert.match(enabled.html, /--gallery-item-height:50.00%/)
  assert.match(first, /src="\/u\/remote\/[a-f0-9]{16}-[a-f0-9]{16}\.png"/)
  assert.match(first, /image\/webp/)
  assert.match(first, /sizes=/)
  const api = JSON.parse(enabled.html.match(/<script id="image-api" type="application\/json">(.*?)<\/script>/s)[1])
  assert.match(api.og.img, /^https:\/\/fixture.example\/u\/remote\//)
  assert.equal(api.schema.url, api.og.img)
  assert.equal(api.schema.width, 600)
  assert.equal(api.schema.height, 300)
  assert.equal(api.imgs[0], api.og.img)
  assert.match(api.imgs[1], /^https:\/\/fixture.example\/u\/remote\/[^ ]+\.svg$/)
  assert.match(first, /-q47.webp/)
  assert.match(first, /"url":"https:\/\/fixture.example\/u\/remote\//)
  const original = first.match(/<img[^>]*src="([^"]+)"/)[1]
  assert.deepEqual(await fs.readFile(path.join(root, 'public', original)), image)
  const derivative = first.match(/srcset="([^ ,"]+\.webp)/)[1]
  const metadata = await sharp(path.join(root, 'public', derivative)).metadata()
  assert.equal(metadata.width, metadata.height, 'explicit square crop is preserved')
  const svg = part(enabled.html, 'svg')
  assert.match(svg, /<img[^>]*height="40"[^>]*src="\/u\/remote\/[^" ]+\.svg"[^>]*width="80"/)
  assert.doesNotMatch(svg, /<svg|<use/)
  assert.match(part(enabled.html, 'missing'), /src="http:\/\/127.0.0.1:[0-9]+\/missing.png"/)
  assert.match(part(enabled.html, 'mime'), /src="http:\/\/127.0.0.1:[0-9]+\/not-image"/)
  assert.match(part(enabled.html, 'broken'), /src="http:\/\/127.0.0.1:[0-9]+\/broken.png"/)
  assert.match(enabled.output, /imgs_remote.*keeping the external image URL/)
  const avif = await build('imgs_remote: true\nimgs_quality: 47\n')
  const avifFirst = part(avif.html, 'first')
  assert.match(avifFirst, /image\/avif/)
  const files = await fs.readdir(path.join(root, 'public/img_list'))
  const manifests = await Promise.all(files.map(file => fs.readFile(path.join(root, 'public/img_list', file), 'utf8').then(JSON.parse)))
  assert.ok(manifests.length > 0)
  for (const manifest of manifests) {
    assert.equal(manifest.path, original)
    assert.equal(manifest.quality, 47)
    if (avifFirst.includes(manifest.output)) assert.equal(manifest.width, manifest.height)
    assert.ok(await fs.stat(path.join(root, 'public', manifest.path)))
  }
  const processed = await run(process.execPath, [path.join(engine, 'scripts/imgs.js')], root)
  assert.equal(processed.code, 0, processed.output)
  const output = avifFirst.match(/srcset="([^ ,"]+\.avif)/)[1]
  assert.equal((await sharp(path.join(root, 'public', output)).metadata()).format, 'heif')
  image = await sharp({ create: { width: 600, height: 300, channels: 3, background: '#f096ab' } }).png().toBuffer()
  const changed = await build('imgs_remote: true\nimgs_webp: true\n')
  assert.ok(!part(changed.html, 'first').includes(original), 'changed remote bytes invalidate the published URL')
})
