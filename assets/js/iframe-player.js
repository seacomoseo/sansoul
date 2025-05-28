// Load iframe player when hover mouse
import { i18nVideo, lang } from '@params'
import { loadScript } from './load-script'

const players = {}
const playerReadyPromises = {}

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
        let attrs = ''
        let attrsLang = ''
        const dataIframe = imageWithIframe.querySelector('[data-iframe]')
        const className = dataIframe.className
        const isYoutube = dataIframe.dataset.youtube
        const src = dataIframe.dataset.youtube || dataIframe.dataset.vimeo
        const idVideo = videoId(src)
        const id = playerId(dataIframe, idVideo)
        if (isYoutube) {
          if (lang !== 'es') attrsLang = `&cc_load_policy=1&hl=${lang}&cc_lang_pref=${lang}`
          attrs =
            ` title="${i18nVideo} · Youtube"` +
            ` src="${src}${attrsLang}&autoplay=1&showinfo=0"` +
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
                  playerReadyPromises[id] = new Promise((_resolve, _reject) => {
                    players[id] = new window[windowObject].Player(iframe, {
                      events: {
                        onReady: (event) => {
                          console.log('YouTube/Vimeo player ready:', id)
                          if (!isYoutube) event.target.play()
                          _resolve(event.target)
                        },
                        onError: (event) => {
                          console.error('YouTube/Vimeo player error for ID ' + id + ':', event.data)
                          _reject(new Error('YouTube/Vimeo player error: ' + event.data))
                        }
                      }
                    })
                  })
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
export async function togglePlayer (target, openModal) {
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
    if (playerReadyPromises[id]) {
      try {
        const player = await playerReadyPromises[id]
        if (player) {
          const isYoutube = iframePlayers[0].src.includes('https://www.youtube')
          if (isYoutube) {
            // Check if playVideo and pauseVideo is set
            if (player.playVideo && player.pauseVideo) {
              openModal ? player.playVideo() : player.pauseVideo()
            } else {
              // This should not occur if the pledge was resolved successfully
              console.error('YouTube player methods not available for id:', id)
            }
          } else {
            openModal ? player.play() : player.pause()
          }
        } else {
          console.log('Player promise for ID', id, 'resolved to null/undefined.')
        }
      } catch (error) {
        console.error('Error waiting for player or executing command for the ID:', id, error)
      }
    } else {
      // This could occur if the iframe exists but was not set by initIframePlayer.
      console.log('Promise to prepare for player with ID was not found:', id)
    }
    return
  }
  // Play/Pause only one video player
  const videoPlayers = target.querySelectorAll('.modal.ph video')
  if (videoPlayers.length === 1) {
    openModal ? videoPlayers[0].play() : videoPlayers[0].pause()
  }
}
