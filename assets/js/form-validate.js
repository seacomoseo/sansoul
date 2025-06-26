import {
  formErrorSingleQuotes,
  formErrorRequiredFields,
  formErrorRequiredCheck,
  formErrorEmail,
  formErrorTel,
  formErrorFileSize,
  formErrorFileSizeTotal,
  formErrorFileLength,
  formErrorAcept
} from '@params'

<<<<<<< HEAD
export function initFormValidate () {
  window.addEventListener('load', () => {
    const forms = document.querySelectorAll('.contact__form')
    const closeIcon =
      '<svg class="close" onclick="this.parentElement.remove()">' +
        '<use xlink:href="/draws.svg#xmark"></use>' +
      '</svg>'
    let formError, formSubmit

    // Change checkbox value and checked pre and post get form data
    function changeCheckbox (form, prev) {
      const checkboxes = form.querySelectorAll('input[type="checkbox"]')
      checkboxes.forEach(checkbox => {
        if (prev) {
          if (!checkbox.checked) {
            checkbox.value = '❌'
            checkbox.checked = true
          }
        } else {
          if (checkbox.value === '❌') {
            checkbox.value = '✅'
            checkbox.checked = false
          }
        }
      })
    }
    // Response
    function formSubmitOk (form) {
      formSubmit.classList.add('contact__form-submit--ok')
      formSubmit.innerHTML = `<svg><use xlink:href="/draws.svg#circle-check"></use></svg> ${closeIcon} ${formSubmitOne}`
      formSubmited(form)
    }
    function formSubmitError (error) {
      formSubmit.classList.add('contact__form-submit--error')
      formSubmit.innerHTML =
        `<svg><use xlink:href="/draws.svg#circle-xmark"></use></svg> ${closeIcon} ${formSubmitOther}<br>` +
        `<svg><use xlink:href="/draws.svg#circle-info"></use></svg> ${error}`
    }
    function formSubmited (form) {
      const customEventSubmit = new CustomEvent('submited_' + form.parentElement.id)
      document.dispatchEvent(customEventSubmit)
      if (googleAnalyticsId) {
        // eslint-disable-next-line
        gtag('event', 'contact_form_submit', {
          event_category: 'contact',
          event_label: 'form',
          value: form.parentElement.id
=======
export function formValid (form) {
  // Vars
  let valid = true
  const message = document.createElement('ul')

  // Functions
  const addMessage = (error, name) => {
    const nameError = name ? `: <strong>${name.replace(' *', '')}</strong>` : ''
    const itemError = `<li>${error}${nameError}</li>`
    message.innerHTML += itemError
    valid = false
  }
  const setItemStyle = (element, error) => {
    const item = element.closest('.form__item')
    if (error) {
      item.classList.add('form__item--error')
    } else {
      item.classList.remove('form__item--error')
    }
  }
  const isInput = (input) => {
    if (input.tagName === 'FIELDSET') {
      return input.querySelector('input:checked')
    } else if (input.type === 'checkbox') {
      return input.checked
    } else if (input.type === 'file') {
      return input.closest('.form__item:has(.form__preview-item)')?.querySelector('input')
    } else {
      return input.value
    }
  }

  // Single Quotes
  form.querySelectorAll(
    '[type="text"],' +
    '[type="email"],' +
    '[type="number"],' +
    '[type="date"],' +
    '[type="time"],' +
    'textarea'
  ).forEach(input => {
    if (input.value.includes("'")) {
      setItemStyle(input, true)
      addMessage(formErrorSingleQuotes, input.placeholder)
    } else {
      setItemStyle(input, false)
    }
  })

  // Required Check and Fields
  form.querySelectorAll('[data-required], [data-requiredif]').forEach(input => {
    let required
    if (input.dataset.required !== undefined) {
      required = true // Data-required fields are always mandatory
    } else if (input.dataset.requiredif) {
      // Split by || to handle OR conditions
      const orGroups = input.dataset.requiredif.split(/\s*\|\|\s*/)
      required = orGroups.some(orGroup => {
        // Divide each OR group by && to handle AND conditions
        const andConditions = orGroup.split(/\s*&&\s*/)
        // All AND conditions must be true
        return andConditions.every(cond => {
          const inputIf = form.querySelector(`[name="${cond}"]`)
          return inputIf && isInput(inputIf)
>>>>>>> 3c1c646474044268b088da6ce391479f7976107c
        })
      })
    }
    // If this is required or references is filled; and this is empty
    if (required && !isInput(input)) {
      let errorMessage, errorName
      if (input.tagName === 'FIELDSET') {
        errorMessage = formErrorRequiredCheck
        errorName = input.children[0].textContent
      } else if (input.classList.contains('form__geo')) {
        errorMessage = formErrorRequiredFields
        errorName = input.name
      } else {
        errorMessage = formErrorRequiredFields
        errorName = (input.placeholder || input.dataset.placeholder || input.children[0].textContent)
      }
      setItemStyle(input, true)
      addMessage(errorMessage, errorName)
    } else {
      setItemStyle(input, false)
    }
  })

  // Email
  form.querySelectorAll('[type="email"]').forEach(input => {
    const emailMatch = input.value.match(/@.*\./)
    if (input.value && !emailMatch) {
      setItemStyle(input, true)
      addMessage(formErrorEmail, input.placeholder)
    } else if (input.value && emailMatch) {
      setItemStyle(input, false)
    }
  })

  // Telephone
  form.querySelectorAll('[type="tel"]').forEach(input => {
    const telMatch = input.value.match(/^\+?[0-9\s-+]{6,20}$/)
    if (input.value && !telMatch) {
      setItemStyle(input, true)
      addMessage(formErrorTel, input.placeholder)
    } else if (input.value && telMatch) {
      setItemStyle(input, false)
    }
  })

  // Min
  // form.querySelectorAll('[type="number"][min]').forEach(input => {
  //   const minMatch = input.value >= input.min
  //   if (input.value && !minMatch) {
  //     setItemStyle(input, true)
  //     addMessage(formErrorMin.replace('{{.}}', input.min), input.placeholder)
  //   } else if (input.value && minMatch) {
  //     setItemStyle(input, false)
  //   }
  // })

  // Max
  // form.querySelectorAll('[type="number"][max]').forEach(input => {
  //   const maxMatch = input.value <= input.max
  //   if (input.value && !maxMatch) {
  //     setItemStyle(input, true)
  //     addMessage(formErrorMax.replace('{{.}}', input.max), input.placeholder)
  //   } else if (input.value && maxMatch) {
  //     setItemStyle(input, false)
  //   }
  // })

  // Size Total for formErrorFileSizeTotal
  let counterTotalSize = 0
  form.querySelectorAll('.form__file [type="file"]').forEach(input => {
    // FileSize
    let tooBig
    input.closest('.form__item').querySelectorAll('.form__preview :is(input, textarea)').forEach(inputPreview => {
      const size = inputPreview.dataset.size
      counterTotalSize += parseInt(size)
      if (size > 3 * 1024 * 1024) {
        // setItemStyle(input, true)
        inputPreview.parentElement.style.setProperty('--text', 'var(--submit-error)')
        tooBig = true
      }
    })
    if (tooBig) {
      addMessage(formErrorFileSize, input.dataset.placeholder)
    }

<<<<<<< HEAD
    forms.forEach(e => {
      e.addEventListener('submit', submit => {
        submit.preventDefault()

        let valid = true
        const form = submit.target
        formSubmit && formSubmit.remove()
        formError && formError.remove()
        formError = document.createElement('ul')
        formError.classList.add('contact__form-error')
        formError.innerHTML += closeIcon
        form.parentElement.prepend(formError)

        form.querySelectorAll(
          '[type="text"],' +
          '[type="email"],' +
          '[type="number"],' +
          '[type="date"],' +
          '[type="time"],' +
          'textarea'
        ).forEach(input => {
          if (input.value.includes("'")) {
            input.style.borderColor = 'red'
            formError.innerHTML += `<li>${formErrorSingleQuotes}: <strong>${input.placeholder.replace(' *', '')}</strong></li>`
            valid = false
          } else {
            input.style = false
          }
        })

        form.querySelectorAll(
          '[type="text"][novalidate],' +
          '[type="email"][novalidate],' +
          '[type="tel"][novalidate],' +
          '[type="number"][novalidate],' +
          '[type="date"][novalidate],' +
          '[type="time"][novalidate],' +
          '[type="file"][novalidate],' +
          'textarea[novalidate],' +
          'select[novalidate]'
        ).forEach(input => {
          if (!input.value) {
            input.style.borderColor = 'red'
            const placeholder = input.placeholder || input.children[0].textContent
            formError.innerHTML += `<li>${formErrorRequiredOne}: <strong>${placeholder.replace(' *', '')}</strong></li>`
            valid = false
          } else {
            input.style = false
          }
        })

        form.querySelectorAll('fieldset[novalidate]').forEach(fieldset => {
          let fieldsetValid
          fieldset.querySelectorAll('input').forEach(input => {
            if (input.checked) fieldsetValid = true
          })
          if (!fieldsetValid) {
            fieldset.style.borderColor = 'red'
            formError.innerHTML += `<li>${formErrorRequired}: <strong>${fieldset.children[0].textContent.replace(' *', '')}</strong></li>`
            valid = false
          } else {
            fieldset.style = false
          }
        })

        form.querySelectorAll('[type="email"]').forEach(input => {
          const emailMatch = input.value.match(/@.*\./)
          if (input.value && !emailMatch) {
            input.style.borderColor = 'red'
            formError.innerHTML += `<li>${formErrorEmail}: <strong>${input.placeholder.replace(' *', '')}</strong></li>`
            valid = false
          } else if (input.value && emailMatch) {
            input.style = false
          }
        })

        form.querySelectorAll('[type="tel"]').forEach(input => {
          const telMatch = input.value.match(/^[0-9]{9,15}$/)
          if (input.value && !telMatch) {
            input.style.borderColor = 'red'
            formError.innerHTML += `<li>${formErrorNumber}: <strong>${input.placeholder.replace(' *', '')}</strong></li>`
            valid = false
          } else if (input.value && telMatch) {
            input.style = false
          }
        })

        form.querySelectorAll('[type="file"]').forEach(input => {
          if (input.files.length > 0) {
            const file = input.files[0]
            if (file.size > 5 * 1024 * 1024) {
              input.style.borderColor = 'red'
              formError.innerHTML += `<li>${formErrorFile}: <strong>${input.placeholder.replace(' *', '')}</strong></li>`
              valid = false
            } else if (input.value && file) {
              input.style = false
            }
          }
        })

        const accept = form.querySelector('.contact__form-label--accept')
        if (!accept) valid = false
        if (!accept.querySelector('[type="checkbox"]').checked) {
          accept.style.color = 'red'
          formError.innerHTML += `<li>${formErrorAcept}</li>`
          valid = false
        } else {
          accept.style = false
        }

        if (valid) {
          formError && formError.remove()
          const actionEncoded = form.action.replace(window.location.href.split('#')[0], '')
          let action = window.atob(actionEncoded)
          const isFileType = form.querySelector('[type="file"]')
          const netlifyForm = action === window.location.pathname
          const googleForm = action.includes('docs.google.com/forms')
          const formSubmitCo = action.includes('formsubmit.co')
          const workersLGTN = action.includes('lagrantribunomada.workers.dev')
          const formSubmitCoAjax = formSubmitCo && !isFileType
          if (!netlifyForm && !googleForm && !formSubmitCoAjax && !workersLGTN) {
            if (formSubmitCo) action = action.replace('/ajax', '')
            form.action = action
            // like form.submit()
            const submitFormFunction = Object.getPrototypeOf(form).submit
            submitFormFunction.call(form)
            form.action = actionEncoded
            formSubmited(form)
          } else {
            if (formSubmitCo && !action.includes('/ajax')) action = action.replace('formsubmit.co', 'formsubmit.co/ajax')
            formSubmit && formSubmit.remove()
            formSubmit = document.createElement('p')
            formSubmit.classList.add('contact__form-submit')
            form.parentElement.append(formSubmit)
            formSubmit.innerHTML = '<svg class="spin"><use xlink:href="/draws.svg#rotate"></use></svg> Enviando…'

            changeCheckbox(form, true)
            const formOptions = { method: 'POST' }
            if (isFileType || formSubmitCo) {
              formOptions.timeout = 30000
              formOptions.body = new FormData(form)
            } else {
              formOptions.headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
              formOptions.body = new URLSearchParams(new FormData(form)).toString()
            }
            if (googleForm) formOptions.mode = 'no-cors'
            changeCheckbox(form, false)

            // Send by AJAX
            fetch(action, formOptions)
              .then(response => {
                if (!response.ok) {
                  throw new Error('HTTP status ' + response.status)
                }
              })
              .then(response => { formSubmitOk(form) })
              .catch(error => {
                if (googleForm && error === 'Error: HTTP status 0') {
                  formSubmitOk(form)
                } else {
                  formSubmitError(error)
                }
              })
          }
        } else {
          // alert('Completa correctamente los campos requeridos')
          scrollTo(formError)
=======
    // File Length
    const fileMax = input.dataset.max
    const inputPreview = input.closest('.form__item').querySelector('.form__preview')
    const children = [...inputPreview.children]
      .filter(child => !child.classList.contains('form__preview-item--error-load') && !child.style[0])
    if (children.length > fileMax) {
      const errorFileLength = formErrorFileLength.replace('{s}', fileMax)
      addMessage(errorFileLength, input.dataset.placeholder)
      children.forEach((child, i) => {
        if (i + 1 > fileMax) {
          child.classList.add('form__preview-item--error')
        } else {
          child.classList.remove('form__preview-item--error')
>>>>>>> 3c1c646474044268b088da6ce391479f7976107c
        }
      })
    } else if (input.value) {
      children.forEach(child => {
        child.classList.remove('form__preview-item--error')
      })
    }
  })

  // FileSizeTotal
  if (counterTotalSize > 4 * 1024 * 1024) {
    addMessage(formErrorFileSizeTotal)
    form.classList.add('form--error-files-total-size')
  } else {
    form.classList.remove('form--error-files-total-size')
  }

  // Acept
  const accept = form.querySelector('.form__option--consent [type="checkbox"]')
  if (!accept || !accept.checked) {
    addMessage(formErrorAcept)
    form.classList.add('form--error-consent')
  } else {
    form.classList.remove('form--error-consent')
  }

  return { valid, message }
}
