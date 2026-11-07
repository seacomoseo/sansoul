import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

async function render (t, cases) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-links-layout-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  for (const directory of ['layouts/partials/blocks', 'layouts/partials/func', 'data']) {
    await fs.mkdir(path.join(root, directory), { recursive: true })
  }
  for (const source of ['blocks/links', 'blocks/margin-style', 'func/set', 'func/set-value', 'func/columns', 'func/attrs', 'func/is-mail', 'func/ga4-event', 'func/phone-to-complete', 'link']) {
    await fs.copyFile(path.join(engine, `layouts/partials/${source}.html`), path.join(root, `layouts/partials/${source}.html`))
  }
  await fs.writeFile(path.join(root, 'layouts/partials/icon.html'), '<svg data-icon="{{ .icon | default .def }}"></svg>')
  await fs.writeFile(path.join(root, 'layouts/index.html'), '{{ range $name, $case := site.Data.cases }}<section id="{{ $name }}">{{ partial "blocks/links" $case }}</section>{{ end }}')
  await fs.writeFile(path.join(root, 'data/cases.json'), JSON.stringify(cases))
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\ndisableKinds: [taxonomy, term, RSS, sitemap]\n')
  const built = spawnSync('hugo', ['--source', root, '--environment', 'production'], { encoding: 'utf8' })
  assert.equal(built.status, 0, built.stdout + built.stderr)
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  return name => html.match(new RegExp(`<section id="${name}">([\\s\\S]*?)</section>`))[1]
}

const custom = (label, properties = {}) => ({ type: 'custom', label, url: 'https://example.com/', ...properties })

test('link defaults inherit all item options while explicit false and item values win', async t => {
  const result = await render(t, {
    defaults: {
      btn: 'main', swap: true,
      link: { label: 'Inherited', url: 'https://shared.example/', btn: 'alt', swap: true, il: 'star', ir: 'close', ga4: 'shared_event', lock: true, title: 'Shared title' },
      links: [{}, custom('Override', { btn: 'none', swap: false, ga4: 'none', lock: false, il: 'hide', title: 'Own title' })]
    }
  })
  const html = result('defaults')
  assert.match(html, /links--grow/)
  assert.match(html, /class="[^"]*btn--swap[^"]*alt[^"]*ga4/)
  assert.match(html, /data-icon="star"/)
  assert.match(html, /title="Shared title"/)
  assert.match(html, /Inherited/)
  assert.match(html, /<a[^>]*class="link link__custom"[^>]*href="https:\/\/example.com\/"[^>]*title="Own title"/)
  assert.equal((html.match(/links__item--sized/g) || []).length, 0)
})

test('responsive columns and per-link fits serialize independently with auto columns shared with boxes', async t => {
  const result = await render(t, {
    fit: { links: [custom('Quarter off', { fit: 0.75, fit_vs: null }), custom('Half mobile', { fit_vs: 0.5 })] },
    columns: { link: { cols: 3, cols_vs: 2, align_x: 'space-between' }, links: [custom('One'), custom('Two', { fit: 2 })] },
    auto: { link: { cols: 0, cols_vs: 0 }, links: [custom('One'), custom('Two'), custom('Three')] }
  })
  assert.match(result('fit'), /--links-cols-vs:1;--links-cols-vl:1/)
  assert.match(result('fit'), /links__item--sized" style="--links-fit-vl:0.75"/)
  assert.match(result('fit'), /links__item--sized" style="--links-fit-vs:0.5"/)
  assert.match(result('columns'), /links--space-between/)
  assert.match(result('columns'), /--links-cols-vs:2;--links-cols-vl:3/)
  assert.equal((result('columns').match(/links__item--sized/g) || []).length, 2)
  assert.match(result('columns'), /--links-fit-vl:2/)
  assert.match(result('auto'), /--links-cols-vs:3;--links-cols-vl:3/)
})

test('legacy separator types disappear and full has no layout effect', async t => {
  const result = await render(t, {
    removed: { links: ['h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'br'].map(type => ({ type, label: 'Separator' })).concat([custom('Kept', { full: true }), { type: 'address', hide: true, label: 'Hidden' }]) }
  })
  const html = result('removed')
  assert.doesNotMatch(html, /Separator|Hidden|<hr|<h[2-6]|link__br|\bfull\b|links__item--sized/)
  assert.equal((html.match(/class="links__item"/g) || []).length, 1)
  assert.match(html, /Kept/)
})

test('links Sass compiles with fluid columns/fits and keeps explicit sizes outside grow', async t => {
  if (spawnSync('sass', ['--version']).status !== 0) return t.skip('Dart Sass unavailable')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-links-style-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'boxes/blocks'), { recursive: true })
  await fs.copyFile(path.join(engine, 'assets/css/boxes/blocks/_links.scss'), path.join(root, 'boxes/blocks/_links.scss'))
  await fs.copyFile(path.join(engine, 'assets/css/_mixins.scss'), path.join(root, '_mixins.scss'))
  await fs.writeFile(path.join(root, '_variables.scss'), '$btns-3d: true;')
  await fs.writeFile(path.join(root, '_custom-properties.scss'), '')
  await fs.writeFile(path.join(root, 'entry.scss'), '@use "boxes/blocks/links";')
  const built = spawnSync('sass', ['--no-source-map', path.join(root, 'entry.scss')], { encoding: 'utf8' })
  assert.equal(built.status, 0, built.stdout + built.stderr)
  assert.match(built.stdout, /\.links--grow > \.links__item:not\(\.links__item--sized\)\s*\{\s*flex-grow: 1;/)
  assert.match(built.stdout, /\.links__item--sized\s*\{\s*width: max\(0px, \(100% \+ 1em\) \* var\(--links-fit\) \/ var\(--links-cols\) - 1em\);\s*flex-shrink: 0;/)
  assert.match(built.stdout, /--links-fit-vl: var\(--links-fit-vs, 1\)/)
  assert.match(built.stdout, /--links-fit: calc\(/)
  assert.match(built.stdout, /\.links--flex-end\s*\{\s*justify-content: flex-end;/)
})

test('automatic columns count effective inherited fits and only rendered links', async t => {
  const result = await render(t, {
    inherited: { link: { cols: 0, cols_vs: 0, fit: 2, fit_vs: 2 }, links: [custom('One'), custom('Two'), custom('Three')] },
    visible: { link: { cols: 0, cols_vs: 0 }, links: [custom('One'), custom('Two'), custom('Three'), { type: 'address', hide: true }, { type: 'h2', label: 'Removed' }] },
    override: { link: { fit: 2, fit_vs: 0.5 }, links: [custom('Override', { fit: 0.75, fit_vs: null })] }
  })
  assert.match(result('inherited'), /--links-cols-vs:4;--links-cols-vl:4/)
  assert.equal((result('inherited').match(/--links-fit-vl:2;--links-fit-vs:2/g) || []).length, 3)
  assert.match(result('visible'), /--links-cols-vs:3;--links-cols-vl:3/)
  assert.equal((result('visible').match(/class="links__item links__item--sized"/g) || []).length, 3)
  // Explicit null clears inherited fit_vs, restoring the mobile base of one.
  assert.match(result('override'), /style="--links-fit-vl:0.75"/)
  assert.doesNotMatch(result('override'), /--links-fit-vs:/)
})
