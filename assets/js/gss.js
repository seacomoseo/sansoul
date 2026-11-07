// google spreadsheets
import { scrollShot } from './scroll-shot'
import { createGssTable } from './gss-table'

const loads = new WeakMap()

export function initGss () {
  return scrollShot({
    rootMargin: '600px 0%',
    query: '[data-gss]',
    doStart: e => {
      const url = e.dataset.gss
      const previous = loads.get(e)
      if (previous?.url === url) return previous.promise
      const load = { url }
      load.promise = fetch(url)
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
          }
          return response.text()
        })
        .then(data => {
          // A newer initialization may have selected another sheet on this node.
          if (loads.get(e) !== load) return
          e.replaceChildren(createGssTable(data))
        })
        .catch(error => {
          if (loads.get(e) === load) loads.delete(e)
          throw error
        })
      loads.set(e, load)
      return load.promise
    },
    end: true
  })
}
