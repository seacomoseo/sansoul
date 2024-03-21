export function screenSticky () {
  let size = 0

  if (document.querySelector('.body-menu--sticky--xs')) size = 375
  else if (document.querySelector('.body-menu--sticky--sm')) size = 425
  else if (document.querySelector('.body-menu--sticky--md')) size = 768
  else if (document.querySelector('.body-menu--sticky--lg')) size = 1024
  else if (document.querySelector('.body-menu--sticky--xl')) size = 1280

  return size
}
