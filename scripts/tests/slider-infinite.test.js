import test from 'node:test'
import assert from 'node:assert/strict'
import { createInfiniteSlider } from '../../assets/js/slider-infinite.js'

function fixture ({ count = 8, width = 100, viewport = 200, preserveState = true, complex = false } = {}) {
  const frames = new Map()
  const resize = []
  let sequence = 0
  globalThis.requestAnimationFrame = fn => { frames.set(++sequence, fn); return sequence }
  globalThis.cancelAnimationFrame = id => frames.delete(id)
  globalThis.document = { activeElement: null }
  globalThis.getComputedStyle = () => ({ gap: '0' })
  globalThis.MutationObserver = class { observe () {} }
  globalThis.ResizeObserver = class { constructor (fn) { resize.push(fn) } observe () {} }
  globalThis.IntersectionObserver = class { constructor (fn) { this.fn = fn } observe () { this.fn([{ isIntersecting: true }]) } }
  const classes = new Set()
  const classList = { contains: value => classes.has(value), add: value => classes.add(value), remove: value => classes.delete(value), toggle: (value, on) => on ? classes.add(value) : classes.delete(value) }
  const slider = { classList, isConnected: true }
  const listeners = {}
  const track = {
    scrollLeft: 0,
    clientWidth: viewport,
    scrollWidth: count * width,
    classList,
    getBoundingClientRect: () => ({ left: 0, right: track.clientWidth }),
    scrollTo ({ left }) { track.scrollLeft = left },
    addEventListener: (name, fn) => { listeners[name] = fn }
  }
  const items = {
    children: [],
    get firstElementChild () { return this.children[0] },
    get lastElementChild () { return this.children.at(-1) },
    insertBefore (item, before) {
      this.children.splice(this.children.indexOf(item), 1)
      this.children.splice(before ? this.children.indexOf(before) : this.children.length, 0, item)
    }
  }
  if (preserveState) items.moveBefore = items.insertBefore
  const logical = Array.from({ length: count }, (_, i) => ({
    id: `original-${i}`,
    contains: node => node === logical[i],
    querySelector: () => complex ? {} : null,
    get nextElementSibling () { return items.children[items.children.indexOf(this) + 1] || null },
    getBoundingClientRect () {
      const left = items.children.indexOf(this) * width - track.scrollLeft
      return { left, right: left + width, width }
    }
  }))
  items.children.push(...logical)
  const flush = () => {
    let limit = 10
    while (frames.size && --limit) {
      const batch = [...frames]
      frames.clear()
      batch.forEach(([, fn]) => fn())
    }
    assert.ok(limit > 0, 'must not create a frame loop')
  }
  const controller = createInfiniteSlider(slider, track, items, logical)
  flush()
  return { listeners, controller, slider, track, items, logical, classes, flush, resize: () => { resize.forEach(fn => fn()); flush() }, scroll: amount => { track.scrollLeft += amount; listeners.scroll(); listeners.scrollend(); flush() } }
}

test('continuous recycling preserves each original identity and viewport position in both directions', () => {
  const f = fixture()
  assert.ok(f.classes.has('slider--infinite'))
  assert.equal(f.logical[0].getBoundingClientRect().left, 0, 'initial authored card stays visually fixed')
  for (const direction of [1, -1]) {
    for (let turn = 0; turn < 40; turn++) {
      const anchor = f.items.children.find(item => item.getBoundingClientRect().left >= 0)
      const left = anchor.getBoundingClientRect().left - direction * 70
      f.scroll(direction * 70)
      assert.equal(anchor.getBoundingClientRect().left, left, 'compensation must preserve the gesture displacement')
      assert.equal(f.items.children.length, f.logical.length)
      assert.equal(new Set(f.items.children).size, f.logical.length)
      assert.ok(f.track.scrollLeft > 0 && f.track.scrollLeft < 600, 'keep native scrolling away from finite ends')
    }
  }
  f.logical.forEach((item, index) => {
    assert.equal(f.controller.indexOf(item), index)
    assert.equal(f.controller.itemAt(index), item)
  })
})

test('arrows cross the logical last/first boundary using adjacent real cards', () => {
  const f = fixture()
  for (let index = 0; index < 20; index++) {
    assert.equal(f.controller.step('right', 'instant'), true)
    f.scroll(0)
  }
  assert.equal(f.items.children.length, 8)
  assert.equal(f.controller.step('left', 'instant'), true)
})

test('resize restores authored order when there is not enough off-screen content', () => {
  const f = fixture()
  f.track.clientWidth = 800
  f.resize()
  assert.equal(f.classes.has('slider--infinite'), false)
  assert.deepEqual(f.items.children, f.logical)
  assert.equal(f.controller.step('right', 'instant'), false)
  f.track.clientWidth = 200
  f.resize()
  assert.ok(f.classes.has('slider--infinite'))
})

test('focused content and embedded players are not detached by legacy DOM movement', () => {
  const f = fixture({ preserveState: false, complex: true })
  assert.deepEqual(f.items.children, f.logical, 'legacy browsers must not reload an iframe/player while recycling it')
  assert.equal(f.classes.has('slider--infinite'), false, 'fallback must be finite from the start, not stop at a media card')
  const g = fixture()
  globalThis.document.activeElement = g.items.lastElementChild
  const focused = g.items.lastElementChild
  const before = [...g.items.children]
  g.scroll(-150)
  assert.equal(g.items.children.indexOf(focused), before.indexOf(focused), 'do not move the focused card')
})

test('static and insufficient collections retain their natural reading order', () => {
  for (const count of [1, 2, 3]) {
    const f = fixture({ count })
    assert.equal(f.classes.has('slider--infinite'), false)
    assert.deepEqual(f.items.children, f.logical)
    assert.equal(f.controller.step('right', 'instant'), false)
  }
})

test('resize restores authored order around an untouched focused card', () => {
  const f = fixture()
  globalThis.document.activeElement = f.logical[4]
  f.track.clientWidth = 800
  f.resize()
  assert.deepEqual(f.items.children, f.logical)
  assert.equal(globalThis.document.activeElement, f.logical[4])
})


test('wheel momentum never rebases cards or writes scroll position before settling', () => {
  const f = fixture()
  const order = [...f.items.children]
  f.listeners.wheel()
  f.track.scrollLeft += 180
  const position = f.track.scrollLeft
  f.listeners.scroll()
  f.flush()
  assert.deepEqual(f.items.children, order)
  assert.equal(f.track.scrollLeft, position)
  f.listeners.scrollend()
  f.flush()
  assert.equal(new Set(f.items.children).size, 8)
})

test('rapid arrows serialize until scrollend and do not reverse an active animation', () => {
  const f = fixture()
  f.controller.step('right', 'smooth')
  const destination = f.track.scrollLeft
  const order = [...f.items.children]
  for (let i = 0; i < 5; i++) f.controller.step('right', 'smooth')
  assert.equal(f.track.scrollLeft, destination)
  assert.deepEqual(f.items.children, order)
  for (let i = 0; i < 6; i++) f.listeners.scrollend()
  f.flush()
  assert.equal(new Set(f.items.children).size, 8)
})


test('an edge pip is centered after settling and making room without cloning', () => {
  const f = fixture()
  const target = f.items.firstElementChild
  f.controller.goTo(target, 'smooth')
  f.listeners.scrollend()
  f.flush()
  f.listeners.scrollend()
  f.flush()
  const bounds = target.getBoundingClientRect()
  assert.equal((bounds.left + bounds.right) / 2, f.track.clientWidth / 2)
  assert.equal(f.items.children.length, 8)
})
