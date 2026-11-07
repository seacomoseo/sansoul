import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

test('box margins use the small/base names and block overrides stay on the outer wrapper', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-block-margins-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'layouts'), { recursive: true })
  await fs.cp(new URL('../../layouts/partials', import.meta.url), path.join(root, 'layouts/partials'), { recursive: true })
  await fs.cp(new URL('../../i18n', import.meta.url), path.join(root, 'i18n'), { recursive: true })
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\n')
  await fs.writeFile(path.join(root, 'layouts/partials/icon.html'), '{{ return "" }}')
  await fs.writeFile(path.join(root, 'layouts/partials/schema/review.html'), '{{ return "{}" }}')
  await fs.writeFile(path.join(root, 'layouts/index.html'), `
    <section id="box"><div{{ partial "boxes/attr" (dict "key" 0 "mt" 0 "mt_vl" 4 "mb" 1 "mb_vl" 3 "ml" -1 "ml_vl" 2 "mr" 2 "mr_vl" 0) }}></div></section>
    {{ $margin := dict "mt" 0 "mt_vl" 3 }}
    <section id="step">{{ partial "blocks/steps" (dict "level" 2 "step" $margin "steps" slice) }}</section>
    <section id="faq">{{ partial "blocks/faq" (dict "faq" $margin "faqs" slice) }}</section>
    <section id="review">{{ partial "blocks/reviews" (dict "review" $margin "reviews" slice) }}</section>
    <section id="review-slider">{{ partial "blocks/reviews" (dict "review" (merge $margin (dict "slider" true)) "reviews" slice) }}</section>
    <section id="gallery">{{ partial "blocks/gallery" (dict "col_vl" 1 "col_vs" 1 "gallery" (merge $margin (dict "type" "grid")) "imgs" slice) }}</section>
    <section id="link">{{ partial "blocks/links" (dict "link" $margin "links" (slice (dict "type" "custom" "url" "#target" "label" "Link"))) }}</section>
    <section id="form">{{ partial "blocks/form" (dict "Page" . "section" (dict "id" "fixture") "form" (merge $margin (dict "id" "fixture-form" "action" "about:blank" "cols" 2)) "inputs" slice) }}</section>
    <section id="geo">{{ partial "blocks/geo" (dict "id" "fixture" "geo" $margin "geos" (slice (dict "type" "point" "geo" "point-data"))) }}</section>
    <section id="boxes">{{ partial "boxes/items" (dict "boxes_wrap" true "columns" (dict "vl" 1 "vs" 1) "box" (dict "cols" 1) "boxes" slice "block_spacing" $margin) }}</section>
    <section id="boxes-slider">{{ partial "boxes/items" (dict "boxes_wrap" true "columns" (dict "vl" 1 "vs" 1) "box" (dict "slider" true) "boxes" slice "block_spacing" $margin) }}</section>
    <section id="single">{{ partial "func/attrs" (dict "style" (partial "blocks/margin-style" (dict "mt" 2))) }}</section>
    <section id="large">{{ partial "func/attrs" (dict "style" (partial "blocks/margin-style" (dict "mt_vl" 2))) }}</section>
    <section id="absent">{{ partial "blocks/steps" (dict "level" 2 "step" dict "steps" slice) }}</section>
  `)
  const result = spawnSync('hugo', ['--source', root], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  const section = id => html.match(new RegExp(`<section id="${id}">([\\s\\S]*?)</section>`))[1]
  const box = section('box')
  for (const [side, small, large] of [['t', 0, 4], ['b', 1, 3], ['l', -1, 2], ['r', 2, 0]]) {
    assert.ok(box.includes(`--box-m${side}-vs:${small}`), side)
    assert.ok(box.includes(`--box-m${side}-vl:${large}`), side)
  }
  for (const id of ['step', 'faq', 'review', 'review-slider', 'gallery', 'link', 'form', 'geo', 'boxes', 'boxes-slider']) {
    const markup = section(id)
    const [wrapper] = markup.match(/<(?:div|ul|form)[^>]*box__block[^>]*>/) || []
    assert.ok(wrapper, `${id}: outer block wrapper exists`)
    assert.match(wrapper, /--block-mt-vs:0;--block-mt-vl:3/, `${id}: zero is an explicit override`)
    assert.equal((markup.match(/--block-mt-vs:/g) || []).length, 1, `${id}: nested tracks never receive another margin`)
    assert.doesNotMatch(wrapper, /\[--block/, `${id}: style arrays must stay flat`)
  }
  assert.match(section('single'), /--block-mt-vs:2;--block-mt-vl:2/)
  assert.match(section('large'), /--block-mt-vs:0;--block-mt-vl:2/)
  assert.doesNotMatch(section('absent'), /--block-mt/)
})
