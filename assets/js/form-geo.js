import { formGeo, timestamp } from '@params'
import { scrollShot } from './scroll-shot'
import { loadLeaflet } from './load-leaflet'

export function initFormGeo () {
  function mapStart (geoDiv) {
    const zoom = geoDiv.dataset.zoom || 5
    const isMobile = window.innerWidth <= 768 // Mobile size
    const initialZoom = isMobile ? zoom - 1 : zoom // Soom adjust by device
    const map = window.L.map(geoDiv, {
      setView: true,
      trackResize: true
    }).setView([40.46367, -3.74922], initialZoom)

    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map)

    const myIcon = window.L.divIcon({
      className: 'leaflet-data-marker',
      html: `<svg class="leaflet-data-marker__svg" viewBox="0 -5 149 188"><path fill="var(--base)" stroke="var(--base-mix)" stroke-width="12" paint-order="stroke" stroke-miterlimit="10" d="M126 23l-6-6A69 69 0 0 0 74 1a69 69 0 0 0-51 22A70 70 0 0 0 1 74c0 21 7 38 22 52l43 47c6 6 11 6 16 0l48-51c12-13 18-29 18-48 0-20-8-37-22-51z"/><use fill="var(--base-mix)" href="/draws.${timestamp}.svg#${geoDiv.dataset.icon}" x="36" y="16" transform="scale(.67)"></use></svg>`,
      iconAnchor: [24, 50],
      iconSize: [48, 48],
      popupAnchor: [0, -46]
    })

    let marker = window.L.marker([40.46367, -3.74922], { icon: myIcon, id: 1 }).addTo(map).bindPopup(formGeo).openPopup()

    // Clics listen
    map.on('click', (e) => {
      const { lat, lng } = e.latlng

      // If a marker already exists, move it
      if (marker) {
        marker.setLatLng(e.latlng)
      } else {
        marker = window.L.marker(e.latlng).addTo(map)
      }

      // Display latitude and longitude in input field
      document.querySelector('.form__geo--x').value = Number(lat.toFixed(7))
      document.querySelector('.form__geo--y').value = Number(lng.toFixed(7))
    })

    // popup over top elements when popupopen in small screen sizes
    const mapPane = document.querySelector('.leaflet-map-pane')
    if (window.innerWidth < 480) {
      mapPane.style.zIndex = 10000
      map.on('popupclose', () => { mapPane.style.zIndex = '' })
      map.on('popupopen', () => { mapPane.style.zIndex = 10000 })
    }
  }

  scrollShot({
    rootMargin: '0%',
    query: '.form__geo-map',
    doStart: geoDiv => {
      loadLeaflet().then(() => {
        mapStart(geoDiv)
      }).catch(error => {
        console.error(error)
      })
    }
  })
}
