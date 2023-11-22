
// MENU

const menu = document.querySelector('.menu')
if (menu) {
  const menuToggleButton = document.querySelector('.menu__toggle')
  const menuBackover = document.querySelector('.menu__backover')
  const menuLinks = document.querySelectorAll('.menu__link:not(.menu__item--more > .menu__link, .menu__link--translate), .menu__button')
  function menuOpen() {
    menu.removeAttribute('hidden')
    menu.focus()
    document.documentElement.classList.add('menu__active')
  }
  function menuClose() {
    if (window.innerWidth < {{ site.Data.menu.screen_sticky | default 0 }}) {
      document.documentElement.classList.remove('menu__active')
      setTimeout(() => menu.setAttribute('hidden', 'until-found'), 300)
    }
  }
  function menuToggle() {
    const isMenuOpen = document.querySelector('.menu[hidden="until-found"]')
    if (isMenuOpen) {
      menuOpen()
    } else {
      menuClose()
    }
  }
  function menuVisibility() {
    if (window.innerWidth < {{ site.Data.menu.screen_sticky | default 0 }}) {
      menu.setAttribute('hidden', 'until-found')
    } else {
      menu.removeAttribute('hidden')
    }
  }

  // Toggle navigation

  // ... when clicked .menu__toggle
  menuToggleButton.addEventListener('click', menuToggle)

  // ... when clicked .menu__backover
  menuBackover.addEventListener('click', menuClose)

  // ... when clicked any menu link
  if (menuLinks) menuLinks.forEach(e => e.addEventListener('click', menuClose))

  // ... when keyup escape
  document.addEventListener('keyup', e => e.keyCode === 27 && menuClose())

  // ... when hash change
  window.addEventListener('hashchange', menuClose)

  // ... when resize
  window.addEventListener('resize', menuVisibility)

  // ... when load
  menuVisibility()

  // Toggle more
  // const menuMore = document.querySelector('.menu__item--more')
  // menuMore && menuMore.addEventListener('click', () => menuMore.classList.toggle('menu__item--more--active'))

}