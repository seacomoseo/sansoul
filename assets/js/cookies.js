import { cookiesLegal } from '@params'
import params from './params'
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
        if (localStorage[`controlcookie${e.value}`]) {
          e.checked = true
        }
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

    function cookiesAccept (c) {
      localStorage.controlcookie = localStorage.controlcookie || 0
      localStorage.controlcookie++
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
          localStorage[`controlcookie${type}`] = localStorage[`controlcookie${type}`] || 0
          localStorage[`controlcookie${type}`]++
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
