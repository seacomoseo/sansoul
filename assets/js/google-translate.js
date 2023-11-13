
const menuGoogleTranslate = document.querySelector('.menu__link--translate > i')

function googleTranslateElementInit () {
  menuGoogleTranslate.setAttribute('id', 'google_translate_element')
  menuGoogleTranslate.innerHTML = ''
  new google.translate.TranslateElement({
    pageLanguage: '{{ .Lang }}',
    includedLanguages: 'en,es,fr,de,pt,it,zh-CN,ar,id,ja,ru,hi,eu,ca,gl'
  }, 'google_translate_element')
}

function LoadGoogleTranslate () {
  loadScript('https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit')
}

if (document.cookie.indexOf('googtrans=/') > -1) {
  LoadGoogleTranslate()
} else {
  menuGoogleTranslate.addEventListener('mouseenter', LoadGoogleTranslate)
}

