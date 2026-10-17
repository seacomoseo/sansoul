// Shared Markdown syntax for CMS components and the versioned source migration.
const LINK_TOKENS = new Set(['main', 'alt', 'cta', 'light', 'dark', 'turn', 'such', 'whatsapp', 'dot', 'sm', 'swap', 'lock', 'nofollow', 'homefollow', 'blank', 'ga4'])
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
  if (!tokens.length || !tokens.every(token => LINK_TOKENS.has(token))) return { title, tokens: [] }
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
  return {
    url: decodeURL(match[5]), icon: match[2] ?? '', anchor: match[3], title,
    btn: Boolean(match[1] && match[4]),
    color: tokens.find(value => ['main', 'alt', 'cta', 'light', 'dark', 'turn', 'such', 'whatsapp'].includes(value)) ?? '',
    dot: tokens.includes('dot'), sm: tokens.includes('sm'), swap: tokens.includes('swap'),
    follow: tokens.includes('homefollow') ? 'homefollow' : tokens.includes('lock') ? 'lock' : '',
    blank: tokens.includes('blank'), ga4: tokens.includes('ga4')
  }
}

export function formatLink ({ url, icon = '', anchor = '', title = '', btn = false, color = '', dot = false, sm = false, swap = false, follow = '', blank = false, ga4 = false }) {
  const tokens = [btn && color, btn && dot && 'dot', btn && sm && 'sm', btn && swap && 'swap', follow === 'nofollow' ? 'lock' : follow, blank && 'blank', ga4 && 'ga4'].filter(Boolean)
  const metadata = `${title}${tokens.length ? `${title ? ' ' : ''}{${tokens.join(' ')}}` : ''}`
  return `[${btn ? '[' : ''}${icon ? `::${icon}:: ` : ''}${anchor}${btn ? ']' : ''}](${formatURL(url)}${metadata ? ` "${escapeMarkdownTitle(metadata)}"` : ''})`
}

export function parseImage (alt = '', src = '', rawTitle = '', url = '') {
  let title = decodeMarkdownTitle(rawTitle)
  const ratioMatch = title.match(/\s*\{(\d+(?:\.\d+)?\/\d+(?:\.\d+)?)\}$/)
  const legacyRatio = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(alt)
  const ratio = ratioMatch?.[1] ?? (legacyRatio ? alt : '')
  if (ratioMatch) title = title.slice(0, ratioMatch.index)
  return { alt: legacyRatio ? '' : decodeMarkdownTitle(alt), src: decodeURL(src), title, ratio, url: decodeURL(url) }
}

export function formatImage ({ src = '', alt = '', ratio = '', title = '', url = '' }) {
  const metadata = `${title}${ratio ? `${title ? ' ' : ''}{${ratio}}` : ''}`
  const image = `![${String(alt).replace(/\\/g, '\\\\').replace(/\[|\]/g, character => `\\${character}`)}](${formatURL(src)}${metadata ? ` "${escapeMarkdownTitle(metadata)}"` : ''})`
  return url ? `[${image}](${formatURL(url)})` : image
}
