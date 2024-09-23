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
  document.documentElement.classList.add('modal__active')
  target.scrollTo({ top: 0 })
}

// Close
export function closeModal (changeHash) {
  document.documentElement.classList.remove('modal__active')
  // Remove hash
  if (!changeHash && window.location.hash) {
    if (hasLastSection) {
      window.history.replaceState('', '', hasLastSection)
      hasLastSection = ''
    } else {
      window.history.replaceState('', '', window.location.pathname + window.location.search)
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
  //   window.location.hash = modalPrevNext.id
  // }
  const prevNext = prev ? 'prev' : 'next'
  const modalButtonPrevNext = document.querySelector(`dialog[open].modal .modal__${prevNext}`)
  if (modalButtonPrevNext) modalButtonPrevNext.click()
}

export function initModals () {
  // When load if modal is active
  if (window.location.hash) {
    const hasModal = document.querySelector((window.location.hash.replace(/=+/, '-').substring(0, 155) || 'none') + '.modal')
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
  window.addEventListener('hashchange', e => {
    const windowPosition = window.scrollY
    const hashOld = e.oldURL.split('#')[1]
    const hashNew = e.newURL.split('#')[1]
    const target = document.getElementById(hashNew)
    closeModal(true)
    if (target && target.classList.contains('modal')) {
      // Save the last seccion hash
      if (hashOld) {
        const isHasOld = document.querySelector('#' + hashOld.replace('=', ''))
        if (isHasOld) {
          if (isHasOld.classList.contains('section')) {
            hasLastSection = '#' + hashOld
          // Only need check other hashes not sections and not modals when click, scroll and load
          // } else {
          //   hasLastSection = '#' + hashOld
          }
        }
      }
      openModal(target)
    }
    // Menu close
    document.body.classList.remove('menu__active')
    // Fix scroll in android
    if (target && !target.classList.contains('modal')) {
      setTimeout(() => {
        if (windowPosition === window.scrollY) {
          scrollTo(target)
        }
      }, 300)
    }
  })

  // When click
  document.addEventListener('click', e => {
    const buttonClose = e.target.closest('.modal__close, .modal__close--corner')
    const backover = e.target.classList.contains('modal')
    if (buttonClose || backover) closeModal()
    // Back
    const back = e.target.closest('.modal__back')
    if (back) window.history.back()
  })

  // When keyup escape
  document.addEventListener('keyup', e => e.keyCode === 27 && closeModal())

  // When match in search browser
  if (!('onbeforematch' in document.body)) {
    document.querySelectorAll('.modal').forEach(e => {
      e.onbeforematch = match => window.collapse(match)
    })
  }

  // When keyup left
  document.addEventListener('keyup', e => e.keyCode === 37 && prevNextModal(true))

  // When keyup right
  document.addEventListener('keyup', e => e.keyCode === 39 && prevNextModal(false))
}
