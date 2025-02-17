// google spreadsheets
import { scrollShot } from './scroll-shot'

export function initGss () {
  scrollShot({
    rootMargin: '600px 0%',
    query: '[data-gss]',
    doStart: e => {
      const url = e.dataset.gss
      const xhr = new XMLHttpRequest()
      xhr.open('GET', url, true)
      xhr.onload = () => {
        // display response
        e.innerHTML = xhr.responseText
          .replace(/\n/ig, '')
          .replace(/<!DOCTYPE .*<link .*?>|style> .*?<body .*?>|<script .*?<\/script>|<style>.*?<\/style>|html \{.*?\.dash \{.*?\}|(font-family|padding):.*?;|display:none;|<thead>.*?<\/thead>|<\/body><\/html>/ig, '')
        document.querySelectorAll('.row-header-shim').forEach(e => e.remove())
      }
      xhr.send()
    }
  })
}
