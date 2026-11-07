import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

test('localized search pages render usable search controls and their language index endpoint', async t => {
  if (spawnSync('hugo', ['version']).status !== 0) return t.skip('Hugo unavailable')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-search-render-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  for (const directory of ['content/page', 'layouts/_default', 'layouts/shortcodes', 'layouts/partials/func', 'assets/js', 'data/types', 'i18n']) {
    await fs.mkdir(path.join(root, directory), { recursive: true })
  }
  const languages = ['de', 'en', 'es', 'fr', 'it', 'pt']
  const slugs = new Map()
  for (const language of languages) {
    const source = path.join(engine, `content/page/search.${language}.md`)
    const page = await fs.readFile(source, 'utf8')
    slugs.set(language, page.match(/^slug:\s*(.+)$/m)[1].trim())
    await fs.copyFile(source, path.join(root, `content/page/search.${language}.md`))
    await fs.copyFile(path.join(engine, `i18n/${language}.yml`), path.join(root, `i18n/${language}.yml`))
  }
  await fs.copyFile(path.join(engine, 'layouts/shortcodes/search.html'), path.join(root, 'layouts/shortcodes/search.html'))
  await fs.copyFile(path.join(engine, 'layouts/partials/search.html'), path.join(root, 'layouts/partials/search.html'))
  await fs.writeFile(path.join(root, 'layouts/partials/icon.html'), '<svg aria-hidden="true"></svg>')
  await fs.writeFile(path.join(root, 'layouts/partials/func/publish-content-resource.html'), '{{ return .resource }}')
  await fs.writeFile(path.join(root, 'assets/js/fixedsearch.js'), '/* Search fixture resource. */')
  await fs.writeFile(path.join(root, 'data/types/all.yml'), 'tpl:\n  list:\n    cols: 3\n')
  await fs.writeFile(path.join(root, 'layouts/_default/single.html'), '{{ .Content }}')
  await fs.writeFile(path.join(root, 'layouts/index.html'), '{{ .Content }}')
  await fs.writeFile(path.join(root, 'layouts/index.json.json'), '[]')
  await fs.writeFile(path.join(root, 'hugo.yml'), `baseURL: https://fixture.example/
defaultContentLanguage: es
outputs:
  home: [HTML, JSON]
languages:
${languages.map(language => `  ${language}:\n    languageCode: ${language}`).join('\n')}
`)
  const built = spawnSync('hugo', ['--source', root, '--environment', 'production'], { encoding: 'utf8' })
  assert.equal(built.status, 0, built.stdout + built.stderr)
  for (const language of languages) {
    const prefix = language === 'es' ? '' : language + '/'
    const html = await fs.readFile(path.join(root, 'public', prefix, 'page', slugs.get(language), 'index.html'), 'utf8')
    assert.match(html, /<form\b[^>]*id="search__form"[^>]*role="search"[^>]*method="GET"/, language)
    assert.ok(html.includes(`data-index="/${prefix}index.json"`), language)
    assert.match(html, /<input\b[^>]*id="search__input"[^>]*type="search"[^>]*name="q"/, language)
    assert.match(html, /<button\b[^>]*id="search__submit"[^>]*type="submit"/, language)
    assert.match(html, /aria-controls="search__results"/, language)
    assert.match(html, /id="search__results"/, language)
    assert.match(html, /<script src="\/js\/fixedsearch(?:\.min)?\.js" defer><\/script>/, language)
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'public', prefix, 'index.json'), 'utf8')), [], language)
  }
})
