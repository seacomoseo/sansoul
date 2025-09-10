import { debounce } from './debounce'
import { waitCSS } from './wait-css'

const menu = document.querySelector('.menu')
const menuSticky = document.querySelector('.body-menu--sticky')
const menuNoStickyVisibility = () => !menuSticky || screenSticky()

function screenSticky () {
  // Sticky auto
  if (document.querySelector('.body-menu--sticky--auto')) {
    document.body.classList.add('body-menu--sticky--calculate')
    menu.removeAttribute('hidden')

    // Calculate width based on content
    const menuItems = menu.querySelector('.menu__items')
    const active = menuItems.scrollWidth > menuItems.clientWidth

    document.body.classList.remove('body-menu--sticky--calculate')
    // menu.setAttribute('hidden', 'until-found') // Remove for fix menu close animation
    return active
  }

  // Sticky breackpoint
  const breackpoints = {
    xs: 375,
    sm: 425,
    md: 768,
    lg: 1024,
    xl: 1280
  }
  for (const [size, width] of Object.entries(breackpoints)) {
    if (document.querySelector(`.body-menu--sticky--${size}`)) {
      return document.documentElement.clientWidth < width
    }
  }

  return 0
}

function menuOpen () {
  menu.removeAttribute('hidden')
  menu.focus()
  document.documentElement.classList.add('menu__active')
}

function menuClose () {
  const menuSticky = document.querySelector('.body-menu--sticky--active')
  if (!menuSticky) {
    document.documentElement.classList.remove('menu__active')
    setTimeout(() => { menu.setAttribute('hidden', 'until-found') }, 300)
  }
}

function menuToggle () {
  const isMenuClose = menu.getAttribute('hidden') === 'until-found'
  isMenuClose ? menuOpen() : menuClose()
}

function menuSetVisibility () {
  document.documentElement.classList.remove('menu__active') // Close without hidden
  if (menuNoStickyVisibility()) {
    menu.setAttribute('hidden', 'until-found')
    document.body.classList.remove('body-menu--sticky--active')
  } else {
    menu.removeAttribute('hidden')
    document.body.classList.add('body-menu--sticky--active')
  }
}

export function initMenuToggle () {
  if (!menu) return
  document.addEventListener('click', e => {
    const menuToggleButton = e.target.closest('.menu__toggle')
    if (menuToggleButton) {
      menuToggle()
    } else {
      const menuBackoverAndLinks = e.target.closest('.menu__backover,.menu__link, .menu__button')
      if (menuBackoverAndLinks) menuClose()
    }
  })
  waitCSS(async () => {
    // Listeners
    document.addEventListener('keyup', e => e.key === 'Escape' && menuClose())
    window.addEventListener('hashchange', menuClose)
    window.addEventListener('resize', debounce(menuSetVisibility))

    // Run when load
    if (document.documentElement.clientWidth >= 375) menuSetVisibility()
  })
}
