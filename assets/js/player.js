import { cookiesLegal } from '@params/config'
import { loadScript } from './load-script'
import params from './params'
import { initVideoDimensions, observeVideoDimensions } from './video-dimensions'
import { hasConsent } from './consent'
const { vid, lang } = params

const players = {}
const activeMedia = new Map()

// Video ID
function videoId (src) {
  return src.match(/(youtube-nocookie\.com\/embed|vimeo\.com(?:\/video)?)\/([\w-]+)/)[2]
}

// Player ID
function playerId (target, idVideo) {
  const idSection = target.closest('[id]')?.id || 'video'
  return `${idSection}-${idVideo}`
}

let initialized = false

export function initPlayer () {
  initVideoDimensions()
  if (initialized) return
  const posterVideo = document.querySelectorAll('[data-vid]')

  if (posterVideo.length) {
    initialized = true
    const refreshConsent = () => {
      const allowed = hasConsent('media', cookiesLegal)
      if (!allowed) {
        for (const [wrapper, { children, id }] of activeMedia) {
          try { Promise.resolve(players[id]?.destroy?.()).catch(() => {}) } catch {}
          delete players[id]
          if (wrapper.isConnected) wrapper.replaceChildren(...children)
          activeMedia.delete(wrapper)
        }
      }
      document.querySelectorAll('[data-vid]').forEach(poster => {
        poster.toggleAttribute('not-cookie', !poster.hasAttribute('data-file') && !allowed)
      })
    }
    refreshConsent()
    window.addEventListener('cookies:media', refreshConsent)
    window.addEventListener('cookies:changed', refreshConsent)

    document.addEventListener('click', e => {
      const imgWithIframe = e.target.closest('.img')
      if (imgWithIframe) {
        const dataMedia = imgWithIframe.querySelector('[data-vid]')
        if (!dataMedia) return
        const isVideoFile = dataMedia.hasAttribute('data-file')
        if (!isVideoFile && !hasConsent('media', cookiesLegal)) {
          dataMedia.setAttribute('not-cookie', '')
          const cookieToggle = document.querySelector('.cookies__toggle')
          if (cookieToggle) cookieToggle.click()
          return
        }
        const src = dataMedia.dataset.vid
        const className = dataMedia.className?.baseVal || dataMedia.className // baseVal to fix svg's
        const copyDimensions = target => {
          for (const name of ['width', 'height']) {
            const value = Number(dataMedia.dataset[name])
            if (Number.isFinite(value) && value > 0) target.setAttribute(name, value)
          }
        }

        if (isVideoFile) {
          const video = document.createElement('video')
          video.className = className
          video.title = vid
          video.src = src
          video.autoplay = true
          video.controls = true
          video.playsInline = true
          copyDimensions(video)
          imgWithIframe.replaceChildren(video)

          // Remove play button
          video.nextElementSibling?.remove()
        } else {
          const isYT = dataMedia.dataset.youtube === ''
          const idVideo = videoId(src)
          const id = playerId(dataMedia, idVideo)
          activeMedia.set(imgWithIframe, {
            children: [...imgWithIframe.childNodes].map(node => node.cloneNode(true)),
            id
          })
          const attrsLang = lang === 'es' ? '' : `&cc_load_policy=1&hl=${lang}&cc_lang_pref=${lang}`
          const iframe = document.createElement('iframe')
          iframe.className = className
          iframe.title = vid
          copyDimensions(iframe)
          iframe.allowFullscreen = true
          iframe.allow = isYT
            ? 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; autoplay'
            : 'fullscreen; autoplay'
          imgWithIframe.replaceChildren(iframe)
          observeVideoDimensions(iframe)

          // Remove play button
          iframe.nextElementSibling?.remove()

          // Init Player
          function initPlayer () {
            const api = isYT
              ? 'https://www.youtube.com/iframe_api'
              : 'https://player.vimeo.com/api/player.js'
            loadScript(api)
              .then(() => {
                if (!iframe.isConnected || !hasConsent('media', cookiesLegal)) return
                if (isYT) {
                  // It is executed when ALL iframe API is ready
                  window.YT.ready(() => {
                    if (!iframe.isConnected || !hasConsent('media', cookiesLegal)) return
                    players[id] = new window.YT.Player(iframe, {
                      host: 'https://www.youtube-nocookie.com',
                      playerVars: { origin: location.origin }
                    })
                  })
                } else {
                  // Vimeo: the constructor is ready immediately after loading the script
                  players[id] = new window.Vimeo.Player(iframe)
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
          iframe.src = isYT ? `${src}${attrsLang}&autoplay=1&origin=${location.origin}&showinfo=0` : `${src}&autoplay=1`
        }
      }
    })
  }
}

// Play/Pause modal videos
export function togglePlayer (target, openModal) {
  if (openModal) {
    // Click (load and play) data video
    const dataMedia = target.querySelectorAll('.ph [data-vid]')
    if (dataMedia.length === 1) {
      dataMedia[0].click()
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
  // Play/Pause only one file player
  const filePlayers = target.querySelectorAll('.modal.ph video')
  if (filePlayers.length === 1) {
    openModal ? filePlayers[0].play() : filePlayers[0].pause()
  }
}
