const itemContent = item => item.querySelector('.accordion__content')
const itemscrollHeight = item => item.style.setProperty('--max-height', item.scrollHeight + 'px')

function hideAccordionActive (itemActive) {
  const itemActiveContent = itemContent(itemActive)
  setTimeout(() => itemActiveContent.setAttribute('hidden', 'until-found'), 300)
  setTimeout(() => itemActive.classList.remove('accordion--active'), 10)
  itemscrollHeight(itemActiveContent)
}

function showAccordionTarget (itemTarget) {
  const itemTargetContent = itemContent(itemTarget)
  itemTargetContent.removeAttribute('hidden')
  itemscrollHeight(itemTargetContent)
  setTimeout(() => itemTarget.classList.add('accordion--active'), 10)
}

function accordionToggle (itemTarget) {
  const itemActive = document.querySelector('.accordion--active')
  console.log(itemTarget)
  console.log(itemActive)

  if (itemTarget === itemActive) {
    hideAccordionActive(itemActive)
  } else {
    showAccordionTarget(itemTarget)
    if (itemActive) hideAccordionActive(itemActive)
  }
}

export function initAccordion () {
  if (document.querySelector('.accordion')) {
    document.addEventListener('click', e => {
      const t = e.target.closest('.accordion')
      if (t) accordionToggle(t)
    })
  }
}
