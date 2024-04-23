export function initSliders () {
  const sliders = document.querySelectorAll('.slider')

  if (sliders) {
    function indexOfItem (item) {
      return [...item.parentElement.children].indexOf(item)
    }

    function activeClass (item, bullets, remove = false) {
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

    function scrollToItem (item, slider, track) {
      const itemLeft = item.offsetLeft
      const itemWidth = item.offsetWidth
      const sliderWidth = slider.offsetWidth // - parseFloat(getComputedStyle(document.body)['font-size'].replace('px', ''))
      const scrollLeft = itemLeft - (sliderWidth - itemWidth) / 2
      track.scrollTo({ top: 0, left: scrollLeft, behavior: 'smooth' })
    }

    function scrollToNear (item, side, track) {
      const trackLeft = track.scrollLeft
      const itemWidth = item.offsetWidth
      let scrollLeft
      if (side === 'left') {
        scrollLeft = trackLeft - itemWidth
      } else {
        scrollLeft = trackLeft + itemWidth
      }
      track.scrollTo({ top: 0, left: scrollLeft, behavior: 'smooth' })
    }

    function sideScroll (side, slider, track, children) {
      const activeItems = slider.querySelectorAll('.slider__item--active')
      const lastIndex = children.length - 1
      let keyItem, keyIndex
      if (side === 'left') {
        keyItem = activeItems[0]
        keyIndex = indexOfItem(keyItem)
        if (keyIndex === 0) {
          scrollToItem(children[lastIndex], slider, track)
        } else {
          scrollToNear(keyItem, 'left', track)
        }
      } else {
        keyItem = activeItems[activeItems.length - 1]
        keyIndex = indexOfItem(keyItem)
        if (keyIndex === lastIndex) {
          scrollToItem(children[0], slider, track)
        } else {
          scrollToNear(keyItem, 'right', track)
        }
      }
    }

    // CONTROLS VIEW
    function slidersControlsView () {
      sliders.forEach(slider => {
        const track = slider.querySelector('.slider__track')
        const items = slider.querySelector('.slider__items')
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
      })
    }
    window.addEventListener('resize', slidersControlsView)
    window.addEventListener('hashchange', slidersControlsView)
    window.addEventListener('load', () => {
      slidersControlsView()

      // SCROLL-SHOT AND INTERVALS
      sliders.forEach(slider => {
        const track = slider.querySelector('.slider__track')
        const items = slider.querySelector('.slider__items')
        const children = [...items.children]
        const bullets = slider.querySelectorAll('.slider__bullet')

        // SCROLL-SHOT
        function callbackScroll (entries, observer) {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              activeClass(entry.target, bullets)
            } else {
              activeClass(entry.target, bullets, true)
            }
          })
        }
        // eslint-disable-next-line
        const observerScroll = new IntersectionObserver(callbackScroll, {
          root: track,
          rootMargin: '0% 0%',
          threshold: 0.99
        })
        children.forEach(e => {
          observerScroll.observe(e)
        })

        // INTERVALS
        const interval = slider.dataset.interval * 1000
        if (interval) {
          let scrollInterval = setInterval(() => sideScroll('right', slider, track, children), interval)
          slider.addEventListener('mouseenter', () => {
            clearInterval(scrollInterval)
          })
          slider.addEventListener('mouseleave', () => {
            scrollInterval = setInterval(() => sideScroll('right', slider, track, children), interval)
          })
        }
      })
    })

    // ONCLICK
    document.addEventListener('click', e => {
      // BULLETS AND ARROWS
      const bullet = e.target.closest('.slider__bullet')
      const arrowLeft = e.target.closest('.slider__arrow--left')
      const arrowRight = e.target.closest('.slider__arrow--right')
      if (bullet || arrowLeft || arrowRight) {
        const slider = e.target.closest('.slider')
        const track = slider.querySelector('.slider__track')
        const items = slider.querySelector('.slider__items')
        const children = [...items.children]
        if (bullet) scrollToItem(children[indexOfItem(bullet)], slider, track)
        if (arrowLeft) sideScroll('left', slider, track, children)
        if (arrowRight) sideScroll('right', slider, track, children)
      }
    })
  }
}
