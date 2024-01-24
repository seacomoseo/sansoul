import { lang } from '@params'
import { loadScript } from './load-script'

export function initGoogleTranslate () {
  const menuGoogleTranslate = document.querySelector('.menu__link--translate > i')

  // eslint-disable-next-line
  function googleTranslateElementInit () {
    menuGoogleTranslate.setAttribute('id', 'google_translate_element')
    menuGoogleTranslate.innerHTML = ''
    // eslint-disable-next-line
    new google.translate.TranslateElement({
      pageLanguage: lang,
      includedLanguages: 'en,es,fr,de,pt,it,zh-CN,ar,id,ja,ru,hi,eu,ca,gl'
    }, 'google_translate_element')
  }

  function LoadGoogleTranslate () {
    loadScript('https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit')
  }

  if (document.cookie.includes('googtrans=/')) {
    LoadGoogleTranslate()
  } else {
    menuGoogleTranslate.addEventListener('mouseenter', LoadGoogleTranslate)
  }
}
