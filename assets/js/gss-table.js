// Published Sheets documents contain page-wide CSS and scripts. Only copy the
// table's passive content; no provider stylesheet enters the receiving page.
const tags = new Set(['TABLE', 'CAPTION', 'COLGROUP', 'COL', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'DIV', 'SPAN', 'P', 'BR', 'A', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'SUB', 'SUP'])
const discard = new Set(['SCRIPT', 'STYLE', 'LINK', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'IMG', 'VIDEO', 'AUDIO'])
const properties = new Set(['color', 'background-color', 'font-size', 'font-weight', 'font-style', 'text-align', 'text-decoration', 'vertical-align', 'white-space', 'word-wrap', 'overflow-wrap', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-color', 'border-style', 'border-width', 'width', 'height'])
const attributes = new Set(['colspan', 'rowspan', 'scope', 'abbr', 'title', 'lang', 'dir', 'aria-label', 'aria-description'])
let sequence = 0

function copyStyle (target, declarations) {
  for (const declaration of declarations.split(';')) {
    const colon = declaration.indexOf(':')
    if (colon < 0) continue
    const property = declaration.slice(0, colon).trim().toLowerCase()
    const value = declaration.slice(colon + 1).trim()
    // Reject escapes, functions and custom properties rather than attempting to
    // interpret arbitrary CSS. Sheets' cell colors and dimensions are literals.
    if (properties.has(property) && value && /^[#\w\s.,%+-]+$/.test(value)) {
      target.style.setProperty(property, value)
    }
  }
}

export function createGssTable (html, owner = document) {
  // Template contents are inert, including images and frames that DOMParser
  // implementations may otherwise fetch while parsing a detached document.
  const template = owner.createElement('template')
  template.innerHTML = html
  const source = template.content.querySelector('table.waffle') || template.content.querySelector('table')
  if (!source) throw new Error('Published sheet response contains no table')
  const prefix = `gss-table-${++sequence}-`
  const ids = new Map([source, ...source.querySelectorAll('[id]')]
    .filter(node => node.hasAttribute('id'))
    .map((node, index) => [node.id, prefix + index]))
  const styles = new Map()
  for (const style of template.content.querySelectorAll('style')) {
    // Only Google's generated per-cell class rules are recognized. Global
    // selectors, imports, nested rules and all other declarations are ignored.
    for (const rule of style.textContent.split('}')) {
      const match = rule.match(/(?:^|;)\s*\.ritz\s+\.waffle\s+\.(s\d+)\s*\{([^{}]*)$/)
      if (match) styles.set(match[1], (styles.get(match[1]) || '') + ';' + match[2])
    }
  }
  const copy = node => {
    if (node.nodeType === 3) return owner.createTextNode(node.textContent)
    if (node.nodeType !== 1 || discard.has(node.tagName)) return null
    if (node.classList.contains('row-header-shim') || node.classList.contains('row-header')) return null
    if (node.tagName === 'THEAD' && node.querySelector('.header-shim')) return null
    const element = owner.createElement(tags.has(node.tagName) ? node.tagName.toLowerCase() : 'span')
    for (const attribute of node.attributes) {
      if (attributes.has(attribute.name)) element.setAttribute(attribute.name, attribute.value)
    }
    if (ids.has(node.id)) element.id = ids.get(node.id)
    for (const attribute of ['headers', 'aria-labelledby', 'aria-describedby']) {
      const references = (node.getAttribute(attribute) || '').split(/\s+/).map(id => ids.get(id)).filter(Boolean)
      if (references.length) element.setAttribute(attribute, references.join(' '))
    }
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || ''
      try {
        const url = new URL(href)
        if (['https:', 'http:'].includes(url.protocol)) element.setAttribute('href', url.href)
      } catch {}
    }
    for (const className of node.classList) {
      if (styles.has(className)) copyStyle(element, styles.get(className))
    }
    copyStyle(element, node.getAttribute('style') || '')
    for (const child of node.childNodes) {
      const result = copy(child)
      if (result) element.append(result)
    }
    return element
  }
  const table = copy(source)
  table.className = 'gss__table'
  return table
}
