import { reducedMotion, onMotionChange } from './motion'
import { waitCSS } from './wait-css'
import { createInfiniteSlider } from './slider-infinite'

const initializedSliders = new WeakSet()
let controlsInitialized = false
const infiniteSliders = new WeakMap()
const destinations = new WeakMap()
const interactionUntil = new WeakMap()

function indexOfItem (item) {
  return [...item.parentElement.children].indexOf(item)
}

function activeClass (item, pips, remove = false) {
  const infinite = infiniteSliders.get(item.closest('.slider'))
  const index = infinite ? infinite.indexOf(item) : indexOfItem(item)
  const pip = pips[index]
  if (!remove) {
    item.classList.add('slider__item--active')
    pip && pip.classList.add('slider__pip--active')
  } else {
    item.classList.remove('slider__item--active')
    pip && pip.classList.remove('slider__pip--active')
  }
}

function scrollToItem (item, slider, track) {
  if (infiniteSliders.get(slider)?.goTo(item, reducedMotion() ? 'instant' : 'smooth')) return
  destinations.set(track, item)
  const bounds = track.getBoundingClientRect()
  const target = item.getBoundingClientRect()
  track.scrollTo({ left: track.scrollLeft + (target.left + target.right - bounds.left - bounds.right) / 2, behavior: reducedMotion() ? 'instant' : 'smooth' })
}

function sideScroll (side, track, children) {
  const slider = track.closest('.slider')
  const infinite = infiniteSliders.get(slider)
  if (infinite?.step(side, reducedMotion() ? 'instant' : 'smooth')) return
  const bounds = track.getBoundingClientRect()
  const center = (bounds.left + bounds.right) / 2
  const nearest = destinations.get(track) || children.reduce((best, item) => {
    const a = item.getBoundingClientRect()
    const b = best.getBoundingClientRect()
    return Math.abs((a.left + a.right) / 2 - center) < Math.abs((b.left + b.right) / 2 - center) ? item : best
  })
  const next = (children.indexOf(nearest) + (side === 'left' ? -1 : 1) + children.length) % children.length
  scrollToItem(children[next], slider, track)
}

function slidersControlsView (slider, items) {
  const itemsStyle = window.getComputedStyle(items, '')
  const padding = parseFloat(itemsStyle.getPropertyValue('padding-left')) * 2
  const itemsWidth = items.offsetWidth - padding
  if (slider.offsetWidth >= itemsWidth - 1) {
    slider.classList.add('slider--static')
  } else {
    slider.classList.remove('slider--static')
  }
}

export function initSliders () {
  waitCSS(() => {
    const sliders = document.querySelectorAll('.slider')
    if (!sliders.length) return

    // SCROLL-SHOT AND INTERVALS
    sliders.forEach(slider => {
      if (initializedSliders.has(slider)) return
      initializedSliders.add(slider)
      const track = slider.querySelector('.slider__track')
      const items = slider.querySelector('.slider__items')
      const children = [...items.children]
      const pips = slider.querySelectorAll('.slider__pip')

      // Finite controls accumulate destinations rather than sampling an animation
      // halfway through. Direct gestures cancel that destination immediately.
      for (const event of ['scrollend', 'pointerdown', 'touchstart', 'wheel']) {
        track.addEventListener(event, () => destinations.delete(track), { passive: true })
      }

      for (const event of ['pointerdown', 'touchstart']) {
        track.addEventListener(event, () => interactionUntil.set(track, Infinity), { passive: true })
      }
      for (const event of ['pointerup', 'pointercancel', 'pointerleave', 'touchend', 'touchcancel', 'wheel']) {
        track.addEventListener(event, () => interactionUntil.set(track, Date.now() + 500), { passive: true })
      }
      track.addEventListener('scroll', () => {
        if (interactionUntil.get(track) !== Infinity) interactionUntil.set(track, Date.now() + 500)
      }, { passive: true })

      // CONTROLS VIEW
      const ro = new ResizeObserver(() => {
        slidersControlsView(slider, items)
      })
      ro.observe(slider)
      // Run when load
      slidersControlsView(slider, items)

      // SCROLL-SHOT
      function callbackScrollChildren (entries, observer) {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            activeClass(entry.target, pips)
          } else {
            activeClass(entry.target, pips, true)
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

      // FIRST TO START ON LOAD
      const trackChild = track.firstElementChild
      const trackStyle = window.getComputedStyle(trackChild)
      const padding = parseFloat(trackStyle.getPropertyValue('padding-left'))
      track.scrollTo(padding, 0)
      if (slider.dataset.infinite === 'true') {
        infiniteSliders.set(slider, createInfiniteSlider(slider, track, items, children))
      }
      onMotionChange(reduce => {
        if (reduce) track.scrollTo({ left: track.scrollLeft, top: track.scrollTop, behavior: 'instant' })
      })

      // INTERVALS
      const interval = slider.dataset.time * 1000
      if (interval) {
        let scrollInterval
        let visible = false
        let hovered = false
        function updateInterval () {
          clearInterval(scrollInterval)
          scrollInterval = undefined
          if (!visible || hovered || slider.contains(document.activeElement) || reducedMotion()) return
          scrollInterval = setInterval(() => {
            const isStatic = slider.classList.contains('slider--static')
            const disableParallax = document.body.classList.contains('scrolling')
            if (!isStatic && !disableParallax && !(Date.now() < (interactionUntil.get(track) || 0)) && !infiniteSliders.get(slider)?.isBusy() && !reducedMotion()) {
              sideScroll('right', track, children)
            }
          }, interval)
        }
        const observerScrollParent = new IntersectionObserver(entries => {
          entries.forEach(entry => {
            visible = entry.isIntersecting
            updateInterval()
          })
        }, { rootMargin: '0% 0%' })
        observerScrollParent.observe(slider)
        slider.addEventListener('mouseenter', () => {
          hovered = true
          updateInterval()
        })
        slider.addEventListener('mouseleave', () => {
          hovered = false
          updateInterval()
        })
        slider.addEventListener('focusin', updateInterval)
        slider.addEventListener('focusout', () => requestAnimationFrame(updateInterval))
        onMotionChange(updateInterval)
      }
    })

    // ONCLICK
    if (controlsInitialized) return
    controlsInitialized = true
    document.addEventListener('click', e => {
      // pips AND ARROWS
      const pip = e.target.closest('.slider__pip')
      const arrowLeft = e.target.closest('.slider__arrow--left')
      const arrowRight = e.target.closest('.slider__arrow--right')
      if (pip || arrowLeft || arrowRight) {
        const slider = e.target.closest('.slider')
        const track = slider.querySelector('.slider__track')
        const items = slider.querySelector('.slider__items')
        const children = [...items.children]
        if (pip) scrollToItem(infiniteSliders.get(slider)?.itemAt(indexOfItem(pip)) || children[indexOfItem(pip)], slider, track)
        if (arrowLeft) sideScroll('left', track, children)
        if (arrowRight) sideScroll('right', track, children)
      }
    })
  })
}
