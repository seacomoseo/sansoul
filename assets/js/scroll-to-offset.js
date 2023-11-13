function scrollToOffset(element, offset) {
  if (!offset) {
    const menuSticky = document.querySelector('.menu--sticky')
    if (menuSticky) offset = menuSticky.offsetHeight
  }
  if (window.innerWidth < {{ site.Data.menu.screen_sticky | default 0 }} || !offset) offset = 0
  const y = element.getBoundingClientRect().top + window.pageYOffset - offset - 36;
  window.scrollTo({top: y, behavior: 'smooth'})
}