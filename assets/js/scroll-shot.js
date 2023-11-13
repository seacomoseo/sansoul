// SCROLL-SHOT FUNCTION
function scrollShot (windowMargin, selectorCSS, doOnLoad = () => undefined, doStart, doEnd = undefined) {
  const callbackScroll = (entries, observer) =>
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        doStart(entry.target)
        if (!doEnd) {
          observer.unobserve(entry.target)
        }
      } else if (doEnd) {
        doEnd(entry.target)
      }
    })
  const observerScroll = new window.IntersectionObserver(callbackScroll, {
    rootMargin: windowMargin
  })
  document.querySelectorAll(selectorCSS).forEach(nodo => {
    observerScroll.observe(nodo)
    doOnLoad(nodo)
  })
}
