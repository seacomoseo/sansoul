// SHOW WITH SCROLL TO UP
import { scrollShot } from './scroll-shot'

export function initScrollShow () {
  scrollShot({
    rootMargin: '-5% 0% -5%',
    query: '[data-showup]',
    doOnLoad: e => e.classList.add('showup'),
    doStart: e => e.classList.remove('showup')
  })
}
