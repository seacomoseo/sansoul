import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const hasHugo = spawnSync('hugo', ['version']).status === 0

// Section Markdown is rendered by func/md. Its page-aware shortcodes must read
// the page being built: collection pages used to resolve {{% get %}} against
// the home page (14.15.2 and earlier).
test('{{% get %}} in section Markdown resolves against the page being built', { skip: !hasHugo, timeout: 60000 }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-md-page-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), content)
  }
  const copy = file => write(file, fs.readFileSync(path.join(engine, file), 'utf8'))
  for (const file of ['layouts/partials/func/md.html', 'layouts/partials/func/get-param.html', 'layouts/partials/func/index-split.html', 'layouts/shortcodes/get.html']) copy(file)
  write('layouts/partials/icon.html', '<i class="icon">{{ .icon }}</i>')
  // The _examples service is a collection page with its own params.
  write('content/service/servicio.es.md', fs.readFileSync(path.join(engine, '_examples/content/service/servicio.es.md'), 'utf8')
    .replace(/^---\n/, '---\nheader:\n  md: Cabecera del servicio\n'))
  write('content/_index.es.md', '---\ntitle: Portada\nprovider: Portada SL\nheader:\n  md: Cabecera de la portada\n---\n')
  // One shared section, as a data/section file would provide it.
  const section = '::bolt:: {{% get header.md %}} · {{% get title %}} · {{% get provider %}}'
  write('data/section.yml', `md: ${JSON.stringify(section)}\n`)
  const layout = '<main>{{ partial "func/md" hugo.Data.section.md }}</main>'
  write('layouts/_default/single.html', layout)
  write('layouts/_default/list.html', layout)
  write('layouts/index.html', layout)
  write('hugo.yml', 'baseURL: https://fixture.example/\ndefaultContentLanguage: es\ndisableKinds: [taxonomy, term, RSS, sitemap]\nlanguages:\n  es:\n    languageCode: es\n')

  const built = spawnSync('hugo', ['--source', root, '--quiet'], { encoding: 'utf8' })
  assert.equal(built.status, 0, built.stdout + built.stderr)
  const html = file => fs.readFileSync(path.join(root, 'public', file), 'utf8')
  assert.match(html('service/servicio/index.html'), /<i class="icon">bolt<\/i> Cabecera del servicio · Servicio de ejemplo · SanSoul/)
  assert.match(html('index.html'), /<i class="icon">bolt<\/i> Cabecera de la portada · Portada · Portada SL/)
})
