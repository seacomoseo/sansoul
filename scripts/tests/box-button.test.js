import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

test('box button width respects explicit false, direct backgrounds and inherited values; margins preserve zero', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-box-button-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'layouts'), { recursive: true })
  await fs.cp(new URL('../../layouts/partials', import.meta.url), path.join(root, 'layouts/partials'), { recursive: true })
  await fs.cp(new URL('../../data', import.meta.url), path.join(root, 'data'), { recursive: true })
  await fs.cp(new URL('../../i18n', import.meta.url), path.join(root, 'i18n'), { recursive: true })
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\n')
  await fs.writeFile(path.join(root, 'layouts/partials/icon.html'), '{{ return "" }}')
  await fs.writeFile(path.join(root, 'layouts/index.html'), `
    {{ $base := dict "url" "#target" "label" "Action" "anchor" "Action" }}
    {{ range $id, $settings := dict
      "background" (dict "is_bg" true "box_wrap" true)
      "plain" dict
      "forced" (dict "btn_full" true)
      "automatic" (dict "is_bg" true "box_wrap" true "btn_full" false)
      "unwrapped" (dict "is_bg" true "box_wrap" false)
      "inherited" (merge (dict "btn_full" true "btn_mt" 4) (dict "btn_full" false "btn_mt" 0))
      "small" (dict "btn_mt" 0)
      "large" (dict "btn_mt_vl" 3)
      "both" (dict "btn_mt" -1 "btn_mt_vl" 2)
    }}<section id="{{ $id }}">{{ partial "boxes/btn" (merge $base $settings) }}</section>{{ end }}
    <script type="application/json" id="schema">{{ partial "cms/config/boxes" hugo.Data.cms.en | jsonify | safeJS }}</script>
  `)
  const run = spawnSync('hugo', ['--source', root], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  const section = id => html.match(new RegExp(`<section id="${id}">([\\s\\S]*?)</section>`))[1]
  for (const id of ['background', 'forced']) assert.match(section(id), /box__btn--full/)
  for (const id of ['plain', 'automatic', 'unwrapped', 'inherited']) assert.doesNotMatch(section(id), /box__btn--full/)
  for (const id of ['automatic', 'inherited']) assert.match(section(id), /box__btn--auto/)
  for (const id of ['small', 'inherited']) assert.match(section(id), /--block-mt-vs:0;--block-mt-vl:0/)
  assert.match(section('large'), /--block-mt-vs:0;--block-mt-vl:3/)
  assert.match(section('both'), /--block-mt-vs:-1;--block-mt-vl:2/)
  assert.doesNotMatch(section('plain'), /style=|box__btn--mt/)
  const schema = Object.assign({}, ...JSON.parse(html.match(/id="schema">([\s\S]*?)<\/script>/)[1]))
  for (const name of ['btn_full', 'btn_mt', 'btn_mt_vl']) {
    assert.equal(schema[`&${name}`].required, false)
    assert.equal(Object.hasOwn(schema[`&${name}`], 'default'), false, `${name} must preserve absent/inherited values`)
  }
  assert.equal(schema['&btn_full'].widget, 'select')
  assert.equal(schema['&btn_full'].options, '~opts_bool')
})
