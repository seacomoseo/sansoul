import { reducedMotion } from './motion'
import { waitCSS } from './wait-css'
import { hashTarget } from './hash-target'

const c = document.body.classList

export function scrolling () {
  // if (!c.contains('sections-visibile')) c.add('sections-visibile')
  c.add('scrolling')
  setTimeout(() => {
    c.remove('scrolling')
  }, 1500)
}

export function scrollTo (targetElement, instant) {
  if (!instant && !reducedMotion()) scrolling()
  targetElement.scrollIntoView({ behavior: instant || reducedMotion() ? 'instant' : 'smooth' })
  // setTimeout(() => {
  // }, 500)
}

// SCROLL IF IS HASH WHEN LOAD (FIX SHOW)
export function initScrollToHashWhenLoad () {
  if (!location.hash) return
  const target = hashTarget()
  waitCSS(() => {
    if (target) scrollTo(target)
  })
}
