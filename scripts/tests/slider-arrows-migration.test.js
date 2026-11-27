import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { migrateSource, migrateProject } from '../migrations/14.28.0-slider-arrows.js'

const script = fileURLToPath(new URL('../migrations/14.28.0-slider-arrows.js', import.meta.url))

test('active slider with its own btn colour gets the same arrows colour right after btn', () => {
  const source = [
    'boxes:',
    '- title: Vídeos',
    '  box:',
    '    slider: true',
    '    btn: light # botones claros',
    '    time: 8',
    '  boxes: []',
    '- title: Reseñas',
    '  review:',
    '    btn: main',
    '    slider: true',
    ''
  ].join('\n')
  assert.equal(migrateSource(source), [
    'boxes:',
    '- title: Vídeos',
    '  box:',
    '    slider: true',
    '    btn: light # botones claros',
    '    arrows: light',
    '    time: 8',
    '  boxes: []',
    '- title: Reseñas',
    '  review:',
    '    btn: main',
    '    arrows: main',
    '    slider: true',
    ''
  ].join('\n'))
})

test('blocks without an active slider keep their buttons untouched', () => {
  for (const source of [
    'box:\n  btn: light\n',
    'box:\n  slider: false\n  btn: light\n',
    'box:\n  slider: "true"\n  btn: light\n',
    'review:\n  btn: dark\n  cols: 3\n'
  ]) assert.equal(migrateSource(source), source)
})

test('existing arrows, hide, cta, non-block keys and flow maps are left alone', () => {
  const warnings = []
  const onWarning = message => warnings.push(message)
  for (const source of [
    'box:\n  slider: true\n  btn: light\n  arrows: dark\n',
    'box:\n  slider: true\n  btn: light\n  arrows: hide\n',
    'box:\n  slider: true\n  btn: hide\n',
    'box:\n  slider: true\n  btn: cta\n',
    'box:\n  slider: true\n',
    'link:\n  slider: true\n  btn: light\n',
    'scroll: box\n'
  ]) assert.equal(migrateSource(source, { onWarning }), source)
  assert.deepEqual(warnings, [])
  const flow = 'box: { slider: true, btn: light }\n'
  assert.equal(migrateSource(flow, { onWarning }), flow)
  const float = 'box:\n  slider: true\n  btn: light\n  arrows: float\n'
  assert.equal(migrateSource(float, { onWarning }), float)
  assert.equal(warnings.length, 2)
  assert.match(warnings[0], /flow map/)
  assert.match(warnings[1], /float/)
})

test('global styles arrows for a block type win over the migration', () => {
  const warnings = []
  const source = 'box:\n  slider: true\n  btn: light\nreview:\n  slider: true\n  btn: dark\n'
  assert.equal(migrateSource(source, { skip: new Set(['box']), onWarning: message => warnings.push(message) }),
    'box:\n  slider: true\n  btn: light\nreview:\n  slider: true\n  btn: dark\n  arrows: dark\n')
  assert.match(warnings[0], /styles\.yml already sets box\.arrows/)
})

test('Markdown front matter, CRLF and a final line without newline are migrated in place', () => {
  const md = '---\ntitle: Inicio\nsections:\n- boxes:\n  - box:\n      slider: true\n      btn: alt\n---\nTexto [box: no] con btn: light\n'
  assert.equal(migrateSource(md, { markdown: true }),
    '---\ntitle: Inicio\nsections:\n- boxes:\n  - box:\n      slider: true\n      btn: alt\n      arrows: alt\n---\nTexto [box: no] con btn: light\n')
  assert.equal(migrateSource('box:\r\n  slider: true\r\n  btn: dark\r\n'), 'box:\r\n  slider: true\r\n  btn: dark\r\n  arrows: dark\r\n')
  assert.equal(migrateSource('box:\n  slider: true\n  btn: dark'), 'box:\n  slider: true\n  btn: dark\n  arrows: dark')
  assert.equal(migrateSource('Sin front matter\n', { markdown: true }), 'Sin front matter\n')
})

test('project migration is idempotent, skips data/styles.yml and honours --check', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-slider-arrows-'))
  try {
    fs.mkdirSync(path.join(root, 'data/section'), { recursive: true })
    fs.mkdirSync(path.join(root, 'content'), { recursive: true })
    const styles = 'review:\n  arrows: dark\nbox:\n  slider: true\n  btn: light\n'
    fs.writeFileSync(path.join(root, 'data/styles.yml'), styles)
    fs.writeFileSync(path.join(root, 'data/section/videos.yml'), 'boxes:\n- box:\n    slider: true\n    btn: light\n')
    fs.writeFileSync(path.join(root, 'data/section/resenas.yml'), 'boxes:\n- review:\n    slider: true\n    btn: light\n')
    fs.writeFileSync(path.join(root, 'content/_index.es.md'), '---\ntitle: Hola\n---\n')

    const out = execFileSync(process.execPath, [script, '--check'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    assert.match(out, /Would add .* 1 file\(s\):\n- data\/section\/videos\.yml/)
    assert.equal(fs.readFileSync(path.join(root, 'data/section/videos.yml'), 'utf8'), 'boxes:\n- box:\n    slider: true\n    btn: light\n')

    const warnings = []
    assert.deepEqual(migrateProject(root, { onWarning: message => warnings.push(message) }), { changed: true, files: ['data/section/videos.yml'] })
    assert.equal(fs.readFileSync(path.join(root, 'data/section/videos.yml'), 'utf8'), 'boxes:\n- box:\n    slider: true\n    btn: light\n    arrows: light\n')
    assert.equal(fs.readFileSync(path.join(root, 'data/styles.yml'), 'utf8'), styles)
    assert.match(warnings.join('\n'), /resenas\.yml: review.* data\/styles\.yml already sets review\.arrows/)
    assert.deepEqual(migrateProject(root, { onWarning () {} }), { changed: false, files: [] })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
