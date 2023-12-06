// Require scroll-shot.js
// When load DOM and sources
window.addEventListener('load', () => {
  scrollShot(
    '0%',
    '[data-mute]',
    undefined,
    e => {
      e.removeAttribute('preload')
      e.removeAttribute('data-mute')
      e.setAttribute('muted', '')
      e.setAttribute('loop', '')
      e.setAttribute('autoplay', '')
      e.setAttribute('playsinline', '')
      e.play()
    },
    undefined
  )
})