document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('[data-h],[data-b]').forEach(l => {
    l.addEventListener('keydown', e => e.key === 'Enter' && l.click())
    l.addEventListener('click', e => {
      const t = e.currentTarget
      if (t.dataset.b) {
        window.open(window.atob(t.dataset.b), '_blank')
      } else if (t.dataset.h) {
        window.location.href = window.atob(t.dataset.h)
      }
    })
  })
})
