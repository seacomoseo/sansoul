// Require scroll-shot.js
// When load DOM and sources
window.addEventListener('load', () => {
  scrollShot({
    rootMargin: '0%',
    query: '[data-mute]',
    doStart: e => {
      e.removeAttribute('preload')
      e.removeAttribute('data-mute')
      e.setAttribute('playsinline', '')
      e.muted = true
      e.loop = true
      e.autoplay = true
      e.playsinline = true
      e.play()
    }
  })
})