import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'

test('floating labels inherit globally, preserve native associations and leave special fields outside', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-floating-labels-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'layouts'), { recursive: true })
  await fs.mkdir(path.join(root, 'data'))
  await fs.cp(new URL('../../layouts/partials', import.meta.url), path.join(root, 'layouts/partials'), { recursive: true })
  await fs.cp(new URL('../../i18n', import.meta.url), path.join(root, 'i18n'), { recursive: true })
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\n')
  await fs.writeFile(path.join(root, 'data/styles.yml'), 'inputs:\n  labels: both\n')
  await fs.writeFile(path.join(root, 'layouts/partials/icon.html'), '{{ return "" }}')
  await fs.writeFile(path.join(root, 'layouts/index.html'), `{{ range slice "inherit" "in" "out" }}{{ $form := dict "id" . "subject" "Test" "action" "about:blank" }}{{ if ne . "inherit" }}{{ $form = merge $form (dict "labels" .) }}{{ end }}<section id="{{ . }}">{{ partial "blocks/form" (dict "Page" $ "section" (dict "id" "fixture") "form" $form "inputs" (slice
    (dict "type" "text" "name" "Name" "req" true)
    (dict "type" "mail" "name" "Email")
    (dict "type" "phone" "name" "Phone")
    (dict "type" "date" "name" "Date")
    (dict "type" "area" "name" "Message")
    (dict "type" "select" "name" "Subject" "items" (slice (dict "key" "one" "label" "One")))
    (dict "type" "range" "name" "Amount" "value" 0)
    (dict "type" "geo" "name" "Place")
  )) }}</section>{{ end }}`)
  const built = spawnSync('hugo', ['--source', root], { encoding: 'utf8' })
  assert.equal(built.status, 0, built.stderr)
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  const section = name => html.match(new RegExp(`<section id="${name}">([\\s\\S]*?)</section>`))[1]
  const both = section('inherit')
  assert.match(both, /form--labels-both/)
  assert.equal([...both.matchAll(/class="form__label form__label--floating"/g)].length, 6)
  for (let index = 0; index < 6; index++) {
    assert.match(both, new RegExp(`for="inherit-field-${index}"`))
    assert.match(both, new RegExp(`id="inherit-field-${index}"`))
  }
  assert.match(both, /<div class="form__select-wrap">/)
  assert.match(both, /<label class="form__label" for="inherit-field-6">Amount/)
  assert.match(both, /<label class="form__label" for="inherit-field-7">Place/)
  assert.doesNotMatch(section('in'), /form__label--floating|form--labels-both|form--labels-out/)
  assert.match(section('out'), /form--labels-out/)
  assert.doesNotMatch(section('out'), /form__label--floating/)
})
