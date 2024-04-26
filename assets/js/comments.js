import { disqusId } from '@params'
import { scrollShot } from './scroll-shot'

export function initComments () {
  function loadComments () {
    // Waiting load icon
    // var clock = document.getElementById('disqus_thread').insertAdjacentHTML('beforeend', `<img class="comments__load" style='height:20em;width:100%' src="data:image/svg+xml,%3Csvg%20width='100%'%20height='100%'%20viewBox='0%200%2016%2016'%20xmlns='http://www.w3.org/2000/svg'%3E%3Cstyle%3Epath%7Btransform-origin:center%7Dpath:nth-child%282%29%7Banimation:spin%202s%20linear%20infinite%7Dpath:nth-child%283%29%7Banimation:spin%20calc%282s%20%2A%2012%29%20linear%20infinite%7D%40keyframes%20spin%7Bto%7Btransform:rotate%28360deg%29%7D%7D%3C/style%3E%3Cg%20fill='none'%20stroke='gray'%20stroke-width='1'%20stroke-linecap='round'%20stroke-linejoin='round'%20stroke-miterlimit='10'%3E%3Ccircle%20cx='8'%20cy='8'%20r='7.5'/%3E%3Cpath%20d='M8%203%20V8'/%3E%3Cpath%20d='M8%208%20L10%2010'/%3E%3C/g%3E%3C/svg%3E">`)
    const s1 = document.createElement('script')
    const s2 = document.createElement('script')
    // Load disqus script 1
    s1.src = `https://${disqusId}.disqus.com/count.js`
    s1.id = 'dsq-count-scr'
    document.head.appendChild(s1)
    // Load disqus script 2
    // var disqus_config = function () {
    //   this.page.url = PAGE_URL // Replace PAGE_URL with your page's canonical URL variable
    //   this.page.identifier = PAGE_IDENTIFIER // Replace PAGE_IDENTIFIER with your page's unique identifier variable
    // }
    s2.src = `https://${disqusId}.disqus.com/embed.js`
    s2.setAttribute('data-timestamp', +new Date());
    (document.head || document.body).appendChild(s2)
    // document.querySelector('.comments__load').remove();
  }
  function showComments () {
    document.querySelector('#disqus_thread').classList.add('disqus-show')
  }

  // Lazy-Load show comments
  scrollShot({
    rootMargin: '0%',
    query: '#disqus_thread',
    // () => document.querySelector('.comments__show').remove(),
    doStart: () => {
      loadComments()
      showComments()
    }
  })
}
