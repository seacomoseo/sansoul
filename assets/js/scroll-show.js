// SHOW WITH SCROLL TO UP
// Require scroll-shot.js
scrollShot(
  '-5% 0% -5%',
  '[data-showup]',
  e => e.classList.add('showup'),
  e => e.classList.remove('showup'),
  undefined
)
