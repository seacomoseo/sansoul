import { closeModal } from './modals'
import { scrollShot } from './scroll-shot'
import { loadScript } from './load-script'

export function initSimpleLightbox () {
  // All ligtbox items
  const lbItems = document.querySelectorAll('[data-lightbox]')
  if (lbItems) {
    function lightbox () {
      // Unique groups of ligtbox items
      let lbGroups = []
      lbItems.forEach(lbItem => {
        const lbGroup = lbItem.closest('.gallery, .container, .boxes, .content, .menu__items')
        lbGroups.push(lbGroup)
      })
      lbGroups = [...new Set(lbGroups)]
      // Each group
      lbGroups.forEach(lbGroup => {
        const lbSection = lbGroup.closest('.menu, .section, .modal')
        const lbGroupSection = lbSection ? '.' + lbSection.classList.value.replace(/^.*?((section|modal)--[\w-]+|menu).*$/, '$1') : ''
        const lbBox = lbGroup.closest('.box')
        const lbGroupBox = lbBox ? '.' + lbBox.classList.value.replace(/^.*?(box(--\d+)?).*$/, '$1').replace(' ', '.') : ''
        // eslint-disable-next-line
        const localImages = new SimpleLightbox(`${lbGroupSection} ${lbGroupBox} [data-lightbox]`, { sourceAttr: 'data-lightbox' })
        // Gallery expand button open first child
        document.addEventListener('click', e => {
          const galleryExpand = e.target.closest('.gallery__expand:not([href],[data-h],[data-b])')
          if (galleryExpand) localImages.open(e.target.closest('.gallery').firstChild)
        })
        // Fix combine lightbox with modal
        localImages.on('show.simplelightbox', e => {
          closeModal(true)
        })
      })
    }

    scrollShot({
      rootMargin: '0%',
      query: ':is(.menu, .section, .modal):has([data-lightbox])',
      doStart: gallery => loadScript('/js/simple-lightbox.min.js')
        .then(lightbox)
        .catch(console.error)
    })
  }
}
