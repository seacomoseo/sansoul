// Load iframe player when hover mouse
import { i18nVideo, lang } from '@params'
import { loadScript } from './load-script'

const players = {}
const playerStates = {} // Track player ready state

// Video ID
function videoId (src) {
  return src.match(/(youtube-nocookie\.com\/embed|vimeo\.com\/video)\/([\w-]+)/)[2]
}

// Player ID
function playerId (target, idVideo) {
  const idSection = target.closest('[id]').id
  return `${idSection}-${idVideo}`
}

// Wait for player to be ready
function waitForPlayerReady (id, maxAttempts = 50) {
  return new Promise((resolve, reject) => {
    let attempts = 0
    const checkReady = () => {
      attempts++
      if (playerStates[id] && players[id]) {
        resolve(players[id])
      } else if (attempts >= maxAttempts) {
        reject(new Error(`Player ${id} not ready after ${maxAttempts} attempts`))
      } else {
        setTimeout(checkReady, 100)
      }
    }
    checkReady()
  })
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
            ` id="${id}"` +
            ' allowfullscreen ' +
            ' width="560" ' +
            ' height="320" ' +
          '></iframe>'

        const iframe = imageWithIframe.querySelector('iframe')
        const script = isYoutube ? 'https://www.youtube.com/iframe_api' : 'https://player.vimeo.com/api/player.js'
        const windowObject = isYoutube ? 'YT' : 'Vimeo'

        // Remove player button
        iframe.nextElementSibling?.remove()

        // Initialize player state as not ready
        playerStates[id] = false

        iframe.addEventListener('load', () => {
          loadScript(script)
            .then(() => {
              const checkWindowObject = setInterval(() => {
                if (window[windowObject] && window[windowObject].Player) {
                  clearInterval(checkWindowObject)

                  if (isYoutube) {
                    // For YouTube, wait for YT.Player to be available
                    if (window.YT.Player) {
                      players[id] = new window.YT.Player(id, {
                        events: {
                          onReady: (event) => {
                            console.log('YouTube player ready:', id)
                            playerStates[id] = true
                            // Auto-play when ready (since autoplay in URL might not work)
                            event.target.playVideo()
                          },
                          onStateChange: (event) => {
                            // Optional: Log state changes for debugging
                            console.log('Player state changed:', id, event.data)
                          }
                        }
                      })
                    }
                  } else {
                    // For Vimeo
                    players[id] = new window.Vimeo.Player(iframe, {
                      events: {
                        onReady: () => {
                          console.log('Vimeo player ready:', id)
                          playerStates[id] = true
                          players[id].play()
                        }
                      }
                    })
                  }
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
        // Wait for YouTube player to be ready before calling methods
        waitForPlayerReady(id)
          .then((readyPlayer) => {
            if (readyPlayer.pauseVideo && readyPlayer.playVideo) {
              openModal ? readyPlayer.playVideo() : readyPlayer.pauseVideo()
            } else {
              console.log('YouTube player methods not available yet:', id)
            }
          })
          .catch((error) => {
            console.log('YouTube player not ready:', error.message)
          })
      } else {
        // For Vimeo
        waitForPlayerReady(id)
          .then((readyPlayer) => {
            openModal ? readyPlayer.play() : readyPlayer.pause()
          })
          .catch((error) => {
            console.log('Vimeo player not ready:', error.message)
          })
      }
    } else {
      console.log('Player not found, id:', id)
    }
    return
  }

  // Play/Pause only one video player
  const videoPlayers = target.querySelectorAll('.modal.ph video')
  if (videoPlayers.length === 1) {
    openModal ? videoPlayers[0].play() : videoPlayers[0].pause()
  }
}
