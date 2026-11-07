import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'

async function fixture () {
  const timers = []
  const fades = []
  const writes = []
  const calls = []
  const context = vm.createContext({
    Event: class {},
    setTimeout: callback => { timers.push(callback) }
  })
  context.window = context
  context.global = context
  vm.runInContext(await fs.readFile(new URL('../../static/js/simple-lightbox.min.js', import.meta.url), 'utf8'), context)
  const item = source => ({ dispatchEvent () {}, getAttribute: () => source })
  const image = name => ({ setAttribute: (key, value) => writes.push([name, key, value]) })
  const currentImage = image('original')
  const lightbox = {
    options: { animationSlide: false, loop: true, preloading: true, sourceAttr: 'data-lightbox' },
    relatedElements: [item('first.jpg'), item('second.jpg')],
    currentImageIndex: 0,
    currentImage,
    isAnimating: false,
    isClosing: false,
    isOpen: true,
    loadedImages: [],
    domNodes: { counter: { querySelector: () => ({}) }, image: { contains: () => false } },
    fadeOut: (node, speed, callback) => fades.push(callback),
    show: () => calls.push('show'),
    adjustImage: direction => calls.push(['adjust', direction]),
    preload: () => calls.push('preload')
  }
  return {
    lightbox, timers, fades, writes, calls, image,
    next: () => context.SimpleLightbox.prototype.loadImage.call(lightbox, 1),
    close: () => { lightbox.isOpen = false; lightbox.isClosing = true; lightbox.currentImage = null; lightbox.isAnimating = false }
  }
}

test('lightbox ignores a navigation fade callback after closing', async () => {
  const f = await fixture()
  f.next()
  f.close()
  assert.doesNotThrow(() => f.fades.shift()())
  f.timers.splice(0).forEach(callback => callback())
  assert.deepEqual(f.writes, [])
  assert.deepEqual(f.calls, [])
  assert.equal(f.lightbox.isAnimating, false)
})

test('lightbox ignores queued navigation after closing during its delay', async () => {
  const f = await fixture()
  f.next()
  f.fades.shift()()
  assert.equal(f.timers.length, 1)
  f.close()
  assert.doesNotThrow(() => f.timers.shift()())
  assert.deepEqual(f.writes, [])
  assert.deepEqual(f.calls, [])
})

for (const phase of ['fade', 'timer']) {
  test(`lightbox ignores an old ${phase} callback after reopening with another image`, async () => {
    const f = await fixture()
    f.next()
    if (phase === 'timer') f.fades.shift()()
    f.close()
    const reopened = f.image('reopened')
    f.lightbox.currentImage = reopened
    f.lightbox.isOpen = true
    f.lightbox.isClosing = false
    if (phase === 'fade') f.fades.shift()()
    f.timers.splice(0).forEach(callback => callback())
    assert.equal(f.lightbox.currentImage, reopened)
    assert.equal(f.lightbox.isAnimating, false)
    assert.deepEqual(f.writes, [])
    assert.deepEqual(f.calls, [])
  })
}

test('lightbox navigation still loads and adjusts the next image while open', async () => {
  const f = await fixture()
  f.next()
  assert.equal(f.lightbox.currentImageIndex, 1)
  f.fades.shift()()
  assert.equal(f.timers.length, 1)
  f.timers.shift()()
  assert.deepEqual(f.writes, [['original', 'src', 'second.jpg']])
  assert.deepEqual(f.calls, ['show', ['adjust', 1], 'preload'])
})

test('Escape bypasses the navigation throttle', async () => {
  const timers = []
  const context = vm.createContext({ setTimeout: callback => timers.push(callback) })
  context.window = context
  context.global = context
  vm.runInContext(await fs.readFile(new URL('../../static/js/simple-lightbox.min.js', import.meta.url), 'utf8'), context)
  const keys = []
  const handler = context.SimpleLightbox.prototype.throttle.call({}, event => keys.push(event.key), 500)
  handler({ key: 'ArrowRight' })
  handler({ key: 'ArrowRight' })
  handler({ key: 'Escape' })
  assert.deepEqual(keys, ['ArrowRight', 'Escape'])
})

test('lightbox ignores image load and error callbacks from a closed or replaced image', async () => {
  const listeners = {}
  const context = vm.createContext({
    Image: class {
      setAttribute () {}
      addEventListener (name, handler) { listeners[name] = handler }
    }
  })
  context.window = context
  context.global = context
  context.innerWidth = 1000
  context.innerHeight = 800
  vm.runInContext(await fs.readFile(new URL('../../static/js/simple-lightbox.min.js', import.meta.url), 'utf8'), context)
  const image = { dataset: {}, getAttribute: () => 'one.jpg' }
  const lightbox = { currentImage: image, options: {}, zoomPanElement () {} }
  context.SimpleLightbox.prototype.adjustImage.call(lightbox)
  lightbox.currentImage = null
  assert.doesNotThrow(() => listeners.load({}))
  assert.doesNotThrow(() => listeners.error({}))
  lightbox.currentImage = { ...image }
  assert.doesNotThrow(() => listeners.load({}))
  assert.doesNotThrow(() => listeners.error({}))
})

test('lightbox can close before its initial image has loaded', async () => {
  const events = []
  const context = vm.createContext({ Event: class { constructor (type) { this.type = type } }, document: { querySelectorAll: () => [] } })
  context.window = context
  context.global = context
  vm.runInContext(await fs.readFile(new URL('../../static/js/simple-lightbox.min.js', import.meta.url), 'utf8'), context)
  const lightbox = {
    isOpen: false,
    isAnimating: false,
    isClosing: false,
    currentImage: {},
    currentImageIndex: 0,
    relatedElements: [{ dispatchEvent: event => events.push(event.type) }],
    eventNamespace: 'simplelightbox',
    options: {},
    domNodes: {},
    controlCoordinates: {},
    removeEventListener () {},
    fadeOut () {},
    minMax: () => 1
  }
  assert.doesNotThrow(() => context.SimpleLightbox.prototype.close.call(lightbox))
  assert.deepEqual(events, ['close.simplelightbox'])
  assert.equal(lightbox.currentImage, null)
  assert.equal(lightbox.isClosing, true)
})

test('gallery configuration accepts SVG/AVIF and query suffixes in the real vendor filter', async () => {
  let options
  const group = { addEventListener () {} }
  const item = { closest: () => group }
  const context = vm.createContext({
    document: { querySelectorAll: () => [item] },
    loadScript: () => Promise.resolve(), onMotionChange () {}, closeModal () {},
    IntersectionObserver: class { constructor (fn) { this.fn = fn } observe () { this.fn([{ isIntersecting: true }]) } disconnect () {} },
    SimpleLightbox: class { constructor (_, config) { options = config; this.options = {} } on () {} }
  })
  const source = (await fs.readFile(new URL('../../assets/js/simple-lightbox.js', import.meta.url), 'utf8')).replace(/^import .*\n/gm, '').replace('export function', 'function')
  vm.runInContext(source + '\ninitSimpleLightbox()', context)
  await new Promise(resolve => setImmediate(resolve))
  context.window = context
  context.global = context
  vm.runInContext(await fs.readFile(new URL('../../static/js/simple-lightbox.min.js', import.meta.url), 'utf8'), context)
  for (const url of ['/poster.png', '/icon.jpg', '/poster.svg', '/photo.avif', '/photo.WEBP?width=600#preview']) {
    assert.equal(context.SimpleLightbox.prototype.isValidLink.call({ options }, { getAttribute: () => url }), true, url)
  }
  assert.equal(context.SimpleLightbox.prototype.isValidLink.call({ options }, { getAttribute: () => '/document.pdf' }), false)
})
