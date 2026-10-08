import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

function setup (kind) {
  const listeners = {}
  let clicks = 0
  const control = {
    closest: () => control,
    matches: selector => selector.includes('a[href]') ? kind === 'native' : selector.includes('[data-h]') ? kind === 'link' : kind === 'button',
    click: () => { clicks++ }
  }
  const document = { activeElement: control, addEventListener: (name, listener) => { listeners[name] = listener } }
  const source = fs.readFileSync(new URL('../../../assets/js/open-links.js', import.meta.url), 'utf8').replace(/^import .*\n/, '').replace('export function', 'function')
  vm.runInNewContext(source + '\ninitOpenLinks()', { document })
  const send = (key, extra = {}) => {
    const event = { key, target: control, preventDefault () { this.defaultPrevented = true }, ...extra }
    listeners.keydown(event)
    return event
  }
  return { send, clicks: () => clicks }
}

test('native controls retain native Enter activation without a synthetic click', () => {
  const state = setup('native')
  assert.equal(state.send('Enter').defaultPrevented, undefined)
  assert.equal(state.clicks(), 0)
})

test('custom links activate once with Enter but not Space', () => {
  const state = setup('link')
  assert.equal(state.send('Enter').defaultPrevented, true)
  state.send(' ')
  assert.equal(state.clicks(), 1)
})

test('custom buttons implement Enter and Space', () => {
  const state = setup('button')
  assert.equal(state.send('Enter').defaultPrevented, true)
  assert.equal(state.send(' ').defaultPrevented, true)
  assert.equal(state.clicks(), 2)
})

test('custom activation respects cancellation, composition, repeat and modifiers', () => {
  const state = setup('link')
  for (const property of ['defaultPrevented', 'isComposing', 'repeat', 'altKey', 'ctrlKey', 'metaKey', 'shiftKey']) state.send('Enter', { [property]: true })
  assert.equal(state.clicks(), 0)
})
