// Lightbox
// Require scroll-shot.js + load-script.js

function lightbox () {
  const lbItems = document.querySelectorAll('[data-lightbox]')
  if (lbItems) {
    let lbGroups = []
    lbItems.forEach(lbItem => {
      const lbGroup = lbItem.closest('.row, .container > .description, section.content')
      lbGroups.push(lbGroup)
      lbItem.addEventListener('keydown', e => e.key === 'Enter' && lbItem.click())
    })
    lbGroups = [...new Set(lbGroups)]
    lbGroups.forEach(lbGroup => {
      const lbSection = lbGroup.closest('.section, .modal')
      const lbGroupSection = lbSection ? '.' + lbSection.classList.value.replace(/^.*?(section--[\w-]+).*$/, '$1') : ''
      const lbGroupElement = '.' + lbGroup.classList.value.replace(/^.*?(row--\d+).*$/, '$1').replace(' ', '.')
      let localImages = new SimpleLightbox(lbGroupSection + ' ' + lbGroupElement + ' [data-lightbox]', { sourceAttr: 'data-lightbox' })
      // Gallery expand button open first child
      document.querySelectorAll('.gallery__expand:not([href],[data-h],[data-b])').forEach(g => {
        g.addEventListener('click', e => {
          localImages.open(e.target.closest('.gallery').firstChild)
        })
      })
      // Fix combine lightbox with modal
      localImages.on('show.simplelightbox', e => {
        closeModal(true)
      })
    })
  }
}

scrollShot({
  rootMargin: '0%',
  query: '[data-lightbox]',
  doStart: gallery => loadScript('/js/simple-lightbox.min.js', lightbox)
})
