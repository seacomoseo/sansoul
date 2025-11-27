import { cookiesLegal } from '@params'

export function initCookies () {
  const cookiesMessage = document.querySelector('.cookies')

  if (cookiesMessage) {
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
      localStorage.controlcookie = localStorage.controlcookie || 0
      localStorage.controlcookie++
      cookiesClose()

      // If acept all or analytics ckecked
      const aceptAll = c.classList.contains('cookies__btn--all')
      const analyticsCkecked = document.querySelector('.cookies [value="analytics"]')?.checked
      if (aceptAll || analyticsCkecked) {
        localStorage.controlcookieanalytics = localStorage.controlcookieanalytics || 0
        localStorage.controlcookieanalytics++
        if (typeof googleAnalytics === 'function' && cookiesLegal) {
          googleAnalytics()
        }
      }
    }

    document.addEventListener('click', e => {
      // Onclick cookies accept
      const cb = e.target.closest('.cookies__btn')
      if (cb) {
        cookiesAccept(cb)
      } else {
        // Onclick cookies message toggle
        const ct = e.target.closest('.cookies__toggle')
        if (ct) cookiesToggle()
      }
    })

    // Add class active from cookies message if cookies don't acept
    if (localStorage.controlcookie) cookiesClose()
  }
}
