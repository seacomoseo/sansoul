/* eslint-disable no-eval */

import {
  isScrollShow,
  isParallax,
  isCookies,
  disqusId,
  isGoogleTranslate,
  googleAnalyticsId,
  formsLoad,
  custom,
  customString
} from '@params'
import { scrollShot } from './scroll-shot.js'
import { initScrollbar } from './scrollbar.js'
import { initScrollShow } from './scroll-show.js'
import { initScrollTop } from './scroll-top.js'
import { initScrollToHashWhenLoad } from './scroll-to.js'
import { initLazyLoad } from './lazy-load.js'
import { initOpenLinks } from './open-links.js'
import { initMails } from './mails.js'
import { initParallax } from './parallax.js'
import { initModals } from './modals.js'
import { initMenuToggle } from './menu-toggle.js'
import { initMenuScrollSpy } from './menu-scroll-spy.js'
import { initIframePoster } from './iframe-poster.js'
import { initVideoMute } from './video-mute.js'
import { initVideoFullscreen } from './video-fullscreen.js'
import { initGss } from './gss.js'
import { initCookies } from './cookies.js'
import { initCollapse } from './collapse.js'
import { initSliders } from './sliders.js'
import { initFormValidate } from './form-validate.js'
import { initComments } from './comments.js'
import { initGoogleTranslate } from './google-translate.js'
import { initNetlifyIdentity } from './netlify-identity.js'
import { initSimpleLightbox } from './simple-lightbox.js'
import { initPrerender } from './prerender.js'
import { initGa4 } from './ga4.js'

initScrollbar()
if (isScrollShow) initScrollShow()
initScrollTop()
initScrollToHashWhenLoad()
initLazyLoad()
initOpenLinks()
initMails()
if (isParallax) initParallax()
initModals()
initMenuToggle()
initMenuScrollSpy()
initIframePoster()
initVideoMute()
initVideoFullscreen()
initGss()
if (isCookies) initCookies()
initCollapse()
initSliders()
eval(formsLoad)
initFormValidate()
if (disqusId) initComments()
if (isGoogleTranslate) initGoogleTranslate()
initNetlifyIdentity()
initSimpleLightbox()
initPrerender()
if (googleAnalyticsId) initGa4()
eval(custom)
eval(customString)
