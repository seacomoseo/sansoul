import {
  formErrorSingleQuotes,
  formErrorRequiredFields,
  formErrorRequiredCheck,
  formErrorEmail,
  formErrorTel,
  formErrorFile,
  formErrorAcept
} from '@params'

export function formValid (form) {
  let valid = true
  const message = document.createElement('ul')

  form.querySelectorAll(
    '[type="text"],' +
    '[type="email"],' +
    '[type="number"],' +
    '[type="date"],' +
    '[type="time"],' +
    'textarea'
  ).forEach(input => {
    if (input.value.includes("'")) {
      input.style.setProperty('--border', 'red')
      message.innerHTML += `<li>${formErrorSingleQuotes}: <strong>${input.placeholder.replace(' *', '')}</strong></li>`
      valid = false
    } else {
      input.removeAttribute('style')
    }
  })

  function isInput (input) {
    if (input.tagName === 'FIELDSET') {
      return input.querySelector('input:checked')
    } else if (input.type === 'checkbox') {
      return input.checked
    } else {
      return input.value
    }
  }

  form.querySelectorAll('[data-required], [data-requiredif]').forEach(input => {
    let required
    if (!(input.dataset.required === undefined)) {
      required = true
    } else if (input.dataset.requiredif) {
      input.dataset.requiredif.split(/\|\||&&/).forEach(requif => {
        const inputIf = form.querySelector(`[name="${requif}"]`)
        if (isInput(inputIf)) required = true
      })
    }
    const elementToStyle = input.classList.contains('form__geo') ? input.parentElement.children[0] : input
    if (required) {
      if (!isInput(input)) {
        let formErrorMessage, formErrorName
        if (input.tagName === 'FIELDSET') {
          elementToStyle.style.setProperty('--border', 'red')
          formErrorMessage = formErrorRequiredCheck
          formErrorName = input.children[0].textContent.replace(' *', '')
        } else if (input.classList.contains('form__geo')) {
          elementToStyle.style.color = 'red'
          formErrorMessage = formErrorRequiredFields
          formErrorName = elementToStyle.textContent
        } else {
          elementToStyle.style.setProperty('--border', 'red')
          formErrorMessage = formErrorRequiredFields
          formErrorName = (input.placeholder || input.dataset.placeholder || input.children[0].textContent).replace(' *', '')
        }
        message.innerHTML += `<li>${formErrorMessage}: <strong>${formErrorName}</strong></li>`
        valid = false
      } else {
        elementToStyle.removeAttribute('style')
      }
    } else {
      elementToStyle.removeAttribute('style')
    }
  })

  form.querySelectorAll('[type="email"]').forEach(input => {
    const emailMatch = input.value.match(/@.*\./)
    if (input.value && !emailMatch) {
      input.style.setProperty('--border', 'red')
      message.innerHTML += `<li>${formErrorEmail}: <strong>${input.placeholder.replace(' *', '')}</strong></li>`
      valid = false
    } else if (input.value && emailMatch) {
      input.removeAttribute('style')
    }
  })

  form.querySelectorAll('[type="tel"]').forEach(input => {
    const telMatch = input.value.match(/^[0-9\s]{9,15}$/)
    if (input.value && !telMatch) {
      input.style.setProperty('--border', 'red')
      message.innerHTML += `<li>${formErrorTel}: <strong>${input.placeholder.replace(' *', '')}</strong></li>`
      valid = false
    } else if (input.value && telMatch) {
      input.removeAttribute('style')
    }
  })

  // form.querySelectorAll('[type="number"][min]').forEach(input => {
  //   const minMatch = input.value >= input.min
  //   if (input.value && !minMatch) {
  //     input.style.setProperty('--border', 'red')
  //     message.innerHTML += `<li>${formErrorMin.replace('{{.}}', input.min)}: <strong>${input.placeholder.replace(' *', '')}</strong></li>`
  //     valid = false
  //   } else if (input.value && minMatch) {
  //     input.removeAttribute('style')
  //   }
  // })

  // form.querySelectorAll('[type="number"][max]').forEach(input => {
  //   const maxMatch = input.value <= input.max
  //   if (input.value && !maxMatch) {
  //     input.style.setProperty('--border', 'red')
  //     message.innerHTML += `<li>${formErrorMax.replace('{{.}}', input.max)}: <strong>${input.placeholder.replace(' *', '')}</strong></li>`
  //     valid = false
  //   } else if (input.value && maxMatch) {
  //     input.removeAttribute('style')
  //   }
  // })

  form.querySelectorAll('[type="file"]').forEach(input => {
    if (input.files.length > 0) {
      const file = input.files[0]
      if (file.size > 5 * 1024 * 1024) {
        input.style.setProperty('--border', 'red')
        message.innerHTML += `<li>${formErrorFile}: <strong>${input.placeholder.replace(' *', '')}</strong></li>`
        valid = false
      } else if (input.value && file) {
        input.removeAttribute('style')
      }
    }
  })

  const accept = form.querySelector('.form__label--accept')
  if (!accept) valid = false
  if (!accept.querySelector('[type="checkbox"]').checked) {
    accept.style.color = 'red'
    message.innerHTML += `<li>${formErrorAcept}</li>`
    valid = false
  } else {
    accept.removeAttribute('style')
  }

  return { valid, message }
}
