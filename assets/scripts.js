import { initNetlifyIdentity } from './netlify-identity'
import { initMenuToggle } from './menu-toggle'
import { initMenuScrollSpy } from './menu-scroll-spy'
import { initScrollTop } from './scroll-top'
import { initScrollToHashWhenLoad } from './scroll-to'
import { initOpenLinks } from './open-links'
import { initMails } from './mails'
import { initScrollParallax } from './scroll-parallax'
import { initModals } from './modals'
import { initPlayer } from './player'
import { initVideoMute } from './video-mute'
import { initVideoFullscreen } from './video-fullscreen'
import { initGss } from './gss'
import { initLatex } from './latex'
import { initFaq } from './faq'
import { initSliders } from './sliders'
import { initMap } from './map'
import { initFormGeo } from './form-geo'
import { initFormSend } from './form-send'
import { initFormFiles } from './form-files'
import { initFormShow } from './form-show'
import { initGoogleTranslate } from './google-translate'
import { initGa4 } from './ga4'
import { initSimpleLightbox } from './simple-lightbox'
import { initPrerender } from './prerender'
import { initComments } from './comments'
import { initCounter } from './counter'

if (!window.__sansoulInitialized) {
  window.__sansoulInitialized = true
  initNetlifyIdentity()
  initMenuToggle()
  initMenuScrollSpy()
  initScrollTop()
  initScrollToHashWhenLoad()
  initOpenLinks()
  initMails()
  initScrollParallax()
  initModals()
  initPlayer()
  initVideoMute()
  initVideoFullscreen()
  initGss()
  initLatex()
  initFaq()
  initSliders()
  initMap()
  initFormGeo()
  initFormSend()
  initFormFiles()
  initFormShow()
  initGoogleTranslate()
  initGa4()
  initSimpleLightbox()
  initPrerender()
  initComments()
  initCounter()
}
