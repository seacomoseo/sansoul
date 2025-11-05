export function initMails () {
  // Decode form mail
  document.querySelectorAll('.mail > b').forEach(mail => {
    mail.textContent = atob(mail.textContent)
  })

  document.addEventListener('click', e => {
    const emailCopyButton = e.target.closest(
      '.mail__option-copy,' +
      '.mail__option-send'
    )
    if (emailCopyButton) {
      const email = emailCopyButton
        .closest('.mail')
        .querySelector('.mail > b')
        .textContent
      // If copy button then copy in clipbard; if not then send email
      if (emailCopyButton.classList.value.includes('copy')) {
        navigator.clipboard.writeText(email)
        const msg = 'mail__option-copy--active'
        emailCopyButton.classList.add(msg)
        setTimeout(() => emailCopyButton.classList.remove(msg), 1000)
      } else {
        location.href = 'mailto:' + email
      }
    }
  })
}
