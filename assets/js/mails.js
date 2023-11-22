// Decode form mail
document.querySelectorAll('.ofuscate').forEach(mail => {
  mail.textContent = window.atob(mail.textContent)
})

document.querySelectorAll('.contact__email-option-copy, .contact__email-option-send').forEach(emailCopyButtons => {
  // emailCopyButtons.addEventListener('keydown', e => e.key === 'Enter' && emailCopyButtons.click())
  emailCopyButtons.addEventListener('click', emailCopyButton => {
    const button = emailCopyButton.currentTarget
    const email = emailCopyButton.target
      .closest('.contact__email')
      .querySelector('.ofuscate')
      .textContent
    // If copy button then copy in clipbard; if not then send email
    if (button.classList[0].indexOf('copy') > -1) {
      navigator.clipboard.writeText(email)
      const msg = 'contact__email-option-copy--active'
      button.classList.add(msg)
      setTimeout(() => button.classList.remove(msg), 1000)
    } else {
      window.location.href = 'mailto:' + email
    }
  })
})
