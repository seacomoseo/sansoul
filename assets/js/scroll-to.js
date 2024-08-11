import { isScrollShow } from '@params'

export function disableEnableParallax () {
  document.body.classList.add('disable-parallax')
  setTimeout(() => { document.body.classList.remove('disable-parallax') }, 1000)
}

export function scrollTo (targetElement) {
  disableEnableParallax()
  targetElement.scrollIntoView({ behavior: 'smooth' })
}

// SCROLL IF IS HASH WHEN LOAD (FIX SHOW)
export function initScrollToHashWhenLoad (element) {
  if (isScrollShow) {
    if (window.location.hash) {
      const target = document.querySelector(window.location.hash)
      window.addEventListener('load', () => {
        setTimeout(() => {
          if (target) {
            scrollTo(target)
          }
        }, 1000)
      })
    }
  }
}
