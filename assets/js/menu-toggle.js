const menu = document.querySelector('.menu')
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
    document.body.classList.add('body-menu--sticky--calculate')
    menu.hidden = false
    //
    size = menu.querySelector('.menu__items').scrollWidth + 18 * 2 // 18px padding left and right
    // const breackPoints = [768, 1024, 1280]
    // size = breackPoints.find(bp => bp > size) ?? size
    //
    document.body.classList.remove('body-menu--sticky--calculate')
    menu.hidden = 'until-found'
  }
  return size
}
function menuOpen () {
  menu.hidden = false
  menu.focus()
  document.documentElement.classList.add('menu__active')
}
function menuClose () {
  if (menuNoStickyVisibility()) {
    document.documentElement.classList.remove('menu__active')
    setTimeout(() => { menu.hidden = 'until-found' }, 300)
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
    menu.hidden = 'until-found'
    document.body.classList.remove('body-menu--sticky--active')
  } else {
    menu.hidden = false
    document.body.classList.add('body-menu--sticky--active')
  }
}

function initMenuToggleWhenCSS () {
  if (menu) {
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
}

export function initMenuToggle () {
  document.addEventListener('DOMContentLoaded', () => {
    // 1️⃣ DOM is ready
    if (!document.documentElement.classList.contains('preload')) {
      // CSS was already applied from cache
      initMenuToggleWhenCSS()
      return
    }

    // 2️⃣ Wait for the async stylesheet
    const cssLink = document.querySelector('link[as="style"][rel="preload"]')
    if (cssLink) {
      cssLink.addEventListener('load', initMenuToggleWhenCSS, { once: true })
    } else {
      // Fallback: observe the class change
      const obs = new MutationObserver(() => {
        if (!document.documentElement.classList.contains('preload')) {
          obs.disconnect()
          initMenuToggleWhenCSS()
        }
      })
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    }
  })
}
