import { initMediaConsent } from './media-consent'
import { loadLeaflet, loadLeafletDraw, myIcon, fill, tile } from './leaflet'
import params from './params'
const { formGeo } = params

function updateInputGeo (json, layer, type) {
  type = (type || (json.value ? JSON.parse(json.value).type : '')).toLowerCase()
  const geoJson = {
    type: type === 'circle' ? 'Circle' : 'Polygon',
    coordinates: layer.toGeoJSON().geometry.coordinates,
    radius: layer._mRadius || undefined
  }
  json.value = JSON.stringify(geoJson)
  json.dispatchEvent(new Event('change', { bubbles: true }))
}

function mapStart (geoDiv) {
  const json = geoDiv.parentElement.querySelector('.form__geo--json')
  const zoom = geoDiv.dataset.zoom || 5
  const isMobile = document.documentElement.clientWidth <= 768 // Mobile size
  const initialZoom = isMobile ? zoom - 1 : zoom // Soom adjust by device
  const initialView = JSON.parse(geoDiv.dataset.view).coordinates
  const map = L.map(geoDiv, {
    setView: true,
    trackResize: true,
    scrollWheelZoom: false
  })

  try {
    map.setView(initialView, initialZoom)
    tile(map, geoDiv.dataset.tile)
    const saved = json.value ? JSON.parse(json.value) : null

    if (geoDiv.dataset.area === 'true') {
      // Polygon and circle
      const drawnItems = new L.FeatureGroup()
      map.addLayer(drawnItems)
      if (saved?.type === 'Circle') {
        const coordinates = [saved.coordinates[1], saved.coordinates[0]]
        drawnItems.addLayer(L.circle(coordinates, { radius: saved.radius, ...fill(geoDiv.dataset.color).style }))
      } else if (saved?.type === 'Polygon') {
        L.geoJSON(saved, fill(geoDiv.dataset.color)).eachLayer(layer => drawnItems.addLayer(layer))
      }

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

      map.on('draw:deleted', () => {
        if (drawnItems.getLayers().length === 0) {
          json.value = ''
          json.dispatchEvent(new Event('change', { bubbles: true }))
        }
      })
    } else {
      // Marker
      const position = saved?.type === 'Point' ? [saved.coordinates[1], saved.coordinates[0]] : initialView
      const marker = L.marker(position, { icon: myIcon(geoDiv.dataset) })
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
      const mapPane = geoDiv.querySelector('.leaflet-map-pane')
      if (document.documentElement.clientWidth < 480) {
        mapPane.style.zIndex = 10000
        map.on('popupclose', () => { mapPane.style.zIndex = '' })
        map.on('popupopen', () => { mapPane.style.zIndex = 10000 })
      }
    }
  } catch (error) {
    map.remove()
    throw error
  }
  return () => map.remove()
}

export function initFormGeo () {
  initMediaConsent({
    requiresConsent: false,
    query: '.form__geo-map',
    start: async (geoDiv, isCurrent) => {
      await loadLeaflet()
      if (!isCurrent()) return
      if (geoDiv.dataset.area === 'true') await loadLeafletDraw()
      if (isCurrent()) return mapStart(geoDiv)
    }
  })
}
