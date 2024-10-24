// SCROLL-SHOT FUNCTION
export function scrollShot ({
  rootMargin,
  query,
  doOnLoad = () => null,
  doStart,
  doEnd = null
}) {
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
  const observerScroll = new window.IntersectionObserver(callbackScroll, { rootMargin })
  const nodeList = document.querySelectorAll(query)
  nodeList && nodeList.forEach(nodo => {
    observerScroll.observe(nodo)
    doOnLoad(nodo)
  })
}
