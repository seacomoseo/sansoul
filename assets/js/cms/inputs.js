export function initInputs () {
  // Placeholders
  const inputsPlaceholderSelector = '.field[data-key-path$="view"] ~ .field :is(input, textarea):not([placeholder], [type="checkbox"], [type="radio"], [type="file"])'
  // Icon inputs
  const fieldIconSelector = '.field:is([data-key-path^="icons."], [data-key-path$="icon"], [data-key-path$="pin"])'
  const inputIconSelector = `${fieldIconSelector} div:not([data-icon]) > input`
  const wrapIconSelector = `${fieldIconSelector} div:has(> input)`

  // Placeholders
  // Inject a plain-space placeholder to satisfy :placeholder-shown without affecting layout
  const injectPlaceholders = input => {
    input.setAttribute('placeholder', ' ')
  }
  // Icon inputs
  // Inject a input value in it wrap attribute
  const injectIconValue = (input, wrap) => {
    if (!wrap) wrap = input.closest(wrapIconSelector)
    wrap.dataset.icon = input.value
  }

  // Listeners changes to icon inputs
  const ROOT = document.querySelector('.app-shell') || document
  const eventNames = ['input', 'change']
  eventNames.forEach(eventName => {
    ROOT.addEventListener(eventName, e => {
      const wrap = e.target.closest(wrapIconSelector)
      if (wrap) injectIconValue(e.target, wrap)
    }, true)
  })

  // Watch SPA mutations and inject on newly added chunks
  const mo = new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue
        // Placeholders
        if (node.matches?.(inputsPlaceholderSelector)) {
          injectPlaceholders(node)
        } else {
          const inputs = node.querySelectorAll(inputsPlaceholderSelector)
          if (inputs) inputs.forEach(input => injectPlaceholders(input))
        }
        // Icon inputs
        if (node.matches?.(inputIconSelector)) {
          injectIconValue(node)
        } else {
          const inputs = node.querySelectorAll(inputIconSelector)
          if (inputs) inputs.forEach(input => injectIconValue(input))
        }
      }
    }
  })

  mo.observe(document.body, { childList: true, subtree: true })
}
