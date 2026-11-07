import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'

async function moduleFixture (name, context, exports) {
  const source = (await fs.readFile(new URL(`../../assets/js/${name}.js`, import.meta.url), 'utf8'))
    .replace(/^import .+\n/gm, '').replace(/^export /gm, '')
  return vm.runInNewContext(source + `\n;({ ${exports.join(', ')} })`, { ...context })
}

async function preference (initial = false, legacy = false) {
  const handlers = new Set()
  let reads = 0
  const query = { matches: initial }
  query[legacy ? 'addListener' : 'addEventListener'] = (...args) => handlers.add(args.at(-1))
  const window = { matchMedia: value => { assert.equal(value, '(prefers-reduced-motion: reduce)'); reads++; return query } }
  const motion = await moduleFixture('motion', { window }, ['reducedMotion', 'onMotionChange'])
  return {
    ...motion, window,
    reads: () => reads,
    listeners: () => handlers.size,
    change: value => { query.matches = value; handlers.forEach(handler => handler({ matches: value })) }
  }
}

function classes (...names) {
  const set = new Set(names)
  return { contains: name => set.has(name), add: name => set.add(name), remove: name => set.delete(name) }
}

test('motion is lazy, shares one modern/legacy preference listener and supports unsubscribe', async () => {
  for (const legacy of [false, true]) {
    const motion = await preference(false, legacy)
    assert.equal(motion.reads(), 0)
    const changes = []
    const stop = motion.onMotionChange(value => changes.push(value))
    motion.reducedMotion()
    motion.onMotionChange(() => {})
    assert.equal(motion.reads(), 1)
    assert.equal(motion.listeners(), 1)
    motion.change(true)
    assert.equal(motion.reducedMotion(), true)
    stop()
    motion.change(false)
    assert.deepEqual(changes, [false, true])
  }
  const motion = await moduleFixture('motion', {}, ['reducedMotion'])
  assert.equal(motion.reducedMotion(), false, 'missing matchMedia keeps the existing behavior')
})

test('page and hash navigation use instant scrolling under reduced motion and honor explicit instant', async () => {
  const motion = await preference()
  const calls = []
  const target = { scrollIntoView: options => calls.push(options.behavior) }
  const api = await moduleFixture('scroll-to', {
    ...motion, document: { body: { classList: classes() } }, setTimeout () {},
    location: { hash: '#demo' }, hashTarget: () => target, waitCSS: fn => fn()
  }, ['scrollTo', 'initScrollToHashWhenLoad'])
  api.scrollTo(target)
  api.scrollTo(target, true)
  motion.change(true)
  api.scrollTo(target)
  api.initScrollToHashWhenLoad()
  motion.change(false)
  api.scrollTo(target)
  assert.deepEqual(calls, ['smooth', 'instant', 'instant', 'instant', 'smooth'])
})

test('parallax removes stale offsets and observers when reduced, then resumes without duplicate scroll listeners', async () => {
  const motion = await preference()
  const events = new Map()
  const offsets = new Map()
  const element = { classList: classes(), style: { setProperty: (key, value) => offsets.set(key, value), removeProperty: key => offsets.delete(key) }, getBoundingClientRect: () => ({ height: 200, top: 300 }) }
  let cleanup = 0
  let observers = 0
  const api = await moduleFixture('scroll-parallax', {
    ...motion,
    window: { innerHeight: 800, addEventListener: (type, fn) => events.set(type, fn), removeEventListener: type => events.delete(type) },
    document: { readyState: 'complete', querySelectorAll: () => [element] },
    scrollShot: options => { observers++; options.doOnLoad(element); return () => cleanup++ }
  }, ['initScrollParallax'])
  api.initScrollParallax()
  api.initScrollParallax()
  assert.equal(observers, 1)
  assert.equal(events.size, 1)
  assert.equal(offsets.has('--scroll-pos'), true)
  const queuedScroll = events.get('scroll')
  motion.change(true)
  assert.equal(cleanup, 1)
  assert.equal(events.size, 0)
  queuedScroll()
  assert.equal(offsets.has('--scroll-pos'), false)
  motion.change(false)
  assert.equal(events.size, 1)
  assert.equal(observers, 2)
  assert.equal(offsets.has('--scroll-pos'), true)
})

test('reveals become visible on runtime reduction and are never hidden again after preference restoration', async () => {
  const motion = await preference()
  const element = { classList: classes() }
  let cleanup = 0
  let observers = 0
  const api = await moduleFixture('scroll-show', {
    ...motion, document: { querySelectorAll: () => [element] },
    scrollShot: options => { observers++; options.doOnLoad(element); return () => cleanup++ }
  }, ['initScrollShow'])
  api.initScrollShow()
  api.initScrollShow()
  assert.equal(element.classList.contains('show--will'), true)
  motion.change(true)
  assert.equal(cleanup, 1)
  assert.equal(element.classList.contains('show--will'), false)
  motion.change(false)
  assert.equal(observers, 1)
  assert.equal(element.classList.contains('show--will'), false)
})

async function sliderFixture (initial = false) {
  const motion = await preference(initial)
  const observers = []
  const intervals = new Map()
  const listeners = {}
  const documentEvents = {}
  const scrolls = []
  const trackEvents = {}
  const frames = []
  const body = { classList: classes() }
  const document = { body, activeElement: body }
  let intervalKey = 0
  const children = [{ offsetLeft: 20, offsetWidth: 100, scrollWidth: 100, classList: classes() }, { offsetLeft: 140, offsetWidth: 100, scrollWidth: 100, classList: classes() }]
  const items = { children, offsetWidth: 600, scrollWidth: 600 }
  children.forEach(child => { child.parentElement = items; child.getBoundingClientRect = () => ({left: child.offsetLeft, right: child.offsetLeft + child.offsetWidth}) })
  const track = { addEventListener (name, fn) { (trackEvents[name] ||= []).push(fn) }, getBoundingClientRect: () => ({left: 0, right: 240}), firstElementChild: items, scrollLeft: 0, scrollTop: 0, scrollTo: (...args) => scrolls.push(args) }
  const slider = {
    dataset: { time: '3' }, offsetWidth: 240, classList: classes(),
    parentElement: body,
    contains (node) {
      for (let current = node; current; current = current.parentElement) if (current === this) return true
      return false
    },
    querySelector: selector => ({ '.slider__track': track, '.slider__items': items })[selector],
    querySelectorAll: () => [],
    addEventListener: (name, fn) => { listeners[name] = fn }
  }
  items.parentElement = track
  track.parentElement = slider
  track.closest = selector => selector === '.slider' ? slider : null
  children.forEach(child => { child.closest = track.closest })
  document.querySelectorAll = () => [slider]
  document.addEventListener = (name, fn) => { (documentEvents[name] ||= []).push(fn) }
  const api = await moduleFixture('sliders', {
    ...motion,
    document,
    requestAnimationFrame: fn => frames.push(fn),
    window: { getComputedStyle: () => ({ getPropertyValue: name => name === 'gap' ? '20' : '0' }) },
    waitCSS: fn => fn(),
    ResizeObserver: class { observe () {} },
    IntersectionObserver: class { constructor (callback) { observers.push(callback) } observe () {} },
    setInterval: fn => { intervals.set(++intervalKey, fn); return intervalKey },
    clearInterval: key => intervals.delete(key)
  }, ['initSliders'])
  api.initSliders()
  api.initSliders()
  return { trackEvents, motion, intervals, listeners, documentEvents, scrolls, observers, slider, document, children, flushFrames: () => frames.splice(0).forEach(fn => fn()) }
}

test('sliders pause automatic motion immediately, remain keyboard/click usable and resume only when visible and unhovered', async () => {
  const f = await sliderFixture()
  assert.equal(f.observers.length, 2)
  assert.equal(f.documentEvents.click.length, 1)
  f.observers[1]([{ isIntersecting: true }])
  f.observers[1]([{ isIntersecting: true }])
  assert.equal(f.intervals.size, 1)
  f.intervals.values().next().value()
  assert.equal(f.scrolls.at(-1)[0].behavior, 'smooth')
  f.motion.change(true)
  assert.equal(f.intervals.size, 0)
  assert.equal(f.scrolls.at(-1)[0].behavior, 'instant')
  const right = { closest: selector => selector === '.slider__arrow--right' ? right : selector === '.slider' ? f.slider : null }
  f.documentEvents.click[0]({ target: right })
  assert.equal(f.scrolls.at(-1)[0].behavior, 'instant')
  f.listeners.mouseenter()
  f.motion.change(false)
  assert.equal(f.intervals.size, 0)
  f.listeners.mouseleave()
  assert.equal(f.intervals.size, 1)
  f.observers[1]([{ isIntersecting: false }])
  f.listeners.mouseleave()
  assert.equal(f.intervals.size, 0)
})

test('slider focus pauses autoplay throughout internal focus changes and resumes only after focus leaves', async () => {
  const f = await sliderFixture()
  f.observers[1]([{ isIntersecting: true }])
  assert.equal(f.intervals.size, 1)
  const firstInput = { parentElement: f.children[0] }
  const secondInput = { parentElement: f.children[1] }
  f.document.activeElement = firstInput
  f.listeners.focusin()
  assert.equal(f.intervals.size, 0, 'focused form control must immediately pause autoplay')
  f.listeners.focusout()
  f.document.activeElement = secondInput
  f.listeners.focusin()
  f.flushFrames()
  assert.equal(f.intervals.size, 0, 'moving focus between cards must never restart autoplay')
  f.listeners.focusout()
  f.document.activeElement = f.document.body
  assert.equal(f.intervals.size, 0, 'wait for the focus transition before resuming')
  f.flushFrames()
  assert.equal(f.intervals.size, 1)
  f.document.activeElement = firstInput
  f.listeners.focusin()
  f.motion.change(true)
  f.listeners.focusout()
  f.document.activeElement = f.document.body
  f.flushFrames()
  assert.equal(f.intervals.size, 0, 'reduced motion still prevents autoplay after focus leaves')
  f.motion.change(false)
  assert.equal(f.intervals.size, 1)
  f.observers[1]([{ isIntersecting: false }])
  f.document.activeElement = firstInput
  f.listeners.focusin()
  f.listeners.focusout()
  f.document.activeElement = f.document.body
  f.flushFrames()
  assert.equal(f.intervals.size, 0, 'off-screen sliders remain paused after blur')
})

test('a slider starting reduced never starts autoplay until preference is restored', async () => {
  const f = await sliderFixture(true)
  f.observers[1]([{ isIntersecting: true }])
  assert.equal(f.intervals.size, 0)
  f.motion.change(false)
  assert.equal(f.intervals.size, 1)
})

test('lightbox applies live motion preferences without replacing its instance or changing close handlers', async () => {
  const motion = await preference(true)
  let instance
  let constructed = 0
  const events = {}
  const groupEvents = {}
  const group = { addEventListener: (name, handler) => { groupEvents[name] = handler } }
  const item = { closest: () => group }
  const api = await moduleFixture('simple-lightbox', {
    ...motion,
    document: { querySelectorAll: () => [item] }, closeModal () {},
    loadScript: () => Promise.resolve(),
    SimpleLightbox: class {
      constructor () { instance = this; constructed++; this.options = { animationSlide: true, animationSpeed: 250, fadeSpeed: 300 } }
      on (name, fn) { events[name] = fn }
      open () {}
    }
  }, ['initSimpleLightbox'])
  api.initSimpleLightbox()
  api.initSimpleLightbox()
  groupEvents.keydown({ key: 'Enter', target: item, preventDefault () {} })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(constructed, 1)
  assert.equal(instance.options.animationSlide, false)
  assert.equal(instance.options.fadeSpeed, 1)
  assert.equal(instance.options.animationSpeed, 1)
  assert.equal(typeof events['closed.simplelightbox'], 'function')
  motion.change(false)
  assert.equal(instance.options.animationSlide, true)
  assert.equal(instance.options.fadeSpeed, 300)
  motion.change(true)
  assert.equal(constructed, 1)
  assert.equal(instance.options.fadeSpeed, 1)
})

test('the real lightbox fade completes at reduced speed without scheduling another animation frame', async () => {
  let frames = 0
  const context = vm.createContext({ document: {}, requestAnimationFrame: () => frames++ })
  context.window = context
  context.global = context
  context.getComputedStyle = () => ({ getPropertyValue: () => '1' })
  vm.runInContext(await fs.readFile(new URL('../../static/js/simple-lightbox.min.js', import.meta.url), 'utf8'), context)
  const node = { style: { opacity: 1, display: 'block' } }
  let closed = 0
  const instance = Object.create(context.SimpleLightbox.prototype)
  instance.options = { fadeSpeed: 1 }
  context.SimpleLightbox.prototype.fadeOut.call(instance, node, 1, () => closed++)
  assert.equal(closed, 1)
  assert.equal(frames, 0)
  assert.equal(node.style.display, 'none')
})

test('motion-aware initializers remain no-ops when their components are absent', async () => {
  const motion = await preference()
  const context = {
    ...motion,
    document: { querySelectorAll: () => [], addEventListener: () => assert.fail('no component listener expected') },
    waitCSS: fn => fn(),
    scrollShot: () => assert.fail('no observer expected')
  }
  for (const [name, init] of [['counter', 'initCounter'], ['sliders', 'initSliders'], ['scroll-show', 'initScrollShow'], ['scroll-parallax', 'initScrollParallax'], ['simple-lightbox', 'initSimpleLightbox']]) {
    const api = await moduleFixture(name, context, [init])
    api[init]()
    api[init]()
  }
  assert.equal(motion.reads(), 0)
})

async function counterFixture (initial = false) {
  const motion = await preference(initial)
  const element = { textContent: '1.234' }
  const intervals = new Map()
  let id = 0
  let observe
  let observers = 0
  const api = await moduleFixture('counter', {
    ...motion,
    document: { querySelectorAll: () => [element] },
    scrollShot: options => { observe = options.doStart; observers++ },
    setInterval: fn => { intervals.set(++id, fn); return id },
    clearInterval: key => intervals.delete(key)
  }, ['initCounter'])
  api.initCounter()
  api.initCounter()
  return { motion, element, intervals, start: () => observe(element), observers }
}

test('counters starting reduced keep the authored final value without intervals', async () => {
  const f = await counterFixture(true)
  f.start()
  assert.equal(f.element.textContent, '1.234')
  assert.equal(f.intervals.size, 0)
  assert.equal(f.observers, 1)
  f.motion.change(false)
  f.start()
  assert.equal(f.intervals.size, 1)
  for (let frame = 0; frame < 120; frame++) [...f.intervals.values()].forEach(fn => fn())
  assert.equal(f.element.textContent, (1234).toLocaleString('es-ES'))
  assert.equal(f.intervals.size, 0)
})

test('runtime reduction cancels counter intervals and queued callbacks cannot overwrite the final value', async () => {
  const f = await counterFixture()
  f.start()
  const queued = [...f.intervals.values()][0]
  queued()
  assert.notEqual(f.element.textContent, '1.234')
  f.motion.change(true)
  assert.equal(f.intervals.size, 0)
  assert.equal(f.element.textContent, '1.234')
  queued()
  assert.equal(f.element.textContent, '1.234')
  f.start()
  assert.equal(f.intervals.size, 0)
  f.motion.change(false)
  f.start()
  f.start()
  assert.equal(f.intervals.size, 1, 'repeated intersection cannot duplicate intervals')
  queued()
  assert.equal(f.element.textContent, '1.234', 'retired callbacks stay inert after preference restoration')
  for (let frame = 0; frame < 120; frame++) [...f.intervals.values()].forEach(fn => fn())
  assert.equal(f.element.textContent, (1234).toLocaleString('es-ES'), 'normal replay uses its original target')
})


test('finite rapid arrows advance from the pending destination instead of the animation midpoint', async () => {
  const f = await sliderFixture()
  const right = { closest: selector => selector === '.slider__arrow--right' ? right : selector === '.slider' ? f.slider : null }
  const click = () => f.documentEvents.click[0]({ target: right })
  click()
  const first = f.scrolls.at(-1)[0].left
  click()
  const second = f.scrolls.at(-1)[0].left
  click()
  assert.notEqual(first, second)
  assert.equal(f.scrolls.at(-1)[0].left, first)
})


test('finite autoplay yields to held pointers and the momentum quiet period', async () => {
  const f = await sliderFixture()
  f.observers[1]([{ isIntersecting: true }])
  const tick = f.intervals.values().next().value
  const before = f.scrolls.length
  f.trackEvents.pointerdown.forEach(fn => fn())
  tick()
  assert.equal(f.scrolls.length, before)
  f.trackEvents.pointerup.forEach(fn => fn())
  tick()
  assert.equal(f.scrolls.length, before, 'do not restart during the post-gesture quiet period')
})
