import { isScrollShow } from '@params'

export function scrollTo (element) {
  element.scrollIntoView({ behavior: 'smooth' })
}

// SCROLL IF IS HASH WHEN LOAD (FIX SHOWUP)
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
