import { formGeo } from '@params'
import { scrollShot } from './scroll-shot'
import { loadLeaflet, loadLeafletDraw, myIcon, fill, tile } from './leaflet'

function updateInputGeo (json, layer, type) {
  if (!type) type = JSON.parse(json.value).type
  const geoJson = {
    type: type === 'circle' ? 'Circle' : 'Polygon',
    coordinates: layer.toGeoJSON().geometry.coordinates,
    radius: layer._mRadius || undefined
  }
  json.value = JSON.stringify(geoJson)
}

function mapStart (geoDiv) {
  const json = geoDiv.parentElement.querySelector('.form__geo--json')
  const zoom = geoDiv.dataset.zoom || 5
  const isMobile = window.innerWidth <= 768 // Mobile size
  const initialZoom = isMobile ? zoom - 1 : zoom // Soom adjust by device
  const initialView = JSON.parse(geoDiv.dataset.view).coordinates
  const map = L.map(geoDiv, {
    setView: true,
    trackResize: true,
    scrollWheelZoom: false
  }).setView(initialView, initialZoom)

  tile(map, geoDiv.dataset.tile)

  if (geoDiv.dataset.area === 'true') {
    // Polygon and circle
    loadLeafletDraw()
      .then(() => {
        const drawnItems = new L.FeatureGroup()
        map.addLayer(drawnItems)

        const style = { shapeOptions: fill(geoDiv.dataset.color).style }
        const drawControl = new L.Control.Draw({
          edit: {
            featureGroup: drawnItems
          },
          draw: {
            polygon: style,
            circle: style,
            marker: false,
            circlemarker: false,
            polyline: false,
            rectangle: style
          }
        })
        map.addControl(drawControl)

        map.on(L.Draw.Event.CREATED, e => {
          const layer = e.layer
          drawnItems.clearLayers()
          drawnItems.addLayer(layer)
          updateInputGeo(json, layer, e.layerType)
        })

        map.on('draw:edited', e => {
          const layers = drawnItems.getLayers()
          if (layers.length > 0) {
            updateInputGeo(json, layers[0], e.layerType)
          }
        })
      })
      .catch(error => {
        console.error('Error loading Leaflet Draw:', error)
      })
  } else {
    // Marker
    const marker = L.marker(initialView, { icon: myIcon(geoDiv.dataset) })
    marker.addTo(map).bindPopup(formGeo).openPopup()

    // Clics listen
    map.on('click', (e) => {
      marker.setLatLng(e.latlng)
      json.value = JSON.stringify(marker.toGeoJSON().geometry)
      // Trigger change event manually (for form-show)
      const input = geoDiv.parentElement.querySelector('input')
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })

    // popup over top elements when popupopen in small screen sizes
    const mapPane = document.querySelector('.leaflet-map-pane')
    if (window.innerWidth < 480) {
      mapPane.style.zIndex = 10000
      map.on('popupclose', () => { mapPane.style.zIndex = '' })
      map.on('popupopen', () => { mapPane.style.zIndex = 10000 })
    }
  }
}

export function initFormGeo () {
  scrollShot({
    rootMargin: '0%',
    query: '.form__geo-map',
    doStart: geoDiv => {
      loadLeaflet()
        .then(() => { mapStart(geoDiv) })
        .catch(console.error)
    },
    doEnd: () => null // For unobserve
  })
}
