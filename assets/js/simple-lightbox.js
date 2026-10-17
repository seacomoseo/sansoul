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
    const prepare = () => {
      if (instance) return Promise.resolve(instance)
      if (pending) return pending
      pending = loadScript('/js/simple-lightbox.min.js').then(() => {
        instance = new SimpleLightbox(items, { sourceAttr: 'data-lightbox' })
        instance.on('show.simplelightbox', () => closeModal(true))
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
      if (instance && !expand) return
      event.preventDefault()
      prepare().then(lightbox => lightbox.open(item || items[0])).catch(console.error)
    })
    group.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key) || !items.includes(event.target)) return
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
