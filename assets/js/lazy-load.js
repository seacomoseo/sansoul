import { scrollShot } from './scroll-shot'

export function initLazyLoad () {
  // DATA-SRC
  scrollShot({
    rootMargin: '0%',
    query: '[data-src]',
    // doOnLoad: e => e.classList.add('lazyload'),
    doStart: e => {
      if (e.dataset.sizes) e.sizes = e.dataset.sizes; e.removeAttribute('data-sizes')
      if (e.dataset.srcset) e.srcset = e.dataset.srcset; e.removeAttribute('data-srcset')
      e.src = e.dataset.src; e.removeAttribute('data-src')
      // e.classList.remove('lazyload')
    },
    end: true
  })

  // DATA-STYLE
  scrollShot({
    rootMargin: '0% 320px 50%',
    query: '[data-style]',
    doStart: e => { e.style = e.dataset.style },
    // , doEnd: e => e.style = "background-image: url(data:image/svg+xml,%3Csvg viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg'%3E%3Cstyle%3Epath%7Btransform-origin:center%7Dpath:nth-child%282%29%7Banimation:spin 2s linear infinite%7Dpath:nth-child%283%29%7Banimation:spin calc%282s %2A 12%29 linear infinite%7D%40keyframes spin%7Bto%7Btransform:rotate%28360deg%29%7D%7D%3C/style%3E%3Cg fill='none' stroke='gray' stroke-width='1' stroke-linecap='round' stroke-linejoin='round' stroke-miterlimit='10'%3E%3Ccircle cx='8' cy='8' r='7.5'/%3E%3Cpath d='M8 3 V8'/%3E%3Cpath d='M8 8 L10 10'/%3E%3C/g%3E%3C/svg%3E); background-repeat: no-repeat; background-position: center;",
    end: true
  })
}
