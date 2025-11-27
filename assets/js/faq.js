const itemContent = item => item.querySelector('.faq__md')
const itemscrollHeight = item => item.style.setProperty('--max-height', item.scrollHeight + 'px')

function hideFaqActive (itemActive) {
  const itemActiveContent = itemContent(itemActive)
  setTimeout(() => itemActiveContent.setAttribute('hidden', 'until-found'), 300)
  setTimeout(() => itemActive.classList.remove('faq--active'), 10)
  itemscrollHeight(itemActiveContent)
}

function showFaqTarget (itemTarget) {
  const itemTargetContent = itemContent(itemTarget)
  itemTargetContent.removeAttribute('hidden')
  itemscrollHeight(itemTargetContent)
  setTimeout(() => itemTarget.classList.add('faq--active'), 10)
}

function faqToggle (itemTarget) {
  const itemActive = document.querySelector('.faq--active')
  if (itemTarget === itemActive) {
    hideFaqActive(itemActive)
  } else {
    showFaqTarget(itemTarget)
    if (itemActive) hideFaqActive(itemActive)
  }
}

export function initFaq () {
  if (document.querySelector('.faq')) {
    document.addEventListener('click', e => {
      const t = e.target.closest('.faq')
      if (t) faqToggle(t)
    })
  }
}
