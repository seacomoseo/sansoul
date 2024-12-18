const itemContent = item => item.querySelector('.collapsible__content')
const itemscrollHeight = item => item.style.setProperty('--max-height', item.scrollHeight + 'px')

function hideCollapsibleActive (itemActive) {
  const itemActiveContent = itemContent(itemActive)
  setTimeout(() => itemActiveContent.setAttribute('hidden', 'until-found'), 300)
  setTimeout(() => itemActive.classList.remove('collapsible--active'), 10)
  itemscrollHeight(itemActiveContent)
}

function showCollapsibleTarget (itemTarget) {
  const itemTargetContent = itemContent(itemTarget)
  itemTargetContent.removeAttribute('hidden')
  itemscrollHeight(itemTargetContent)
  setTimeout(() => itemTarget.classList.add('collapsible--active'), 10)
}

function collapsibleToggle (itemTarget) {
  const itemActive = document.querySelector('.collapsible--active')
  console.log(itemTarget)
  console.log(itemActive)

  if (itemTarget === itemActive) {
    hideCollapsibleActive(itemActive)
  } else {
    showCollapsibleTarget(itemTarget)
    if (itemActive) hideCollapsibleActive(itemActive)
  }
}

export function initCollapsible () {
  if (document.querySelector('.collapsible')) {
    document.addEventListener('click', e => {
      const t = e.target.closest('.collapsible')
      if (t) collapsibleToggle(t)
    })
  }
}
