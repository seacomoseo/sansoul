import { onMotionChange } from './motion'
import { closeModal } from './modals'
import { loadScript } from './load-script'

const observedGroups = new WeakSet()

export function initSimpleLightbox () {
  const groups = new Map()
  document.querySelectorAll('[data-lightbox]').forEach(item => {
    const group = item.closest('.gallery, .container, .boxes, .md, .menu__items') || item.parentElement
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push(item)
  })
  groups.forEach((items, group) => {
    if (observedGroups.has(group)) return
    observedGroups.add(group)
    let instance
    let pending
    let trigger
    const prepare = () => {
      if (instance) return Promise.resolve(instance)
      if (pending) return pending
      pending = loadScript('/js/simple-lightbox.min.js').then(() => {
        instance = new SimpleLightbox(items, { sourceAttr: 'data-lightbox', fileExt: '(?:png|jpe?g|gif|webp|avif|svg)(?:[?#].*)?' })
        const normalMotion = {
          animationSlide: instance.options.animationSlide,
          animationSpeed: instance.options.animationSpeed,
          fadeSpeed: instance.options.fadeSpeed
        }
        onMotionChange(reduce => {
          // The vendor treats zero fadeSpeed as its default. One millisecond
          // completes the fade callback on its first step, including close.
          Object.assign(instance.options, reduce
            ? { animationSlide: false, animationSpeed: 1, fadeSpeed: 1 }
            : normalMotion)
        })
        instance.on('show.simplelightbox', event => {
          trigger = trigger || event.target
          closeModal(true)
        })
        instance.on('closed.simplelightbox', () => {
          if (trigger?.isConnected && trigger.getClientRects().length && !trigger.closest('[hidden], dialog:not([open])')) {
            trigger.focus({ preventScroll: true })
          }
          trigger = null
        })
        return instance
      }).catch(error => {
        pending = null
        throw error
      })
      return pending
    }
    // Click also permits retry after a failed lazy network request.
    group.addEventListener('click', event => {
      const item = event.target.closest('[data-lightbox]')
      const expand = event.target.closest('.gallery__expand:not([href],[data-h],[data-b])')
      if ((!items.includes(item) && !expand) || (expand && expand.closest('.gallery') !== group)) return
      trigger = expand || item
      if (instance && !expand) return
      event.preventDefault()
      prepare().then(lightbox => lightbox.open(item || items[0])).catch(console.error)
    })
    group.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key) || !items.includes(event.target)) return
      trigger = event.target
      event.preventDefault()
      prepare().then(lightbox => lightbox.open(event.target)).catch(console.error)
    })
    if (typeof IntersectionObserver === 'function') {
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return
        observer.disconnect()
        prepare().catch(console.error)
      })
      observer.observe(group)
    }
  })
}
