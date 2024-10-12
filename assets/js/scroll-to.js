export function scrolling () {
  document.body.classList.add('scrolling')
  setTimeout(() => { document.body.classList.remove('scrolling') }, 1000)
}

export function scrollTo (targetElement) {
  scrolling()
  targetElement.scrollIntoView({ behavior: 'smooth' })
}

// SCROLL IF IS HASH WHEN LOAD (FIX SHOW)
export function initScrollToHashWhenLoad (element) {
  if (window.location.hash) {
    const target = document.querySelector(window.location.hash)
    window.addEventListener('load', () => {
      setTimeout(() => {
        if (target) {
          scrollTo(target)
        }
      }, 1000)
    })
  }
}
