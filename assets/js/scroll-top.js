// Required by .menu--sticky, .button-up and .button-google-translate
// Require scroll-shot.js

// Get background color of header and menu transparent
const sectionHeader  = document.querySelector('.section--header') || document.body
const menuSticky     = document.querySelector('.body-menu--transparent .menu--sticky')
const logoSticky     = document.querySelector('.body-menu--transparent .logo')
let menuStickyBgBefore, menuStickyBgAfter, elementToChange
if (sectionHeader && menuSticky) {
  menuStickyBgBefore = sectionHeader.classList.value
    .replace(/\sbg-(color|gradient|opacity|image)[\w-]*/g, '')
    .replace(/.*?(bg-[\w-]*).*/g, '$1')
  menuStickyBgAfter  = menuSticky.classList.value
    .replace(/.*?(bg-[\w-]*).*/g, '$1')
}

// Toogle menu background color
function menuChangeColor (beforeToAfter) {
  if (menuSticky) {
    if (menuStickyBgAfter != menuStickyBgBefore) {
      if (window.innerWidth >= {{ site.Data.menu.screen_sticky | default 0 }}) {
        elementToChange = menuSticky
      } else if (logoSticky) {
        elementToChange = logoSticky
      }
      if (elementToChange) {
        if (beforeToAfter) {
          elementToChange.classList.replace(menuStickyBgAfter, menuStickyBgBefore)
        } else {
          elementToChange.classList.replace(menuStickyBgBefore, menuStickyBgAfter)
        }
      }
    }
  }
}
// Toogle body top and menu background color (to header)
function toogleBodyTop (option) {
  if (option === 'add') {
    document.body.classList.add('body-top')
    menuChangeColor(true)
    // Remove hash
    history.replaceState('', '', location.pathname + location.search)
  } else {
    document.body.classList.remove('body-top')
    menuChangeColor(false)
  }
}

scrollShot(
  '20% 0% -120%',
  'body',
  toogleBodyTop,
  toogleBodyTop,
  () => toogleBodyTop('add')
)
