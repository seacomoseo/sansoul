import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { urlize, faceName, describeFont, convertFonts } from '../fonts.js'

function fakeFont ({ family, subfamily = 'Regular', weight = 400, fsSelection = 0 }) {
  const names = { fontFamily: family, fontSubfamily: subfamily }
  return { getEnglishName: key => names[key], tables: { os2: { usWeightClass: weight, fsSelection } } }
}

test('face names match the lookup in layouts/partials/files/fonts.html', () => {
  assert.equal(urlize('Delorean Slab'), 'delorean-slab')
  assert.equal(urlize('Señora Ñ'), 'senora-n')
  assert.equal(faceName({ family: 'Delorean Slab', weight: 400, italic: true }), 'delorean-slab-400-italic.woff2')
  assert.equal(faceName({ family: 'Acme', weight: 700, italic: false }), 'acme-700.woff2')
})

test('weight and style come from the font tables', () => {
  assert.deepEqual(describeFont(fakeFont({ family: 'Acme', weight: 700 })), { family: 'Acme', weight: 700, italic: false })
  assert.deepEqual(describeFont(fakeFont({ family: 'Acme', weight: 350, fsSelection: 1 })), { family: 'Acme', weight: 400, italic: true })
  assert.deepEqual(describeFont(fakeFont({ family: 'Acme', subfamily: 'Light Oblique', weight: 300 })), { family: 'Acme', weight: 300, italic: true })
})

test('converts sources into uploads/fonts and removes public sources only', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-fonts-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'assets/fonts'), { recursive: true })
  fs.mkdirSync(path.join(root, 'uploads/fonts'), { recursive: true })
  fs.writeFileSync(path.join(root, 'assets/fonts/Acme-Bold.ttf'), 'bold')
  fs.writeFileSync(path.join(root, 'uploads/fonts/Acme-Italic.otf'), 'italic')
  const fonts = { bold: fakeFont({ family: 'Acme', weight: 700 }), italic: fakeFont({ family: 'Acme', weight: 400, fsSelection: 1 }) }
  const tools = {
    opentype: { parse: data => fonts[Buffer.from(data).toString()] },
    wawoff2: { compress: async buffer => Buffer.concat([Buffer.from('woff2:'), buffer]) }
  }
  const log = console.log
  console.log = () => {}
  t.after(() => { console.log = log })
  const faces = await convertFonts(root, tools)
  assert.deepEqual(faces.map(face => face.file).sort(), ['uploads/fonts/acme-400-italic.woff2', 'uploads/fonts/acme-700.woff2'])
  assert.equal(fs.readFileSync(path.join(root, 'uploads/fonts/acme-700.woff2'), 'utf8'), 'woff2:bold')
  assert.ok(fs.existsSync(path.join(root, 'assets/fonts/Acme-Bold.ttf')))
  assert.ok(!fs.existsSync(path.join(root, 'uploads/fonts/Acme-Italic.otf')))
})
