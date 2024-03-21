import { screenSticky } from './screen-sticky'

export function initMenuToggle () {
  document.addEventListener('DOMContentLoaded', () => {
    const menu = document.querySelector('.menu')

    if (menu) {
      const menuSticky = document.querySelector('.body-menu--sticky')
      const menuBreackPoint = screenSticky()
      const menuNoStickyVisibility = () => !menuSticky || window.innerWidth < menuBreackPoint
      function menuOpen () {
        menu.removeAttribute('hidden')
        menu.focus()
        document.documentElement.classList.add('menu__active')
      }
      function menuClose () {
        if (menuNoStickyVisibility()) {
          document.documentElement.classList.remove('menu__active')
          setTimeout(() => menu.setAttribute('hidden', 'until-found'), 300)
        }
      }
      function menuToggle () {
        const isMenuClose = document.querySelector('.menu[hidden="until-found"]')
        if (isMenuClose) {
          menuOpen()
        } else {
          menuClose()
        }
      }
      function menuVisibility () {
        if (menuNoStickyVisibility()) {
          menu.setAttribute('hidden', 'until-found')
          document.body.classList.remove('body-menu--sticky--active')
        } else {
          menu.removeAttribute('hidden')
          document.body.classList.add('body-menu--sticky--active')
        }
      }

      // Listeners
      document.addEventListener('click', e => {
        const menuToggleButton = e.target.closest('.menu__toggle')
        if (menuToggleButton) menuToggle()
        const menuBackover = e.target.closest('.menu__backover')
        if (menuBackover) menuClose()
        const menuLink = e.target.closest('.menu__link, .menu__button')
        if (menuLink) menuClose()
      })
      document.addEventListener('keyup', e => e.keyCode === 27 && menuClose())
      window.addEventListener('hashchange', menuClose)
      window.addEventListener('resize', menuVisibility)

      // Run when load
      menuVisibility()
    }
  })
}
