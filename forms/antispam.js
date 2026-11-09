// Content rules ported from the audited GAS processor (b706fec2…9913). A match
// never rejects: the submission is stored as `review` and sends nothing.
export const SPAM_PHRASES = Object.freeze([
  'viagra', 'cialis', 'casino', 'poker', 'lottery', 'winner', 'click here', 'buy now',
  'free money', 'seo service', 'web traffic', 'backlink'
])
const BLOCKED_EMAIL_DOMAINS = Object.freeze(['sigismail.com'])

function matchesPhrase (text, phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i').test(text)
}

// Same acceptance as GAS /^[^\s@]+@[^\s@]+\.[^\s@]+$/ without backtracking.
export function looksLikeEmail (value) {
  if (typeof value !== 'string' || !value || value.length > 254 || /\s/.test(value)) return false
  const at = value.indexOf('@')
  if (at < 1 || at !== value.lastIndexOf('@')) return false
  const domain = value.slice(at + 1)
  const dot = domain.indexOf('.', 1)
  return dot > 0 && dot < domain.length - 1
}

export function spamReasons ({ honeypot, values, email, validEmail = looksLikeEmail }) {
  const reasons = []
  if (honeypot) reasons.push('honeypot')
  const text = values.join(' ')
  if (text.trim()) {
    if ((text.match(/https?:\/\//gi) || []).length > 2) reasons.push('too_many_urls')
    if (/[\u0400-\u04FF\u4E00-\u9FFF]/.test(text)) reasons.push('unexpected_script')
    const lower = text.toLowerCase()
    const matched = SPAM_PHRASES.filter(phrase => matchesPhrase(lower, phrase))
    if (matched.length) reasons.push(`spam_words:${matched.join('|')}`)
  }
  if (email) {
    if (!validEmail(email)) reasons.push('invalid_email')
    else if (BLOCKED_EMAIL_DOMAINS.includes(email.split('@')[1].toLowerCase())) reasons.push('blocked_email_domain')
  }
  return reasons
}
