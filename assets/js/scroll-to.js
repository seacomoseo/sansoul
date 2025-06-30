import { whaitCSS } from './whait-css'

const c = document.body.classList

export function scrolling () {
  // if (!c.contains('sections-visibile')) c.add('sections-visibile')
  c.add('scrolling')
  setTimeout(() => {
    c.remove('scrolling')
  }, 1500)
}

export function scrollTo (targetElement, instant) {
  scrolling()
  targetElement.scrollIntoView({ behavior: 'smooth' })
  // setTimeout(() => {
  // }, 500)
}

// SCROLL IF IS HASH WHEN LOAD (FIX SHOW)
function initScrollToHashWhenLoadWhenCSS (element) {
  if (!location.hash) return
  const target = document.querySelector(location.hash)
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (target) {
        scrollTo(target)
      }
    }, 1000)
  })
}

export function initScrollToHashWhenLoad () {
  whaitCSS(initScrollToHashWhenLoadWhenCSS)
}
