export const scrollShot = ({
  rootMargin = '0px',
  query,
  doOnLoad = () => {},
  doStart = () => {},
  doEnd = () => {},
  end = false
}) => {
  const nodeList = document.querySelectorAll(query)

  if (!nodeList?.length) return

  const callbackScroll = (entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        doStart(entry.target)
        if (end) {
          observer.unobserve(entry.target)
        }
      } else if (!end) {
        doEnd(entry.target)
      }
    })
  }

  const observerScroll = new IntersectionObserver(callbackScroll, { rootMargin })

  nodeList.forEach(node => {
    observerScroll.observe(node)
    doOnLoad(node)
  })

  // Return a cleanup function
  return () => {
    nodeList.forEach(node => observerScroll.unobserve(node))
    observerScroll.disconnect()
  }
}
