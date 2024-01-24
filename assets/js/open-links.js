import { scrollTo } from './scroll-to.js'

export function initOpenLinks () {
  function openLink (url) {
    const isHash = url.includes('#')
    if (isHash) {
      const path = url.split('#')[0]
      const isCurrentPage = path === window.location.pathname || !path
      if (isCurrentPage) {
        const hash = url.split('#')[1]
        const target = document.getElementById(hash)
        if (!target.classList.contains('modal')) {
          scrollTo(target)
        }
        window.location.hash = hash
      } else {
        window.location.href = url
      }
    } else {
      window.location.href = url
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    // NORMAL LINKS
    const links = document.querySelectorAll('[href*="#"]')
    links.forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault()
        const url = link.getAttribute('href')
        openLink(url)
      })
    })

    // OFUSCATE LINKS
    document.querySelectorAll('[data-h],[data-b]').forEach(l => {
      l.addEventListener('keydown', e => e.key === 'Enter' && l.click())
      l.addEventListener('click', e => {
        const t = e.currentTarget
        if (t.dataset.b) {
          window.open(window.atob(t.dataset.b), '_blank')
        } else if (t.dataset.h) {
          const url = window.atob(t.dataset.h)
          openLink(url)
        }
      })
    })
  })
}
