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
