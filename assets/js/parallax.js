import { scrollShot } from './scroll-shot'

export function initParallax () {
  const parallaxElements = document.querySelectorAll('.parallax > *:first-child')

  if (parallaxElements[0]) {
    function doParallax (e) {
      const speed = 10
      const parent = e.parentElement
      const parentTop = parent.getBoundingClientRect().top
      const partialHeight = window.innerHeight / speed
      const pos = parentTop / speed - partialHeight
      e.style.transform = `translateY(${pos}px)`
      // e.style.height = `calc(100% + ${partialHeight * 2}px)` // => calc(110% + 10lvh)
    }

    // Toggle class parallax--scroll when element is in viewport
    scrollShot({
      rootMargin: '0%',
      query: '.parallax > *:first-child',
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
