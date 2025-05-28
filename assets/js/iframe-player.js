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
      const imageWithIframe = e.target.closest('.image:has(> [data-iframe])')
      if (imageWithIframe) {
        const dataIframe = imageWithIframe.querySelector('[data-iframe]')
        let attrs = ''
        let attrsEn = ''
        const className = dataIframe.className
        const isYoutube = dataIframe.dataset.youtube
        const src = dataIframe.dataset.youtube || dataIframe.dataset.vimeo
        const idVideo = videoId(src)
        const id = playerId(dataIframe, idVideo)
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
        dataIframe.outerHTML =
          '<iframe' +
            ` ${className ? ' class="' + className + '"' : ''}` +
            ` ${attrs}` +
            ' allowfullscreen ' +
            ' width="560" ' +
            ' height="320" ' +
          '></iframe>'
        const iframe = imageWithIframe.querySelector('iframe')
        const script = isYoutube ? 'https://www.youtube.com/iframe_api' : 'https://player.vimeo.com/api/player.js'
        const windowObject = isYoutube ? 'YT' : 'Vimeo'

        iframe.nextElementSibling?.remove()
        iframe.addEventListener('load', () => {
          loadScript(script)
            .then(() => {
              const checkWindowObject = setInterval(() => {
                if (window[windowObject] && window[windowObject].Player) {
                  clearInterval(checkWindowObject)
                  const opts = {
                    events: {
                      onReady: () => {
                        console.log('YouTube/Vimeo player ready:', id)
                        if (!isYoutube) players[id].play()
                      }
                    }
                  }
                  if (isYoutube) opts.host = 'https://www.youtube-nocookie.com'
                  players[id] = new window[windowObject].Player(iframe, opts)
                }
              }, 100)
            })
            .catch(console.error)
        })
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
  const iframePlayers = target.querySelectorAll('.modal.ph iframe:is([src^="https://www.youtube"], [src^="https://player.vimeo.com"])')
  if (iframePlayers.length === 1) {
    const idVideo = videoId(iframePlayers[0].src)
    const id = playerId(target, idVideo)
    const player = players[id]
    if (player) {
      if (iframePlayers[0].src.includes('https://www.youtube')) {
        // Check if playVideo and pauseVideo is set
        if (player.pauseVideo && player.playVideo) {
          openModal ? player.playVideo() : player.pauseVideo()
        } else {
          console.log((openModal ? 'playVideo' : 'pauseVideo') + ' not set')
        }
      } else {
        openModal ? player.play() : player.pause()
      }
    } else {
      console.log('players is not set, id:', id)
    }
    return
  }
  // Play/Pause only one video player
  const videoPlayers = target.querySelectorAll('.modal.ph video')
  if (videoPlayers.length === 1) {
    openModal ? videoPlayers[0].play() : videoPlayers[0].pause()
  }
}
