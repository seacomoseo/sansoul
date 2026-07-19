import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(scriptDir, '../..')
const cssDir = path.join(projectDir, 'public/css')
const statsPath = path.join(projectDir, 'hugo_stats.json')
const cssPattern = /^styles\..*\.css$/

async function findCssFile (directory, pattern) {
  const files = await fs.readdir(directory)
  const file = files.find(file => pattern.test(file))
  if (!file) {
    throw new Error(`No CSS file matching ${pattern} found in ${directory}`)
  }
  return path.join(directory, file)
}

function splitSelectors (text) {
  const selectors = []
  let depth = 0
  let segment = ''

  for (const character of text) {
    if (character === '(') depth++
    if (character === ')') depth--

    if (character === ',' && depth === 0) {
      selectors.push(segment.trim())
      segment = ''
    } else {
      segment += character
    }
  }

  if (segment) selectors.push(segment.trim())
  return selectors
}

function createElementPattern ({ tags, classes, ids }) {
  const safelist = [
    'active',
    'hidden',
    '\\.sl-',
    '\\.form__submit',
    '\\.form__error',
    '\\.show--will',
    '\\.search__result-item-link',
    '\\.cookies--hide'
  ].join('|')

  return new RegExp(
    `(^|\\.|\\])(\\*|\\[.+\\]|:[\\w:-]+|(${tags.join('|')})|\\.(${classes.join('|')})|#(${ids.join('|')}))($|=|:|\\[|\\]|\\.)|${safelist}`
  )
}

function normalizeCss (css) {
  return css
    .replace(/\n\s*/g, '')
    .replace(/(\()\s/g, '$1')
    .replace(/\s(\))/g, '$1')
    .replace(/(\})/g, '$1\n')
    .replace(/(@media[^{]*\{)/g, '$1\n')
    .replace(/^((@keyframes|\.?\d|from|to).+)\n/gm, '$1')
    .replace(/\/\*.*?\*\//g, '')
    .replace(/^([^@]+?)\{/gm, '$1\n{')
}

function purgeSelectors (css, elementPattern) {
  const lines = normalizeCss(css).split('\n')
  const keptLines = lines.map(line => {
    if (/^[@{}]/.test(line)) return line

    return splitSelectors(line).filter(selector => {
      let candidate = selector
      while (/\([^()]*\)/.test(candidate)) {
        candidate = candidate.replace(/\([^()]*\)/g, '')
      }
      candidate = candidate.replace(/^.*[\s>+~]/g, '')
      return elementPattern.test(candidate)
    }).join(',')
  })

  let result = keptLines.join('\n')
    .replace(/\n\n\{.+/gm, '')
    .replace(/^@media.+\{\n\}\n/gm, '')

  const animations = [...result.matchAll(/animation(-name)?:([\w-]+)/g)]
    .map(animation => animation[2])
    .join('|')
  const unusedAnimations = new RegExp(`^@keyframes\\s(?!${animations})[\\w-]+\\{.+\n`, 'gm')

  result = result.replace(unusedAnimations, '').replace(/\n/g, '')
  return result
}

async function main () {
  const cssPath = await findCssFile(cssDir, cssPattern)
  const stats = JSON.parse(await fs.readFile(statsPath, 'utf8'))
  const elementPattern = createElementPattern(stats.htmlElements)
  const css = await fs.readFile(cssPath, 'utf8')
  const purgedCss = purgeSelectors(css, elementPattern)

  await fs.writeFile(cssPath, purgedCss, 'utf8')
  console.log(`Processed and saved ${cssPath}`)
}

main().catch(error => {
  console.error('CSS purge failed:', error)
  process.exitCode = 1
})
