// SCROLL TO TOP
document.querySelectorAll('.scroll-to-top').forEach(e => {
  e.addEventListener('click', () => {
    const toc = document.getElementById('toc')
    let tocPosition = toc ? toc.scrollHeight - (3 * 16) : 0
    if (!(scrollY > tocPosition)) tocPosition = 0
    scrollTo({ top: tocPosition, behavior: 'smooth' })
    // Remove hash
    if (location.hash && !isSectionedPage) {
      history.replaceState('', '', location.pathname + location.search)
    }
  })
})
