// Recycle original, fully hidden cards: never duplicate media, IDs or controls.
export function createInfiniteSlider (slider, track, items, logicalItems) {
  let enabled = false
  let near = false
  let frame = 0
  let restoring = false
  let snapFrame = 0
  let navigating = false
  let settleTimer
  let alignTarget = null
  let held = false
  let destination = 0
  let moving = false
  let pending = []
  const index = new Map(logicalItems.map((item, index) => [item, index]))
  const rect = item => item.getBoundingClientRect()
  const statefulMedia = 'iframe, video, audio, object, embed, [data-vid], [data-disqus-thread], #disqus_thread'
  const focused = item => item.contains(document.activeElement)
  const movable = item => !focused(item) && (typeof items.moveBefore === 'function' || !item.querySelector(statefulMedia))

  function move (item, before) {
    if (typeof items.moveBefore === 'function') items.moveBefore(item, before)
    else items.insertBefore(item, before)
  }

  function compensate (anchor, change) {
    const left = rect(anchor).left
    track.classList.add('slider__track--rebasing')
    change()
    track.scrollTo({ left: track.scrollLeft + rect(anchor).left - left, behavior: 'instant' })
    cancelAnimationFrame(snapFrame)
    snapFrame = requestAnimationFrame(() => track.classList.remove('slider__track--rebasing'))
  }

  function nearest () {
    const bounds = rect(track)
    const center = (bounds.left + bounds.right) / 2
    return logicalItems.reduce((best, item) => Math.abs((rect(item).left + rect(item).right) / 2 - center) < Math.abs((rect(best).left + rect(best).right) / 2 - center) ? item : best)
  }

  function rebalance () {
    frame = 0
    if (!near || !enabled || restoring || moving || navigating || !slider.isConnected) return
    const bounds = rect(track)
    const anchor = nearest()
    const gap = parseFloat(getComputedStyle(items).gap) || 0
    const reserve = Math.max(...logicalItems.map(item => rect(item).width)) + gap
    // Bounded work even for uneven cards or a viewport wider than the content.
    for (let count = 0; count < logicalItems.length; count++) {
      const first = items.firstElementChild
      const last = items.lastElementChild
      const firstRect = rect(first)
      const lastRect = rect(last)
      if (bounds.left - firstRect.left < reserve && lastRect.left >= bounds.right - 1 && movable(last)) {
        compensate(anchor, () => move(last, first))
      } else if (lastRect.right - bounds.right < reserve && firstRect.right <= bounds.left + 1 && movable(first)) {
        compensate(anchor, () => move(first, null))
      } else break
    }
  }

  function schedule () {
    if (!frame) frame = requestAnimationFrame(rebalance)
  }

  function refresh () {
    if (!near) return
    const widths = logicalItems.map(item => rect(item).width)
    const gap = parseFloat(getComputedStyle(items).gap) || 0
    const available = widths.reduce((sum, width) => sum + width, 0) + gap * (logicalItems.length - 1)
    const stateSafe = typeof items.moveBefore === 'function' || !logicalItems.some(item => item.querySelector(statefulMedia))
    const next = stateSafe && logicalItems.length > 2 && available >= track.clientWidth + 2 * (Math.max(...widths) + gap) - 2
    if (enabled && !next) {
      restoring = true
      const anchor = nearest()
      compensate(anchor, () => {
        // Restore the authored reading order when the viewport no longer fits a loop.
        let next = null
        for (const item of [...logicalItems].reverse()) {
          if (item.nextElementSibling !== next && movable(item)) move(item, next)
          next = item
        }
      })
      restoring = false
    }
    enabled = next
    slider.classList.toggle('slider--infinite', enabled)
    schedule()
  }

  function finishNavigation () {
    clearTimeout(settleTimer)
    if (held) return
    moving = false
    navigating = false
    rebalance()
    const align = alignTarget
    alignTarget = null
    if (align && !pending.length) {
      const bounds = rect(track)
      const target = rect(align)
      if (Math.abs(target.left + target.right - bounds.left - bounds.right) > 4) {
        goTo(align, 'smooth', true)
        return
      }
    }
    const next = pending.shift()
    if (next) {
      if (next.direction) step(next.direction, next.behavior)
      else goTo(next.target, next.behavior)
    }
  }

  function waitForRest () {
    if (track.classList.contains('slider__track--rebasing')) return
    moving = true
    clearTimeout(settleTimer)
    settleTimer = setTimeout(finishNavigation, 250)
  }

  function goTo (target, behavior, correction = false) {
    if (!enabled || !target) return false
    if (moving || navigating) {
      // Pips select one destination; arrows are serialized in authored direction.
      pending = [{ target, behavior }]
      return true
    }
    rebalance()
    const bounds = rect(track)
    const targetBounds = rect(target)
    alignTarget = correction ? null : target
    navigating = behavior === 'smooth'
    if (navigating) waitForRest()
    destination = track.scrollLeft + (targetBounds.left + targetBounds.right - bounds.left - bounds.right) / 2
    destination = Math.max(0, Math.min(destination, Number.isFinite(track.scrollWidth) ? track.scrollWidth - track.clientWidth : Infinity))
    track.scrollTo({ left: destination, behavior })
    if (!navigating) schedule()
    return true
  }

  function step (direction, behavior) {
    if (!enabled) return false
    if (moving || navigating) {
      // Bound queued work: a burst must not keep animating long after input ends.
      if (pending.length < logicalItems.length) pending.push({ direction, behavior })
      return true
    }
    rebalance()
    const current = nearest()
    const siblings = [...items.children]
    const target = siblings[siblings.indexOf(current) + (direction === 'left' ? -1 : 1)]
    return goTo(target, behavior)
  }

  // Never change scrollLeft or DOM order during native momentum. Doing so cancels
  // smooth scrolling and fights scroll snapping, especially with wheel/touch bursts.
  track.addEventListener('scroll', waitForRest, { passive: true })
  track.addEventListener('scrollend', () => {
    if (!navigating || Math.abs(track.scrollLeft - destination) < 2) finishNavigation()
  })
  for (const event of ['pointerdown', 'touchstart', 'wheel']) {
    track.addEventListener(event, () => {
      if (event !== 'wheel') held = true
      pending = []
      alignTarget = null
      navigating = false
      waitForRest()
    }, { passive: true })
  }
  for (const event of ['pointerup', 'pointercancel', 'pointerleave', 'touchend', 'touchcancel']) {
    track.addEventListener(event, () => {
      held = false
      waitForRest()
    }, { passive: true })
  }
  // ResizeObserver also covers media consent changing a card's dimensions.
  const observer = new ResizeObserver(refresh)
  observer.observe(track)
  logicalItems.forEach(item => observer.observe(item))
  const changes = new MutationObserver(records => {
    if (records.some(record => record.target !== items)) refresh()
  })
  changes.observe(items, { childList: true, subtree: true })
  const visibility = new IntersectionObserver(entries => {
    near = entries.some(entry => entry.isIntersecting)
    if (near) refresh()
  }, { rootMargin: '200px' })
  visibility.observe(slider)
  return {
    isBusy: () => moving || navigating,
    indexOf: item => index.get(item),
    itemAt: logicalIndex => logicalItems[logicalIndex],
    goTo,
    step
  }
}
