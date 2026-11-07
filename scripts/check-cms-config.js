// Run from a SanSoul consumer project root after Hugo has generated public/.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseGroupYAML } from '../assets/js/cms/format-codec.js'

export function validateCMSConfig (config) {
  const i18n = config.i18n
  if (!i18n || typeof i18n.default_locale !== 'string' || !i18n.locales?.includes(i18n.default_locale)) throw new Error('Generated CMS config must define an included i18n.default_locale')
  const seen = new WeakSet()
  function visit (value, location) {
    if (!value || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    if (value.widget === 'select' && (!Array.isArray(value.options) || !value.options.length)) throw new Error(`CMS select requires non-empty options at ${location}`)
    if (value.widget === 'object' && !Array.isArray(value.fields) && !Array.isArray(value.types)) throw new Error(`CMS object requires fields or types at ${location}`)
    if (Array.isArray(value.fields) && (typeof value.name === 'string' || value.widget || location.endsWith('.index_file'))) {
      const names = new Set()
      for (const field of value.fields) {
        if (!field || Array.isArray(field) || typeof field.name !== 'string') throw new Error(`Invalid CMS field at ${location}`)
        if (names.has(field.name)) throw new Error(`Duplicate CMS field ${location}.${field.name}`)
        names.add(field.name)
      }
    }
    // Anchors can be intentionally incomplete fragments; validate their resolved uses.
    for (const [key, child] of Object.entries(value)) {
      if (location === 'config' && key === '_anchors') continue
      visit(child, `${location}.${key}`)
    }
  }
  visit(config, 'config')
  return i18n.default_locale
}

export function checkCMSConfig (directory = process.cwd()) {
  const adminDir = path.join(directory, 'public', 'admin')
  if (!fs.existsSync(adminDir)) {
    console.log('CMS config check skipped: public/admin was not generated')
    return
  }
  const configs = fs.readdirSync(adminDir).filter(name => /^config\.[a-f0-9]+\.yml$/.test(name))
  if (configs.length !== 1) throw new Error(`Expected exactly one generated CMS config, found ${configs.length}`)
  const config = parseGroupYAML(fs.readFileSync(path.join(adminDir, configs[0]), 'utf8'), { config: true })
  console.log(`CMS config valid: default locale ${validateCMSConfig(config)}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) checkCMSConfig()
