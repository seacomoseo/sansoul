import { googleAnalyticsId } from '@params'

export function initCookies () {
  const cookiesMessage = document.querySelector('.cookies')
  const cookiesMessageAcept = document.querySelectorAll('.cookies__button-acept')
  const cookiesMessageToogle = document.querySelector('.cookies__toggle')

  if (cookiesMessage && cookiesMessageAcept && cookiesMessageToogle) {
    function cookiesOpen () {
      cookiesMessage.removeAttribute('hidden')
      cookiesMessage.querySelector('[data-b]').focus()
      setTimeout(() => cookiesMessage.classList.remove('cookies--hide'), 10)
    }
    function cookiesClose () {
      cookiesMessage.classList.add('cookies--hide')
      setTimeout(() => cookiesMessage.setAttribute('hidden', 'until-found'), 300)
    }
    function cookiesToggle () {
      const isCookiesOpen = document.querySelector('.cookies[hidden="until-found"]')
      if (isCookiesOpen) {
        cookiesOpen()
      } else {
        cookiesClose()
      }
    }

    function cookiesAccept (c) {
      window.localStorage.controlcookie = window.localStorage.controlcookie || 0
      window.localStorage.controlcookie++
      cookiesClose()
      // If acept all or if not acept all and if analytics ckecked
      const aceptAll = c.target.classList.value.includes('cookies__button-acept--all')
      const analyticsCkecked = document.querySelector('[value="de-analisis"]').checked
      if (aceptAll || (!aceptAll && analyticsCkecked)) {
        window.localStorage.controlcookieanalytics = window.localStorage.controlcookieanalytics || 0
        window.localStorage.controlcookieanalytics++
        if (googleAnalyticsId) {
          // eslint-disable-next-line
          googleAnalytics()
        }
      }
    }

    document.addEventListener('click', e => {
      // Onclick cookies accept
      const cb = e.target.closest('.cookies__button-acept')
      if (cb) cookiesAccept(cb)
      // Onclick cookies message toggle
      const ct = e.target.closest('.cookies__toggle')
      if (ct) cookiesToggle()
    })

    // Add class active from cookies message if cookies don't acept
    if (window.localStorage.controlcookie) cookiesClose()
  }
}
