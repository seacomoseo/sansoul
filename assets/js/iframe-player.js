// Load iframe player when hover mouse
import { i18nVideo, lang } from '@params'
import { loadScript } from './load-script'

const players = {}

// Video ID
function videoId (src) {
  return src.match(/(youtube-nocookie\.com\/embed|vimeo\.com\/video)\/([\w-]+)/)[2]
}

// Player ID
function playerId (target, idVideo) {
  const idSection = target.closest('[id]').id
  return `${idSection}-${idVideo}`
}

export function initIframePlayer () {
  const posterIframe = document.querySelectorAll('[data-iframe]')

  if (posterIframe) {
    document.addEventListener('click', e => {
      const iframeWrap = e.target.closest('[data-iframe]')
      if (iframeWrap) {
        let attrs = ''
        let attrsEn = ''
        const className = iframeWrap.className
        const isYoutube = iframeWrap.dataset.youtube
        const src = iframeWrap.dataset.youtube || iframeWrap.dataset.vimeo
        const idVideo = videoId(src)
        const id = playerId(iframeWrap, idVideo)
        if (isYoutube) {
          if (lang !== 'es') attrsEn = `&cc_load_policy=1&hl=${lang}&cc_lang_pref=${lang}`
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
            ' allowfullscreen ' +
            ' width="560" ' +
            ' height="320" ' +
          '></iframe>'

        delete iframeWrap.dataset.iframe
        delete iframeWrap.dataset.youtube
        delete iframeWrap.dataset.vimeo
        iframeWrap.nextElementSibling.remove()

        const script = isYoutube ? 'https://www.youtube.com/iframe_api' : 'https://player.vimeo.com/api/player.js'
        const windowObject = isYoutube ? 'YT' : 'Vimeo'
        loadScript(script)
          .then(() => {
            const checkWindowObject = setInterval(() => {
              if (window[windowObject] && window[windowObject].Player) {
                clearInterval(checkWindowObject)
                // eslint-disable-next-line
                // players[id] = new window[windowObject].Player(iframeWrap.firstChild)
                players[id] = new window[windowObject].Player(iframeWrap.firstChild, {
                  events: {
                    videoId: idVideo,
                    onReady: (event) => {
                      console.log(`YouTube Player listo: ${id}`)
                      players[id] = event.target // Asigna correctamente el objeto Player
                    }
                  }
                })
                if (!isYoutube) players[id].play()
              }
            }, 100)
          })
          .catch(console.error)
      }
    })
  }
}

// Play/Pause modal videos
export function togglePlayer (target, openModal) {
  if (openModal) {
    // Click (load and play) data iframe
    const dataIframe = target.querySelectorAll('.ph [data-iframe]')
    if (dataIframe.length === 1) {
      dataIframe[0].click()
      return
    }
  }
  // Play/Pause only one youtube/vimeo player
  const iframePlayers = target.querySelectorAll('.modal.ph :is(iframe[src^="https://www.youtube"], iframe[src^="https://player.vimeo.com"])')
  if (iframePlayers.length === 1) {
    const id = playerId(target, videoId(iframePlayers[0].src))
    if (iframePlayers[0].src.includes('https://www.youtube')) {
      openModal ? players[id].playVideo() : players[id].pauseVideo()
    } else {
      openModal ? players[id].play() : players[id].pause()
    }
    return
  }
  // Play/Pause only one video player
  const videoPlayers = target.querySelectorAll('.modal.ph video')
  if (videoPlayers.length === 1) {
    openModal ? videoPlayers[0].play() : videoPlayers[0].pause()
  }
}
