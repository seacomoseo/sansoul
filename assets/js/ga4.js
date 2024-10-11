export function initGa4 () {
  function ga4 (b) {
    let category, label, ofuscateLink, value, type

    if (b.classList.toString().search('phone') !== -1) {
      category = 'phone'
    } else if (b.classList.toString().search('whatsapp') !== -1) {
      category = 'whatsapp'
    } else if (b.classList.contains('contact__email-option-copy')) {
      category = 'email_copy'
    } else if (b.classList.contains('contact__email-option-send')) {
      category = 'email_send'
    } else if (b.classList.contains('contact__address')) {
      category = 'address'
    } else if (b.classList.toString().search('custom--ga4') !== -1) {
      category = 'custom'
    }

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
      type = 'callnow'
    } else {
      type = 'contact'
    }

    // eslint-disable-next-line
    gtag('event', 'contact_click', {
      event_category: category,
      event_label: `${type}${value ? `: ${value}` : ''}`
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
      '.contact__custom--ga4'
    )
    if (b) ga4(b)
  })
}
