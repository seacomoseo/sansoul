// Load iframe player when hover mouse
import { loadScript } from './load-script'
import params from './params'
const { vid, lang } = params

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
      const imgWithIframe = e.target.closest('.img')
      if (imgWithIframe) {
        const dataIframe = imgWithIframe.querySelector('[data-iframe]')
        const className = dataIframe.className?.baseVal || dataIframe.className // baseVal to fix svg's
        const isYT = dataIframe.dataset.youtube
        const src = dataIframe.dataset.youtube || dataIframe.dataset.vimeo
        const idVideo = videoId(src)
        const id = playerId(dataIframe, idVideo)
        const attrsLang = lang === 'es' ? '' : `&cc_load_policy=1&hl=${lang}&cc_lang_pref=${lang}`
        const iframe = document.createElement('iframe')
        iframe.className = className
        iframe.title = vid
        iframe.width = 560
        iframe.height = 320
        iframe.allowFullscreen = true
        iframe.allow = isYT
          ? 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; autoplay'
          : 'fullscreen; autoplay'
        imgWithIframe.replaceChildren(iframe)

        // Remove play button
        iframe.nextElementSibling?.remove()

        // Init Player
        function initPlayer () {
          const api = isYT
            ? 'https://www.youtube.com/iframe_api'
            : 'https://player.vimeo.com/api/player.js'
          loadScript(api)
            .then(() => {
              if (isYT) {
                // It is executed when ALL iframe API is ready
                window.YT.ready(() => {
                  players[id] = new window.YT.Player(iframe, {
                    host: 'https://www.youtube-nocookie.com',
                    playerVars: { origin: location.origin },
                    events: {
                      onReady: () => console.log('Player ready:', id)
                    }
                  })
                })
              } else {
                // Vimeo: the constructor is ready immediately after loading the script
                players[id] = new window.Vimeo.Player(iframe, {
                  events: {
                    loaded: () => console.log('Player ready:', id)
                  }
                })
              }
            })
            .catch(console.error)
        }

        // If the iframe is NOW ready, create the player right now; if not, wait for it to load. This way you never lose the event.
        if (iframe.contentWindow?.postMessage) {
          initPlayer()
        } else {
          iframe.addEventListener('load', initPlayer, { once: true })
        }

        // Assigns the URL
        iframe.src = isYT ? `${src}${attrsLang}&autoplay=1&origin=${location.origin}&showinfo=0` : src
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
