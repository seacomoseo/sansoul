import { scrollShot } from './scroll-shot'

export function initParallax () {
  const parallaxElements = document.querySelectorAll('.parallax')

  if (parallaxElements[0]) {
    function doParallax (e) {
      const speed = 10
      const parent = e.parentElement
      const parentTop = parent.getBoundingClientRect().top
      const partialHeight = window.innerHeight / speed
      const pos = parentTop / speed - partialHeight
      e.style.setProperty('--parallax-pos', pos)
    }

    // Toggle class parallax--scroll when element is in viewport
    scrollShot({
      rootMargin: '0%',
      query: '.parallax',
      doStart: e => e.classList.add('parallax--scroll'),
      doEnd: e => e.classList.remove('parallax--scroll')
    })

    window.addEventListener('scroll', () => {
      parallaxElements.forEach(e => e.classList.contains('parallax--scroll') ? doParallax(e) : null)
    })

    // Apply parallax function in first image in header to prevent "blink first scroll" efect
    // When load DOM and sources
    window.addEventListener('load', () => {
      if (window.scrollY < window.innerHeight && parallaxElements[0].closest('.section--header')) {
        doParallax(parallaxElements[0])
      }
    })
    // if (window.scrollY < window.innerHeight) {
    //   const parallaxFirstImage = parallaxElements[0].querySelector('img')
    //   if (parallaxFirstImage) {
    //     const newImg = new Image()
    //     newImg.onload = () => {
    //       doParallax(parallaxElements[0])
    //     }
    //     newImg.src = parallaxFirstImage.currentSrc
    //   }
    // }
  }
}
