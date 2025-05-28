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
  console.log('Attempting to initialize YouTube player for:', id)

  return waitForYouTubeAPI().then(() => {
    console.log('YouTube API ready, creating player for:', id)

    return new Promise((resolve, reject) => {
      try {
        // Check if player already exists
        if (players[id]) {
          console.log('Player already exists for:', id)
          resolve(players[id])
          return
        }

        const player = new window.YT.Player(iframe, {
          events: {
            onReady: (event) => {
              console.log('YouTube player ready:', id)
              players[id] = event.target
              resolve(event.target)
            },
            onError: (error) => {
              console.error('YouTube player error for', id, ':', error)
              reject(error)
            },
            onStateChange: (event) => {
              console.log('YouTube player state change for', id, ':', event.data)
            }
          }
        })

        // Timeout fallback
        setTimeout(() => {
          if (!players[id]) {
            console.warn('YouTube player initialization timeout for:', id)
            // Try to get player anyway
            if (player && typeof player.playVideo === 'function') {
              players[id] = player
              resolve(player)
            } else {
              reject(new Error('Player initialization timeout'))
            }
          }
        }, 5000)
      } catch (error) {
        console.error('Error creating YouTube player for', id, ':', error)
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
          console.log('Iframe loaded, loading script for:', id)

          loadScript(script)
            .then(() => {
              console.log('Script loaded successfully for:', id)

              if (isYoutube) {
                initYouTubePlayer(iframe, id)
                  .then(player => {
                    console.log('YouTube player initialized successfully for:', id)
                  })
                  .catch(error => {
                    console.error('Failed to initialize YouTube player for', id, ':', error)
                  })
              } else {
                const checkVimeo = setInterval(() => {
                  if (window.Vimeo && window.Vimeo.Player) {
                    clearInterval(checkVimeo)
                    initVimeoPlayer(iframe, id)
                      .then(player => {
                        console.log('Vimeo player initialized successfully for:', id)
                      })
                      .catch(error => {
                        console.error('Failed to initialize Vimeo player for', id, ':', error)
                      })
                  }
                }, 100)
              }
            })
            .catch(error => {
              console.error('Failed to load script for', id, ':', error)
            })
        })
      }
    })
  }
}

// Play/Pause modal videos
export function togglePlayer (target, openModal) {
  console.log('togglePlayer called, openModal:', openModal)
  console.log('Available players:', Object.keys(players))

  if (openModal) {
    // Click (load and play) data iframe
    const dataIframe = target.querySelectorAll('.ph [data-iframe]')
    if (dataIframe.length === 1) {
      console.log('Clicking data iframe to load player')
      dataIframe[0].click()
      return
    }
  }

  // Play/Pause only one youtube/vimeo player
  const iframePlayers = target.querySelectorAll('.modal.ph iframe:is([src^="https://www.youtube"], [src^="https://player.vimeo.com"])')
  console.log('Found iframe players:', iframePlayers.length)

  if (iframePlayers.length === 1) {
    const idVideo = videoId(iframePlayers[0].src)
    const id = playerId(target, idVideo)
    const player = players[id]

    console.log('Looking for player with id:', id)
    console.log('Player found:', !!player)

    if (player) {
      if (iframePlayers[0].src.includes('https://www.youtube')) {
        console.log('YouTube player methods available:', {
          playVideo: typeof player.playVideo,
          pauseVideo: typeof player.pauseVideo
        })

        // Check if methods are available and wait if necessary
        const executeYouTubeAction = () => {
          if (typeof player.pauseVideo === 'function' && typeof player.playVideo === 'function') {
            console.log('Executing YouTube action:', openModal ? 'play' : 'pause')
            openModal ? player.playVideo() : player.pauseVideo()
          } else {
            console.log('YouTube methods not ready, waiting...')
            // Wait a bit more for the API to be ready
            setTimeout(() => {
              if (typeof player.pauseVideo === 'function' && typeof player.playVideo === 'function') {
                console.log('Executing YouTube action after wait:', openModal ? 'play' : 'pause')
                openModal ? player.playVideo() : player.pauseVideo()
              } else {
                console.log('YouTube player methods still not available for:', id)
                console.log('Player object:', player)
              }
            }, 500)
          }
        }
        executeYouTubeAction()
      } else {
        // Vimeo
        if (typeof player.play === 'function' && typeof player.pause === 'function') {
          console.log('Executing Vimeo action:', openModal ? 'play' : 'pause')
          openModal ? player.play() : player.pause()
        }
      }
    } else {
      console.log('Player not found for id:', id)
      console.log('Available player IDs:', Object.keys(players))
      console.log('Target element ID:', target.id)
      console.log('Video ID from src:', idVideo)
    }
    return
  }

  // Play/Pause only one video player
  const videoPlayers = target.querySelectorAll('.modal.ph video')
  if (videoPlayers.length === 1) {
    console.log('Executing native video action:', openModal ? 'play' : 'pause')
    openModal ? videoPlayers[0].play() : videoPlayers[0].pause()
  }
}
