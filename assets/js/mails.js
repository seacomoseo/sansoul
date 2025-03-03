export function initMails () {
  // Decode form mail
  document.querySelectorAll('.mail').forEach(mail => {
    mail.textContent = window.atob(mail.textContent)
  })

  document.addEventListener('click', e => {
    const emailCopyButton = e.target.closest(
      '.contact__email-option-copy,' +
      '.contact__email-option-send'
    )
    if (emailCopyButton) {
      const email = emailCopyButton
        .closest('.contact__email')
        .querySelector('.mail')
        .textContent
      // If copy button then copy in clipbard; if not then send email
      if (emailCopyButton.classList.value.includes('copy')) {
        navigator.clipboard.writeText(email)
        const msg = 'contact__email-option-copy--active'
        emailCopyButton.classList.add(msg)
        setTimeout(() => emailCopyButton.classList.remove(msg), 1000)
      } else {
        window.location.href = 'mailto:' + email
      }
    }
  })
}
