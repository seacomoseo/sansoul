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
