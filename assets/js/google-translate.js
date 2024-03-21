import { isGoogleTranslate } from '@params'

export function initGoogleTranslate () {
  // Onclick to translate.goog
  if (isGoogleTranslate) {
    document.addEventListener('click', e => {
      const l = e.target.closest('.menu__link--translate')
      if (l) window.open(`https://translate.google.com/translate?sl=auto&tl=en&u=${location.href}`, '_blank')
    })
  }
  // Reload svg uses in translate.goog
  document.addEventListener('DOMContentLoaded', e => {
    if (window.location.hostname === 'translate.goog') {
      // Remove base tag
      const baseTag = document.querySelector('base')
      if (baseTag) baseTag.remove()
      // Reset href in svg uses
      const uses = document.querySelectorAll('use[href^="/draws.svg"]')
      uses.forEach((use) => use.setAttribute('href', use.getAttribute('href')))
    }
  })
}