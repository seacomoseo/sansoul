const pendingResources = new Map()

// Share requests and retain successful loads; failed requests can be retried.
export function loadResource (url, type) {
  const href = new URL(url, document.baseURI).href
  const key = `${type}:${href}`
  if (pendingResources.has(key)) return pendingResources.get(key)
  const script = type === 'script'
  const attribute = script ? 'src' : 'href'
  const promise = new Promise((resolve, reject) => {
    let element = [...document.querySelectorAll(script ? 'script[src]' : 'link[rel="stylesheet"]')]
      .find(element => element[attribute] === href)
    if (element && (element.dataset.loaded === 'true' || (!script && element.sheet) || /^(loaded|complete)$/.test(element.readyState || ''))) {
      resolve()
      return
    }
    const created = !element
    if (created) {
      element = document.createElement(script ? 'script' : 'link')
      element[attribute] = href
      if (!script) element.rel = 'stylesheet'
    }
    const cleanup = () => {
      element.removeEventListener('load', loaded)
      element.removeEventListener('error', failed)
    }
    const loaded = () => {
      cleanup()
      element.dataset.loaded = 'true'
      resolve()
    }
    const failed = () => {
      cleanup()
      element.remove()
      reject(new Error(`Error loading ${type} ${url}`))
    }
    element.addEventListener('load', loaded)
    element.addEventListener('error', failed)
    if (created) document.head.appendChild(element)
  })
  pendingResources.set(key, promise)
  promise.catch(() => {
    if (pendingResources.get(key) === promise) pendingResources.delete(key)
  })
  return promise
}
