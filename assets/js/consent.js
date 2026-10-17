// Stored counters and the legacy boolean both represent explicit consent.
export function hasConsent (type, legal = true, storage) {
  if (!legal) return true
  try {
    const value = (storage || window.localStorage).getItem(`controlcookie${type}`)
    return /^(?:true|[1-9][0-9]*)$/.test(value || '')
  } catch {
    return false
  }
}
