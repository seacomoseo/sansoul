// Read lazily so importing a reusable component never changes the page.
let preference
const listeners = new Set()

function motionPreference () {
  if (!preference && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const changed = () => listeners.forEach(listener => listener(preference.matches))
    if (preference.addEventListener) preference.addEventListener('change', changed)
    else if (preference.addListener) preference.addListener(changed)
  }
  return preference
}

export function reducedMotion () {
  return Boolean(motionPreference()?.matches)
}

export function onMotionChange (listener) {
  listeners.add(listener)
  listener(reducedMotion())
  return () => listeners.delete(listener)
}
