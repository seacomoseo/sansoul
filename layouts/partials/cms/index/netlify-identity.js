if (window.location.hash.indexOf('_token=') >= 0) {
  // Reload script for fix invitation
  function loadScript (url) {
    const s = document.createElement('script')
    s.src = url
    document.head.appendChild(s)
  }
  setTimeout(
    loadScript('https://identity.netlify.com/v1/netlify-identity-widget.js')
    , 5000
  )
}
