import { scrollShot } from './scroll-shot'

export function initVideoMute () {
  const video = document.querySelector('video[muted]')
  if (video) {
    const events = ['click', 'touchstart']
    // Función para intentar reproducir el vídeo con sonido
    const tryPlayWithSound = e => {
      video.muted = false
      const paused = video.paused
      video.play().then(() => {
        if (paused) {
          video.pause()
        } else {
          e.target === video && video.play()
        }
        console.log('Reproducción con sonido habilitada')
        // Remover listeners después de la primera reproducción exitosa
        events.forEach(e => {
          document.removeEventListener(e, tryPlayWithSound)
        })
      }).catch((err) => {
        console.log('No se puede reproducir con sonido aún', err)
      })
    }
    // Escuchar clic en cualquier parte de la página, interacción táctil y con teclado
    events.forEach(e => {
      document.addEventListener(e, tryPlayWithSound)
    })
  }

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
}
