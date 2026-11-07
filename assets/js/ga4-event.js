// Author-defined GA4 names follow Google's event naming rules.
export function ga4EventName (value) {
  if (value === 'none') return ''
  if (value === true) return 'contact'
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(value)) return ''
  return /^(?:google_|ga_|firebase_)/i.test(value) ? '' : value
}

export function ga4EventList (value) {
  if (typeof value !== 'string') return [ga4EventName(value)].filter(Boolean)
  return value.split(',').map(name => ga4EventName(name.trim())).filter(Boolean)
}

export function sendGa4Events (automatic, custom, details) {
  if (typeof gtag !== 'function') return
  const names = new Set([automatic && 'contact', ...ga4EventList(custom)].filter(Boolean))
  for (const name of names) gtag('event', name, details)
}
