import { timestamp } from '@params'
import { scrollShot } from './scroll-shot'
import { loadLeaflet } from './load-leaflet'

export function initMap () {
  function mapStart (mapDiv) {
    const zoom = mapDiv.dataset.zoom || 15
    const x = mapDiv.dataset.x
    const y = mapDiv.dataset.y
    const map = window.L.map(mapDiv.id, {
      setView: true,
      trackResize: true,
      scrollWheelZoom: false
    }).setView([x, y], zoom)

    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map)

    const myIcon = window.L.divIcon({
      className: 'leaflet-data-marker',
      html: `<svg class="leaflet-data-marker__svg" viewBox="0 -5 149 188"><path fill="var(--base)" stroke="var(--base-mix)" stroke-width="12" paint-order="stroke" stroke-miterlimit="10" d="M126 23l-6-6A69 69 0 0 0 74 1a69 69 0 0 0-51 22A70 70 0 0 0 1 74c0 21 7 38 22 52l43 47c6 6 11 6 16 0l48-51c12-13 18-29 18-48 0-20-8-37-22-51z"/><use fill="var(--base-mix)" href="/draws.${timestamp}.svg#${mapDiv.dataset.icon}" x="36" y="16" transform="scale(.67)"></use></svg>`,
      iconAnchor: [24, 50],
      iconSize: [48, 48],
      popupAnchor: [0, -46]
    })

    /* let marker = */ window.L.marker([x, y], { icon: myIcon, id: 1 }).addTo(map)
  }

  scrollShot({
    rootMargin: '20%',
    query: '.map',
    doStart: (mapDiv) => {
      loadLeaflet().then(() => {
        mapStart(mapDiv)
      }).catch(error => {
        console.error(error)
      })
    }
  })
}
