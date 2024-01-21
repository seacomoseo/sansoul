// SHOW WITH SCROLL TO UP
// Require scroll-shot.js
scrollShot({
  rootMargin: '-5% 0% -5%',
  query: '[data-showup]',
  doOnLoad: e => e.classList.add('showup'),
  doStart: e => e.classList.remove('showup')
})
