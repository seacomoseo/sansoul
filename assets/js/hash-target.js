// Fragment identifiers are IDs, not CSS selectors (for example #pid=2).
export function hashTarget (hash = location.hash) {
  let id = hash.replace(/^#/, '')
  try { id = decodeURIComponent(id) } catch {}
  return id ? document.getElementById(id) : null
}
