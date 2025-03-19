// google spreadsheets
import { scrollShot } from './scroll-shot'
import { loadScript } from './load-script'

export function initLatex () {
  scrollShot({
    rootMargin: '600px 0%',
    query: '.latex',
    doStart: e => {
      loadScript('https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js')
        .then(() => {
          MathJax = {
            tex: {
              displayMath: [['\\[', '\\]'], ['$$', '$$']],
              inlineMath: [['\\(', '\\)']]
            },
            loader: {
              load: ['ui/safe']
            }
          }
        })
        .catch(console.error)
    }
  })
}
