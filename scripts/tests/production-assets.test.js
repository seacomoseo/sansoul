import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'

const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const project = path.resolve(engine, path.basename(engine) === 'core' ? '..' : '../..')
const hasHugo = spawnSync('hugo', ['version'], { encoding: 'utf8' }).status === 0

// This exercises real Hugo resource transforms without starting a server or
// touching the consumer's generated output. No remote services are submitted.
test('production shares whole-module graphs and ordered CSS while retaining complete fallbacks', { skip: !hasHugo, timeout: 120000 }, t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-assets-'))
  const write = (name, value) => {
    fs.mkdirSync(path.dirname(path.join(fixture, name)), { recursive: true })
    fs.writeFileSync(path.join(fixture, name), value)
  }
  try {
    fs.mkdirSync(path.join(fixture, 'core'))
    for (const name of ['assets', 'layouts', 'data', 'i18n']) {
      fs.cpSync(path.join(engine, name), path.join(fixture, 'core', name), { recursive: true })
    }
    fs.copyFileSync(path.join(engine, 'hugo.default.yml'), path.join(fixture, 'core/hugo.default.yml'))
    write('core/hugo.yml', 'theme: []\n')
    fs.symlinkSync(path.join(project, 'node_modules'), path.join(fixture, 'node_modules'), 'dir')
    write('hugo.yml', `baseURL: https://fixture.example/
themesDir: .
theme: [core]
defaultContentLanguage: es
languages:
  es:
    disabled: false
locale: es
timeout: 20s
build:
  noJSConfigInAssets: true
markup:
  goldmark:
    renderer:
      unsafe: true
module:
  mounts:
  - source: assets
    target: assets
  - source: content
    target: content
  - source: data
    target: data
  - source: layouts
    target: layouts
  - source: core/i18n
    target: data/i18n
`)
    // Local faces make preload assertions deterministic even without network.
    const font = path.join(project, 'node_modules/material-symbols/material-symbols-outlined.woff2')
    if (!fs.existsSync(font)) throw new Error('Install the declared project dependencies before running asset integration tests')
    const styles = fs.readFileSync(path.join(engine, '_examples/data/styles.yml'), 'utf8')
      .replace('family: Montserrat', 'family: Fixture Base')
      .replace('family: Montserrat', 'family: Fixture Title')
      .replace('family: Dancing Script', 'family: Fixture Cursive')
      .replace('bold: 0', 'bold: 700')
    write('data/styles.yml', styles)
    for (const name of ['fixture-base-400', 'fixture-base-700', 'fixture-title-800', 'fixture-cursive-400']) {
      const target = path.join(fixture, `assets/u/fonts/${name}.woff2`)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(font, target)
    }
    write('layouts/_default/baseof.html', `{{ block "none" . }}{{ end }}{{ $body := print .Content (partial "schema/img" (dict "url" "/fixture.webp" "width" 640 "height" 480 "caption" "Fixture")) | safeHTML }}
{{ $usage := partial "files/component-usage" (dict "html" $body "attributes" "" "custom" "") }}
{{ if .Params.asset_all }}{{ $flags := dict }}{{ range $name, $flag := $usage.flags }}{{ $flags = merge $flags (dict $name true) }}{{ end }}{{ $usage = dict "full" false "flags" $flags }}{{ end }}
{{ page.Store.Set "sansoul.assets.usage" $usage }}
{{ hugo.Store.SetInMap "sansoul.assets.pages" .RelPermalink $usage }}
{{ if and hugo.IsProduction (not $usage.full) }}{{ page.Store.Set "sansoul.assets.registering" true }}{{ $registered := partial "scripts" . }}{{ page.Store.Set "sansoul.assets.registering" false }}{{ end }}
{{ partial "files/fonts" . }}
{{ with (templates.Defer (dict "data" (dict "body" $body))) }}
{{ $css := partial "styles" page }}{{ $js := partial "scripts" page }}
<!doctype html><html><head>{{ partial "files/font-preloads" page }}{{ range page.Store.Get "sansoul.assets.styles" }}<link rel="stylesheet" href="{{ .RelPermalink }}">{{ end }}</head>
<body>{{ if page.Params.asset_all }}{{ $parts := slice }}{{ range page.Store.Get "sansoul.assets.styles" }}{{ $parts = $parts | append .Content }}{{ end }}{{ $joined := resources.FromString "css/rejoined.css" (delimit $parts "") | minify }}<link data-rejoined href="{{ $joined.RelPermalink }}">{{ end }}{{ .body }}<script src="{{ $js.RelPermalink }}" defer></script></body></html>{{ end }}`)
    write('layouts/_default/single.html', '{{ define "none" }}{{ end }}')
    write('layouts/index.html', '{{ define "none" }}{{ end }}')
    write('layouts/shortcodes/asset-fixture.html', '<div class="slider"><div class="slider__track"></div></div>')
    const page = (name, body, extra = '') => write(`content/${name}.es.md`, `---\ntitle: ${name}\n${extra}---\n${body}\n`)
    write('data/config.yml', 'show: true\n')
    page('page/cookies', '<h1>Cookie policy</h1>')
    page('show-only', '<h1>Simple</h1><p class=show>Body text.</p>')
    page('cookies-only', '<h1>Simple</h1><div class=cookies>Cookie controls</div>')
    page('dots', '<h1 class=box__title>Dots</h1><div class=dots></div>')
    page('identifiers', '<h1>IDs</h1><div id=disqus_thread></div><nav id=toc></nav><nav id=crumbs></nav><form id=search__form></form><div class=gss></div><legend>Legend</legend>')
    page('simple', '<h1>Simple</h1><p>Body text.</p>')
    page('twin', '<h1>Twin</h1><p>Other body text.</p>')
    page('components', `<h1>Components</h1>
<dialog class=modal><div class='faq'><button class="faq__btn">Question</button><div class="faq__md">Answer</div></div></dialog>
<form class="form"><input type="file"><div class="form__geo-map"></div></form>
<div class="gallery"></div><div class="map"></div><span data-lightbox="fixture"></span>
{{< asset-fixture >}}`)
    page('full', '<h1>External integration</h1>', 'assets_full: true\n')
    page('all-selected', '<h1>All modules</h1>', 'asset_all: true\n')
    page('injected', '<h1>Dynamic content</h1><script>window.externalWidget = true</script>')
    page('json-data', `<h1>Data blocks</h1>
<script TYPE='APPLICATION/JSON; charset=utf-8'>{"items":[]}</script>
<script type=application/ld+json>{"@type":"WebPage"}</script>
<script type = "application/json">{}</script>`)
    page('module-script', '<h1>Module</h1><script type=module>window.externalWidget = true</script>')
    page('unknown-script', '<h1>Unknown type</h1><script type=application/x-custom>{}</script>')
    page('attribute-script', '<h1>Attribute text</h1><script data-note=" type=application/json">window.externalWidget = true</script>')

    const build = (environment, minify = false) => {
      const result = spawnSync('hugo', ['--config', 'core/hugo.default.yml,hugo.yml', '--environment', environment, '--destination', `public-${environment}`, '--cacheDir', path.join(fixture, 'cache'), ...(minify ? ['--minify'] : [])], {
        cwd: fixture,
        timeout: 30000,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${path.join(engine, 'scripts/bin')}:${path.join(project, 'node_modules/.bin')}:${process.env.PATH}` }
      })
      assert.equal(result.status, 0, result.stdout + result.stderr)
      return name => {
        const html = fs.readFileSync(path.join(fixture, `public-${environment}/${name}/index.html`), 'utf8')
        const read = kind => {
          const matches = [...html.matchAll(kind === 'js' ? /<script src=(?:"([^"]+)"|([^\s>]+)) defer/g : /<link rel=(?:"stylesheet"|stylesheet) href=(?:"([^"]+)"|([^\s>]+))/g)]
          const urls = matches.map(match => match[1] || match[2])
          const visited = new Set()
          const files = []
          const collect = url => {
            if (visited.has(url)) return
            visited.add(url)
            const bytes = fs.readFileSync(path.join(fixture, `public-${environment}`, url.replace(/^\//, '')))
            files.push({ url, text: bytes.toString(), bytes: bytes.length, gzip: gzipSync(bytes).length })
            if (kind === 'js') {
              for (const match of bytes.toString().matchAll(/(?:from|import)\s*["'](\.[^"']+)["']/g)) collect(path.posix.resolve(path.posix.dirname(url), match[1]))
            }
          }
          for (const url of urls) collect(url)
          return { url: urls.join(','), urls, files, text: files.map(file => file.text).join('\n'), bytes: files.reduce((sum, file) => sum + file.bytes, 0), gzip: files.reduce((sum, file) => sum + file.gzip, 0) }
        }
        return { html, js: read('js'), css: read('css') }
      }
    }
    const production = build('production')
    const simple = production('simple')
    const component = production('components')
    const full = production('full')
    const injected = production('injected')
    const allSelected = production('all-selected')
    const rejoinedUrl = allSelected.html.match(/data-rejoined href="([^"]+)"/)[1]
    const rejoined = fs.readFileSync(path.join(fixture, 'public-production', rejoinedUrl.replace(/^\//, '')), 'utf8')
    assert.equal(rejoined, full.css.text, 'joining all selected segments reproduces the complete compiled CSS cascade exactly')
    const twin = production('twin')
    const dots = production('dots')
    assert.match(simple.html, /application\/ld\+json/, 'real schema partial participates before component detection')
    assert.equal(production('json-data').js.url, simple.js.url, 'JSON and JSON-LD data blocks retain component selection')
    for (const name of ['module-script', 'unknown-script', 'attribute-script']) {
      assert.equal(production(name).js.url, full.js.url, `${name} retains full assets`)
    }
    assert.match(dots.css.text, /\.box__title\+\.dots:last-child/)
    const identifiers = production('identifiers')
    assert.match(identifiers.js.text, /disqus.com/)
    assert.match(identifiers.css.text, /#toc/)
    assert.match(identifiers.css.text, /#crumbs/)
    assert.match(identifiers.css.text, /#search__results/)
    assert.match(identifiers.css.text, /\.gss\{/)
    const show = production('show-only')
    const cookies = production('cookies-only')
    assert.notEqual(show.js.url, simple.js.url)
    assert.notEqual(cookies.js.url, simple.js.url)
    assert.match(show.js.text, /show--will/)
    assert.doesNotMatch(simple.js.text, /show--will/)
    assert.match(cookies.js.text, /cookies:media|cookies:/)
    assert.doesNotMatch(simple.js.text, /cookies:/)
    assert.equal(simple.js.url, twin.js.url, 'identical sets share the compiled JS')
    assert.equal(simple.css.url, twin.css.url, 'identical sets share the compiled CSS')
    assert.ok(simple.js.files.some(file => component.js.files.some(other => other.url === file.url)), 'different component sets share JavaScript chunks')
    assert.ok(simple.css.files.some(file => component.css.files.some(other => other.url === file.url)), 'different component sets share CSS segments')
    assert.equal((simple.css.text.match(/--div-height:/g) || []).length, 1, 'Sass dependencies emit shared custom properties once')
    const transfer = assets => {
      const files = new Map(assets.flatMap(asset => asset.files).map(file => [file.url, file]))
      return [...files.values()].reduce((sum, file) => sum + file.gzip, 0)
    }
    assert.ok(transfer([simple.js, component.js, identifiers.js]) < simple.js.gzip + component.js.gzip + identifiers.js.gzip, 'a route reuses cached shared JavaScript')
    assert.ok(transfer([simple.css, component.css, identifiers.css]) < simple.css.gzip + component.css.gzip + identifiers.css.gzip, 'a route reuses cached shared CSS')
    assert.ok(simple.js.gzip < component.js.gzip)
    assert.ok(component.js.gzip < full.js.gzip)
    assert.ok(simple.css.gzip < component.css.gzip)
    assert.ok(component.css.bytes < full.css.bytes, 'selective CSS removes optional modules; gzip can grow with separate dictionaries')
    assert.doesNotMatch(simple.js.text, /formSubmitSending|MathJax|data-lightbox|leaflet/)
    assert.match(component.js.text, /formSubmitSending/)
    assert.match(component.js.text, /data-lightbox/)
    assert.match(component.js.text, /leaflet/)
    assert.match(component.css.text, /\.faq--active/)
    assert.match(component.css.text, /\.form__item--error/)
    assert.match(component.css.text, /\.gallery__items/)
    assert.match(component.css.text, /\.slider__track/)
    assert.doesNotMatch(simple.css.text, /--gallery-img-hover-transform|\.leaflet-container \.leaflet-tile-pane/)
    assert.match(full.js.text, /MathJax/)
    assert.match(injected.js.text, /MathJax/)
    assert.equal((simple.html.match(/as="font"/g) || []).length, 2, 'only body/title default faces preload')
    assert.equal((full.html.match(/as="font"/g) || []).length, 3, 'full mode deduplicates identical binaries within one family')
    assert.equal((simple.css.text.match(/@font-face/g) || []).length, 4, 'unpreloaded faces stay available')
    assert.match(simple.js.text, /__sansoulInitialized/)
    t.diagnostic(JSON.stringify({ simple: { js: simple.js.bytes, jsGzip: simple.js.gzip, css: simple.css.bytes, cssGzip: simple.css.gzip }, component: { js: component.js.bytes, jsGzip: component.js.gzip, css: component.css.bytes, cssGzip: component.css.gzip }, full: { js: full.js.bytes, jsGzip: full.js.gzip, css: full.css.bytes, cssGzip: full.css.gzip } }))

    const modulePath = path.join(fixture, 'core/assets/js/open-links.js')
    const moduleSource = fs.readFileSync(modulePath, 'utf8')
    fs.writeFileSync(modulePath, moduleSource.replace('export function initOpenLinks () {', "export function initOpenLinks () {\n  document.body.dataset.assetRevision = 'two'"))
    const revised = build('production')('simple')
    assert.notEqual(revised.js.url, simple.js.url, 'a transitive module change fingerprints the batch entry as well as its shared chunks')
    assert.match(revised.js.text, /assetRevision/)
    fs.writeFileSync(modulePath, moduleSource)

    const minified = build('production', true)
    assert.match(minified('simple').html, /type="?application\/ld\+json/, 'deferred output retains the generated schema under HTML minification')
    assert.equal(minified('simple').js.url, simple.js.url)
    assert.equal(minified('json-data').js.url, simple.js.url)
    assert.equal(minified('module-script').js.url, full.js.url)

    const development = build('development')('simple')
    assert.equal(development.js.files.length, 1, 'development retains one complete JavaScript bundle')
    assert.equal(development.css.files.length, 1, 'development retains one complete CSS bundle')
    assert.match(development.js.text, /MathJax|mathjax/)
    assert.match(development.js.text, /formSubmitSending/)
    assert.match(development.css.text, /\.gallery__items/)
    assert.equal((development.html.match(/as="font"/g) || []).length, 4)
    write('assets/_custom.scss', '@use \'custom-component\';\n')
    write('assets/custom-component.scss', '.custom-component { color: red; }\n')
    const imported = build('production')('simple')
    assert.match(imported.css.text, /custom-component/)
    assert.match(imported.js.text, /MathJax/)
    fs.rmSync(path.join(fixture, 'assets/_custom.scss'))
    fs.rmSync(path.join(fixture, 'assets/custom-component.scss'))
    write('assets/styles.scss', fs.readFileSync(path.join(engine, 'assets/styles.scss')))
    const override = build('production')('simple')
    assert.match(override.js.text, /MathJax/)
    fs.rmSync(path.join(fixture, 'assets/styles.scss'))
    fs.appendFileSync(path.join(fixture, 'hugo.yml'), '\nparams:\n  g_translate: true\n')
    const translate = build('production')('simple')
    assert.match(translate.js.text, /translate.google.com/)
    assert.match(translate.css.text, /margin-top:56px/)
    write('assets/custom.js', 'window.customFixtureLoaded = true\n')
    const custom = build('production')('simple')
    assert.match(custom.js.text, /customFixtureLoaded/)
    assert.match(custom.js.text, /MathJax/)
    assert.match(custom.css.text, /\.gallery__items/)
    fs.rmSync(path.join(fixture, 'assets/custom.js'))
    write('data/styles.yml', styles.replaceAll(/Fixture (Base|Title|Cursive)/g, 'Remote Fixture'))
    fs.copyFileSync(font, path.join(fixture, 'assets/remote-font.woff2'))
    write('assets/remote-font.css', [400, 700, 800].map(weight => `/* latin */ @font-face { font-family: 'Remote Fixture'; font-style: normal; font-weight: ${weight}; src: url(fixture.woff2) format('woff2'); }`).join('\n'))
    write('layouts/partials/func/get-remote.html', `{{ $resource := resources.Get "remote-font.woff2" }}{{ if strings.Contains .url "fonts.googleapis.com" }}{{ $resource = resources.Get "remote-font.css" }}{{ end }}{{ return $resource }}`)
    const remote = build('production')('simple')
    const weights = [...remote.css.text.matchAll(/@font-face\{font-family:remote fixture;font-weight:(\d+)/g)].map(match => Number(match[1])).sort()
    assert.deepEqual(weights, [400, 700, 800], 'remote faces retain the matched weight rather than the first family match')
    assert.equal((remote.html.match(/as="font"/g) || []).length, 1, 'identical same-family binaries share one production URL')
    const configPath = path.join(fixture, 'hugo.yml')
    const config = fs.readFileSync(configPath, 'utf8')
      .replace('  g_translate: true', '  g_translate: true\n  name: LanguageOne\n  disqus: esforum')
      .replace('    disabled: false', '    disabled: false\n  en:\n    disabled: false\n    params:\n      name: LanguageTwo\n      disqus: enforum')
    fs.writeFileSync(configPath, config)
    write('content/language-check.en.md', '---\ntitle: Language check\n---\n<h1>English</h1>\n')
    const multilingual = build('production')
    assert.match(multilingual('simple').js.text, /esforum/, 'language map keeps Spanish site configuration')
    assert.match(multilingual('en/language-check').js.text, /enforum/, 'language map keeps English site configuration')
    assert.notEqual(multilingual('simple').js.url, multilingual('en/language-check').js.url, 'different global language options get separate batches')
  } finally {
    if (process.env.SANSOUL_KEEP_ASSET_FIXTURE) t.diagnostic(fixture)
    else fs.rmSync(fixture, { recursive: true, force: true })
  }
})
