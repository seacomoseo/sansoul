export function initMenuToggle () {
  window.addEventListener('load', () => {
    const menu = document.querySelector('.menu')

    if (menu) {
      const menuSticky = document.querySelector('.body-menu--sticky')
      const breackPoint = screenSticky()
      const menuNoStickyVisibility = () => !menuSticky || window.innerWidth < breackPoint

      function screenSticky () {
        let size = 0
        if (document.querySelector('.body-menu--sticky--xs')) size = 375
        else if (document.querySelector('.body-menu--sticky--sm')) size = 425
        else if (document.querySelector('.body-menu--sticky--md')) size = 768
        else if (document.querySelector('.body-menu--sticky--lg')) size = 1024
        else if (document.querySelector('.body-menu--sticky--xl')) size = 1280
        else if (document.querySelector('.body-menu--sticky--auto')) {
          menu.removeAttribute('hidden')
          document.body.classList.add('body-menu--sticky--calculate')
          //
          const menuItems = [...document.querySelector('.menu__items').children]
          menuItems.forEach(e => { size += e.offsetWidth })
          const superiorNumbers = [768, 1024, 1280].filter(num => num > size)
          size = Math.min(...superiorNumbers)
          //
          menu.setAttribute('hidden', 'until-found')
          document.body.classList.remove('body-menu--sticky--calculate')
        }
        return size
      }
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
