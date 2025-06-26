import { lang } from '@params'

export function initNetlifyIdentity () {
  // Change language
  netlifyIdentity.setLocale(lang)

  if (location.hash.indexOf('_token=') >= 0) {
    // Reload script for fix invitation
    function loadScript (url) {
      const s = document.createElement('script')
      s.src = url
      document.head.appendChild(s)
    }
    loadScript('https://identity.netlify.com/v1/netlify-identity-widget.js')
  }
}
