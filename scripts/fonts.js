#!/usr/bin/env node

/* `sh do fonts`: convert .ttf/.otf files into the woff2 faces that
 * layouts/partials/files/fonts.html looks up in uploads/fonts/
 * (<family-urlized>-<weight>[-italic].woff2). Google Fonts need nothing: the
 * build downloads them. Sources go in assets/fonts/ (never published); sources
 * left in uploads/fonts/ are removed after conversion because uploads are public.
 *
 * The converters are pure JavaScript (no native build) and live in a per-user
 * tool cache, so projects do not carry them as dependencies. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const TOOLS = { 'opentype.js': '2.0.0', wawoff2: '2.0.1' }
const SOURCE_DIRS = ['assets/fonts', 'uploads/fonts']
const OUTPUT_DIR = 'uploads/fonts'

// Same shape as Hugo's urlize for font family names.
export function urlize (text) {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
    .replace(/\s+/g, '-').replace(/[^a-z0-9._~-]/g, '')
}

export function faceName ({ family, weight, italic }) {
  return `${urlize(family)}-${weight}${italic ? '-italic' : ''}.woff2`
}

export function describeFont (font) {
  const family = font.getEnglishName('preferredFamily') || font.getEnglishName('fontFamily')
  const subfamily = font.getEnglishName('preferredSubfamily') || font.getEnglishName('fontSubfamily') || ''
  const os2 = font.tables.os2 || {}
  // usWeightClass is authoritative; round odd values (e.g. 350) to CSS steps.
  const weight = Math.min(900, Math.max(100, Math.round((os2.usWeightClass || 400) / 100) * 100))
  const italic = Boolean(os2.fsSelection & 1) || /italic|oblique/i.test(subfamily)
  return { family, weight, italic }
}

function toolCache () {
  const base = process.env.XDG_CACHE_HOME || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Caches') : path.join(os.homedir(), '.cache'))
  return path.join(base, 'sansoul', 'font-tools')
}

function loadTools () {
  const dir = toolCache()
  const manifest = path.join(dir, 'package.json')
  const wanted = JSON.stringify({ private: true, dependencies: TOOLS }, null, 2)
  const ready = fs.existsSync(manifest) && fs.readFileSync(manifest, 'utf8') === wanted &&
    Object.keys(TOOLS).every(name => fs.existsSync(path.join(dir, 'node_modules', name)))
  if (!ready) {
    console.log(`📦 Preparando conversores de fuentes en ${dir}…`)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(manifest, wanted)
    const usePnpm = !spawnSync('pnpm', ['--version'], { stdio: 'ignore' }).error
    const [command, args] = usePnpm ? ['pnpm', ['install', '--ignore-scripts']] : ['npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund']]
    const result = spawnSync(command, args, { cwd: dir, stdio: 'inherit' })
    if (result.error || result.status !== 0) throw new Error(`${command} install failed in ${dir}`)
  }
  const require = createRequire(manifest)
  return { opentype: require('opentype.js'), wawoff2: require('wawoff2') }
}

export async function convertFonts (projectDir = process.cwd(), tools = loadTools()) {
  const sources = SOURCE_DIRS.flatMap(dir => {
    const full = path.join(projectDir, dir)
    return fs.existsSync(full) ? fs.readdirSync(full).filter(file => /\.(ttf|otf)$/i.test(file)).map(file => path.join(full, file)) : []
  })
  if (!sources.length) {
    console.log(`No hay archivos .ttf/.otf en ${SOURCE_DIRS.join(' ni ')}. Las fuentes de Google Fonts no necesitan este paso.`)
    return []
  }
  const outputDir = path.join(projectDir, OUTPUT_DIR)
  fs.mkdirSync(outputDir, { recursive: true })
  const faces = []
  for (const source of sources) {
    const buffer = fs.readFileSync(source)
    const face = describeFont(tools.opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)))
    const target = path.join(outputDir, faceName(face))
    fs.writeFileSync(target, await tools.wawoff2.compress(buffer))
    if (path.dirname(source) === outputDir) fs.rmSync(source)
    faces.push({ ...face, file: path.relative(projectDir, target) })
    console.log(`✅ ${path.relative(projectDir, source)} ⏩ ${path.relative(projectDir, target)}`)
  }
  const families = [...new Set(faces.map(face => face.family))]
  console.log('\nEn data/styles.yml → fonts (base, title o cursive) usa el nombre exacto de familia y sus pesos:')
  for (const family of families) {
    const variants = faces.filter(face => face.family === family).map(face => `${face.weight}${face.italic ? ' itálica' : ''}`)
    console.log(`  family: ${family}   (${variants.join(', ')})`)
  }
  return faces
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await convertFonts()
  } catch (error) {
    console.error(`SanSoul fonts: ${error.message}`)
    process.exitCode = 1
  }
}
