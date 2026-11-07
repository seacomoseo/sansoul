import { cookiesLegal } from '@params/config'
import { hasConsent } from './consent'
import params from './params'

const components = new WeakMap()
const states = new Set()
let listening = false

// Gate external components without granting consent from their retry controls.
// start(element, isCurrent, onCleanup) returns/registers teardown; SDK work must check
// isCurrent before creating instances or requesting the next optional resource.
export function initMediaConsent ({ query, rootMargin = '0%', requiresConsent = true, start, fallback = () => {} }) {
  const elements = document.querySelectorAll(query)
  if (!elements.length) return
  if (!listening) {
    listening = true
    const refreshConsent = () => states.forEach(state => state.refreshConsent?.())
    window.addEventListener('cookies:changed', refreshConsent)
    window.addEventListener('cookies:media', refreshConsent)
    new MutationObserver(() => {
      states.forEach(state => {
        if (!state.element.isConnected) state.disconnect()
      })
    }).observe(document.body, { childList: true, subtree: true })
  }
  elements.forEach(element => {
    if (components.has(element)) return
    const notice = document.createElement('p')
    notice.className = requiresConsent ? 'media-consent' : 'media-retry'
    const button = document.createElement('button')
    button.type = 'button'
    notice.appendChild(button)
    if (requiresConsent) element.before(notice)
    let visible = false
    let generation = 0
    let cleanup
    let running = false
    let pending = false
    let failed = false
    let disposed = false
    const allowed = () => !requiresConsent || hasConsent('media', cookiesLegal)
    const show = status => {
      if (!requiresConsent) {
        if (status === 'error' && !disposed) element.before(notice)
        if (status === 'active') notice.remove()
      }
      notice.hidden = status === 'active'
      button.disabled = status === 'loading'
      button.textContent = status === 'denied' ? params.mediaConsent : status === 'loading' ? params.mediaLoading : status === 'error' ? params.mediaRetry : params.mediaLoad
      fallback(element, status !== 'active')
    }
    const stop = () => {
      generation++
      pending = false
      running = false
      cleanup?.()
      cleanup = undefined
      show(allowed() ? 'error' : 'denied')
    }
    const refresh = () => {
      if (disposed) return
      if (!element.isConnected || !allowed()) {
        stop()
        return
      }
      if (!visible || running || pending) return
      failed = false
      pending = true
      const current = ++generation
      const isCurrent = () => !disposed && generation === current && element.isConnected && allowed()
      show('loading')
      Promise.resolve().then(() => isCurrent() ? start(element, isCurrent, dispose => {
        if (isCurrent()) cleanup = dispose
        else dispose()
      }) : undefined).then(dispose => {
        if (!isCurrent()) {
          dispose?.()
          return
        }
        cleanup = dispose || cleanup
        pending = false
        running = true
        show('active')
      }).catch(error => {
        if (!isCurrent()) return
        cleanup?.()
        cleanup = undefined
        pending = false
        failed = true
        show('error')
        console.error('Unable to load media component', error)
      })
    }
    const state = {
      element,
      refreshConsent: requiresConsent ? refresh : undefined,
      disconnect: () => {
        disposed = true
        stop()
        observer.disconnect()
        states.delete(state)
        components.delete(element)
        notice.remove()
      }
    }
    states.add(state)
    components.set(element, state)
    button.addEventListener('click', () => {
      if (disposed) return
      if (!allowed()) document.querySelector('.cookies__toggle')?.click()
      else {
        visible = true
        refresh()
      }
    })
    const observer = new IntersectionObserver(entries => {
      if (disposed) return
      entries.forEach(entry => {
        visible = entry.isIntersecting
        if (visible && !failed) refresh()
      })
    }, { rootMargin })
    observer.observe(element)
    show(allowed() ? 'idle' : 'denied')
  })
}
