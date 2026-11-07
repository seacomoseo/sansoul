import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
test('responsive ladder caps original/DPR and separates lazy layout from cover enlargement', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-responsive-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  for (const dir of ['layouts/partials', 'assets/u', 'data']) await fs.mkdir(path.join(root, dir), { recursive: true })
  await fs.cp(path.join(engine, 'layouts/partials'), path.join(root, 'layouts/partials'), { recursive: true })
  await sharp({ create: { width: 3600, height: 900, channels: 3, background: '#abcdde' } }).png().toFile(path.join(root, 'assets/u/panorama.png'))
  await sharp({ create: { width: 1200, height: 2400, channels: 3, background: '#abc' } }).png().toFile(path.join(root, 'assets/u/portrait.png'))
  await sharp({ create: { width: 1, height: 1, channels: 3, background: '#fff' } }).png().toFile(path.join(root, 'assets/u/pixel.png'))
  await sharp(path.join(root, 'assets/u/panorama.png')).jpeg().toFile(path.join(root, 'assets/u/panorama.jpg'))
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\n')
  await fs.writeFile(path.join(root, 'data/config.yml'), 'imgs_dpr: 2\nimgs_quality: 45\n')
  const cases = [
    { name: 'normal', container: 'xs', fit_vs: 1, fit_vl: 0.5 },
    { name: 'sm', container: 'sm' },
    { name: 'same-basename', img: '/u/panorama.jpg', container: 'sm' },
    { name: 'md', container: 'md' },
    { name: 'xl', container: 'xl' },
    { name: 'fluid', container: 'fluid' },
    { name: 'tiny', max: 50 },
    { name: 'pixel', img: '/u/pixel.png', ratio: '16/9', width: 1, height: 1 },
    { name: 'nested', container: 'lg', fit_vs: 0.5, fit_vl: 0.125 },
    { name: 'reverse', container: 'lg', fit_vs: 1, fit_vl: 0.1 },
    { name: 'limited', max: 180 },
    { name: 'cover', is_bg: true, container: 'fluid' },
    { name: 'cover-rate', img: '/u/portrait.png', is_bg: true, box_rate: '1/4', container: 'xs' },
    { name: 'cover-invalid-rate', is_bg: true, box_rate: '1/0', container: 'fluid' },
    { name: 'side-background-rate', side: 'left', img: '/u/portrait.png', is_bg: true, box_rate: '1/4', container: 'xs' },
    { name: 'ratio', ratio: '16/9', container: 'lg' },
    { name: 'side-left', side: 'left', ratio: '16/9', container: 'xs', fit_vs: 0.1, fit_vl: 0.1 },
    { name: 'side-right', side: 'right', ratio: '16/9', container: 'sm' },
    { name: 'side-center', side: 'center', ratio: '16/9', container: 'xs' },
    { name: 'side-background', side: 'left', is_bg: true, container: 'xs' }
  ]
  await fs.writeFile(path.join(root, 'layouts/index.html'), `<aside>{{ partial "media/out-img" (dict "img" "https://fixture.invalid/hero.jpg" "notlazy" true "notschema" true) }}{{ partial "media/in-img" (dict "img" "/u/panorama.png" "notlazy" true "notschema" true "dimensions" (dict "width" 3600 "height" 900)) }}</aside>{{ range ${JSON.stringify(JSON.stringify(cases))} | transform.Unmarshal }}{{ $m := merge . (dict "img" (.img | default "/u/panorama.png") "lazy" "lazy" "dimensions" (dict "width" (.width | default 3600) "height" (.height | default 900)) "notschema" true) }}<section id="{{ .name }}">{{ partial "media/in-img" $m }}</section>{{ end }}`)
  const built = spawnSync('hugo', ['--source', root], { encoding: 'utf8' })
  assert.equal(built.status, 0, built.stdout + built.stderr)
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  assert.doesNotMatch(html, /%!/, 'responsive CSS must not contain Go printf type errors')
  assert.equal([...html.matchAll(/fetchpriority="high"/g)].length, 1)
  assert.match(html, /<img[^>]*fetchpriority="high"[^>]*src="https:\/\/fixture.invalid\/hero.jpg"/)
  const part = name => html.match(new RegExp(`<section id="${name}">([\\s\\S]*?)</section>`))[1]
  for (const name of cases.map(item => item.name)) {
    const widths = [...part(name).matchAll(/ (\d+)w/g)].map(match => Number(match[1]))
    assert.deepEqual(widths, [...new Set(widths)].sort((a, b) => a - b))
    assert.ok(widths.every(width => width <= 3600 && width > 0))
    if (name === 'pixel') assert.deepEqual(widths, [1])
    else if (name === 'tiny') assert.deepEqual(widths, [100])
    else {
      assert.equal(widths[0], 150)
      assert.equal(widths[1], 225)
    }
    assert.match(part(name), /-q45.avif/)
    if (['cover-rate', 'side-background-rate'].includes(name)) {
      assert.doesNotMatch(part(name), /sizes="auto/)
      assert.match(part(name), /50.000000vh/)
      assert.match(part(name), /\* 2.000000/)
      assert.equal(widths.at(-1), 1200)
      if (name === 'side-background-rate') assert.match(part(name), /\(min-width: 1280px\).*50vw.*100vw/)
    } else if (['cover', 'cover-invalid-rate', 'side-background'].includes(name)) {
      assert.doesNotMatch(part(name), /sizes="auto/)
      assert.match(part(name), /400.000000vh/)
      assert.equal(widths.at(-1), 3600)
    } else if ((['ratio', 'pixel'].includes(name) || name.startsWith('side-'))) assert.doesNotMatch(part(name), /sizes="auto/)
    else assert.match(part(name), /sizes="auto, /)
    if (['side-left', 'side-right'].includes(name)) {
      assert.match(part(name), /\(min-width: 1280px\).*50vw.*100vw/)
      assert.equal(widths.at(-1), 1600)
    }
    if (name === 'side-center') {
      assert.match(part(name), /sizes="min\(1600px, max\(1px, 100vw\)\)/)
      assert.equal(widths.at(-1), 1600)
    }
    if (name === 'normal') assert.equal(widths.at(-1), 686)
    if (name === 'sm') assert.equal(widths.at(-1), 1440)
    if (name === 'md') assert.equal(widths.at(-1), 1920)
    if (name === 'xl') assert.equal(widths.at(-1), 2880)
    if (name === 'fluid') assert.equal(widths.at(-1), 3600)
    if (name === 'limited') assert.equal(widths.at(-1), 360)
    if (name === 'nested') assert.ok(widths.at(-1) < 400)
  }
  assert.match(part('ratio'), /sizes="min\(1600px,/)
  assert.match(part('pixel'), /sizes="min\(1px,/)
  assert.match(part('ratio'), /height="900"[^>]*width="1600"/)
  assert.equal(await fs.stat(path.join(root, 'resources/_gen/images')).then(() => true, () => false), false, 'AVIF defers crop/resize to Sharp instead of generating an intermediate Hugo image')
  const firstURL = name => part(name).match(/srcset="([^ ,"]+)/)[1]
  assert.notEqual(firstURL('sm'), firstURL('same-basename'), 'PNG and JPEG with the same basename must not overwrite each other')
  await sharp({ create: { width: 3600, height: 900, channels: 3, background: '#fedcba' } }).png().toFile(path.join(root, 'assets/u/panorama.png'))
  const updated = spawnSync('hugo', ['--source', root], { encoding: 'utf8' })
  assert.equal(updated.status, 0, updated.stdout + updated.stderr)
  const updatedHTML = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  assert.ok(!updatedHTML.includes(firstURL('sm')), 'replacing source bytes must invalidate derivative URLs')
  await fs.writeFile(path.join(root, 'data/config.yml'), 'imgs_dpr: 8\nimgs_quality: 50\nimgs_webp: true\n')
  const webp = spawnSync('hugo', ['--source', root], { encoding: 'utf8' })
  assert.equal(webp.status, 0, webp.stdout + webp.stderr)
  const webpHTML = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  assert.match(webpHTML, /image\/webp/)
  assert.match(webpHTML, /-q50.webp/)
  const derivative = /srcset="([^ ,"]+\.webp) (\d+)w/.exec(webpHTML)
  const metadata = await sharp(path.join(root, 'public', derivative[1])).metadata()
  assert.equal(metadata.width, Number(derivative[2]))
  assert.ok(metadata.width <= 3600)
  await fs.writeFile(path.join(root, 'data/config.yml'), 'imgs_dpr: 0\nimgs_quality: 101\n')
  const invalid = spawnSync('hugo', ['--source', root], { encoding: 'utf8' })
  assert.notEqual(invalid.status, 0)
  assert.match(invalid.stdout + invalid.stderr, /imgs_dpr|imgs_quality/)
})

test('AVIF postprocessing reuses content/options cache and rejects escaping manifests', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-avif-cache-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'public/u'), { recursive: true })
  await sharp({ create: { width: 800, height: 400, channels: 3, background: '#7290ab' } }).png().toFile(path.join(root, 'public/u/input.png'))
  const manifest = { path: '/u/input.png', width: 400, height: 200, quality: 45, output: '/u/output.avif' }
  async function run (data = manifest) {
    await fs.mkdir(path.join(root, 'public/img_list'), { recursive: true })
    await fs.writeFile(path.join(root, 'public/img_list/test.json'), JSON.stringify(data))
    return spawnSync(process.execPath, [path.join(engine, 'scripts/imgs.js')], { cwd: root, encoding: 'utf8' })
  }
  let result = await run()
  assert.equal(result.status, 0, result.stdout + result.stderr)
  const output = await sharp(path.join(root, 'public/u/output.avif')).metadata()
  assert.equal(output.width, 400)
  assert.equal(output.height, 200)
  const cache = path.join(root, 'resources/_gen/sansoul-avif')
  const [file] = await fs.readdir(cache)
  const before = await fs.stat(path.join(cache, file))
  result = await run()
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal((await fs.stat(path.join(cache, file))).mtimeMs, before.mtimeMs)
  result = await run({ ...manifest, output: '/../../escape.avif' })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /escapes public/)
})


test('effective box rate keeps defaults only for cards or genuinely empty backgrounds', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-box-rate-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'layouts/partials/boxes'), { recursive: true })
  await fs.copyFile(path.join(engine, 'layouts/partials/boxes/rate.html'), path.join(root, 'layouts/partials/boxes/rate.html'))
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\n')
  const cases = [
    { name: 'empty', is_bg: true },
    { name: 'explicit', is_bg: true, rate: '1/4', md: 'Content' },
    { name: 'card', card: true, md: 'Content' },
    { name: 'links', is_bg: true, links: [{ url: '#test' }] },
    { name: 'whens', is_bg: true, whens: [{ days: 'Monday' }] },
    { name: 'geos', is_bg: true, geos: [{ address: 'Example' }] },
    { name: 'gss', is_bg: true, gss: { id: 'public-id' } },
    { name: 'missing-gss', is_bg: true, gss: { sheet: 0 } },
    { name: 'video', is_bg: true, vid: '/u/example.mp4' },
    { name: 'price', is_bg: true, price: '10' }
  ]
  await fs.writeFile(path.join(root, 'layouts/index.html'), `{{ range ${JSON.stringify(JSON.stringify(cases))} | transform.Unmarshal }}<p id="{{ .name }}">{{ partial "boxes/rate" . | default "none" }}</p>{{ end }}`)
  const built = spawnSync('hugo', ['--source', root], { encoding: 'utf8' })
  assert.equal(built.status, 0, built.stdout + built.stderr)
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  for (const item of cases) {
    const expected = ({ empty: '16/9', explicit: '1/4', card: '3/4', 'missing-gss': '16/9' })[item.name] || 'none'
    assert.ok(html.includes(`<p id="${item.name}">${expected}</p>`), item.name)
  }
})
