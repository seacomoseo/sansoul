import { scrollShot } from './scroll-shot'

function doParallax (e) {
  // if (e.classList.contains('scroll--box')) e = e.parentElement
  const container = e.getBoundingClientRect()
  const imgHeight = container.height * 1.25
  // const imgHeight = e.querySelector('.bg-fig-img').offsetHeight
  const extraHeight = imgHeight - container.height
  const viewportHeight = window.innerHeight

  // Calculate scroll progress
  const totalScrollDistance = viewportHeight + container.height
  const scrolledDistance = viewportHeight - container.top
  const scrollProgress = scrolledDistance / totalScrollDistance

  // Adjust the vertical displacement of the image
  const imgOffset = -extraHeight * scrollProgress
  e.style.setProperty('--scroll-pos', imgOffset)
}

function doParallaxes () {
  const scrollElements = document.querySelectorAll('.scroll--on:not(.scrolling *)')
  if (scrollElements.length) {
    scrollElements.forEach(doParallax)
  }
}

export function initScrollParallax () {
  const scrollElements = document.querySelectorAll('.scroll')

  if (scrollElements[0]) {
    // Toggle class scroll--on when element is in viewport
    scrollShot({
      rootMargin: '0%',
      query: '.scroll',
      // doOnLoad: doParallaxes,
      doStart: e => e.classList.add('scroll--on'),
      doEnd: e => e.classList.remove('scroll--on')
    })
    window.addEventListener('scroll', doParallaxes)
  }
}
