import { togglePlayer } from './player'
import { scrollTo } from './scroll-to'
import { hashTarget } from './hash-target'

// MODAL

// Last seccion hash
let hasLastSection = ''
const modalStates = new WeakMap()
let clickedTrigger = null

// Open
function openModal (target) {
  const previous = modalStates.get(target)
  if (previous?.timer) clearTimeout(previous.timer)
  const active = clickedTrigger || document.activeElement
  const trigger = active && !target.contains(active) && active !== document.body ? active : previous?.trigger
  clickedTrigger = null
  modalStates.set(target, { trigger })
  target.classList.remove('modal--hide')
  target.removeAttribute('hidden')
  // setTimeout(() => {
  target.showModal()
  target.focus()
  // }, 10)
  document.documentElement.classList.add('modal__active')
  target.scrollTo({ top: 0 })
  togglePlayer(target, true)
}

// Close
export function closeModal (changeHash) {
  document.documentElement.classList.remove('modal__active')
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
    const state = modalStates.get(modalOpen) || {}
    if (state.timer) return
    togglePlayer(modalOpen, false)
    modalOpen.classList.add('modal--hide')
    state.timer = setTimeout(() => {
      modalOpen.close()
      modalOpen.classList.remove('modal--hide')
      modalOpen.setAttribute('hidden', 'until-found')
      state.timer = null
      const trigger = state.trigger
      if (!changeHash && !document.querySelector('dialog[open].modal') && trigger?.isConnected && trigger.getClientRects().length && !trigger.closest('[hidden], dialog:not([open])')) {
        trigger.focus({ preventScroll: true })
      }
    }, 300)
    modalStates.set(modalOpen, state)
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
  const prevNext = prev ? 'prev' : 'next'
  const modalBtnPrevNext = document.querySelector(`dialog[open].modal .modal__${prevNext}`)
  if (modalBtnPrevNext) modalBtnPrevNext.click()
}

export function initModals () {
  // When load if modal is active
  if (location.hash) {
    const hasModal = hashTarget()
    if (hasModal?.classList.contains('modal')) {
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
    const target = hashTarget(hashNew || '')
    closeModal(true)
    if (target && target.classList.contains('modal')) {
      // Save the last seccion hash
      if (hashOld) {
        const isHasOld = hashTarget(hashOld)
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
    document.documentElement.classList.remove('menu__active')
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
    const link = e.target.closest('a[href]')
    if (link?.hash && document.getElementById(link.hash.slice(1))?.classList.contains('modal')) clickedTrigger = link
    const btnClose = e.target.closest('.modal__close, .modal__close--corner')
    const backover = e.target.classList.contains('modal')
    if (btnClose || backover) closeModal()
    // Back
    // const back = e.target.closest('.modal__back')
    // if (back) history.back()
  })

  // Handle the native dialog cancel before it closes, preserving the animation
  // and the element that opened the dialog for keyboard focus restoration.
  document.addEventListener('cancel', e => {
    if (e.target.classList.contains('modal')) {
      e.preventDefault()
      closeModal()
    }
  }, true)

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
