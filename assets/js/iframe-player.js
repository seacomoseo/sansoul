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

// Wait for YouTube API to be fully ready
function waitForYouTubeAPI () {
  return new Promise((resolve) => {
    const checkAPI = () => {
      if (window.YT && window.YT.Player && typeof window.YT.Player === 'function') {
        resolve()
      } else {
        setTimeout(checkAPI, 50)
      }
    }
    checkAPI()
  })
}

// Initialize YouTube player with proper error handling
function initYouTubePlayer (iframe, id) {
  return waitForYouTubeAPI().then(() => {
    return new Promise((resolve, reject) => {
      try {
        const player = new window.YT.Player(iframe, {
          events: {
            onReady: (event) => {
              console.log('YouTube player ready:', id)
              players[id] = event.target
              resolve(event.target)
            },
            onError: (error) => {
              console.error('YouTube player error:', error)
              reject(error)
            }
          }
        })
      } catch (error) {
        console.error('Error creating YouTube player:', error)
        reject(error)
      }
    })
  })
}

// Initialize Vimeo player
function initVimeoPlayer (iframe, id) {
  return new Promise((resolve, reject) => {
    if (window.Vimeo && window.Vimeo.Player) {
      try {
        const player = new window.Vimeo.Player(iframe)
        players[id] = player
        player.ready().then(() => {
          console.log('Vimeo player ready:', id)
          player.play()
          resolve(player)
        }).catch(reject)
      } catch (error) {
        reject(error)
      }
    } else {
      reject(new Error('Vimeo API not loaded'))
    }
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
        } else if (src.match(/vimeo\.com/)) {
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

        iframe.nextElementSibling?.remove()

        iframe.addEventListener('load', () => {
          loadScript(script)
            .then(() => {
              if (isYoutube) {
                initYouTubePlayer(iframe, id).catch(console.error)
              } else {
                const checkVimeo = setInterval(() => {
                  if (window.Vimeo && window.Vimeo.Player) {
                    clearInterval(checkVimeo)
                    initVimeoPlayer(iframe, id).catch(console.error)
                  }
                }, 100)
              }
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
        // Check if methods are available and wait if necessary
        const executeYouTubeAction = () => {
          if (typeof player.pauseVideo === 'function' && typeof player.playVideo === 'function') {
            openModal ? player.playVideo() : player.pauseVideo()
          } else {
            // Wait a bit more for the API to be ready
            setTimeout(() => {
              if (typeof player.pauseVideo === 'function' && typeof player.playVideo === 'function') {
                openModal ? player.playVideo() : player.pauseVideo()
              } else {
                console.log('YouTube player methods still not available for:', id)
              }
            }, 500)
          }
        }
        executeYouTubeAction()
      } else {
        // Vimeo
        if (typeof player.play === 'function' && typeof player.pause === 'function') {
          openModal ? player.play() : player.pause()
        }
      }
    } else {
      console.log('Player not found for id:', id)
    }
    return
  }

  // Play/Pause only one video player
  const videoPlayers = target.querySelectorAll('.modal.ph video')
  if (videoPlayers.length === 1) {
    openModal ? videoPlayers[0].play() : videoPlayers[0].pause()
  }
}
