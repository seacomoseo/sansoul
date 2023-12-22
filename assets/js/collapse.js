function collapse (click) {
  const buttonIconTarget = click.currentTarget.querySelector('.collapse__button-icon')
  const buttonIconActive = document.querySelector('.collapse__button-icon--active')
  const collapseTarget = click.currentTarget.closest('.collapse__item').querySelector('.collapse__target')
  const collapseActive = document.querySelector('.collapse__target--active')
  // Hide item active
  if (collapseActive && collapseActive !== collapseTarget) {
    setTimeout(() => collapseActive.setAttribute('hidden', 'until-found'), 300)
    collapseActive.style.maxHeight = null
    collapseActive.style.marginTop = null
    collapseActive.classList.remove('collapse__target--active')
  }
  // Disable button active
  if (buttonIconActive) buttonIconActive.classList.remove('collapse__button-icon--active')
  // Toggle item target
  if (collapseTarget.style.maxHeight) {
    setTimeout(() => collapseTarget.setAttribute('hidden', 'until-found'), 300)
    collapseTarget.style.maxHeight = null
    collapseTarget.style.marginTop = null
  } else {
    collapseTarget.removeAttribute('hidden')
    const collapseTargetHeight = collapseTarget.scrollHeight
    collapseTarget.style.maxHeight = collapseTargetHeight + 'px'
    // Fix the collapseTargetHeight in modals
    // setTimeout(() => {
    //   if (collapseTargetHeight !== collapseTarget.scrollHeight) {
    //     collapseTarget.style.maxHeight = 'none'
    //   }
    // }, 1000)
    collapseTarget.style.marginTop = '1em'
  }
  // Show item target
  if (collapseTarget) collapseTarget.classList.add('collapse__target--active')
  // Enable button active
  if (buttonIconTarget && buttonIconActive !== buttonIconTarget) {
    buttonIconTarget.classList.add('collapse__button-icon--active')
    // Scroll to self with offset
    // setTimeout( () => scrollTo(buttonIconTarget) , 300 )
  }
}

document.querySelectorAll('.collapse__button').forEach(e => {
  e.addEventListener('click', click => collapse(click))
  if (!('onbeforematch' in document.body)) {
    e.onbeforematch = match => {
      const collapseButton = match.currentTarget.closest('.collapse__item').querySelector('.collapse__button')
      collapse(collapseButton)
    }
  }
})

// if (collapseActive) {
//   collapseTarget.removeAttribute('hidden')
// } else {
//   collapseTarget.setAttribute('hidden', 'until-found')
// }
