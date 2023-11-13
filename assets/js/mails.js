// Decode form mail
document.querySelectorAll('.ofuscate').forEach(mail => {
  mail.textContent = window.atob(mail.textContent)
})

document.querySelectorAll('.contact__email-option-copy, .contact__email-option-send').forEach(emailCopyButtons => {
  emailCopyButtons.addEventListener('click', emailCopyButton => {
    const email = emailCopyButton.target
      .closest('.contact__email')
      .querySelector('.ofuscate')
      .textContent
    // If copy button then copy in clipbard; if not then send email
    if (emailCopyButton.currentTarget.classList[0].indexOf('copy') > -1) {
      navigator.clipboard.writeText(email)
    } else {
      window.location.href = 'mailto:' + email
    }
  })
})
