import { scrollTo, scrolling } from './scroll-to'

export function initOpenLinks () {
  function openLink (url, blank) {
    if (blank) {
      open(url, '_blank')
    } else {
      location.href = url
    }
  }
  function processLink (urlIni, blank) {
    if (urlIni === '#more') {
      scrollTo(document.querySelector('.section--1'))
    } else {
      // const isOut = urlIni.match(/^https?:/) && !urlIni.startsWith(location.origin)
      const url = urlIni.startsWith('/') ? location.origin + urlIni : urlIni
      const isHash = url.includes('#')
      if (isHash) {
        const path = url.split('#')[0]
        // Fix Google Translate Subdomain links with hash
        const isCurrentPage = path === location.href.replace('&_x_tr_hist', '')
        if (isCurrentPage) {
          const hash = url.split('#')[1]
          const target = document.getElementById(hash)
          if (!target.classList.contains('modal')) {
            scrollTo(target)
          }
          location.hash = hash
        } else {
          openLink(url, blank)
        }
      } else {
        openLink(url, blank)
      }
    }
  }

  // BODY CLICK
  document.addEventListener('click', e => {
    let blank
    if (e.button === 1 || e.metaKey || e.ctrlKey) { // Center clic or ctrl + clic
      blank = true
    } else if (!e.button === 0) { // Not left clic
      return
    }
    // NORMAL LINKS
    const link = e.target.closest('[href*="#"]:not(use,[href*="&_x_tr_hist=true"])') // Fix Google Translate Subdomain links with hash
    if (link) {
      e.preventDefault()
      scrolling()
      const url = link.getAttribute('href')
      processLink(url, blank)
    } else {
      // OFUSCATE LINKS
      const ofuscateLink = e.target.closest('[data-h],[data-b]')
      if (ofuscateLink) {
        const l = ofuscateLink.dataset
        if (l.b) {
          processLink(atob(l.b), true)
        } else if (l.h) {
          processLink(atob(l.h), blank)
        }
      } else {
        // BOX LINKS
        const boxLink = e.target.closest('.box--go')
        if (boxLink) boxLink.querySelector('.btn, .link, button').click()
      }
    }
  })

  // BODY KEY ENTER LIKE CLICK
  document.addEventListener('keydown', e => e.key === 'Enter' && document.activeElement.click())
}
