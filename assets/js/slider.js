// SLIDERS
const sliders = document.querySelectorAll('.slider')

sliders && sliders.forEach(slider => {
  const track = slider.querySelector('.slider__track')
  const items = slider.querySelector('.slider__items')
  const children = [...items.children]
  const bullets = slider.querySelectorAll('.slider__bullet')
  const arrowLeft = slider.querySelector('.slider__arrow--left')
  const arrowRight = slider.querySelector('.slider__arrow--right')

  function indexOfItem (item) {
    return Array.prototype.indexOf.call(item.parentElement.children, item)
  }

  function activeClass (item, remove = false) {
    const index = indexOfItem(item)
    const bullet = bullets[index]
    if (!remove) {
      item.classList.add('slider__item--active')
      bullet.classList.add('slider__bullet--active')
    } else {
      item.classList.remove('slider__item--active')
      bullet.classList.remove('slider__bullet--active')
    }
  }

  // SCROLL-SHOT
  window.addEventListener('load', () => {
    const callbackScroll = (entries, observer) =>
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          activeClass(entry.target)
        } else {
          activeClass(entry.target, true)
        }
      })
    const observerScroll = new IntersectionObserver(callbackScroll, {
      root: slider,
      rootMargin: '0% -216px'
    })
    children.forEach(e => {
      observerScroll.observe(e)
    })
  })

  function scrollToItem (item) {
    const itemLeft = item.offsetLeft
    const itemWidth = item.offsetWidth
    const sliderWidth = slider.offsetWidth // - parseFloat(getComputedStyle(document.body)['font-size'].replace('px', ''))
    const scrollLeft = itemLeft - (sliderWidth - itemWidth) / 2
    track.scrollTo({ top: 0, left: scrollLeft, behavior: 'smooth' })
  }

  function scrollToNear (item, side) {
    const trackLeft = track.scrollLeft
    const firstWidth = item.offsetWidth
    let scrollLeft
    if (side === 'left') {
      scrollLeft = trackLeft - firstWidth
    } else {
      scrollLeft = trackLeft + firstWidth
    }
    track.scrollTo({ top: 0, left: scrollLeft, behavior: 'smooth' })
  }

  function sideScroll (side) {
    const activeItems = slider.querySelectorAll('.slider__item--active')
    const lastIndex = children.length - 1
    let keyItem, keyIndex
    if (side === 'left') {
      keyItem = activeItems[0]
      keyIndex = indexOfItem(keyItem)
      if (keyIndex === 0) {
        scrollToItem(children[lastIndex])
      } else {
        scrollToNear(keyItem, 'left')
      }
    } else {
      keyItem = activeItems[activeItems.length - 1]
      keyIndex = indexOfItem(keyItem)
      if (keyIndex === lastIndex) {
        scrollToItem(children[0])
      } else {
        scrollToNear(keyItem, 'right')
      }
    }
  }

  // BULLETS
  bullets && bullets.forEach((button, i) => {
    button.addEventListener('click', () => scrollToItem(children[i]))
  })

  // ARROWS
  arrowLeft && arrowLeft.addEventListener('click', () => sideScroll('left'))
  arrowRight && arrowRight.addEventListener('click', () => sideScroll('right'))

  // INTERVALS
  window.addEventListener('load', () => {
    const interval = slider.dataset.interval * 1000
    if (interval) {
      let scrollInterval = setInterval(sideScroll, interval)
      slider.addEventListener('mouseenter', () => {
        clearInterval(scrollInterval)
      })
      slider.addEventListener('mouseleave', () => {
        scrollInterval = setInterval(sideScroll, interval)
      })
    }
  })

  // CONTROLS VIEW
  function slidersControlsView () {
    const arrowsGroup = slider.querySelector('.slider__arrows')
    const bulletsGroup = slider.querySelector('.slider__bullets')
    if (slider.offsetWidth >= items.offsetWidth) {
      if (arrowsGroup) arrowsGroup.style.display = 'none'
      if (bulletsGroup) bulletsGroup.style.display = 'none'
      if (track) track.style.overflowX = 'hidden'
    } else {
      if (arrowsGroup) arrowsGroup.style = false
      if (bulletsGroup) bulletsGroup.style = false
      if (track) track.style = false
    }
  }
  window.addEventListener('load', slidersControlsView)
  window.addEventListener('resize', slidersControlsView)
  window.addEventListener('hashchange', slidersControlsView)
})
