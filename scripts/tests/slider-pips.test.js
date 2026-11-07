import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'

test('slider navigation renders pill/dot/line modes with exactly one initial active pip and keeps hide empty', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-slider-pips-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'layouts/partials/boxes'), { recursive: true })
  await fs.copyFile(new URL('../../layouts/partials/boxes/slider-nav.html', import.meta.url), path.join(root, 'layouts/partials/boxes/slider-nav.html'))
  await fs.writeFile(path.join(root, 'layouts/partials/link.html'), '<button class="{{ .class }}" title="{{ .title }}"></button>')
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\n')
  await fs.writeFile(path.join(root, 'layouts/index.html'), '{{ range slice "line" "dot" "pill" "hide" }}<section id="{{ . }}">{{ partial "boxes/slider-nav" (dict "pips" . "arrows" "hide" "items" 3) }}</section>{{ end }}')
  const built = spawnSync('hugo', ['--source', root], { encoding: 'utf8' })
  assert.equal(built.status, 0, built.stderr)
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  for (const mode of ['line', 'dot', 'pill', 'hide']) {
    const section = html.match(new RegExp(`<section id="${mode}">([\\s\\S]*?)</section>`))[1]
    if (mode === 'hide') {
      assert.doesNotMatch(section, /slider__pip|<button/)
      continue
    }
    assert.equal((section.match(/<button/g) || []).length, 3)
    assert.equal((section.match(/slider__pip--active/g) || []).length, 1, 'inactive pips must not inherit the first active class')
    assert.match(section, /<button class="slider__pip slider__pip--active"/)
    if (mode === 'line') assert.doesNotMatch(section, /slider__pips--/)
    else assert.match(section, new RegExp(`class="slider__pips slider__pips--${mode}"`))
  }
})

test('pill Sass compiles with moving targets and inherited corner shapes and global reduced motion overrides its transition', async t => {
  if (spawnSync('sass', ['--version']).status !== 0) return t.skip('Dart Sass unavailable')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-slider-pill-style-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'boxes'))
  await fs.copyFile(new URL('../../assets/css/boxes/_slider.scss', import.meta.url), path.join(root, 'boxes/_slider.scss'))
  await fs.copyFile(new URL('../../assets/css/_mixins.scss', import.meta.url), path.join(root, '_mixins.scss'))
  await fs.copyFile(new URL('../../assets/css/_reduced-motion.scss', import.meta.url), path.join(root, '_reduced-motion.scss'))
  await fs.writeFile(path.join(root, '_variables.scss'), '$radius: 1rem;')
  await fs.writeFile(path.join(root, '_custom-properties.scss'), '')
  await fs.writeFile(path.join(root, 'entry.scss'), '@use "boxes/slider"; @use "reduced-motion";')
  const built = spawnSync('sass', ['--no-source-map', path.join(root, 'entry.scss')], { encoding: 'utf8' })
  assert.equal(built.status, 0, built.stdout + built.stderr)
  assert.match(built.stdout, /\.slider__pips--pill \.slider__pip\s*\{\s*width: 2em;/)
  assert.match(built.stdout, /\.slider__pips--pill \.slider__pip::before\s*\{\s*width: 0\.75em;\s*height: 0\.75em;\s*transition: width 0\.2s ease, background-color 0\.1s;/)
  assert.match(built.stdout, /\.slider__pips--pill \.slider__pip\s*\{[^}]*--base: var\(--border\);/)
  assert.match(built.stdout, /\.slider__pips--pill \.slider__pip--active::before\s*\{\s*width: 2em;/)
  assert.doesNotMatch(built.stdout, /clip-path: none|border-radius: 999px/)
  assert.match(built.stdout, /\.slider__pips--pill \.slider__pip--active\s*\{\s*width: 3\.25em;/)
  assert.match(built.stdout, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition-duration: 0\.01ms !important;/)
})
