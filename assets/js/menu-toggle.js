
// MENU

const menu = document.querySelector('.menu')
if (menu) {
  const menuToggleButton = document.querySelector('.menu__toggle')
  const menuBackover = document.querySelector('.menu__backover')
  const menuLinks = document.querySelectorAll('.menu__link:not(.menu__item--more > .menu__link, .menu__link--translate), .menu__button')
  const menuSticky = document.querySelector('.menu--sticky')
  const menuBreackPoint = {{ site.Data.menu.screen_sticky | default 0 }}
  const menuNoStickyVisibility = () => !menuSticky || window.innerWidth < menuBreackPoint
  function menuOpen() {
    menu.removeAttribute('hidden')
    menu.focus()
    document.documentElement.classList.add('menu__active')
  }
  function menuClose() {
    if (menuNoStickyVisibility()) {
      document.documentElement.classList.remove('menu__active')
      setTimeout(() => menu.setAttribute('hidden', 'until-found'), 300)
    }
  }
  function menuToggle() {
    const isMenuClose = document.querySelector('.menu[hidden="until-found"]')
    if (isMenuClose) {
      menuOpen()
    } else {
      menuClose()
    }
  }
  function menuVisibility() {
    if (menuNoStickyVisibility()) {
      menu.setAttribute('hidden', 'until-found')
    } else {
      menu.removeAttribute('hidden')
    }
  }

  menuToggleButton.addEventListener('click', menuToggle)
  menuBackover.addEventListener('click', menuClose)
  menuLinks && menuLinks.forEach(e => e.addEventListener('click', menuClose))
  document.addEventListener('keyup', e => e.keyCode === 27 && menuClose())
  window.addEventListener('hashchange', menuClose)
  window.addEventListener('resize', menuVisibility)
  menuVisibility()

  // Toggle more
  // const menuMore = document.querySelector('.menu__item--more')
  // menuMore && menuMore.addEventListener('click', () => menuMore.classList.toggle('menu__item--more--active'))

}