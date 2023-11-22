// MODAL

// Last seccion hash
let hasLastSection = ''

// Open
function openModal (target) {
  target.removeAttribute('hidden')
  // setTimeout(() => {
    target.showModal()
    target.focus()
  // }, 10)
  // document.documentElement.classList.add('modal__active')
  target.scrollTo({top: 0})
}

// Close
function closeModal (changeHash) {
  // document.documentElement.classList.remove('modal__active')
  // Remove hash
  if (!changeHash && location.hash) {
    if (hasLastSection) {
      history.replaceState('', '', hasLastSection)
      hasLastSection = ''
    } else {
      history.replaceState('', '', location.pathname + location.search)
    }
  }
  const modalOpen = document.querySelector('dialog[open].modal')
  if (modalOpen) {
    modalOpen.classList.add('modal--hide')
    setTimeout(() => {
      modalOpen.close()
      modalOpen.classList.remove('modal--hide')
      modalOpen.setAttribute('hidden', 'until-found')
    }, 300)
  }
}

// Nav modals
function prevNextModal (prev) {
  // const modalActive = document.querySelector('dialog[open].modal')
  // let modalPrevNext
  // if (prev) {
  //   modalPrevNext = modalActive.previousElementSibling
  // } else {
  //   modalPrevNext = modalActive.nextElementSibling
  // }
  // const isModalPrevNext = modalPrevNext.classList.contains('modal')
  // if (isModalPrevNext) {
  //   closeModal()
  //   openModal(modalPrevNext)
  //   location.hash = modalPrevNext.id
  // }
  let modalButtonPrevNext
  if (prev) {
    modalButtonPrevNext = document.querySelector('dialog[open].modal .modal__prev')
  } else {
    modalButtonPrevNext = document.querySelector('dialog[open].modal .modal__next')
  }
  if (modalButtonPrevNext) modalButtonPrevNext.click()
}

// When load if modal is active
if (location.hash) {
  const hasModal = document.querySelector((location.hash.replace(/=+/, '-').substring(0, 150) || 'none') + '.modal')
  if (hasModal) {
    // Get parent section
    let sectionSibling = hasModal.previousElementSibling
    while (sectionSibling) {
      if (sectionSibling.classList.contains('section')) {
        // Save like last seccion hash for target when close modal
        hasLastSection = '#' + sectionSibling.id
        break
      }
      sectionSibling = sectionSibling.previousElementSibling
    }
    openModal(hasModal)
  }
}

// When hash change
addEventListener('hashchange', e => {
  const windowPosition = scrollY
  const hashOld = e.oldURL.split('#')[1]
  const hashNew = e.newURL.split('#')[1]
  const target  = document.getElementById(hashNew)
  closeModal(true)
  if (target && target.classList.contains('modal')) {
    // Save the last seccion hash
    const isHasOld = document.querySelector('#' + hashOld)
    if (isHasOld) {
      if (isHasOld.classList.contains('section')) {
        hasLastSection = '#' + hashOld
      // Only need check other hashes not sections and not modals when click, scroll and load
      // } else {
      //   hasLastSection = '#' + hashOld
      }
    }
    openModal(target)
  }
  // Menu close
  document.body.classList.remove('menu__active')
  // Fix scroll in android
  if (target && !target.classList.contains('modal')) {
    setTimeout(() => {
      if (windowPosition === scrollY) {
        target.scrollIntoView({ behavior: 'smooth' })
      }
    }, 300)
  }
})

// When click
const elementClickToModalClose = document.querySelectorAll('.modal, .modal__close, .modal__close--corner')
elementClickToModalClose.forEach(e => {
  e.addEventListener('click', click => {
    if (
      click.target.classList.contains('modal') ||
      click.currentTarget.classList.contains('modal__close') ||
      click.currentTarget.classList.contains('modal__close--corner')
    ) {
      closeModal()
    }
  })
})

// When keyup escape
document.addEventListener('keyup', e => e.keyCode === 27 && closeModal())

// When match in search browser
if (!('onbeforematch' in document.body)) {
  document.querySelectorAll('.modal').forEach(e => {
    e.onbeforematch = match => collapse(match)
  })
}

// When keyup left
document.addEventListener('keyup', e => e.keyCode === 37 && prevNextModal(true))

// When keyup right
document.addEventListener('keyup', e => e.keyCode === 39 && prevNextModal(false))

// When click in back
document.querySelectorAll('.modal__back').forEach(e => {
  e.addEventListener('click', click => {
    history.back()
  })
})
