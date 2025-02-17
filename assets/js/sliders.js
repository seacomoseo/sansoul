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

    // function scrollToNear (item, side, track) {
    //   const trackLeft = track.scrollLeft
    //   const itemWidth = item.offsetWidth
    //   let scrollLeft
    //   if (side === 'left') {
    //     scrollLeft = trackLeft - itemWidth
    //   } else {
    //     scrollLeft = trackLeft + itemWidth
    //   }
    //   track.scrollTo({ top: 0, left: scrollLeft, behavior: 'smooth' })
    // }

    function scrollToLeft (track, width) {
      track.scrollTo({
        left: width,
        behavior: 'smooth'
      })
    }

    function sideScroll (side, track, children) {
      // Bit by bit
      const trackChild = track.firstElementChild
      const trackStyle = window.getComputedStyle(trackChild)
      const trackWidth = trackChild.scrollWidth
      const padding = parseFloat(trackStyle.getPropertyValue('padding-left')) * 2
      const gap = parseFloat(trackStyle.getPropertyValue('gap'))
      const elementWidth = children[0].scrollWidth
      const scrollWidth = elementWidth + gap
      if (side === 'left') {
        if (track.scrollLeft > 0) {
          scrollToLeft(track, track.scrollLeft - scrollWidth)
        } else {
          scrollToLeft(track, trackWidth - scrollWidth)
        }
      } else {
        if (track.scrollLeft < (trackWidth - scrollWidth - padding)) {
          scrollToLeft(track, track.scrollLeft + scrollWidth)
        } else {
          scrollToLeft(track, 0)
        }
      }
      // Next no observer in center
      // const activeItems = slider.querySelectorAll('.slider__item--active')
      // const lastIndex = children.length - 1
      // let keyItem, keyIndex
      // if (side === 'left') {
      //   keyItem = activeItems[0]
      //   keyIndex = indexOfItem(keyItem)
      //   if (keyIndex === 0) {
      //     scrollToItem(children[lastIndex], slider, track)
      //   } else {
      //     scrollToNear(keyItem, 'left', track)
      //   }
      // } else {
      //   keyItem = activeItems[activeItems.length - 1]
      //   keyIndex = indexOfItem(keyItem)
      //   if (keyIndex === lastIndex) {
      //     scrollToItem(children[0], slider, track)
      //   } else {
      //     scrollToNear(keyItem, 'right', track)
      //   }
      // }
    }

    // CONTROLS VIEW
    function slidersControlsView () {
      document.querySelectorAll('.slider').forEach(slider => {
        const items = slider.querySelector('.slider__items')
        const itemsStyle = window.getComputedStyle(items, '')
        const padding = parseFloat(itemsStyle.getPropertyValue('padding-left')) * 2
        const itemsWidth = items.offsetWidth - padding
        if (slider.offsetWidth >= itemsWidth - 1) {
          slider.classList.add('slider--static')
        } else {
          slider.classList.remove('slider--static')
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

        // FIRST TO START ON LOAD
        const trackChild = track.firstElementChild
        const trackStyle = window.getComputedStyle(trackChild)
        const padding = parseFloat(trackStyle.getPropertyValue('padding-left'))
        track.scrollTo(padding, 0)

        // SCROLL-SHOT
        function callbackScrollChildren (entries, observer) {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              activeClass(entry.target, bullets)
            } else {
              activeClass(entry.target, bullets, true)
            }
          })
        }
        const observerScrollChildren = new IntersectionObserver(callbackScrollChildren, {
          root: slider,
          rootMargin: '0% 0%',
          threshold: 0.95
        })
        children.forEach(e => {
          observerScrollChildren.observe(e)
        })

        // INTERVALS
        const interval = slider.dataset.interval * 1000
        if (interval) {
          let scrollInterval
          // Set intervall if not static
          function setSideScrollInterval () {
            return setInterval(() => {
              const isStatic = slider.classList.contains('slider--static')
              const disableParallax = document.body.classList.contains('scrolling')
              if (!isStatic && !disableParallax) {
                sideScroll('right', track, children)
              }
            }, interval)
          }
          // Observer
          function callbackScrollParent (entries, observer) {
            entries.forEach(entry => {
              if (entry.isIntersecting) {
                scrollInterval = setSideScrollInterval()
              } else {
                clearInterval(scrollInterval)
              }
            })
          }
          const observerScrollParent = new IntersectionObserver(callbackScrollParent, { rootMargin: '0% 0%' })
          observerScrollParent.observe(slider)
          // Mouse hover
          slider.addEventListener('mouseenter', () => {
            clearInterval(scrollInterval)
          })
          slider.addEventListener('mouseleave', () => {
            scrollInterval = setSideScrollInterval()
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
        if (arrowLeft) sideScroll('left', track, children)
        if (arrowRight) sideScroll('right', track, children)
      }
    })
  }
}
