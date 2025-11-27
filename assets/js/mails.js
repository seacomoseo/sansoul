export function initMails () {
  // Decode form mail
  document.querySelectorAll('.mail > b').forEach(mail => {
    mail.textContent = atob(mail.textContent)
  })

  document.addEventListener('click', e => {
    const mailCopyBtn = e.target.closest(
      '.mail__option-copy,' +
      '.mail__option-send'
    )
    if (mailCopyBtn) {
      const mail = mailCopyBtn
        .closest('.mail')
        .querySelector('.mail > b')
        .textContent
      // If copy button then copy in clipbard; if not then send mail
      if (mailCopyBtn.classList.value.includes('copy')) {
        navigator.clipboard.writeText(mail)
        const msg = 'mail__option-copy--active'
        mailCopyBtn.classList.add(msg)
        setTimeout(() => mailCopyBtn.classList.remove(msg), 1000)
      } else {
        location.href = 'mailto:' + mail
      }
    }
  })
}
