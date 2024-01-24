import { scrollShot } from './scroll-shot'

export function initMenuScrollSpy () {
  const isSectionedPage = document.querySelector('body.type-page')
  const menuItemActive = document.querySelector('.menu__item--active')
  if (isSectionedPage) {
    scrollShot({
      rootMargin: '-50% 0% -50%',
      query: '.section[id]:not(footer),#header',
      doStart: e => {
        // When load if hash is section
        const hashIsNotModal = document.querySelector((window.location.hash || 'none') + ':not(.modal)')
        const bodyTop = document.querySelector('body.body-top')
        if ((hashIsNotModal || !window.location.hash) && !bodyTop) {
          if (!menuItemActive) {
            // Remove menu item active
            const menuItemsActive = document.querySelectorAll('.menu__item--active')
            if (menuItemsActive) {
              menuItemsActive.forEach(item => item.classList.remove('menu__item--active'))
            }
            // Add menu item active
            const menuLinkId = document.querySelector('.menu__item > [href="#' + e.id + '"], .menu__item > [href="/#' + e.id + '"]')
            if (menuLinkId) {
              menuLinkId.parentNode.classList.add('menu__item--active')
            }
          }
          // Upgrade hash without cut the flow of the smooth scroll wen there is a section in the middle
          const hash = e.tagName === 'HEADER' ? window.location.pathname + window.location.search : '#' + e.id
          window.history.replaceState('', '', hash)
        }
      },
      doEnd: () => null // For not unobserve
    })
  }
}
