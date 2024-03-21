// Required by .body-menu--sticky-** and .button-up
import { screenSticky } from './screen-sticky'
import { scrollShot } from './scroll-shot'
import { scrollTo } from './scroll-to'

export function initScrollTop () {
  // Get background color of header and menu transparent
  const sectionHeader = document.querySelector('.section--header') || document.body
  const menuSticky = document.querySelector('.body-menu--transparent.body-menu--sticky .menu')
  const logoSticky = document.querySelector('.body-menu--transparent .logo')
  let menuStickyBgBefore, menuStickyBgAfter, elementToChange
  if (sectionHeader && menuSticky) {
    menuStickyBgBefore = sectionHeader.classList.value
      .replace(/\sbg-(color|gradient|opacity|image)[\w-]*/g, '')
      .replace(/.*?(bg-[\w-]*).*/g, '$1')
    menuStickyBgAfter = menuSticky.classList.value
      .replace(/.*?(bg-[\w-]*).*/g, '$1')
  }

  // Toogle menu background color
  function menuChangeColor (beforeToAfter) {
    if (menuSticky) {
      if (menuStickyBgAfter !== menuStickyBgBefore) {
        if (window.innerWidth >= screenSticky) {
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
    rootMargin: '20% 0% -120%',
    query: 'body',
    doOnLoad: toogleBodyTop,
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
      const isSectionedPage = document.querySelector('body.type-page')
      if (window.location.hash && !isSectionedPage) {
        // Remove hash
        window.history.replaceState('', '', window.location.pathname + window.location.search)
      }
    }
  })
}
