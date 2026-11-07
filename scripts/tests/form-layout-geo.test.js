import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

test('form columns preserve full-width types and resolve explicit viewport fits; geo retains runtime hooks', async t => {
  if (spawnSync('hugo', ['version']).status !== 0) return t.skip('Hugo unavailable')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-form-layout-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'layouts'), { recursive: true })
  await fs.cp(new URL('../../layouts/partials', import.meta.url), path.join(root, 'layouts/partials'), { recursive: true })
  await fs.cp(new URL('../../i18n', import.meta.url), path.join(root, 'i18n'), { recursive: true })
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\n')
  await fs.writeFile(path.join(root, 'layouts/partials/icon.html'), '{{ return "" }}')
  await fs.writeFile(path.join(root, 'layouts/index.html'), `{{ partial "blocks/form" (dict "Page" . "section" (dict "id" "fixture") "form" (dict "id" "fixture-form" "subject" "Test" "action" "about:blank" "cols" 3 "cols_vs" 2) "inputs" (slice
    (dict "type" "text" "name" "ordinary" "full" true)
    (dict "type" "area" "name" "wide")
    (dict "type" "area" "name" "fit" "fit" 0.75)
    (dict "type" "text" "name" "fit-vs" "fit_vs" 0.5)
    (dict "type" "geo" "name" "area-enabled" "area" true)
    (dict "type" "geo" "name" "area-disabled" "area" false)
    (dict "type" "geo" "name" "area-default")
  )) }}
  {{ partial "blocks/geo" (dict "id" "fixture" "geo" (dict "zoom" 8 "tile" "https://tiles.example/{z}/{x}/{y}.png" "color" "red") "map" (dict "zoom" 99) "geos" (slice (dict "type" "point" "geo" "point-data" "label" "Place"))) }}`)
  const result = spawnSync('hugo', ['--source', root], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  assert.match(html, /<form[^>]*class="[^"]*form--columns/)
  assert.match(html, /--form-cols-vs:2;--form-cols-vl:3/)
  const items = [...html.matchAll(/<div class="(form__item[^"\n]*)"([^>]*)>/g)].map(match => ({ classes: match[1], attrs: match[2] }))
  assert.equal(items.length, 7)
  assert.equal(items[0].classes, 'form__item', 'removed full parameter has no effect')
  assert.equal(items[1].classes, 'form__item form__item--full')
  assert.equal(items[2].classes, 'form__item form__item--fit')
  assert.match(items[2].attrs, /--form-fit-vs:1;--form-fit-vl:0.75/)
  assert.match(items[3].attrs, /--form-fit-vs:0.5;--form-fit-vl:0.5/)
  const geoMaps = [...html.matchAll(/<div[^>]*class="form__geo-map"[^>]*>/g)].map(match => match[0])
  assert.equal(geoMaps.length, 3)
  assert.match(geoMaps[0], /data-area="true"/, 'The runtime must receive a string, not an empty boolean HTML attribute')
  assert.match(geoMaps[1], /data-area="false"/)
  assert.match(geoMaps[2], /data-area="false"/)
  assert.match(html, /class="map box__block"/)
  assert.match(html, /data-zoom="8"/)
  assert.doesNotMatch(html, /data-zoom="99"/)
  assert.match(html, /data-color="red"/)
  assert.match(html, /data-geo="point-data"/)
})
