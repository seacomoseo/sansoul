import {
  formSubmitSending,
  formSubmitOk,
  formSubmitWrong,
  formErrorFileOnload,
  timestamp
} from '@params'
import { formValid } from './form-validate'

const closeIcon =
'<svg class="close" onclick="this.parentElement.remove()">' +
  `<use href="/draws.${timestamp}.svg#xmark"></use>` +
'</svg>'

// Change values pre and post get form data
function changeValuesPrev (form, prev) {
  // Checkboxes
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
  // Phone Prefixes
  const phones = form.querySelectorAll('[type="tel"]')
  phones.forEach(input => {
    if (prev) {
      if (input.value) {
        input.dataset.value = input.value
        input.value = `+${input.nextElementSibling.children[1].value} ${input.value}`
      }
    } else {
      if (input.dataset.value) {
        input.value = input.dataset.value
        input.removeAttribute('data-value')
      }
    }
  })
  // Checkboxes
  const _bcc = form.querySelector('input[name="_bcc"]')
  if (_bcc) {
    if (prev) {
      _bcc.value = atob(_bcc.value)
    } else {
      _bcc.value = btoa(_bcc.value)
    }
  }
}

function formSubmited (form) {
  const customEventSubmit = new CustomEvent('submited-' + form.id)
  document.dispatchEvent(customEventSubmit)
  if (typeof gtag === 'function') {
    // eslint-disable-next-line
    gtag('event', 'contact', {
      id: form.parentElement.closest('[id]').id,
      type: 'form',
      label: form.id
    })
  }
  if (form.dataset.to) {
    window.location.href = atob(form.dataset.to)
  }
}

function formSubmitError (formMessage, message) {
  formMessage.classList.add('form__submit--error')
  formMessage.innerHTML =
    `<svg><use href="/draws.${timestamp}.svg#circle-xmark"></use></svg> ${closeIcon} ${formSubmitWrong}<br>` +
    `<svg><use href="/draws.${timestamp}.svg#circle-info"></use></svg> ${message}`
}

export function initFormSend () {
  window.addEventListener('load', () => {
    const forms = document.querySelectorAll('.form')
    let formMessage

    forms.forEach(e => {
      e.addEventListener('submit', async submit => {
        submit.preventDefault()

        const form = submit.target
        formMessage && formMessage.remove()
        formMessage = document.createElement('div')
        formMessage.innerHTML += closeIcon

        const { valid, message } = formValid(form)

        if (!valid) {
          formMessage.classList.add('form__error')
          formMessage.append(message)
          form.append(formMessage)
        } else {
          changeValuesPrev(form, true)

          const actionEncoded = form.action.replace(window.location.href.split('#')[0], '')
          let action = window.atob(actionEncoded)
          const isFileType = form.querySelector('[type="file"]')
          const netlifyForm = action === `/${form.id}`
          const googleScript = action.includes('script.google.com')
          const formSubmitCo = action.includes('formsubmit.co')
          const formSubmitCoAjax = formSubmitCo && !isFileType
          if (!netlifyForm && !googleScript && !formSubmitCoAjax) {
            if (formSubmitCo) action = action.replace('/ajax', '')
            form.action = action
            // like form.submit()
            const submitFormFunction = Object.getPrototypeOf(form).submit
            submitFormFunction.call(form)
            form.action = actionEncoded
            formSubmited(form)
            changeValuesPrev(form, false)
          } else {
            if (formSubmitCo && !action.includes('/ajax')) action = action.replace('formsubmit.co', 'formsubmit.co/ajax')

            formMessage.classList.add('form__submit')
            formMessage.innerHTML = `<svg class="spin"><use href="/draws.${timestamp}.svg#rotate"></use></svg> ${formSubmitSending}…`
            form.append(formMessage)

            const formOptions = { method: 'POST' }
            if ((!googleScript && isFileType) || formSubmitCo) {
              // Send with files
              formOptions.timeout = 30000
              // formOptions.headers = { Accept: 'application/json' }
              formOptions.body = new FormData(form)
            } else {
              // Send withouth files, except googleScript tath convert to base64
              let formData
              if (googleScript) {
                formData = new FormData()
                const filePromises = []

                // Add all inputs withouth type files
                const formDataAux = new FormData(form)
                for (const [key, value] of formDataAux.entries()) {
                  if (!key.startsWith('📄')) {
                    formData.append(key, value)
                  }
                }

                // Add inputs type files
                form.querySelectorAll('input[type="file"]').forEach(input => {
                  if (input.files.length) {
                    const files = Array.from(input.files)
                    files.forEach(file => {
                      const filePromise = new Promise((resolve, reject) => {
                        // eslint-disable-next-line
                        const reader = new FileReader()
                        // When reading finishes
                        reader.onloadend = () => {
                          // If an error occurred, reader.error will defined
                          if (reader.error) {
                            formSubmitError(formMessage, `${formErrorFileOnload} <strong>${input.dataset.placeholder}</strong>: ${reader.error}`)
                            reject(reader.error)
                          } else {
                            const base64File = reader.result
                            formData.append(input.name, base64File)
                            resolve()
                          }
                        }
                        reader.readAsDataURL(file)
                      })
                      filePromises.push(filePromise)
                    })
                  } else {
                    formData.append(input.name, input.value)
                  }
                })

                await Promise.all(filePromises)
              } else {
                formData = new FormData(form)
              }
              formOptions.headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
              formOptions.body = new URLSearchParams(formData).toString()
            }

            changeValuesPrev(form, false)

            // Send by AJAX
            fetch(action, formOptions)
              .then(response => {
                if (!response.ok) {
                  throw new Error('HTTP status ' + response.status)
                }
                return googleScript ? response.json() : response
              })
              .then(data => {
                if (googleScript && data.result !== 'success') {
                  throw new Error(data.message || 'Unknown error, data: ' + JSON.stringify(data))
                }
                formMessage.classList.add('form__submit--success')
                formMessage.innerHTML = `<svg><use href="/draws.${timestamp}.svg#circle-check"></use></svg> ${closeIcon} ${formSubmitOk}`
                formSubmited(form)
                form.reset()
                // Trigger change event manually (for form-show)
                form.querySelectorAll('input, select, textarea').forEach(input => {
                  input.dispatchEvent(new Event('change', { bubbles: true }))
                })
              })
              .catch(error => {
                formSubmitError(formMessage, error.message)
              })
          }
        }
      })
    })
  })
}
