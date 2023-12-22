// SCROLL TO TOP
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.scroll-to-top').forEach(e => {
    e.addEventListener('click', () => {
      let target = document.body
      const toc = document.getElementById('toc')
      if (toc) {
        if (scrollY > toc.scrollHeight) {
          target = toc
        }
      }
      scrollTo(target)
      // Remove hash
      if (location.hash && !isSectionedPage) {
        history.replaceState('', '', location.pathname + location.search)
      }
    })
  })
})
