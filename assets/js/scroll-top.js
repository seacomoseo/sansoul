// Required by .body-menu--sticky-** and .up
import { scrollShot } from './scroll-shot'
import { scrollTo } from './scroll-to'

export function initScrollTop () {
  window.addEventListener('load', () => {
    // Get background color of header and menu transparent
    const sectionHeader = document.querySelector('.section--header.bg') || document.body
    const menuSticky = document.querySelector('.body-menu--transparent.body-menu--sticky .menu.bg')
    const logoSticky = document.querySelector('.body-menu--transparent.body-menu--logo--sticky .logo.bg')
    let menuStickyBgBefore, menuStickyBgAfter, elementToChange
    if (sectionHeader && (menuSticky || logoSticky)) {
      const bgRegex = /bg-(main|alt|link|white|light|grey|dark|black)[\w-]*/g
      menuStickyBgBefore = sectionHeader.classList.value.match(bgRegex)[0]
      menuStickyBgAfter = (menuSticky || logoSticky).classList.value.match(bgRegex)[0]
    }

    // Toogle menu background color
    function menuChangeColor (beforeToAfter) {
      if (menuSticky || logoSticky) {
        if (menuStickyBgAfter !== menuStickyBgBefore) {
          const menuStickyActive = document.querySelector('.body-menu--sticky--active')
          if (menuStickyActive) {
            elementToChange = menuSticky
          } else if (logoSticky) {
            elementToChange = logoSticky
          }
          if (elementToChange) {
            if (beforeToAfter) {
              elementToChange.classList.replace(menuStickyBgAfter, menuStickyBgBefore)
            } else {
              elementToChange.classList.replace(menuStickyBgBefore, menuStickyBgAfter)
            }
          }
        }
      }
    }
    // Toogle body top and menu background color (to header)
    function toogleBodyTop (option) {
      if (option === 'add') {
        document.body.classList.add('body-top')
        menuChangeColor(true)
        // Remove hash
        window.history.replaceState('', '', window.location.pathname + window.location.search)
      } else {
        document.body.classList.remove('body-top')
        menuChangeColor(false)
      }
    }

    scrollShot({
      rootMargin: '5% 0% -105%',
      query: 'body',
      // doOnLoad: toogleBodyTop,
      doStart: toogleBodyTop,
      doEnd: () => toogleBodyTop('add')
    })

    // SCROLL TO TOP
    document.addEventListener('click', e => {
      const t = e.target.closest('.scroll-to-top')
      if (t) {
        let target = document.body
        const toc = document.getElementById('toc')
        if (toc) {
          if (window.scrollY > toc.scrollHeight) {
            target = toc
          }
        }
        scrollTo(target)
        if (window.location.hash) {
          // Remove hash
          window.history.replaceState('', '', window.location.pathname + window.location.search)
        }
      }
    })
  })
}
