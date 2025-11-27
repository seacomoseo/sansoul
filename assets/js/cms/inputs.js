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
    if (!wrap) return
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

  const scan = root => {
    // Placeholders
    if (root.matches?.(inputsPlaceholderSelector)) {
      injectPlaceholders(root)
    } else {
      root.querySelectorAll?.(inputsPlaceholderSelector)?.forEach(injectPlaceholders)
    }
    // Icons
    if (root.matches?.(inputIconSelector)) {
      injectIconValue(root)
    } else {
      root.querySelectorAll?.(inputIconSelector)?.forEach(injectIconValue)
    }
  }

  // Init
  scan(document.body)

  // set of unique roots (no overlaps)
  const roots = new Set()
  const addRoot = node => {
    if (node.nodeType !== 1) return
    // if already covered by an existing root, do not add
    for (const r of roots) {
      if (r.contains(node)) return
    }
    // if the new node contains existing roots, remove them
    for (const r of Array.from(roots)) {
      if (node.contains(r)) roots.delete(r)
    }
    roots.add(node)
  }

  let timer = null
  const waitMs = 500

  const flush = () => {
    for (const r of roots) scan(r)
    roots.clear()
  }

  // Watch mutations and inject on newly added chunks
  const mo = new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const n of m.addedNodes) addRoot(n)
    }
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      flush()
    }, waitMs)
  })

  mo.observe(document.body, { childList: true, subtree: true })
}
