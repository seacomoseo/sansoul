// SHOW WITH SCROLL TO UP
import { scrollShot } from './scroll-shot'
import { reducedMotion, onMotionChange } from './motion'

let initialized = false

export function initScrollShow () {
  if (initialized || !document.querySelectorAll('.show').length) return
  initialized = true
  let stopObserving
  let revealedAll = false
  onMotionChange(reduce => {
    if (reduce) {
      if (stopObserving) stopObserving()
      revealedAll = true
      document.querySelectorAll('.show').forEach(e => e.classList.remove('show--will'))
    } else if (!revealedAll) {
      stopObserving = scrollShot({
        rootMargin: '-5% 0% -5%',
        query: '.show',
        doOnLoad: e => { if (!reducedMotion()) e.classList.add('show--will') },
        doStart: e => e.classList.remove('show--will'),
        end: true
      })
    }
  })
}
