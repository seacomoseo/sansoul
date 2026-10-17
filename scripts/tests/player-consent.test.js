import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { hasConsent } from '../../assets/js/consent.js'

test('revoking media consent restores posters and prevents pending SDK initialization; local video is independent', async () => {
  for (const local of [false, true]) {
    const values = new Map()
    const events = {}
    const clicks = {}
    let toggled = 0
    let releaseAPI
    const api = new Promise(resolve => { releaseAPI = resolve })
    const wrapper = { childNodes: [], isConnected: true, replaceChildren (...nodes) { this.childNodes = nodes }, querySelector () { return this.childNodes.find(node => node.dataset?.vid) } }
    class Media {
      contentWindow = { postMessage () {} }
      constructor (tag, dataset = {}) { this.tagName = tag; this.dataset = dataset; this.className = 'img__in'; this.attrs = new Set(local && tag === 'picture' ? ['data-file'] : []) }
      get isConnected () { return wrapper.childNodes.includes(this) }
      setAttribute (name) { this.attrs.add(name) }
      removeAttribute (name) { this.attrs.delete(name) }
      toggleAttribute (name, value) { value ? this.attrs.add(name) : this.attrs.delete(name) }
      hasAttribute (name) { return this.attrs.has(name) }
      closest (selector) { return selector === '.img' ? wrapper : { id: 'hero' } }
      cloneNode () { return new Media(this.tagName, { ...this.dataset }) }
    }
    const poster = new Media('picture', { vid: local ? '/u/demo.mp4' : 'https://www.youtube-nocookie.com/embed/abc?rel=0', youtube: '', width: 608, height: 1080 })
    wrapper.childNodes = [poster]
    const window = { localStorage: { getItem: key => values.get(key) }, addEventListener: (name, callback) => { events[name] = callback } }
    const document = {
      querySelectorAll: () => wrapper.childNodes.filter(node => node.dataset?.vid),
      querySelector: () => ({ click: () => toggled++ }),
      addEventListener: (name, callback) => { clicks[name] = callback },
      createElement: tag => new Media(tag)
    }
    const source = fs.readFileSync(new URL('../../assets/js/player.js', import.meta.url), 'utf8').replace(/^import .+\n/gm, '').replace(/^export /gm, '')
    vm.runInNewContext(source + '\ninitPlayer(); initPlayer();', {
      document, window, cookiesLegal: true, params: { vid: 'Video', lang: 'es' },
      hasConsent: (type, legal) => hasConsent(type, legal, window.localStorage),
      initVideoDimensions: () => {}, observeVideoDimensions: () => {}, loadScript: () => api,
      location: new URL('https://fixture.example/'), console
    })
    clicks.click({ target: poster })
    if (local) {
      assert.equal(wrapper.childNodes[0].tagName, 'video')
      assert.equal(toggled, 0)
      continue
    }
    assert.equal(toggled, 1)
    assert.equal(wrapper.childNodes[0].tagName, 'picture')
    values.set('controlcookiemedia', '1')
    events['cookies:media']()
    assert.equal(poster.hasAttribute('not-cookie'), false)
    clicks.click({ target: poster })
    assert.equal(wrapper.childNodes[0].tagName, 'iframe')
    assert.match(wrapper.childNodes[0].src, /youtube-nocookie/)
    values.delete('controlcookiemedia')
    events['cookies:changed']()
    assert.equal(wrapper.childNodes[0].tagName, 'picture')
    assert.equal(wrapper.childNodes[0].hasAttribute('not-cookie'), true)
    releaseAPI()
    await api
    await Promise.resolve()
    // No YT global was provided: entering its callback after revocation fails.
    clicks.click({ target: wrapper.childNodes[0] })
    assert.equal(toggled, 2)
  }
})
