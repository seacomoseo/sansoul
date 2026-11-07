import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { hasConsent } from '../../assets/js/consent.js'

test('revoking media consent restores posters and prevents pending SDK initialization; local video is independent', async () => {
  for (const [local, cookiesLegal, provider = 'youtube'] of [[false, true], [true, true], [false, false], [false, false, 'vimeo']]) {
    const values = new Map()
    const events = {}
    const clicks = {}
    let toggled = 0
    let playersCreated = 0
    let releaseAPI
    const api = new Promise(resolve => { releaseAPI = resolve })
    const classes = new Set()
    const attrs = new Set()
    const wrapper = {
      childNodes: [], isConnected: true,
      classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
      setAttribute: name => attrs.add(name), removeAttribute: name => attrs.delete(name),
      replaceChildren (...nodes) { this.childNodes = nodes },
      append (node) { this.childNodes.push(node) },
      querySelector () { return this.childNodes.find(node => node.dataset?.vid) }
    }
    class Media {
      contentWindow = { postMessage () {} }
      listeners = {}
      addEventListener (name, callback) { this.listeners[name] = callback }
      fire (name) { this.listeners[name]?.() }
      constructor (tag, dataset = {}) { this.tagName = tag; this.dataset = dataset; this.className = 'img__in'; this.attrs = new Set(local && tag === 'picture' ? ['data-file'] : []) }
      get isConnected () { return wrapper.childNodes.includes(this) }
      setAttribute (name) { this.attrs.add(name) }
      removeAttribute (name) { this.attrs.delete(name) }
      toggleAttribute (name, value) { value ? this.attrs.add(name) : this.attrs.delete(name) }
      hasAttribute (name) { return this.attrs.has(name) }
      closest (selector) { return selector === '.img' ? wrapper : { id: 'hero' } }
      cloneNode () { return new Media(this.tagName, { ...this.dataset }) }
    }
    const poster = new Media('picture', { vid: local ? '/u/demo.mp4' : provider === 'youtube' ? 'https://www.youtube-nocookie.com/embed/abc?rel=0' : 'https://player.vimeo.com/video/123?rel=0', ...(provider === 'youtube' ? { youtube: '' } : {}), width: 608, height: 1080 })
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
      document, window, cookiesLegal, params: { vid: 'Video', lang: 'es' },
      hasConsent: (type, legal) => hasConsent(type, legal, window.localStorage),
      initVideoDimensions: () => {}, observeVideoDimensions: () => {}, loadScript: () => api,
      location: new URL('https://fixture.example/'), console
    })
    clicks.click({ target: poster })
    if (local) {
      assert.equal(wrapper.childNodes[0], poster, 'poster stays visible until a decoded frame is ready')
      const video = wrapper.childNodes.at(-1)
      assert.equal(video.tagName, 'video')
      assert.ok(classes.has('img--loading'))
      assert.ok(attrs.has('aria-busy'))
      clicks.click({ target: poster })
      assert.equal(wrapper.childNodes.length, 2, 'repeated clicks do not create duplicate players')
      video.fire('error')
      assert.deepEqual(wrapper.childNodes, [poster], 'failure restores a retryable poster')
      assert.equal(classes.has('img--loading'), false)
      clicks.click({ target: poster })
      const retried = wrapper.childNodes.at(-1)
      video.fire('loadeddata')
      assert.equal(wrapper.childNodes[0], poster, 'stale load cannot replace the retried media')
      retried.fire('loadeddata')
      assert.deepEqual(wrapper.childNodes, [retried])
      assert.equal(classes.has('img--loading'), false)
      assert.equal(attrs.has('aria-busy'), false)
      events['cookies:changed']()
      assert.deepEqual(wrapper.childNodes, [retried], 'local playback is independent of media consent')
      assert.equal(toggled, 0)
      continue
    }
    if (!cookiesLegal) {
      const iframe = wrapper.childNodes.at(-1)
      assert.equal(wrapper.childNodes[0], poster, 'remote poster stays visible until iframe load')
      iframe.fire('load')
      assert.equal(classes.has('img--loading'), false)
      assert.equal(toggled, 0)
      assert.equal(iframe.tagName, 'iframe')
      assert.match(iframe.src, /autoplay=1/)
      assert.equal(poster.hasAttribute('not-cookie'), false)
      events['cookies:changed']({ detail: { media: false } })
      assert.equal(wrapper.childNodes[0], iframe, 'revocation leaves unrestricted playback attached')
      assert.equal(toggled, 0)
      const Player = function () { playersCreated++ }
      window.YT = { ready: callback => callback(), Player }
      window.Vimeo = { Player }
      releaseAPI()
      await api
      await Promise.resolve()
      assert.equal(playersCreated, 1, `${provider} initializes without consent`)
      events['cookies:changed']({ detail: { media: false } })
      assert.equal(wrapper.childNodes[0], iframe, 'initialized player survives revocation when enforcement is disabled')
      continue
    }
    assert.equal(toggled, 1)
    assert.equal(wrapper.childNodes[0].tagName, 'picture')
    values.set('controlcookiemedia', '1')
    events['cookies:media']()
    assert.equal(poster.hasAttribute('not-cookie'), false)
    clicks.click({ target: poster })
    assert.equal(wrapper.childNodes[0], poster, 'consent can be revoked while the iframe is pending')
    const pending = wrapper.childNodes.at(-1)
    assert.equal(pending.tagName, 'iframe')
    assert.match(pending.src, /youtube-nocookie/)
    values.delete('controlcookiemedia')
    events['cookies:changed']()
    assert.equal(wrapper.childNodes[0].tagName, 'picture')
    assert.equal(wrapper.childNodes[0].hasAttribute('not-cookie'), true)
    pending.fire('load')
    assert.equal(wrapper.childNodes[0].tagName, 'picture', 'revoked pending iframe cannot replace the restored poster')
    assert.equal(classes.has('img--loading'), false)
    assert.equal(attrs.has('aria-busy'), false)
    releaseAPI()
    await api
    await Promise.resolve()
    // No YT global was provided: entering its callback after revocation fails.
    clicks.click({ target: wrapper.childNodes[0] })
    assert.equal(toggled, 2)
  }
})
