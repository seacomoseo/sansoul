import {
  timestamp,
  mapTerrain,
  mapStreets,
  mapSatellite,
  mapHybrid
} from '@params'
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

export function loadLeafletDraw () {
  return new Promise((resolve, reject) => {
    // Verificamos si Leaflet.Draw ya está cargado
    if (L && L.Control && L.Control.Draw) {
      resolve()
      return
    }
    // Cargamos CSS y JS de Leaflet.Draw
    Promise.all([
      loadStyle('https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css'),
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js')
    ]).then(() => {
      resolve()
    }).catch(reject)
  })
}

export function myIcon (i) {
  return L.divIcon({
    className: 'leaflet-data-marker',
    html: `<svg class="icon leaflet-data-marker__svg ${i.color}" viewBox="0 -5 149 188">` +
      '<path fill="var(--base)" stroke="color-mix(in srgb, var(--base), var(--base-text) 75%)" stroke-width="12" paint-order="stroke" stroke-miterlimit="10" d="M126 23l-6-6A69 69 0 0 0 74 1a69 69 0 0 0-51 22A70 70 0 0 0 1 74c0 21 7 38 22 52l43 47c6 6 11 6 16 0l48-51c12-13 18-29 18-48 0-20-8-37-22-51z"/>' +
      `<use fill="color-mix(in srgb, var(--base), var(--base-text) 75%)" href="/draws.${timestamp}.svg#${i.icon}" x="36" y="16" transform="scale(.67)"></use>` +
    '</svg>',
    iconAnchor: [24, 50],
    iconSize: [48, 48],
    popupAnchor: [0, -46]
  })
}

export function fill (color = 'main') {
  return {
    style: {
      weight: 2,
      strokeOpacity: 1,
      color: `color-mix(in srgb, var(--${color}), var(--${color}-text) 50%)`,
      fillColor: `var(--${color})`,
      fillOpacity: 0.5
    }
  }
}

export function tile (map, defaultNameLayer = 'streets') {
  // dark mode: .leaflet-tile-pane { filter: brightness(0.6) invert(1) contrast(3) hue-rotate(200deg) saturate(0.3) brightness(0.7); }
  const baseMaps = {}
  const layers = [
    { name: 'streets', title: mapStreets, url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', options: { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>' } },
    { name: 'terrain', title: mapTerrain, url: 'http://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', options: { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'] } },
    { name: 'satellite', title: mapSatellite, url: 'http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', options: { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'] } },
    { name: 'hybrid', title: mapHybrid, url: 'http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', options: { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'] } }
  ]
  layers.forEach(({ name, title, url, options }) => {
    const layer = L.tileLayer(url, options)
    // Adds the layer only if it matches the default layer
    if (name === defaultNameLayer) layer.addTo(map)
    baseMaps[title] = layer
  })
  const layerControl = L.control.layers(baseMaps).addTo(map)
  return layerControl
}
