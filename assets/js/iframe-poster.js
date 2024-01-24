// Load iframe player when hover mouse
import { i18nVideo, isLangEn } from '@params'
import { loadScript } from './load-script'

export function initIframePoster () {
  const posterIframe = document.querySelectorAll('[data-iframe]')
  posterIframe && posterIframe.forEach(e => {
    e.addEventListener('mouseenter', iframeWrap => {
      let attrs = ''
      let attrsEn = ''
      const className = e.className
      const src = e.dataset.iframe
      const parent = iframeWrap.target.parentElement
      const isYoutube = src.match(/youtu\.be|youtube(-nocookie)?\.com/s)
      if (isYoutube) {
        if (isLangEn) attrsEn = '&cc_load_policy=1&hl=en&cc_lang_pref=en'
        attrs =
          ` title="${i18nVideo} · Youtube"` +
          ` src="${src}${attrsEn}&autoplay=1&showinfo=0"` +
          ' allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; autoplay"'
      } else if (src.match(/vimeo\.com/s)) {
        attrs =
          ` title="${i18nVideo} · Vimeo"` +
          ` src="${src}"` +
          ' allow="fullscreen; autoplay"'
      }
      parent.innerHTML =
        '<iframe' +
          ` ${className && 'class="' + className + '"'}` +
          ` ${attrs}` +
          ' allowfullscreen` ' +
          ' width="560"` ' +
          ' height="320"` ' +
        '></iframe>'
      if (isYoutube) {
        loadScript('https://www.youtube.com/iframe_api')
        // eslint-disable-next-line
        function onYouTubeIframeAPIReady () {
          // eslint-disable-next-line
          const player = new YT.Player('parent.firstChild', {
            videoId: 'M7lc1UVf-VE',
            // eslint-disable-next-line
            events: { onReady: onPlayerReady }
          })
          player.playVideo()
        }
      }
    })
  })
}
