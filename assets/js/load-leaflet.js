import { loadScript } from './load-script'
import { loadStyle } from './load-style'

let leafletPromise = null

export function loadLeaflet () {
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      // Verificamos si Leaflet ya está cargado
      if (window.L) {
        resolve()
        return
      }

      // Cargamos CSS y JS de Leaflet
      Promise.all([
        loadStyle('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'),
        loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js')
      ]).then(() => {
        resolve()
      }).catch(reject)
    })
  }
  return leafletPromise
}
