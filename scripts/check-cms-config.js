// Run from a SanSoul consumer project root after Hugo has generated public/.
import fs from 'node:fs'
import path from 'node:path'

const adminDir = path.join(process.cwd(), 'public', 'admin')

if (!fs.existsSync(adminDir)) {
  console.log('CMS config check skipped: public/admin was not generated')
  process.exit()
}

const configs = fs.readdirSync(adminDir)
  .filter(name => /^config\.[a-f0-9]+\.yml$/.test(name))

if (configs.length !== 1) {
  throw new Error(`Expected exactly one generated CMS config, found ${configs.length}`)
}

const configPath = path.join(adminDir, configs[0])
const source = fs.readFileSync(configPath, 'utf8')
const i18n = [...source.matchAll(/"i18n":(\{[^{}]+\})/g)]
  .map(match => JSON.parse(match[1]))
  .find(config => config.structure && Array.isArray(config.locales))

if (!i18n || typeof i18n.default_locale !== 'string') {
  throw new Error('Generated CMS config must define i18n.default_locale as a string')
}

if (!i18n.locales.includes(i18n.default_locale)) {
  throw new Error(`CMS default locale "${i18n.default_locale}" is not included in locales`)
}

console.log(`CMS config valid: default locale ${i18n.default_locale}`)
