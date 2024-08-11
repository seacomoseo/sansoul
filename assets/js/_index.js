import {
  isScrollShow,
  isCookies,
  disqusId,
  googleAnalyticsId
} from '@params'
import { initNetlifyIdentity } from './netlify-identity'
import { initScrollbar } from './scrollbar'
import { initScrollTop } from './scroll-top'
import { initScrollToHashWhenLoad } from './scroll-to'
import { initLazyLoad } from './lazy-load'
import { initOpenLinks } from './open-links'
import { initMails } from './mails'
import { initParallax } from './parallax'
import { initModals } from './modals'
import { initMenuToggle } from './menu-toggle'
import { initMenuScrollSpy } from './menu-scroll-spy'
import { initIframePoster } from './iframe-poster'
import { initVideoMute } from './video-mute'
import { initVideoFullscreen } from './video-fullscreen'
import { initGss } from './gss'
import { initCollapsible } from './collapsible'
import { initSliders } from './sliders'
import { initFormValidate } from './form-validate'
import { initGoogleTranslate } from './google-translate'
import { initSimpleLightbox } from './simple-lightbox'
import { initPrerender } from './prerender'

initNetlifyIdentity()
initScrollbar()
initScrollTop()
initScrollToHashWhenLoad()
initLazyLoad()
initOpenLinks()
initMails()
initParallax()
initModals()
initMenuToggle()
initMenuScrollSpy()
initIframePoster()
initVideoMute()
initVideoFullscreen()
initGss()
initCollapsible()
initSliders()
initFormValidate()
initGoogleTranslate()
initSimpleLightbox()
initPrerender()
// Importaciones condicionales
if (isScrollShow) {
  import('./scroll-show').then(({ initScrollShow }) => {
    initScrollShow()
  })
}

if (isCookies) {
  import('./cookies').then(({ initCookies }) => {
    initCookies()
  })
}

if (disqusId) {
  import('./comments').then(({ initComments }) => {
    initComments()
  })
}

if (googleAnalyticsId) {
  import('./ga4').then(({ initGa4 }) => {
    initGa4()
  })
}
// eslint-disable-next-line
{{ . }}
