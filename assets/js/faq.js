const pending = new WeakMap()
const initialized = new WeakSet()
const itemContent = item => item.querySelector('.faq__md')
const itemButton = item => item.querySelector('button[aria-controls]')

function setOpen (item, open) {
  clearTimeout(pending.get(item))
  const content = itemContent(item)
  if (!content) return
  itemButton(item)?.setAttribute('aria-expanded', String(open))
  if (open) content.removeAttribute('hidden')
  content.style.setProperty('--max-height', content.scrollHeight + 'px')
  item.classList.toggle('faq--active', open)
  if (!open) pending.set(item, setTimeout(() => content.setAttribute('hidden', 'until-found'), 300))
}

function toggle (item) {
  const open = !item.classList.contains('faq--active')
  if (open) {
    item.closest('.faqs')?.querySelectorAll('.faq--active').forEach(active => {
      if (active !== item) setOpen(active, false)
    })
  }
  setOpen(item, open)
}

export function initFaq () {
  document.querySelectorAll('.faqs').forEach(group => {
    if (initialized.has(group)) return
    initialized.add(group)
    group.addEventListener('click', event => {
      // Native buttons provide Enter/Space activation. Answer links do not toggle.
      const control = event.target.closest('.faq__btn, .faq__btn-dot, .faqs--headers .faq__title')
      if (!control || !group.contains(control)) return
      const item = control.closest('.faq')
      if (item) toggle(item)
    })
    group.querySelectorAll('.faq').forEach(item => {
      const content = itemContent(item)
      content?.addEventListener('beforematch', () => {
        setOpen(item, true)
      })
    })
  })
}
