import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrateSource, migrateProject, migrateMarkdown } from '../migrations/10.0.0-authoring-api.js'
const require = createRequire(import.meta.url)
const YAML = require('yaml')
const migrate = (source, options = {}) => migrateSource(source, { YAML, ...options })

test('API migration follows authoring roles, preserving unrelated icons and source comments', () => {
  const source = `# Keep\nicon: keep\ncustom: {icon: keep, pin: keep, ga4: true}\nbox: {pin: star, icon: box, ga4: true}\nlinks: [{icon: phone, ga4: true}, {ga4: false}]\nform: {ga4: true}\nreview: {icon: star, icon_right: close}\nreviews: [{icon: star}]\nmd: '[Hello](url "Title {homefollow ga4 lock}")'\n`
  const output = migrate(source, { section: true })
  assert.match(output, /# Keep\nicon: keep/)
  assert.match(output, /custom: \{icon: keep, pin: keep, ga4: true\}/)
  assert.match(output, /box: \{il: star, icon: box, ga4: contact\}/)
  assert.match(output, /links: \[\{il: phone, ga4: contact\}, \{ga4: none\}\]/)
  assert.match(output, /form: \{ga4: contact\}/)
  assert.match(output, /review: \{il: star, ir: close\}/)
  assert.match(output, /\{sublock ga4:contact lock\}/)
  assert.equal(YAML.parse(output).links[1].ga4, 'none', 'explicit false must clear inherited analytics rather than remove the override')
  assert.equal(migrate(output, { section: true }), output)
})

test('collection prefix and image config are contextual', () => {
  assert.equal(migrate('permalinks: blog\n'), 'permalinks: blog\n')
  assert.equal(migrate('permalinks: servicios # keep\n', { type: true }), 'prefix: servicios # keep\n')
  assert.throws(() => migrate('permalinks: old\nprefix: new\n', { type: true }), /Conflicting/)
  assert.equal(migrate('---\npermalinks: blog # note\n---\nBody\n', { markdown: true, index: true }), '---\nprefix: blog # note\n---\nBody\n')
  const output = migrate('webp: true # keep\nimg_sizes: [320, 640]\nother: keep\n', { config: true })
  assert.match(output, /imgs_webp: true # keep/)
  assert.ok(!output.includes('img_sizes'))
  assert.equal(YAML.parse(output).other, 'keep')
})

test('global menu and callnow icons migrate without touching brand icons', () => {
  const output = migrate('menu: {icon: keep, items: [{icon: home, ga4: true}]}\ncallnow: [{icon: phone}]\n', { global: true })
  assert.match(output, /menu: \{icon: keep, items: \[\{il: home, ga4: contact\}\]\}/)
  assert.match(output, /callnow: \[\{il: phone\}\]/)
})

test('Markdown migration ignores code, images, titles without metadata and prose', () => {
  const link = '[A](url "Title {ga4 homefollow}")'
  const source = `${link}\n\`${link}\`\n\`\`\`md\n${link}\n\`\`\`\n    ${link}\n![A](x "{ga4}")\n[A](url "ga4 homefollow")\n`
  const result = migrateMarkdown(source)
  assert.ok(result.startsWith('[A](url "Title {ga4:contact sublock}")\n'))
  assert.equal(result.split('ga4:contact').length, 2)
  assert.equal(migrateMarkdown(result), result)
})

test('ambiguous renamed keys and aliases reject migration', () => {
  for (const source of ['box: {pin: a, il: b}', 'links: [{icon: a, il: b}]', 'review: {icon_right: a, ir: b}', 'links: [*alias]']) {
    assert.throws(() => migrate(source, { section: true }), /Conflicting|aliases/)
  }
  assert.throws(() => migrate('permalinks: a\nprefix: b', { index: true }), /Conflicting/)
  assert.throws(() => migrate('webp: true\nimgs_webp: false', { config: true }), /Conflicting/)
})

test('project preflight is read-only and no file is written when a later source conflicts', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-migrate10-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'data/section'), { recursive: true })
  fs.mkdirSync(path.join(root, 'node_modules'))
  fs.symlinkSync(path.dirname(require.resolve('yaml/package.json')), path.join(root, 'node_modules/yaml'))
  const first = path.join(root, 'data/section/a.yml')
  const second = path.join(root, 'data/section/z.yml')
  fs.writeFileSync(first, 'box: {pin: a}\n')
  fs.writeFileSync(second, 'links: [{icon: a, il: b}]\n')
  assert.throws(() => migrateProject(root), /before writing/)
  assert.equal(fs.readFileSync(first, 'utf8'), 'box: {pin: a}\n')
  fs.writeFileSync(second, 'links: [{icon: a}]\n')
  assert.equal(migrateProject(root, { check: true }).length, 2)
  assert.equal(fs.readFileSync(first, 'utf8'), 'box: {pin: a}\n')
  assert.equal(migrateProject(root).length, 2)
  assert.deepEqual(migrateProject(root), [])
})

test('literal and folded Markdown blocks retain comments and scalar semantics', () => {
  for (const marker of ['|', '>-']) {
    const source = `md: ${marker} # keep comment\n  [A](url "{ga4 homefollow}")\n\n  \`[Code](url "{ga4}")\`\n`
    const result = migrate(source, { section: true })
    assert.match(result, new RegExp(`md: ${marker.replace('|', '\\|')} # keep comment`))
    assert.equal(YAML.parse(result).md, migrateMarkdown(YAML.parse(source).md))
    assert.match(result, /\`\[Code\]\(url "\{ga4\}"\)\`/)
  }
})


test('unsupported front matter fails closed instead of silently retaining old public keys', () => {
  assert.throws(() => migrate('+++\npermalinks = "old"\n+++\n', { markdown: true, index: true }), /Non-YAML/)
  assert.throws(() => migrate('{"permalinks":"old"}\n', { markdown: true, index: true }), /Non-YAML/)
})


test('Markdown API migration covers buttons, linked images, alternate title quotes and reference definitions', () => {
  const cases = [
    [`[[::check:: Button]](url "Title [homefollow ga4]")`, `[[::check:: Button]](url "Title {sublock ga4:contact}")`],
    [`[A](url 'Title {homefollow ga4}')`, `[A](url 'Title {sublock ga4:contact}')`],
    [`[reference]: /url "Title {homefollow ga4}"`, `[reference]: /url "Title {sublock ga4:contact}"`],
    [`[![Alt](image.png)](/url "{homefollow ga4}")`, `[![Alt](image.png)](/url "{sublock ga4:contact}")`],
    [`[A](url (Title {homefollow ga4}))`, `[A](url (Title {sublock ga4:contact}))`]
  ]
  for (const [before, after] of cases) {
    assert.equal(migrateMarkdown(before), after)
    assert.equal(migrateMarkdown(after), after)
  }
  assert.equal(migrateMarkdown(`![Alt](image.png '{ga4 homefollow}')`), `![Alt](image.png '{ga4 homefollow}')`)
})

test('explicit empty analytics overrides migrate to a CMS-stable sentinel', () => {
  const output = migrate("links: [{ga4: ''}, {ga4: null}, {}]\n", { section: true })
  assert.deepEqual(YAML.parse(output).links, [{ ga4: 'none' }, { ga4: null }, {}])
  assert.equal(migrate(output, { section: true }), output)
})
