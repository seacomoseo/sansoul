import { cookiesLegal } from '@params/config'
import params from './params'
import { hasConsent } from './consent'
const { cookiesVideo } = params

export function initCookies () {
  const cookiesMessage = document.querySelector('.cookies')

  // Inject CSS variables
  if (cookiesLegal) {
    if (document.querySelector('[data-vid]')) {
      document.body.style.setProperty('--cookie-video', `"${cookiesVideo}"`)
    }
  }

  if (cookiesMessage) {
    function cookiesOpen () {
      const checkboxes = cookiesMessage.querySelectorAll('input[name="cookies"]')
      checkboxes.forEach(e => {
        if (!e.disabled) e.checked = hasConsent(e.value, cookiesLegal)
      })
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

    function nextCounter (value) {
      const count = Number(value)
      return Number.isSafeInteger(count) && count >= 0 && count < Number.MAX_SAFE_INTEGER ? count + 1 : 1
    }

    function cookiesAccept (c) {
      localStorage.controlcookie = nextCounter(localStorage.controlcookie)
      cookiesClose()

      // Accept all or specific cookies
      const aceptAll = c.classList.contains('cookies__btn--all')
      const rejectAll = c.classList.contains('cookies__btn--reject')
      const checkboxes = cookiesMessage.querySelectorAll('input[name="cookies"]')

      if (rejectAll) {
        checkboxes.forEach(e => {
          if (!e.disabled) e.checked = false
        })
      }

      checkboxes.forEach(e => {
        const type = e.value
        if (aceptAll || e.checked) {
          localStorage[`controlcookie${type}`] = nextCounter(localStorage[`controlcookie${type}`])
          window.dispatchEvent(new CustomEvent(`cookies:${type}`))

          if (type === 'analytics') {
            if (typeof googleAnalytics === 'function' && cookiesLegal) {
              googleAnalytics()
            }
          }
        } else {
          localStorage.removeItem(`controlcookie${type}`)
        }
      })
      window.dispatchEvent(new CustomEvent('cookies:changed', {
        detail: Object.fromEntries([...checkboxes].map(input => [input.value, hasConsent(input.value, cookiesLegal)]))
      }))
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
