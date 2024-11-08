import { scrollShot } from './scroll-shot'
import { loadLeaflet, myIcon, fill, tile } from './leaflet'

function mapStart (mapDiv) {
  const map = window.L.map(mapDiv.id, {
    minZoom: 1,
    maxZoom: 18,
    setView: true,
    trackResize: true,
    scrollWheelZoom: false
  })

  tile(map)

  const bounds = window.L.latLngBounds() // Crea límites manualmente

  Array.from(mapDiv.nextElementSibling.children).forEach(e => {
    const geo = JSON.parse(e.dataset.geo)
    const icon = myIcon(e.dataset)
    let marker
    if (geo.type === 'Point') {
      const latlng = [geo.coordinates[1], geo.coordinates[0]]
      if (e.dataset.radius) {
        const radius = parseFloat(e.dataset.radius) * 1000 // Radio en metros
        marker = window.L.circle(latlng, { radius, ...fill(e.dataset.color).style })

        // Conversión del radio a grados
        const deltaLat = radius / 111320 // Cambio en latitud en grados
        const metersPerDegreeLongitude = 111320 * Math.cos(latlng[0] * Math.PI / 180)
        const deltaLng = radius / metersPerDegreeLongitude // Cambio en longitud en grados

        // Calcula las esquinas del rectángulo que engloba el círculo
        const corner1 = [latlng[0] - deltaLat, latlng[1] - deltaLng]
        const corner2 = [latlng[0] + deltaLat, latlng[1] + deltaLng]
        bounds.extend(corner1)
        bounds.extend(corner2)
      } else {
        marker = window.L.marker(latlng, { icon })
        bounds.extend(marker.getLatLng())
      }
    } else if (geo.type === 'Polygon') {
      marker = window.L.geoJSON(geo, fill(e.dataset.color))
      bounds.extend(marker.getBounds())
    }
    if (e.textContent) marker.bindPopup(e.textContent)
    map.addLayer(marker)
  })

  const maxZoom = mapDiv.dataset.zoom || 15
  map.fitBounds(bounds, { maxZoom, padding: [50, 50] })
}

export function initMap () {
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
