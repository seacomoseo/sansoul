export function initCollapsible () {
  function collapsible (click) {
    const buttonIconTarget = click.querySelector('.collapsible__button-icon')
    const buttonIconActive = document.querySelector('.collapsible__button-icon--active')
    const collapsibleTarget = click.closest('.collapsible').querySelector('.collapsible__target')
    const collapsibleActive = document.querySelector('.collapsible__target--active')
    // Hide item active
    if (collapsibleActive && collapsibleActive !== collapsibleTarget) {
      setTimeout(() => collapsibleActive.setAttribute('hidden', 'until-found'), 300)
      collapsibleActive.style.maxHeight = null
      collapsibleActive.style.marginTop = null
      collapsibleActive.classList.remove('collapsible__target--active')
    }
    // Disable button active
    if (buttonIconActive) buttonIconActive.classList.remove('collapsible__button-icon--active')
    // Toggle item target
    if (collapsibleTarget.style.maxHeight) {
      setTimeout(() => collapsibleTarget.setAttribute('hidden', 'until-found'), 300)
      collapsibleTarget.style.maxHeight = null
      collapsibleTarget.style.marginTop = null
    } else {
      collapsibleTarget.removeAttribute('hidden')
      const collapsibleTargetHeight = collapsibleTarget.scrollHeight
      collapsibleTarget.style.maxHeight = collapsibleTargetHeight + 'px'
      // Fix the collapsibleTargetHeight in modals
      // setTimeout(() => {
      //   if (collapsibleTargetHeight !== collapsibleTarget.scrollHeight) {
      //     collapsibleTarget.style.maxHeight = 'none'
      //   }
      // }, 1000)
      collapsibleTarget.style.marginTop = '1em'
    }
    // Show item target
    if (collapsibleTarget) collapsibleTarget.classList.add('collapsible__target--active')
    // Enable button active
    if (buttonIconTarget && buttonIconActive !== buttonIconTarget) {
      buttonIconTarget.classList.add('collapsible__button-icon--active')
      // Scroll to self with offset
      // setTimeout( () => scrollTo(buttonIconTarget) , 300 )
    }
  }

  // document.querySelectorAll('.collapsible__button').forEach(e => {
  //   e.addEventListener('click', click => collapsible(click))
  //   if (!('onbeforematch' in document.body)) {
  //     e.onbeforematch = match => {
  //       const collapsibleButton = match.currentTarget.closest('.collapsible').querySelector('.collapsible__button')
  //       collapsible(collapsibleButton)
  //     }
  //   }
  // })
  if (document.querySelector('.collapsible__button')) {
    document.addEventListener('click', e => {
      const t = e.target.closest('.collapsible__button')
      if (t) collapsible(t)
    })
  }

  // if (collapsibleActive) {
  //   collapsibleTarget.removeAttribute('hidden')
  // } else {
  //   collapsibleTarget.setAttribute('hidden', 'until-found')
  // }
}
