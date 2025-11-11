import { isGoogleTranslate, draws } from '@params'
import { waitCSS } from './wait-css'

export function initGoogleTranslate () {
  // Onclick to translate.goog
  if (isGoogleTranslate) {
    document.addEventListener('click', e => {
      const l = e.target.closest('.menu__link--translate')
      if (l) open(`https://translate.google.com/translate?sl=auto&tl=en&u=${location.href}`, '_blank')
    })
  }
  // Reload svg uses in translate.goog
  waitCSS(() => {
    if (location.hostname === 'translate.goog') {
      // Remove base tag
      const baseTag = document.querySelector('base')
      if (baseTag) baseTag.remove()
      // Reset href in svg uses
      const uses = document.querySelectorAll(`use[href^="${draws}"]`)
      uses.forEach((use) => use.setAttribute('href', use.getAttribute('href')))
    }
  })
}
