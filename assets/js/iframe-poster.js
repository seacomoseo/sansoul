// Load iframe player when hover mouse
const posterIframe = document.querySelectorAll('[data-iframe]')
posterIframe && posterIframe.forEach(e => {
  e.addEventListener('mouseenter', iframeWrap => {
    let attrs = ''
    const className = e.className
    const src = e.dataset.iframe
    const parent = iframeWrap.target.parentElement
    const isYoutube = src.match(/youtu\.be|youtube(-nocookie)?\.com/s)
    if (isYoutube) {
      attrs = `
        {{- ` ` -}} title="{{ i18n `video` }} · Youtube"
        {{- ` ` -}} src="${src} {{- if eq .Lang `en` -}} &cc_load_policy=1&hl=en&cc_lang_pref=en {{- end }}&autoplay=1&showinfo=0"
        {{- ` ` -}} allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; autoplay"
        {{- `` -}}
      `
    } else if (src.match(/vimeo\.com/s)) {
      attrs = `
        {{- ` ` -}} title="{{ i18n `video` }} · Vimeo"
        {{- ` ` -}} src="${src}"
        {{- ` ` -}} allow="fullscreen; autoplay"
        {{- `` -}}
      `
    }
    parent.innerHTML = `<iframe
      {{- ` ` -}}  ${className && 'class="' + className + '"'}
      {{- ` ` -}}  ${attrs}
      {{- ` ` -}}  allowfullscreen
      {{- ` ` -}}  width="560"
      {{- ` ` -}}  height="320"
      {{- `` -}}></iframe>
      {{- `` -}}
    `
    if (isYoutube) {
      loadScript('https://www.youtube.com/iframe_api')
      function onYouTubeIframeAPIReady() {
        let player = new YT.Player('parent.firstChild', {
          videoId: 'M7lc1UVf-VE',
          events: { 'onReady': onPlayerReady }
        })
        player.playVideo()
      }
    }
  })
})