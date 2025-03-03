import { scrollShot } from './scroll-shot'

export function initMenuScrollSpy () {
  const isShowSections = document.querySelector('.body-menu--sections')
  if (isShowSections) {
    const menuItemActive = document.querySelector('.menu__item--active')
    scrollShot({
      rootMargin: '-50% 0% -50%',
      query: '.section[id]:not(footer),#header',
      doStart: e => {
        // When load if hash is section
        const hashIsNotModal = document.querySelector((location.hash || 'none') + ':not(.modal)')
        const bodyTop = document.querySelector('body.body-top')
        if ((hashIsNotModal || !location.hash) && !bodyTop) {
          if (!menuItemActive) {
            // Remove menu item active
            const menuItemsActive = document.querySelectorAll('.menu__item--active')
            if (menuItemsActive) {
              menuItemsActive.forEach(item => item.classList.remove('menu__item--active'))
            }
            // Add menu item active
            const menuLinkId = document.querySelector(`.menu__item > [href="#${e.id}"], .menu__item > [href="/#${e.id}"]`)
            if (menuLinkId) {
              menuLinkId.parentNode.classList.add('menu__item--active')
            }
          }
          // Upgrade hash without cut the flow of the smooth scroll wen there is a section in the middle
          // const hash = e.tagName === 'HEADER' ? location.pathname + location.search : '#' + e.id
          // history.replaceState('', '', hash)
        }
      },
      doEnd: () => null // For not unobserve
    })
  }
}
