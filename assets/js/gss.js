// google spreadsheets
import { scrollShot } from './scroll-shot'
import { loadScript } from './load-script'

export function initGss () {
  scrollShot({
    rootMargin: '600px 0%',
    query: '[data-gss]',
    doStart: e => {
      loadScript(e.dataset.gss)
        .then(data => {
          // display response
          e.innerHTML = data.responseText
            .replace(/\n/ig, '')
            .replace(/<!DOCTYPE .*<link .*?>|style> .*?<body .*?>|<script .*?<\/script>|<style>.*?<\/style>|html \{.*?\.dash \{.*?\}|(font-family|padding):.*?;|display:none;|<thead>.*?<\/thead>|<\/body><\/html>/ig, '')
          document.querySelectorAll('.row-header-shim').forEach(e => e.remove())
        })
        .catch(console.error)
    }
  })
}
