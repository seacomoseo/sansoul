import { scrollShot } from './scroll-shot'
import { loadScript } from './load-script'
import { loadStyle } from './load-style'

export function initMap () {
  let leafletLoaded = false

  function mapStart (mapDiv) {
    console.log('holi')
    const x = mapDiv.dataset.x
    const y = mapDiv.dataset.y
    // eslint-disable-next-line
    const map = L.map(mapDiv.id, {
      setView: true,
      trackResize: true,
      scrollWheelZoom: false
    }).setView([x, y], 15)

    // eslint-disable-next-line
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map)

    const iconSettings = {
      mapIconUrl: '<svg class="leaflet-data-marker__svg" viewBox="0 -5 149 188"><path fill="{mapIconColor}" stroke="{mapIconColorIvert}" stroke-width="6" stroke-miterlimit="10" d="M126 23l-6-6A69 69 0 0 0 74 1a69 69 0 0 0-51 22A70 70 0 0 0 1 74c0 21 7 38 22 52l43 47c6 6 11 6 16 0l48-51c12-13 18-29 18-48 0-20-8-37-22-51z"/><circle fill="{mapIconColorIvert}" cx="74" cy="75" r="{pinInnerCircleRadius}"/><use fill="{mapIconColor}" href="/draws.svg#star-fill" x="74" y="48" transform="scale(.5)"></use></svg>',
      mapIconColor: 'var(--location)',
      mapIconColorIvert: 'var(--location-inver)',
      pinInnerCircleRadius: 55
    }
    const myIcon = L.divIcon({
      className: 'leaflet-data-marker',
      html: L.Util.template(iconSettings.mapIconUrl, iconSettings),
      iconAnchor: [24, 50],
      iconSize: [48, 48],
      popupAnchor: [0, -46]
    })

    let marker = L.marker([x, y], { icon: myIcon, id: 1 }).addTo(map)
  }

  scrollShot({
    rootMargin: '0%',
    query: '.map',
    doStart: mapDiv => {
      if (!leafletLoaded) {
        leafletLoaded = true
        loadStyle('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', null)
        loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', () => mapStart(mapDiv))
      } else {
        mapStart(mapDiv)
      }
    }
  })
}
