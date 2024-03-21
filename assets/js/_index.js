/* eslint-disable no-eval */

import {
  isScrollShow,
  isCookies,
  disqusId,
  isGoogleTranslate,
  googleAnalyticsId
} from '@params'
import { initNetlifyIdentity } from './netlify-identity'
import { initScrollbar } from './scrollbar'
import { initScrollShow } from './scroll-show'
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
import { initCookies } from './cookies'
import { initCollapsible } from './collapsible'
import { initSliders } from './sliders'
import { initFormValidate } from './form-validate'
import { initComments } from './comments'
import { initGoogleTranslate } from './google-translate'
import { initSimpleLightbox } from './simple-lightbox'
import { initPrerender } from './prerender'
import { initGa4 } from './ga4'

initNetlifyIdentity()
initScrollbar()
if (isScrollShow) initScrollShow()
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
if (isCookies) initCookies()
initCollapsible()
initSliders()
initFormValidate()
if (disqusId) initComments()
initGoogleTranslate()
initSimpleLightbox()
initPrerender()
if (googleAnalyticsId) initGa4()
{{ . }}
