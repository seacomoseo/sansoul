// Preserve presentation dimensions without assigning an aspect-ratio to media.
// Observe the media itself: a fit-content wrapper must be able to grow again
// after a narrow viewport widens. The width stays natural and max-width clamps it.
const active = new Map()
let removalObserver
let listening = false

function remove (element) {
  active.get(element)?.observer?.disconnect()
  active.delete(element)
  if (!active.size) {
    removalObserver?.disconnect()
    removalObserver = undefined
    if (listening) window.removeEventListener('resize', resize)
    listening = false
  }
}

function resize () {
  for (const { update } of active.values()) update()
}

export function observeVideoDimensions (element) {
  if (active.has(element) || element.closest('.img--ratio, .img--disc')) return
  const width = Number(element.getAttribute('width'))
  const height = Number(element.getAttribute('height'))
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) return
  element.style.width = `${width}px`
  const update = () => {
    const displayed = element.clientWidth
    if (!displayed) return
    const value = `${displayed * height / width}px`
    if (element.style.height !== value) element.style.height = value
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : undefined
  active.set(element, { observer, update })
  observer?.observe(element)
  update()
  if (!listening) {
    window.addEventListener('resize', resize)
    listening = true
  }
  if (!removalObserver && typeof MutationObserver === 'function') {
    removalObserver = new MutationObserver(() => {
      for (const target of active.keys()) if (!target.isConnected) remove(target)
    })
    removalObserver.observe(document.documentElement, { childList: true, subtree: true })
  }
}

export function initVideoDimensions (root = document) {
  const elements = [...root.querySelectorAll('[data-vid] > img[width][height], svg[data-vid][width][height], img[data-vid][width][height], iframe.img__in[width][height]')]
  for (const element of elements) observeVideoDimensions(element)
  return () => { for (const element of elements) remove(element) }
}
