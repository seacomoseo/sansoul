export function initGa4 () {
  const contactCallnowPhone = document.querySelectorAll('.callnow__phone')
  const contactCallnowWhatsapp = document.querySelectorAll('.callnow__whatsapp')
  const contactCallnowCustom = document.querySelectorAll('.callnow__custom--ga4')
  const contactPhones = document.querySelectorAll('.contact__phone')
  const contactWhatsapp = document.querySelectorAll('.contact__whatsapp')
  const contactEmailCopy = document.querySelectorAll('.contact__email-option-copy')
  const contactEmailSend = document.querySelectorAll('.contact__email-option-send')
  const contactAddress = document.querySelectorAll('.contact__address')
  const contactMap = document.querySelectorAll('.contact__map')
  const contactCustom = document.querySelectorAll('.contact__custom--ga4')
  const contactButtons = [
    ...contactCallnowPhone,
    ...contactCallnowWhatsapp,
    ...contactCallnowCustom,
    ...contactPhones,
    ...contactWhatsapp,
    ...contactEmailCopy,
    ...contactEmailSend,
    ...contactAddress,
    ...contactMap,
    ...contactCustom
  ]

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
  }

  contactButtons.forEach(e => e.addEventListener('click', button => ga4(button)))
}
