import { formGeo } from '@params'
import { scrollShot } from './scroll-shot'
import { loadScript } from './load-script'
import { loadStyle } from './load-style'

export function initFormGeo () {
  window.addEventListener('load', () => {
    const geo = document.getElementById('geo')
    if (geo) {
      function mapStart () {
        const isMobile = window.innerWidth <= 768 // Definición de tamaño móvil (puedes ajustarlo)
        const initialZoom = isMobile ? 4 : 5 // Ajuste de zoom según dispositivo
        // eslint-disable-next-line
        const map = L.map('geo', {
          setView: true,
          trackResize: true
        }).setView([40.46367, -3.74922], initialZoom)

        // eslint-disable-next-line
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map)

        let marker = L.marker([40.46367, -3.74922]).addTo(map).bindPopup(formGeo).openPopup()

        // Clics listen
        map.on('click', (e) => {
          const { lat, lng } = e.latlng

          // If a marker already exists, move it
          if (marker) {
            marker.setLatLng(e.latlng)
          } else {
            // eslint-disable-next-line
            marker = L.marker(e.latlng).addTo(map)
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
        query: '#geo',
        doStart: gallery => {
          loadStyle('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', null)
          loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', mapStart)
        }
      })
    }
  })
}
