import { waitCSS } from './wait-css'

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
export function initScrollToHashWhenLoad () {
  if (!location.hash) return
  const target = document.querySelector(location.hash)
  waitCSS(() => {
    if (target) scrollTo(target)
  })
}
