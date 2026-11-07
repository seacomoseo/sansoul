import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'

const moduleURL = name => new URL(`../../assets/js/${name}.js`, import.meta.url)
async function runModule (name, context, exports) {
  const source = (await fs.readFile(moduleURL(name), 'utf8')).replace(/^import .+\n/gm, '').replace(/^export /gm, '')
  return vm.runInNewContext(source + `\n;({ ${exports.join(', ')} })`, context)
}
function classes (...names) {
  const set = new Set(names)
  return { contains: name => set.has(name), add: name => set.add(name), remove: name => set.delete(name), toggle: (name, force) => force ? set.add(name) : set.delete(name) }
}
function timers () {
  let id = 0
  const tasks = new Map()
  return { setTimeout: fn => { tasks.set(++id, fn); return id }, clearTimeout: key => tasks.delete(key), flush: () => { const queued = [...tasks.values()]; tasks.clear(); queued.forEach(fn => fn()) } }
}

test('Enter enhancement only activates a focused synthetic link once', async () => {
  const listeners = {}
  const api = await runModule('open-links', { document: { addEventListener: (type, fn) => { listeners[type] = fn } } }, ['initOpenLinks'])
  api.initOpenLinks()
  let clicks = 0
  let prevented = 0
  const link = { closest: () => link, matches: () => false, click: () => clicks++ }
  listeners.keydown({ key: 'Enter', target: link, preventDefault: () => prevented++ })
  assert.equal(clicks, 1)
  assert.equal(prevented, 1)
  listeners.keydown({ key: 'Enter', repeat: true, target: link })
  assert.equal(clicks, 1)
  const native = { closest: () => null, click: () => clicks++ }
  listeners.keydown({ key: 'Enter', target: native })
  assert.equal(clicks, 1)
  const child = { closest: () => link }
  listeners.keydown({ key: 'Enter', target: child })
  assert.equal(clicks, 1)
})

test('clicks on a box link are not replayed by the clickable box', async () => {
  const listeners = {}
  const api = await runModule('open-links', { document: { addEventListener: (type, fn) => { listeners[type] = fn } } }, ['initOpenLinks'])
  api.initOpenLinks()
  let clicks = 0
  const link = { click: () => clicks++ }
  const box = { querySelector: () => link }
  const click = interactive => listeners.click({
    button: 0,
    target: { closest: selector => selector === '.box--go' ? box : interactive && selector.startsWith('a,') ? link : null }
  })
  click(true)
  assert.equal(clicks, 0)
  click(false)
  assert.equal(clicks, 1)
})

test('mobile menu keeps disclosure state and restores focus, including rapid reopen', async () => {
  const listeners = {}
  const clock = timers()
  const attrs = new Map([['hidden', 'until-found']])
  let focused = ''
  const button = { setAttribute: (key, value) => attrs.set('button-' + key, value), focus: () => { focused = 'button' } }
  const menu = { removeAttribute: key => attrs.delete(key), setAttribute: (key, value) => attrs.set(key, value), getAttribute: key => attrs.get(key), focus: () => { focused = 'menu' }, contains: element => element === menu }
  const document = { activeElement: menu, documentElement: { clientWidth: 400, classList: classes() }, body: { classList: classes() }, querySelector: selector => ({ '.menu': menu, '.menu__toggle': button })[selector] || null, addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn) } }
  const api = await runModule('menu-toggle', { document, window: { addEventListener: () => {} }, debounce: fn => fn, waitCSS: fn => fn(), ...clock }, ['initMenuToggle'])
  api.initMenuToggle()
  api.initMenuToggle()
  assert.equal(listeners.click.length, 1)
  assert.equal(attrs.get('button-aria-expanded'), 'false')
  const click = { target: { closest: selector => selector === '.menu__toggle' ? button : null } }
  listeners.click[0](click)
  assert.equal(attrs.get('button-aria-expanded'), 'true')
  assert.equal(focused, 'menu')
  listeners.keyup[0]({ key: 'Escape' })
  assert.equal(attrs.get('button-aria-expanded'), 'false')
  assert.equal(focused, 'button')
  listeners.click[0](click)
  clock.flush()
  assert.equal(attrs.has('hidden'), false)
  assert.equal(attrs.get('button-aria-expanded'), 'true')
})

test('FAQ controls preserve aria, scope their accordion and ignore links in answers', async () => {
  const clock = timers()
  function group () {
    const listeners = {}
    const node = { listeners, items: [], contains: () => true, addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn) }, querySelectorAll: selector => selector === '.faq--active' ? node.items.filter(item => item.classList.contains('faq--active')) : node.items }
    for (let i = 0; i < 2; i++) {
      const attrs = new Map([['hidden', 'until-found']])
      const events = {}
      const button = { setAttribute: (key, value) => attrs.set(key, value), closest: selector => selector === '.faq' ? item : button }
      const content = { scrollHeight: 100, style: { setProperty: () => {} }, setAttribute: (key, value) => attrs.set(key, value), removeAttribute: key => attrs.delete(key), addEventListener: (type, fn) => { events[type] = fn } }
      const item = { attrs, button, events, classList: classes(), querySelector: selector => selector === '.faq__md' ? content : button, closest: () => node }
      node.items.push(item)
    }
    return node
  }
  const groups = [group(), group()]
  const api = await runModule('faq', { document: { querySelectorAll: () => groups }, ...clock }, ['initFaq'])
  api.initFaq()
  api.initFaq()
  assert.equal(groups[0].listeners.click.length, 1)
  const press = (groupIndex, itemIndex) => groups[groupIndex].listeners.click[0]({ target: groups[groupIndex].items[itemIndex].button })
  press(0, 0)
  assert.equal(groups[0].items[0].attrs.get('aria-expanded'), 'true')
  press(1, 0)
  assert.equal(groups[0].items[0].classList.contains('faq--active'), true)
  press(0, 1)
  assert.equal(groups[0].items[0].attrs.get('aria-expanded'), 'false')
  assert.equal(groups[0].items[1].attrs.get('aria-expanded'), 'true')
  groups[0].listeners.click[0]({ target: { closest: () => null } })
  assert.equal(groups[0].items[1].attrs.get('aria-expanded'), 'true')
  press(0, 1)
  press(0, 1)
  clock.flush()
  assert.equal(groups[0].items[1].attrs.has('hidden'), false)
  groups[0].items[0].events.beforematch()
  assert.equal(groups[0].items[0].attrs.get('aria-expanded'), 'true')
})

test('modal native Escape restores the opener and stale close timers cannot hide a reopened dialog', async () => {
  const listeners = {}
  const clock = timers()
  let focused = ''
  let closes = 0
  const trigger = { isConnected: true, getClientRects: () => [1], closest: () => null, focus: () => { focused = 'trigger' } }
  const body = {}
  const modal = {
    classList: classes('modal'),
    contains: element => element === modal,
    removeAttribute () {},
    setAttribute () {},
    showModal () { this.open = true },
    close () { this.open = false; closes++ },
    focus () { focused = 'modal'; document.activeElement = modal },
    scrollTo () {}
  }
  const document = {
    body,
    activeElement: trigger,
    documentElement: { classList: classes() },
    querySelector: selector => selector === 'dialog[open].modal' ? (modal.open ? modal : null) : null,
    querySelectorAll: () => [],
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn) }
  }
  const api = await runModule('modals', {
    document,
    window: { addEventListener () {} },
    location: { hash: '', pathname: '/', search: '' },
    history: { replaceState () {} },
    togglePlayer () {},
    ...clock
  }, ['initModals', 'openModal', 'closeModal'])
  api.initModals()
  api.openModal(modal)
  let prevented = false
  listeners.cancel[0]({ target: modal, preventDefault: () => { prevented = true } })
  assert.equal(prevented, true)
  api.closeModal()
  clock.flush()
  assert.equal(closes, 1, 'native cancel and keyup schedule only one close')
  assert.equal(focused, 'trigger')
  document.activeElement = trigger
  api.openModal(modal)
  api.closeModal()
  api.openModal(modal)
  clock.flush()
  assert.equal(closes, 1)
  assert.equal(modal.open, true)
  assert.equal(modal.classList.contains('modal--hide'), false)
  api.closeModal()
  trigger.isConnected = false
  clock.flush()
  assert.equal(focused, 'modal', 'removed openers are not focused')
})

test('fragment IDs with punctuation or invalid percent escapes never become CSS selectors', async () => {
  const found = []
  const target = {}
  const api = await runModule('hash-target', { document: { getElementById: id => { found.push(id); return target } }, location: { hash: '#pid=2' } }, ['hashTarget'])
  assert.equal(api.hashTarget(), target)
  assert.equal(api.hashTarget('#detalle%20demo'), target)
  assert.equal(api.hashTarget('#%invalid'), target)
  assert.equal(api.hashTarget('#a:b[0]'), target)
  assert.equal(api.hashTarget(''), null)
  assert.deepEqual(found, ['pid=2', 'detalle demo', '%invalid', 'a:b[0]'])
})

test('FAQ commits a measured starting height before its first collapse', async () => {
  const clock = timers()
  const order = []
  let click
  const content = {
    scrollHeight: 144,
    get offsetHeight () { order.push('layout'); return 144 },
    style: { setProperty: (name, value) => order.push([name, value]) },
    setAttribute () {}, addEventListener () {}
  }
  const group = { contains: () => true, addEventListener: (_, fn) => { click = fn }, querySelectorAll: () => [item] }
  const button = { setAttribute () {}, closest: () => item }
  const item = {
    querySelector: selector => selector === '.faq__md' ? content : button,
    classList: { contains: () => true, toggle: (_, open) => order.push(['active', open]) }
  }
  const api = await runModule('faq', { document: { querySelectorAll: () => [group] }, ...clock }, ['initFaq'])
  api.initFaq()
  click({ target: { closest: () => button } })
  assert.deepEqual(order, [['--max-height', '144px'], 'layout', ['active', false]])
})
