import { scrollTo } from './scroll-to'

export function initOpenLinks () {
  function openLink (url, blank) {
    if (blank) {
      window.open(url, '_blank')
    } else {
      window.location.href = url
    }
  }
  function processLink (urlIni, blank) {
    // const isExternal = urlIni.match(/^https?:/) && !urlIni.startsWith(window.location.origin)
    const url = urlIni.startsWith('/') ? window.location.origin + urlIni : urlIni
    const isHash = url.includes('#')
    if (isHash) {
      const path = url.split('#')[0]
      // Fix Google Translate Subdomain links with hash
      const isCurrentPage = path === window.location.href.replace('&_x_tr_hist', '')
      if (isCurrentPage) {
        const hash = url.split('#')[1]
        const target = document.getElementById(hash)
        if (!target.classList.contains('modal')) {
          scrollTo(target)
        }
        window.location.hash = hash
      } else {
        openLink(url, blank)
      }
    } else {
      openLink(url, blank)
    }
  }

  // BODY CLICK
  document.addEventListener('click', e => {
    // NORMAL LINKS
    const link = e.target.closest('[href*="#"]:not(use,[href*="&_x_tr_hist=true"])') // Fix Google Translate Subdomain links with hash
    if (link) {
      e.preventDefault()
      const url = link.getAttribute('href')
      processLink(url)
    } else {
      // OFUSCATE LINKS
      const ofuscateLink = e.target.closest('[data-h],[data-b]')
      if (ofuscateLink) {
        const l = ofuscateLink.dataset
        if (l.b) {
          processLink(window.atob(l.b), true)
        } else if (l.h) {
          processLink(window.atob(l.h))
        }
      } else {
        // BOX LINKS
        const boxLink = e.target.closest(
          '.box:has(> .box__button):not(:has(' +
            '.box .box__button,' +
            '> .box__button ~ .box__button,' +
            ':is(a, [data-h], [data-b]):not(.box__button)' +
          '))'
        )
        if (boxLink) {
          console.log(boxLink.querySelector('.box__button'))
          boxLink.querySelector('.box__button').click()
        }
      }
    }
  })

  // BODY KEY ENTER LIKE CLICK
  document.addEventListener('keydown', e => e.key === 'Enter' && document.activeElement.click())
}
