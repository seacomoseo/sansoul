// Load iframe player when hover mouse
import { i18nVideo, lang } from '@params'
import { loadScript } from './load-script'

export function initIframePoster () {
  const posterIframe = document.querySelectorAll('[data-iframe]')


  if (posterIframe) {
    document.addEventListener('click', e => {
      const iframeWrap = e.target.closest('[data-iframe]')
      if (iframeWrap) {
        let attrs = ''
        let attrsEn = ''
        const className = iframeWrap.className
        const src = iframeWrap.dataset.iframe
        const isYoutube = src.match(/youtu\.be|youtube(-nocookie)?\.com/s)
        if (isYoutube) {
          if (lang == 'en') attrsEn = '&cc_load_policy=1&hl=en&cc_lang_pref=en'
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
        iframeWrap.innerHTML =
          '<iframe' +
            ` ${className && 'class="' + className + '"'}` +
            ` ${attrs}` +
            ' allowfullscreen` ' +
            ' width="560"` ' +
            ' height="320"` ' +
          '></iframe>'
        delete iframeWrap.dataset.iframe
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
      }
    })
  }
}
