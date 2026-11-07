import { sendGa4Events } from './ga4-event'

let initialized = false

export function initGa4 () {
  if (initialized) return
  initialized = true
  function ga4 (b) {
    const id = b.closest('[id]')?.id || ''
    let type, label

    if (b.href) {
      label = b.href
    } else if (b.dataset.b) {
      try { label = atob(b.dataset.b) } catch { return }
    } else if (b.dataset.h) {
      try { label = atob(b.dataset.h) } catch { return }
    } else { // email
      label = b.parentElement?.previousElementSibling?.textContent || ''
    }

    if (label.match(/tel:\+/)) {
      label = label.replace(/tel:\+/, '')
      type = 'phone'
    } else if (label.match(/^https:\/\/(wa.me\/|api.whatsapp.com\/send\/\?phone=)/)) {
      label = label.replace(/^https:\/\/(wa.me\/|api.whatsapp.com\/send\/\?phone=)/, '')
      type = 'whatsapp'
    } else if (label.match(/^mailto:/)) {
      label = label.replace(/^mailto:/, '')
      type = 'email_send'
    } else {
      if (b.classList.contains('mail__opt-send')) {
        type = 'email_send'
      } else if (b.classList.contains('mail__opt-copy')) {
        type = 'email_copy'
      } else if (b.classList.contains('link__address') || label.match(/https:\/\/(www.)?(maps.app.goo.gl|google.\w+?\/maps|g.page|maps.apple.com|bing.com\/maps|openstreetmap.org)\//)) {
        type = 'address'
      } else if (b.classList.value.includes('ga4')) {
        type = 'custom'
      }
    }

    const automatic = type && type !== 'custom'
    sendGa4Events(automatic, b.dataset.ga4 || (b.classList.contains('ga4') ? 'contact' : ''), { id, type: type || 'custom', label })
  }

  document.addEventListener('click', e => {
    if (typeof gtag === 'function') {
      const b = e.target.closest(
        '.callnow__phone,' +
        '.callnow__whatsapp,' +
        '.link__phone,' +
        '.link__whatsapp,' +
        '.link__address,' +
        '.mail__opt-copy,' +
        '.mail__opt-send,' +
        '.ga4,[data-ga4]'
      )
      if (b) ga4(b)
    }
  })
}
