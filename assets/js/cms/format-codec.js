import { parseDocument, stringify } from 'yaml'

function safeValues (value, seen = new Set(), memo = new WeakMap()) {
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('CMS field groups cannot safely edit an integer outside the JavaScript safe integer range.')
    return Number(value)
  }
  if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) throw new Error('CMS field groups require finite numbers and safe integers.')
  if (!value || typeof value !== 'object') return value
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('CMS field groups cannot safely edit this tagged YAML value.')
  if (seen.has(value)) throw new Error('CMS field groups do not support cyclic YAML aliases.')
  if (memo.has(value)) return memo.get(value)
  seen.add(value)
  const result = Array.isArray(value) ? [] : {}
  memo.set(value, result)
  for (const [key, item] of Object.entries(value)) Object.defineProperty(result, key, { value: safeValues(item, seen, memo), enumerable: true, configurable: true, writable: true })
  seen.delete(value)
  return result
}

export function parseGroupYAML (text, { config = false } = {}) {
  const document = parseDocument(text, { intAsBigInt: true, merge: true, uniqueKeys: true })
  if (document.errors.length) throw new Error(`Invalid CMS YAML: ${document.errors[0].message}`)
  // The generated schema intentionally nests and reuses thousands of aliases.
  // Keep the normal YAML alias limit for content; config conversion retains
  // shared references and safeValues rejects cycles without expanding them.
  return safeValues(document.toJS({ maxAliasCount: config ? -1 : 100 }))
}

export function stringifyGroupYAML (data, output = {}) {
  safeValues(data)
  const quote = output.quote || 'none'
  return stringify(data, {
    indent: output.indent_size || 2,
    indentSeq: output.indent_sequences !== false,
    lineWidth: 0,
    compat: 'yaml-1.1',
    defaultKeyType: 'PLAIN',
    defaultStringType: quote === 'double' ? 'QUOTE_DOUBLE' : quote === 'single' ? 'QUOTE_SINGLE' : 'PLAIN',
    singleQuote: quote !== 'double'
  })
}

// These functions handle the complete public custom-format input/output. YAML
// parsing stays in yaml's public API; only Markdown fence separation is local.
export function createGroupCodec ({ format = 'yaml', output, bodyField = {}, delimiters } = {}) {
  const markdown = ['frontmatter', 'yaml-frontmatter'].includes(format)
  const [open, close] = Array.isArray(delimiters) ? delimiters : [delimiters || '---', delimiters || '---']
  const key = bodyField.key || 'body'
  return {
    fromFile (text) {
      const source = text.trim().replace(/\r\n?/g, '\n')
      if (!markdown) return parseGroupYAML(source)
      if (format === 'frontmatter' && (source.startsWith('+++\n') || source.startsWith('{'))) throw new Error('CMS field groups support YAML front matter only. Disable cms_groups to edit this format.')
      const lines = source.split('\n')
      if (lines[0] !== open) return { [key]: source }
      const end = lines.indexOf(close, 1)
      if (end < 0) throw new Error('Unclosed YAML front matter in CMS entry.')
      const head = parseGroupYAML(lines.slice(1, end).join('\n')) ?? {}
      if (!head || typeof head !== 'object' || Array.isArray(head)) throw new Error('CMS front matter must be a YAML mapping.')
      const body = lines.slice(end + 1).join('\n').replace(/^\n/, '')
      return { ...head, ...(!Object.hasOwn(head, key) && (!bodyField.inline || body.trim()) ? { [key]: body } : {}) }
    },
    toFile (data) {
      if (!markdown) return stringifyGroupYAML(data, output)
      const head = { ...data }
      let body = ''
      if (!bodyField.inline && Object.hasOwn(head, key)) {
        if (head[key] != null && typeof head[key] !== 'string') throw new Error('CMS Markdown body must be text.')
        body = head[key] || ''
        delete head[key]
      }
      if (!Object.keys(head).length) return body
      return `${open}\n${stringifyGroupYAML(head, output).trimEnd()}\n${close}\n${body ? `\n${body}` : ''}`
    }
  }
}
