export function initGa4 () {
  function ga4 (b) {
    let ofuscateLink, category, label, value

    if (b.href) {
      value = b.href
    } else if (b.dataset.b) {
      ofuscateLink = b.dataset.b
    } else if (b.dataset.h) {
      ofuscateLink = b.dataset.h
    } else {
      value = b.parentElement.previousElementSibling.textContent
    }

    if (ofuscateLink) {
      const link = window.atob(ofuscateLink)
      if (b.classList.contains('callnow__phone') || b.classList.contains('contact__phone')) {
        value = link.replace('tel:+', '')
      } else if (b.classList.contains('callnow__whatsapp') || b.classList.contains('contact__whatsapp')) {
        value = link.replace('https://wa.me/', '')
      } else {
        value = link
      }
    }

    if (b.classList.toString().search('callnow') !== -1) {
      category = 'callnow'
    } else {
      category = 'contact'
    }

    if (b.classList.toString().search('phone') !== -1) {
      label = 'phone'
    } else if (b.classList.toString().search('whatsapp') !== -1) {
      label = 'whatsapp'
    } else if (b.classList.contains('contact__email-option-copy')) {
      label = 'email_copy'
    } else if (b.classList.contains('contact__email-option-send')) {
      label = 'email_send'
    } else if (b.classList.contains('contact__address')) {
      label = 'address'
    } else if (b.classList.contains('contact__map')) {
      label = 'map'
    } else if (b.classList.toString().search('custom--ga4') !== -1) {
      label = 'custom'
    }

    // eslint-disable-next-line
    gtag('event', 'contact_click', {
      event_category: category,
      event_label: label,
      value
    })
  }

  document.addEventListener('click', e => {
    const b = e.target.closest(
      '.callnow__phone,' +
      '.callnow__whatsapp,' +
      '.callnow__custom--ga4,' +
      '.contact__phone,' +
      '.contact__whatsapp,' +
      '.contact__email-option-copy,' +
      '.contact__email-option-send,' +
      '.contact__address,' +
      '.contact__map,' +
      '.contact__custom--ga4'
    )
    if (b) ga4(b)
  })
}
