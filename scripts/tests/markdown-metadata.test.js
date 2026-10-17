import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import vm from 'node:vm'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import * as syntax from '../../assets/js/cms/markdown-metadata.js'
import { migrateMarkdown, migrateProject } from '../migrations/8.0.0-markdown-metadata.js'

const themeDir = fileURLToPath(new URL('../../', import.meta.url))

test('link metadata round trips buttons, icons, flags and quoted titles', () => {
  for (const follow of ['lock', 'homefollow', '']) {
    const value = { url: '/target/', icon: 'svg:bolt', anchor: 'Open', title: 'A "quoted" \\ title', btn: true, color: 'alt', dot: true, sm: true, swap: true, follow, blank: true, ga4: true }
    const block = syntax.formatLink(value)
    assert.match(block, /\{alt dot sm swap/)
    assert.deepEqual(syntax.parseLinkMatch(block.match(syntax.linkPattern)), value)
  }
  const old = '[Lock](/target "Heading [nofollow blank]")'
  assert.equal(syntax.parseLinkMatch(old.match(syntax.linkPattern)).follow, 'lock')
  assert.equal(syntax.formatLink(syntax.parseLinkMatch(old.match(syntax.linkPattern))), '[Lock](/target "Heading {lock blank}")')
  for (const title of ['A [normal title]', 'A {normal title}', 'An ordinary title']) {
    assert.deepEqual(syntax.parseLinkTitle(title), { title, tokens: [] })
  }
})

test('images preserve descriptive alt and escape captions across new and legacy formats', () => {
  for (const alt of ['', 'Descriptive alt', 'A ] detail', 'A [ detail', 'A [nested] detail']) {
    const value = { src: '/u/image.jpg', alt, ratio: '3/2', title: 'Caption "with quotes"', url: '/destination/' }
    const block = syntax.formatImage(value)
    const match = block.match(syntax.inlineImagePattern)
    assert.deepEqual(syntax.parseImage(match[1], match[2], match[3], match[4]), value)
  }
  assert.deepEqual(syntax.parseImage('3/2', '/u/image.jpg', 'Caption'), { alt: '', src: '/u/image.jpg', title: 'Caption', ratio: '3/2', url: '' })
  assert.equal(syntax.parseImage('Real alt', '/image', 'Plain {caption}').title, 'Plain {caption}')
})

test('source migration is idempotent, preserves code and handles YAML quoting', () => {
  const old = '[Open](/x "Heading [nofollow blank]")'
  const current = '[Open](/x "Heading {lock blank}")'
  const source = `${old}\n\`\`${old}\`\`\n\`\`\`md\n${old}\n\`\`\`\n![3/2](/u/a.jpg "Caption")\n![Descriptive](/u/a.jpg "Caption")\n`
  const migrated = migrateMarkdown(source)
  assert.equal(migrated, `${current}\n\`\`${old}\`\`\n\`\`\`md\n${old}\n\`\`\`\n![](/u/a.jpg "Caption {3/2}")\n![Descriptive](/u/a.jpg "Caption")\n`)
  assert.equal(migrateMarkdown(migrated), migrated)
  assert.equal(migrateMarkdown(`text: '${old}'\n`, { yaml: true }), `text: '${current}'\n`)
  assert.equal(migrateMarkdown(`text: ${JSON.stringify(old)}\n`, { yaml: true }), `text: ${JSON.stringify(current)}\n`)
  assert.equal(migrateMarkdown('[A](/x "Price $& [nofollow]")'), '[A](/x "Price $& {lock}")')
  assert.equal(migrateMarkdown('    [A](/x "[nofollow]")'), '    [A](/x "[nofollow]")')
  assert.equal(migrateMarkdown('    desc: \'[A](/x "[nofollow]")\'', { yaml: true }), '    desc: \'[A](/x "{lock}")\'')
  assert.equal(migrateMarkdown('![3/2](/u/my%20photo.jpg)'), '![](/u/my%20photo.jpg "{3/2}")')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-markdown-migration-'))
  try {
    fs.mkdirSync(path.join(root, 'content'))
    fs.mkdirSync(path.join(root, 'data'))
    fs.writeFileSync(path.join(root, 'content', 'test.md'), old)
    fs.writeFileSync(path.join(root, 'data', 'test.yml'), `text: '${old}'`)
    fs.writeFileSync(path.join(root, 'outside.md'), old)
    fs.symlinkSync(path.join(root, 'outside.md'), path.join(root, 'content', 'symlink.md'))
    assert.equal(migrateProject(root, { check: true }).length, 2)
    assert.equal(fs.readFileSync(path.join(root, 'content', 'test.md'), 'utf8'), old)
    assert.equal(migrateProject(root).length, 2)
    assert.equal(migrateProject(root).length, 0)
    assert.equal(fs.readFileSync(path.join(root, 'outside.md'), 'utf8'), old)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('real Hugo hooks render token flags, clean captions and preserve genuine alt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-markdown-hooks-'))
  const write = (name, content) => {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
    fs.writeFileSync(path.join(root, name), content)
  }
  try {
    write('hugo.yml', 'baseURL: https://example.org/\n')
    write('layouts/home.html', '{{ .Content }}')
    write('layouts/partials/link.html', '<a data-lock="{{ .lock }}" data-btn="{{ .btn }}" data-sm="{{ .sm }}" data-dot="{{ .dot }}" data-blank="{{ .blank }}" data-anchor="{{ .anchor }}">{{ .label }}</a>')
    write('layouts/partials/func/icon-out.html', '{{ return (dict "text" . "icon" "") }}')
    write('layouts/partials/func/is-vid.html', '{{ return false }}')
    write('layouts/partials/func/video-metadata.html', '{{ return dict }}')
    write('layouts/partials/media/_.html', '<img src="{{ .img }}" alt="{{ .alt }}">')
    for (const name of ['render-link.html', 'render-image.html']) write(`layouts/_default/_markup/${name}`, fs.readFileSync(path.join(themeDir, 'layouts/_default/_markup', name), 'utf8'))
    write('content/_index.md', `---\ntitle: Test\n---\n[[Button]](/x "Label {alt dot sm blank}")\n\n[Legacy](/x "Label [nofollow]")\n\n[Ordinary](/x "A [normal title]")\n\n![Real alt](/u/a.jpg "Caption {3/2}")\n\n![3/2](/u/a.jpg "Legacy caption")\n${syntax.formatImage({ src: '/u/bracket.jpg', alt: 'A [ detail' })}\n`)
    execFileSync('hugo', ['--source', root], { stdio: 'pipe' })
    const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8')
    assert.match(html, /data-btn="alt" data-sm="true" data-dot="true" data-blank="true" data-anchor="Label"/)
    assert.match(html, /data-lock="true"/)
    assert.match(html, /data-anchor="A \[normal title\]"/)
    assert.match(html, /alt="Real alt"/)
    assert.match(html, /<img src="\/u\/bracket.jpg" alt="A \[ detail">/)
    assert.match(html, /--img-ratio:3\/2/)
    assert.match(html, /<figcaption class="md__figcaption">Caption<\/figcaption>/)
    assert.doesNotMatch(html, /Caption \{3\/2\}/)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})


test('registered CMS components serialize new metadata and retain image alt in dialogs', () => {
  const components = []
  let source = fs.readFileSync(path.join(themeDir, 'assets/js/cms/editor-components.js'), 'utf8')
  source = source.replace(/^import .+\n/gm, '')
    .replace('export function initEditorComponents', 'function initEditorComponents')
    .replace('  initEditorComponentStyles()\n  initInlineComponentPreviews()\n  initSelectionPrefill()', '')
  const context = { ...syntax, t: new Proxy({}, { get: (_, key) => key }), window: { CMS: { registerEditorComponent: value => components.push(value) } } }
  vm.runInNewContext(source + '\ninitEditorComponents()', context)
  const component = id => components.find(value => value.id === id)
  const link = component('link')
  const oldLink = '[[::svg:bolt:: Open]](/target "Title [nofollow sm dot]")'
  const updatedLink = link.toBlock(link.fromBlock(oldLink.match(link.pattern)))
  assert.equal(updatedLink, '[[::svg:bolt:: Open]](/target "Title {dot sm lock}")')
  assert(link.fields.find(field => field.name === 'sm'))
  for (const id of ['gallery', 'inline-image']) {
    const editor = component(id)
    const old = '![3/2](/u/image.jpg "Caption")'
    const data = editor.fromBlock(old.match(editor.pattern))
    assert.equal(editor.toBlock(data), '![](/u/image.jpg "Caption {3/2}")')
    const described = '![Real alt](/u/image.jpg "Caption {3/2}")'
    assert.equal(editor.toBlock(editor.fromBlock(described.match(editor.pattern))), described)
  }
  const galleryEditor = component('gallery')
  for (const captionless of ['![Alt](/u/img.jpg)', '[![Alt](/u/img.jpg)](/destination/)']) {
    assert.equal(galleryEditor.toBlock(galleryEditor.fromBlock(captionless.match(galleryEditor.pattern))), captionless)
  }
  const simple = component('gallery-simple')
  const gallery = '<!-- gallery-simple -->\n![3/2](/u/1.jpg "Caption")\n![3/2](/u/2.jpg "Caption 2")'
  const updated = simple.toBlock(simple.fromBlock(gallery.match(simple.pattern)))
  assert.equal(updated, '<!-- gallery-simple -->\n![](/u/1.jpg "Caption {3/2}")\n![](/u/2.jpg "Caption 2 {3/2}")')
})


test('migration refuses symlinked top-level content and data roots', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-markdown-symlink-'))
  try {
    const outside = path.join(root, 'external')
    const consumer = path.join(root, 'consumer')
    fs.mkdirSync(outside)
    fs.mkdirSync(consumer)
    const legacy = '[Original](/x "[nofollow]")'
    fs.writeFileSync(path.join(outside, 'test.md'), legacy)
    fs.writeFileSync(path.join(outside, 'test.yml'), `text: '${legacy}'`)
    fs.symlinkSync(outside, path.join(consumer, 'content'))
    fs.symlinkSync(outside, path.join(consumer, 'data'))
    assert.deepEqual(migrateProject(consumer), [])
    assert.equal(fs.readFileSync(path.join(outside, 'test.md'), 'utf8'), legacy)
    assert.equal(fs.readFileSync(path.join(outside, 'test.yml'), 'utf8'), `text: '${legacy}'`)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('ambiguous YAML list, flow and multiline quoting is preserved with manual warnings', () => {
  const fixtures = [
    'items:\n  - "![3/2](/u/a.jpg)"\n',
    'items: ["![3/2](/u/a.jpg)"]\n',
    'items:\n  ["![3/2](/u/a.jpg)"]\n',
    'desc: "![3/2](/u/a.jpg) \\\n  continued"\n',
    'desc: "![3/2](/u/a.jpg)\n  continued"\n',
    'desc: &reused "![3/2](/u/a.jpg)"\n'
  ]
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-markdown-yaml-'))
  try {
    fs.mkdirSync(path.join(root, 'data'))
    fs.mkdirSync(path.join(root, 'layouts'))
    fs.writeFileSync(path.join(root, 'hugo.yml'), 'baseURL: https://example.org/\n')
    fs.writeFileSync(path.join(root, 'layouts', 'home.html'), '{{ len .Site.Data }}')
    for (const [index, source] of fixtures.entries()) {
      const warnings = []
      const migrated = migrateMarkdown(source, { yaml: true, onWarning: warning => warnings.push(warning) })
      assert.equal(migrated, source)
      assert.equal(warnings.length, 1)
      assert.equal(migrateMarkdown(migrated, { yaml: true }), source)
      fs.writeFileSync(path.join(root, 'data', `fixture${index}.yml`), migrated)
      const frontMatter = `---\n${source}---\n![3/2](/u/body.jpg)\n`
      assert.equal(migrateMarkdown(frontMatter), `---\n${source}---\n![](/u/body.jpg "{3/2}")\n`)
    }
    // Goldmark/Hugo parses the untouched YAML fixtures as part of a real build.
    execFileSync('hugo', ['--source', root], { stdio: 'pipe' })
    assert.equal(fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8'), String(fixtures.length))
    const supported = 'desc: "![3/2](/u/a.jpg)"\nbody: |\n  ![3/2](/u/b.jpg "Caption")\n'
    const migrated = migrateMarkdown(supported, { yaml: true })
    assert.equal(migrated, 'desc: "![](/u/a.jpg \\"{3/2}\\")"\nbody: |\n  ![](/u/b.jpg "Caption {3/2}")\n')
    assert.equal(migrateMarkdown(migrated, { yaml: true }), migrated)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})


test('literal YAML block contents use Markdown rules instead of YAML scalar rules', () => {
  const literal = 'md: |\n  desc: "![3/2](/u/a.jpg)"\n\n  An example:\n\n      [A](/x "[nofollow]")\n\n  ![3/2](/u/b.jpg "Caption")\nnext: ok\n'
  const expected = 'md: |\n  desc: "![](/u/a.jpg "{3/2}")"\n\n  An example:\n\n      [A](/x "[nofollow]")\n\n  ![](/u/b.jpg "Caption {3/2}")\nnext: ok\n'
  assert.equal(migrateMarkdown(literal, { yaml: true }), expected)
  assert.equal(migrateMarkdown(expected, { yaml: true }), expected)
  const frontMatter = `---\n${literal}---\nBody\n`
  assert.equal(migrateMarkdown(frontMatter), `---\n${expected}---\nBody\n`)
  const warnings = []
  for (const source of ['md: >\n  ![3/2](/u/a.jpg)\n', 'md: |2\n    ![3/2](/u/a.jpg)\n']) {
    assert.equal(migrateMarkdown(source, { yaml: true, onWarning: message => warnings.push(message) }), source)
  }
  assert.equal(warnings.length, 2)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-markdown-block-'))
  try {
    fs.mkdirSync(path.join(root, 'data'))
    fs.mkdirSync(path.join(root, 'layouts'))
    fs.writeFileSync(path.join(root, 'hugo.yml'), 'baseURL: https://example.org/\n')
    fs.writeFileSync(path.join(root, 'data', 'fixture.yml'), expected)
    fs.writeFileSync(path.join(root, 'layouts', 'home.html'), '{{ .Site.Data.fixture.md }}')
    execFileSync('hugo', ['--source', root], { stdio: 'pipe' })
    const output = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8')
    assert.match(output, /\[A\]\(\/x/)
    assert.doesNotMatch(output, /\\&#34;/)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})


test('nested sequence block boundaries preserve sibling YAML quoting and flow safety', () => {
  const source = 'sections:\n  - md: |\n      ![3/2](/u/a.jpg)\n    title: "![3/2](/u/b.jpg)"\n'
  const expected = 'sections:\n  - md: |\n      ![](/u/a.jpg "{3/2}")\n    title: "![](/u/b.jpg \\"{3/2}\\")"\n'
  assert.equal(migrateMarkdown(source, { yaml: true }), expected)
  assert.equal(migrateMarkdown(expected, { yaml: true }), expected)
  for (const sibling of ['    items: ["![3/2](/u/b.jpg)"]\n', '    items:\n      - "![3/2](/u/b.jpg)"\n']) {
    const flowSource = 'sections:\n  - md: |\n      ![3/2](/u/a.jpg)\n' + sibling
    const warnings = []
    assert.equal(migrateMarkdown(flowSource, { yaml: true, onWarning: message => warnings.push(message) }), flowSource)
    assert.equal(warnings.length, 1)
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-markdown-nested-block-'))
  try {
    fs.mkdirSync(path.join(root, 'data'))
    fs.mkdirSync(path.join(root, 'layouts'))
    fs.writeFileSync(path.join(root, 'hugo.yml'), 'baseURL: https://example.org/\n')
    fs.writeFileSync(path.join(root, 'data', 'fixture.yml'), expected)
    fs.writeFileSync(path.join(root, 'layouts', 'home.html'), '{{ len .Site.Data.fixture.sections }}')
    execFileSync('hugo', ['--source', root], { stdio: 'pipe' })
    assert.equal(fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8'), '1')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})


test('UTF-8 BOM is preserved before YAML front matter and quoted values stay escaped', () => {
  const source = '\uFEFF---\ntitle: "![3/2](/u/a.jpg)"\n---\nBody\n'
  const expected = '\uFEFF---\ntitle: "![](/u/a.jpg \\"{3/2}\\")"\n---\nBody\n'
  assert.equal(migrateMarkdown(source), expected)
  assert.equal(migrateMarkdown(expected), expected)
  const yaml = '\uFEFFtitle: "![3/2](/u/a.jpg)"\n'
  assert.equal(migrateMarkdown(yaml, { yaml: true }), '\uFEFFtitle: "![](/u/a.jpg \\"{3/2}\\")"\n')
})


test('anchored or tagged block scalars are preserved conservatively', () => {
  for (const prefix of ['&shared ', '!!str ']) {
    const source = `md: ${prefix}|\n  desc: "![3/2](/u/a.jpg)"\n`
    const warnings = []
    assert.equal(migrateMarkdown(source, { yaml: true, onWarning: warning => warnings.push(warning) }), source)
    assert.equal(warnings.length, 1)
    assert.equal(migrateMarkdown(source, { yaml: true }), source)
  }
})
