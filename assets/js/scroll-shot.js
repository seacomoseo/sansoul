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

  const pending = new WeakSet()

  const callbackScroll = (entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        if (pending.has(entry.target)) return
        const started = doStart(entry.target)
        if (started && typeof started.then === 'function') {
          pending.add(entry.target)
          Promise.resolve(started)
            .then(() => { if (end) observer.unobserve(entry.target) })
            .catch(console.error)
            .finally(() => { pending.delete(entry.target) })
        } else if (end) {
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
