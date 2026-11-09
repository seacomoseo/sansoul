// Help of /admin/ and /admin/help/: decode the emails, and on the login
// screen show the help only while nobody is signed in to Sveltia.
const decode = value => new TextDecoder().decode(Uint8Array.from(atob(value), char => char.charCodeAt(0)))
for (const node of document.querySelectorAll('[data-mails]')) {
  try {
    node.textContent = decode(node.dataset.mails).split(',').map(mail => mail.trim()).filter(Boolean).join(', ')
  } catch {}
}
for (const link of document.querySelectorAll('a[data-mail]')) {
  try {
    const mail = decode(link.dataset.mail)
    link.href = `mailto:${mail}`
    link.textContent = mail
    link.closest('li').hidden = false
  } catch {}
}

const loginHelp = document.getElementById('sansoul-login-help')
if (loginHelp) {
  // Sveltia keeps the session in localStorage['sveltia-cms.user'] (same key the
  // forms panel reads); polling covers sign-in and sign-out in this tab.
  const update = () => {
    let signedIn = false
    try { signedIn = Boolean(window.localStorage.getItem('sveltia-cms.user')) } catch {}
    loginHelp.hidden = signedIn
  }
  update()
  setInterval(update, 1000)
}
