import { scrollShot } from './scroll-shot'

export const initMenuScrollSpy = () => {
  const sections = '.section[id]:not(footer),#header'
  const sectionsElements = document.querySelectorAll(sections)

  // Check if there are sections AND anchor links in the menu that point to these sections.
  const hasAnchorLinks =
    Array.from(sectionsElements).some(section => {
      return document.querySelector(`.menu__item > [href$="#${section.id}"]`)
    })

  if (!sectionsElements.length || !hasAnchorLinks) return

  const cleanupScrollShot = scrollShot({
    rootMargin: '-50% 0% -50%',
    query: sections,
    doStart: element => {
      // Check if the hash is not a modal
      const hashIsNotModal = document.querySelector((location.hash || 'none') + ':not(.modal)')
      const bodyTop = document.querySelector('body.body-top')

      if ((hashIsNotModal || !location.hash) && !bodyTop) {
        // Remove previous active classes
        const menuItemsActive = document.querySelectorAll('.menu__item--active')
        menuItemsActive?.forEach(item => item.classList.remove('menu__item--active'))

        // Handle the #header section in a special way
        if (element.id === 'header') {
          // Find the menu link that points to the current page without anchors
          const currentPathLink = document.querySelector(`.menu__item > [href="${location.pathname}"]`)

          if (currentPathLink) currentPathLink.parentNode.classList.add('menu__item--active')
        } else {
          // For other sections, find corresponding anchor link
          const menuLinkId = document.querySelector(`.menu__item > [href$="#${element.id}"]`)

          if (menuLinkId) menuLinkId.parentNode.classList.add('menu__item--active')
        }

        // Commented out as in original code
        // const hash = element.tagName === 'HEADER' ? location.pathname + location.search : '#' + element.id
        // history.replaceState('', '', hash)
      }
    },
    end: null // For unobserve
  })

  // Return cleanup function
  return cleanupScrollShot
}
