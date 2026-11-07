import { ga4EventList } from '../ga4-event.js'

// Shared Markdown syntax for CMS components and the versioned source migration.
const LINK_TOKENS = new Set(['main', 'alt', 'cta', 'light', 'dark', 'turn', 'such', 'whatsapp', 'dot', 'sm', 'swap', 'lock', 'nofollow', 'sublock', 'blank', 'ga4'])
export const linkPattern = /(?<!!)\[(?![!])(\[)?(?:::(.+?)::\s*)?([^\]]+?)(\])?\]\(([^)\s]+)(?:\s+"((?:\\.|[^"\\])*)")?\)/
export const imagePattern = /!\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)(?:\s+"((?:\\.|[^"\\])*)")?\)/
export const inlineImagePattern = /(?:^|(?<=[^\n]))(?:\[!\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)(?:\s+"((?:\\.|[^"\\])*)")?\)\]\(([^)\s]+)\)|(?<!\[)!\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)(?:\s+"((?:\\.|[^"\\])*)")?\))/

export function decodeMarkdownTitle (value = '') {
  return value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1')
}

export function escapeMarkdownTitle (value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')
}

export function parseLinkTitle (value = '') {
  const title = decodeMarkdownTitle(value)
  const match = title.match(/\s*(?:\{([^{}]+)\}|\[([^\[\]]+)\])$/)
  const tokens = match ? (match[1] ?? match[2]).trim().split(/\s+/) : []
  if (!tokens.length || !tokens.every(token => (LINK_TOKENS.has(token) || (token.startsWith('ga4:') && (token.slice(4) === 'none' || ga4EventList(token.slice(4)).length === token.slice(4).split(',').length))))) return { title, tokens: [] }
  return { title: title.slice(0, match.index), tokens: tokens.map(token => token === 'nofollow' ? 'lock' : token) }
}

function decodeURL (value = '') {
  try { return decodeURI(value) } catch { return value }
}

function formatURL (value = '') {
  return String(value).replace(/[\s()"]/g, character => encodeURIComponent(character))
}

export function parseLinkMatch (match) {
  const { title, tokens } = parseLinkTitle(match[6] ?? '')
  let anchor = match[3]
  let ir = ''
  const trailing = anchor.match(/\s?::([^:]+(?::[^:]+)?)::$/)
  if (trailing) {
    ir = trailing[1]
    anchor = anchor.slice(0, trailing.index)
  }
  return {
    url: decodeURL(match[5]), il: match[2] ?? '', ir, anchor, title,
    btn: Boolean(match[1] && match[4]),
    color: tokens.find(value => ['main', 'alt', 'cta', 'light', 'dark', 'turn', 'such', 'whatsapp'].includes(value)) ?? '',
    dot: tokens.includes('dot'), sm: tokens.includes('sm'), swap: tokens.includes('swap'),
    follow: tokens.includes('sublock') ? 'sublock' : tokens.includes('lock') ? 'lock' : '',
    blank: tokens.includes('blank'), ga4: tokens.find(token => token.startsWith('ga4:'))?.slice(4) || (tokens.includes('ga4') ? 'contact' : '')
  }
}

export function formatLink ({ url, icon = '', il = icon, ir = '', anchor = '', title = '', btn = false, color = '', dot = false, sm = false, swap = false, follow = '', blank = false, ga4 = '' }) {
  const events = ga4 === 'none' ? ga4 : [...new Set(ga4EventList(ga4))].join(',')
  const tokens = [btn && color, btn && dot && 'dot', btn && sm && 'sm', btn && swap && 'swap', follow === 'nofollow' ? 'lock' : follow, blank && 'blank', events && `ga4:${events}`].filter(Boolean)
  const metadata = `${title}${tokens.length ? `${title ? ' ' : ''}{${tokens.join(' ')}}` : ''}`
  return `[${btn ? '[' : ''}${il ? `::${il}:: ` : ''}${anchor}${ir ? ` ::${ir}::` : ''}${btn ? ']' : ''}](${formatURL(url)}${metadata ? ` "${escapeMarkdownTitle(metadata)}"` : ''})`
}

export function parseImage (alt = '', src = '', rawTitle = '', url = '') {
  let title = decodeMarkdownTitle(rawTitle)
  const suffix = title.match(/\s*\{([^{}]+)\}$/)
  const legacyRatio = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(alt)
  let ratio = legacyRatio ? alt : ''
  const dimensions = {}
  if (suffix) {
    const seen = new Set()
    const valid = suffix[1].trim().split(/ +/).every(token => {
      let key
      if (/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(token) && token.split('/').every(value => Number(value) > 0)) {
        key = 'ratio'
        ratio = token
      } else if (/^[wh][1-9]\d*$/.test(token)) {
        key = token[0] === 'w' ? 'img_w' : 'img_h'
        dimensions[key] = Number(token.slice(1))
      }
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    if (valid) title = title.slice(0, suffix.index).trimEnd()
    else {
      ratio = legacyRatio ? alt : ''
      for (const key of Object.keys(dimensions)) delete dimensions[key]
    }
  }
  return { alt: legacyRatio ? '' : decodeMarkdownTitle(alt), src: decodeURL(src), title, ratio, url: decodeURL(url), ...dimensions }
}

export function formatImage ({ src = '', alt = '', ratio = '', img_w = '', img_h = '', title = '', url = '' }) {
  const tokens = [ratio, /^[1-9]\d*$/.test(String(img_w)) && `w${img_w}`, /^[1-9]\d*$/.test(String(img_h)) && `h${img_h}`].filter(Boolean)
  const metadata = `${title}${tokens.length ? `${title ? ' ' : ''}{${tokens.join(' ')}}` : ''}`
  const image = `![${String(alt).replace(/\\/g, '\\\\').replace(/\[|\]/g, character => `\\${character}`)}](${formatURL(src)}${metadata ? ` "${escapeMarkdownTitle(metadata)}"` : ''})`
  return url ? `[${image}](${formatURL(url)})` : image
}
