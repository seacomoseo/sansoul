export function waitCSS (callback) {
  const run = () => {
    try { callback() } catch (err) { console.error(err) }
  }

  const afterDOMReady = () => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true })
    } else {
      queueMicrotask(run)
    }
  }

  // Take "normal" stylesheets and also preloads as=style
  const links = [...document.querySelectorAll('link[rel~="stylesheet"], link[as="style"]')]

  // If there are no links, don't block: execute after DOM
  if (links.length === 0) return afterDOMReady()

  let pending = links.length
  let fired = false
  const maybeFire = () => {
    if (fired) return
    pending -= 1
    if (pending <= 0) {
      fired = true
      afterDOMReady()
    }
  }

  links.forEach(link => {
    // If it already has a sheet, count it as loaded
    if (link.sheet) {
      maybeFire()
      return
    }
    // Listen for load/error; if it already loaded before, nothing will happen... that's what the timeout is for
    link.addEventListener('load', maybeFire, { once: true })
    link.addEventListener('error', maybeFire, { once: true })
  })

  // Safety timeout in case the browser doesn't trigger events or we can't read .sheet
  setTimeout(() => {
    if (!fired) {
      fired = true
      afterDOMReady()
    }
  }, 1500)
}
