import { scrollShot } from './scroll-shot'

function doParallax (e) {
  // if (e.classList.contains('parallax--box')) e = e.parentElement
  const container = e.getBoundingClientRect()
  const imageHeight = container.height * 1.25
  // const imageHeight = e.querySelector('.bg-figure-image').offsetHeight
  const extraHeight = imageHeight - container.height
  const viewportHeight = window.innerHeight

  // Calculate scroll progress
  const totalScrollDistance = viewportHeight + container.height
  const scrolledDistance = viewportHeight - container.top
  const scrollProgress = scrolledDistance / totalScrollDistance

  // Adjust the vertical displacement of the image
  const imageOffset = -extraHeight * scrollProgress
  e.style.setProperty('--parallax-pos', imageOffset)
}

function doParallaxes () {
  const parallaxElements = document.querySelectorAll('.parallax--scroll:not(.scrolling *)')
  if (parallaxElements.length) {
    parallaxElements.forEach(doParallax)
  }
}

export function initParallax () {
  const parallaxElements = document.querySelectorAll('.parallax')

  if (parallaxElements[0]) {
    // Toggle class parallax--scroll when element is in viewport
    scrollShot({
      rootMargin: '0%',
      query: '.parallax',
      // doOnLoad: doParallaxes,
      doStart: e => e.classList.add('parallax--scroll'),
      doEnd: e => e.classList.remove('parallax--scroll')
    })
    window.addEventListener('scroll', doParallaxes)
  }
}
