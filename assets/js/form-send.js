import {
  googleAnalyticsId,
  formSubmitSending,
  formSubmitOk,
  formSubmitWrong,
  timestamp
} from '@params'
import { formValid } from './form-validate'

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
        input.value = `+${input.previousElementSibling.children[1].value} ${input.value}`
      }
    } else {
      if (input.dataset.value) {
        input.value = input.dataset.value
        input.removeAttribute('data-value')
      }
    }
  })
}

function formSubmited (form) {
  const customEventSubmit = new CustomEvent('submited-' + form.id)
  document.dispatchEvent(customEventSubmit)
  if (googleAnalyticsId) {
    // eslint-disable-next-line
    gtag('event', 'contact_form_submit', {
      event_category: 'contact',
      event_label: 'form',
      value: form.id
    })
  }
  if (form.dataset.to) {
    window.location.href = atob(form.dataset.to)
  }
}

export function initFormSend () {
  window.addEventListener('load', () => {
    const forms = document.querySelectorAll('.form')
    const closeIcon =
      '<svg class="close" onclick="this.parentElement.remove()">' +
        `<use href="/draws.${timestamp}.svg#xmark"></use>` +
      '</svg>'
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
                      const filePromise = new Promise(resolve => {
                        // eslint-disable-next-line
                        const reader = new FileReader()
                        reader.onloadend = () => {
                          const base64File = reader.result // .split(',')[1]
                          formData.append(input.name, base64File)
                          resolve()
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
              })
              .catch(error => {
                formMessage.classList.add('form__submit--error')
                formMessage.innerHTML =
                  `<svg><use href="/draws.${timestamp}.svg#circle-xmark"></use></svg> ${closeIcon} ${formSubmitWrong}<br>` +
                  `<svg><use href="/draws.${timestamp}.svg#circle-info"></use></svg> ${error.message}`
                changeValuesPrev(form, false)
              })
          }
        }
      })
    })
  })
}
