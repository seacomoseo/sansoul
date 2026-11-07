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
    let visibilityGeneration = 0
    function cookiesOpen () {
      const generation = ++visibilityGeneration
      const checkboxes = cookiesMessage.querySelectorAll('input[name="cookies"]')
      checkboxes.forEach(e => {
        if (!e.disabled) e.checked = hasConsent(e.value, cookiesLegal)
      })
      cookiesMessage.removeAttribute('hidden')
      cookiesMessage.querySelector('[data-b]').focus()
      setTimeout(() => {
        if (generation === visibilityGeneration) cookiesMessage.classList.remove('cookies--hide')
      }, 10)
    }
    function cookiesClose () {
      const generation = ++visibilityGeneration
      cookiesMessage.classList.add('cookies--hide')
      setTimeout(() => {
        if (generation === visibilityGeneration) cookiesMessage.setAttribute('hidden', 'until-found')
      }, 300)
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
      const aceptAll = c.classList.contains('cookies__btn--all')
      const rejectAll = c.classList.contains('cookies__btn--reject')
      const checkboxes = cookiesMessage.querySelectorAll('input[name="cookies"]')
      const accepted = [...checkboxes].map(input => [input.value, aceptAll || (input.checked && (!rejectAll || input.disabled))])
      const previous = new Map()
      let storage
      try {
        storage = window.localStorage
        for (const key of ['controlcookie', ...accepted.map(([type]) => `controlcookie${type}`)]) {
          previous.set(key, storage.getItem(key))
        }
        for (const [type, enabled] of accepted) {
          const key = `controlcookie${type}`
          if (enabled) storage[key] = nextCounter(previous.get(key))
          else storage.removeItem(key)
        }
        // Record completion only after all category changes have persisted.
        storage.controlcookie = nextCounter(previous.get('controlcookie'))
      } catch {
        // Storage may reject rollback too; retain the banner and emit no grants.
        for (const [key, value] of previous) {
          try {
            if (value === null) storage.removeItem(key)
            else storage[key] = value
          } catch {}
        }
        cookiesOpen()
        return
      }

      cookiesClose()
      if (rejectAll) {
        checkboxes.forEach(input => {
          if (!input.disabled) input.checked = false
        })
      }
      for (const [type, enabled] of accepted) {
        if (!enabled) continue
        window.dispatchEvent(new CustomEvent(`cookies:${type}`))
        if (type === 'analytics' && typeof googleAnalytics === 'function' && cookiesLegal) {
          googleAnalytics()
        }
      }
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
    try {
      if (window.localStorage.getItem('controlcookie')) cookiesClose()
    } catch {
      // Unavailable storage must leave the consent prompt available.
    }
  }
}
