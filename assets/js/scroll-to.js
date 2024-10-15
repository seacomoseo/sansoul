export function scrolling () {
  document.body.classList.add('scrolling')
  setTimeout(() => {
    document.body.classList.remove('scrolling')
  }, 1500)
}

export function scrollTo (targetElement) {
  scrolling()
  setTimeout(() => {
    targetElement.scrollIntoView({ behavior: 'smooth' })
  }, 500)
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
