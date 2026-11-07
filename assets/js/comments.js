import { initMediaConsent } from './media-consent'
import { loadScript } from './load-script'
import params from './params'
const { disqusId } = params
const activeThreads = new Set()
let watchingFrames = false

function removeInactiveDisqusFrames () {
  document.querySelectorAll('iframe[src]').forEach(frame => {
    try {
      const hostname = new URL(frame.src, document.baseURI).hostname
      if (hostname !== 'disqus.com' && !hostname.endsWith('.disqus.com')) return
      const owner = frame.closest('[data-disqus-thread]')
      if (owner ? !activeThreads.has(owner) : !activeThreads.size) frame.remove()
    } catch {}
  })
}

export function initComments () {
  if (!disqusId) return
  initMediaConsent({
    query: '#disqus_thread, [data-disqus-thread]',
    start: async (thread, isCurrent, onCleanup) => {
      if (!watchingFrames) {
        watchingFrames = true
        // One document guard checks live ownership without retaining old threads.
        // Already requested scripts can still write frames after revocation.
        new MutationObserver(removeInactiveDisqusFrames).observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['src']
        })
      }
      activeThreads.add(thread)
      thread.dataset.disqusThread = ''
      thread.id = 'disqus_thread'
      const dispose = () => {
        activeThreads.delete(thread)
        thread.removeAttribute('id')
        thread.replaceChildren()
        removeInactiveDisqusFrames()
      }
      onCleanup(dispose)
      const reset = typeof window.DISQUS?.reset === 'function'
      const countUrl = `https://${disqusId}.disqus.com/count.js`
      const counts = loadScript(countUrl)
      document.querySelector(`script[src="${countUrl}"]`)?.setAttribute('id', 'dsq-count-scr')
      await Promise.all([
        counts,
        reset ? Promise.resolve() : loadScript(`https://${disqusId}.disqus.com/embed.js`)
      ])
      if (!isCurrent()) return
      if (reset) {
        window.DISQUS.reset({
          reload: true,
          config: function () {
            this.page.url = window.location.href.split('#')[0]
          }
        })
      }
      return dispose
    }
  })
}
