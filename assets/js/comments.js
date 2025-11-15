import { scrollShot } from './scroll-shot'
import params from './params'
const { disqusId } = params

// Flag to ensure Disqus loads only once
let disqusLoaded = false

export function initComments () {
  if (disqusId) {
    const loadComments = () => {
      if (disqusLoaded) return
      disqusLoaded = true
      // Load Disqus scripts only once
      const s1 = document.createElement('script')
      const s2 = document.createElement('script')
      // Load count script
      s1.src = `https://${disqusId}.disqus.com/count.js`
      s1.id = 'dsq-count-scr'
      document.head.appendChild(s1)
      // Load embed script
      s2.src = `https://${disqusId}.disqus.com/embed.js`
      s2.setAttribute('data-timestamp', +new Date());
      (document.head || document.body).appendChild(s2)
    }

    scrollShot({
      rootMargin: '0%',
      query: '#disqus_thread',
      doStart: () => {
        loadComments()
      },
      end: true
    })
  }
}
