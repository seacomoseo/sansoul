// google spreadsheets
import { scrollShot } from './scroll-shot'

export function initGss () {
  scrollShot({
    rootMargin: '600px 0%',
    query: '[data-gss]',
    doStart: e => {
      fetch(e.dataset.gss)
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
          }
          return response.text()
        })
        .then(data => {
          // display response
          e.innerHTML = data
            .replace(/\n/ig, '')
            .replace(/<!DOCTYPE .*<link .*?>|style> .*?<body .*?>|<script .*?<\/script>|<style>.*?<\/style>|html \{.*?\.dash \{.*?\}|(font-family|padding):.*?;|display:none;|<thead>.*?<\/thead>|<\/body><\/html>/ig, '')
          document.querySelectorAll('.row-header-shim').forEach(e => e.remove())
        })
        .catch(console.error)
    },
    end: true
  })
}
