// SHOW WITH SCROLL TO UP
import { scrollShot } from './scroll-shot'

export function initScrollShow () {
  scrollShot({
    rootMargin: '-5% 0% -5%',
    query: '.show',
    doOnLoad: e => e.classList.add('show--will'),
    doStart: e => e.classList.remove('show--will'),
    end: true
  })
}
