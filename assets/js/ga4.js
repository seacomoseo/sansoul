export function initGa4 () {
  function ga4 (b) {
    const id = b.closest('[id]').id
    let type, label

    if (b.href) {
      label = b.href
    } else if (b.dataset.b) {
      label = atob(b.dataset.b)
    } else if (b.dataset.h) {
      label = atob(b.dataset.h)
    } else { // email
      label = b.parentElement.previousElementSibling.textContent
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
      if (b.classList.contains('mail__option-send')) {
        type = 'email_send'
      } else if (b.classList.contains('mail__option-copy')) {
        type = 'email_copy'
      } else if (b.classList.contains('contact__address') || label.match(/https:\/\/(www.)?(maps.app.goo.gl|google.\w+?\/maps|g.page|maps.apple.com|bing.com\/maps|openstreetmap.org)\//)) {
        type = 'address'
      } else if (b.classList.value.includes('ga4')) {
        type = 'custom'
      }
    }

    gtag('event', 'contact', { id, type, label })
  }

  document.addEventListener('click', e => {
    const b = e.target.closest(
      '.callnow__phone,' +
      '.callnow__whatsapp,' +
      '.contact__phone,' +
      '.contact__whatsapp,' +
      '.contact__address,' +
      '.mail__option-copy,' +
      '.mail__option-send,' +
      '.ga4'
    )
    if (b) ga4(b)
  })
}
