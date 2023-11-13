
// MENU

const menuToggleButton = document.querySelector('.menu__toggle')
const menuBackover = document.querySelector('.menu__backover')
const menuLinks = document.querySelectorAll('.menu__link:not(.menu__item--more > .menu__link, .menu__link--translate), .menu__button')
const menuToggle = () => document.documentElement.classList.toggle('menu__active')
const menuClose = () => document.documentElement.classList.remove('menu__active')

// Toggle navigation

// ... when clicked .menu__toggle
menuToggleButton && menuToggleButton.addEventListener('click', menuToggle)

// ... when clicked .menu__backover
menuBackover && menuBackover.addEventListener('click', menuClose)

// ... when clicked any menu link
menuLinks && menuLinks.forEach(e => e.addEventListener('click', menuClose))

// ... when keyup escape
document.addEventListener('keyup', e => e.keyCode === 27 && menuClose())

// ... when hash change
window.addEventListener('hashchange', () => {
  menuClose()
})

// Toggle more
// const menuMore = document.querySelector('.menu__item--more')
// menuMore && menuMore.addEventListener('click', () => menuMore.classList.toggle('menu__item--more--active'))
