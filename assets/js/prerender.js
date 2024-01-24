export function initPrerender () {
  document.addEventListener('DOMContentLoaded', () => {
    // If connection is fast (downlink >= 2 Mbps)
    if (navigator.connection && navigator.connection.downlink >= 2) {
      const links = document.querySelectorAll('a[href^="/"]:not([href^="/#"]), [data-h]:not([data-h=""])')
      links && links.forEach(link => {
        link.addEventListener('mouseover', e => {
          const t = e.currentTarget
          let href = ''
          if (t.dataset.h) href = window.atob(t.dataset.h)
          if (t.href) href = t.href.replace(window.location.origin, '')
          if (href.startsWith('/') && !href.startsWith('/#') && href !== window.location.pathname) {
            href = href.replace(/#.*/, '')
            if (!document.querySelector(`link[href='${href}']`)) {
              const prerenderLink = document.createElement('link')
              prerenderLink.rel = 'prerender'
              prerenderLink.href = href
              document.head.appendChild(prerenderLink)
            }
          }
        })
      })
    }
  })
}
