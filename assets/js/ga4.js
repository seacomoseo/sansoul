export function initGa4 () {
  function ga4 (b) {
    const id = b.closest('[id]').id
    let type, label

<<<<<<< HEAD
  function ga4 (e) {
    const button = e.currentTarget
    let ofuscateLink, category, label = ''

    if (button.href) {
      label = button.href
    } else if (button.dataset.b) {
      ofuscateLink = button.dataset.b
    } else if (button.dataset.h) {
      ofuscateLink = button.dataset.h
    } else {
      label = button.parentElement.previousElementSibling.textContent
    }

    if (ofuscateLink) {
      const link = window.atob(ofuscateLink)
      if (button.classList.contains('callnow__phone') || button.classList.contains('contact__phone')) {
        label = link.replace('tel:+', '')
      } else if (button.classList.contains('callnow__whatsapp') || button.classList.contains('contact__whatsapp')) {
        label = link.replace('https://wa.me/', '')
      } else {
        label = link
      }
    }

    if (button.classList.toString().search('callnow') !== -1) {
      category = 'callnow'
    } else {
      category = 'contact'
    }

    if (button.classList.toString().search('phone') !== -1) {
      label = `phone: ${label}`
    } else if (button.classList.toString().search('whatsapp') !== -1) {
      label = `whatsapp: ${label}`
    } else if (button.classList.contains('contact__email-option-copy')) {
      label = `email_copy: ${label}`
    } else if (button.classList.contains('contact__email-option-send')) {
      label = `email_send: ${label}`
    } else if (button.classList.contains('contact__address')) {
      label = `address: ${label}`
    } else if (button.classList.contains('contact__map')) {
      label = `map: ${label}`
    } else if (button.classList.toString().search('custom--ga4') !== -1) {
      label = `custom: ${label}`
    }

    // eslint-disable-next-line
    gtag('event', 'contact_click', {
      event_category: category,
      event_label: label,
      value: 1
    })
=======
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
      if (b.classList.contains('contact__email-option-send')) {
        type = 'email_send'
      } else if (b.classList.contains('contact__email-option-copy')) {
        type = 'email_copy'
      } else if (b.classList.contains('contact__address') || label.match(/https:\/\/(www.)?(maps.app.goo.gl|google.\w+?\/maps|g.page|maps.apple.com|bing.com\/maps|openstreetmap.org)\//)) {
        type = 'address'
      } else if (b.classList.value.includes('ga4')) {
        type = 'custom'
      }
    }

    gtag('event', 'contact', { id, type, label })
>>>>>>> 3c1c646474044268b088da6ce391479f7976107c
  }

  document.addEventListener('click', e => {
    const b = e.target.closest(
      '.callnow__phone,' +
      '.callnow__whatsapp,' +
      '.contact__phone,' +
      '.contact__whatsapp,' +
      '.contact__email-option-copy,' +
      '.contact__email-option-send,' +
      '.contact__address,' +
      '.ga4'
    )
    if (b) ga4(b)
  })
}
