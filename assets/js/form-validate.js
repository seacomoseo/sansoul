import {
  googleAnalyticsId,
  formErrorSingleQuotes,
  formErrorRequiredFields,
  formErrorRequiredCheck,
  formErrorEmail,
  formErrorTel,
  formErrorFile,
  formErrorAcept,
  formSubmitOk,
  formSubmitWrong
} from '@params'
// import { scrollTo } from './scroll-to'

export function initFormValidate () {
  window.addEventListener('load', () => {
    const forms = document.querySelectorAll('.form')
    const closeIcon =
      '<svg class="close" onclick="this.parentElement.remove()">' +
        '<use href="/draws.svg#xmark"></use>' +
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
    function formSubmitSuccess (form) {
      formSubmit.classList.add('form__submit--success')
      formSubmit.innerHTML = `<svg><use href="/draws.svg#circle-check"></use></svg> ${closeIcon} ${formSubmitOk}`
      formSubmited(form)
      form.reset()
    }
    function formSubmitError (error) {
      formSubmit.classList.add('form__submit--error')
      formSubmit.innerHTML =
        `<svg><use href="/draws.svg#circle-xmark"></use></svg> ${closeIcon} ${formSubmitWrong}<br>` +
        `<svg><use href="/draws.svg#circle-info"></use></svg> ${error}`
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
    }

    forms.forEach(e => {
      e.addEventListener('submit', async submit => {
        submit.preventDefault()

        let valid = true
        const form = submit.target
        formSubmit && formSubmit.remove()
        formError && formError.remove()
        formError = document.createElement('ul')
        formError.classList.add('form__error')
        formError.innerHTML += closeIcon
        form.append(formError)

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
            formError.innerHTML += `<li>${formErrorSingleQuotes}: <strong>${input.placeholder.replace(' *', '')}</strong></li>`
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
              formError.innerHTML += `<li>${formErrorMessage}: <strong>${formErrorName}</strong></li>`
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
            formError.innerHTML += `<li>${formErrorEmail}: <strong>${input.placeholder.replace(' *', '')}</strong></li>`
            valid = false
          } else if (input.value && emailMatch) {
            input.removeAttribute('style')
          }
        })

        form.querySelectorAll('[type="tel"]').forEach(input => {
          const telMatch = input.value.match(/^[0-9\s]{9,15}$/)
          if (input.value && !telMatch) {
            input.style.setProperty('--border', 'red')
            formError.innerHTML += `<li>${formErrorTel}: <strong>${input.placeholder.replace(' *', '')}</strong></li>`
            valid = false
          } else if (input.value && telMatch) {
            input.removeAttribute('style')
          }
        })

        // form.querySelectorAll('[type="number"][min]').forEach(input => {
        //   const minMatch = input.value >= input.min
        //   if (input.value && !minMatch) {
        //     input.style.setProperty('--border', 'red')
        //     formError.innerHTML += `<li>${formErrorMin.replace('{{.}}', input.min)}: <strong>${input.placeholder.replace(' *', '')}</strong></li>`
        //     valid = false
        //   } else if (input.value && minMatch) {
        //     input.removeAttribute('style')
        //   }
        // })

        // form.querySelectorAll('[type="number"][max]').forEach(input => {
        //   const maxMatch = input.value <= input.max
        //   if (input.value && !maxMatch) {
        //     input.style.setProperty('--border', 'red')
        //     formError.innerHTML += `<li>${formErrorMax.replace('{{.}}', input.max)}: <strong>${input.placeholder.replace(' *', '')}</strong></li>`
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
              formError.innerHTML += `<li>${formErrorFile}: <strong>${input.placeholder.replace(' *', '')}</strong></li>`
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
          formError.innerHTML += `<li>${formErrorAcept}</li>`
          valid = false
        } else {
          accept.removeAttribute('style')
        }

        if (valid) {
          formError && formError.remove()

          // Phone Prefixes Prev
          form.querySelectorAll('[type="tel"]').forEach(input => {
            if (input.value) {
              input.value = `+${input.previousElementSibling.children[0].value} ${input.value}`
              input.dataset.value = input.value
            }
          })

          const actionEncoded = form.action.replace(window.location.href.split('#')[0], '')
          let action = window.atob(actionEncoded)
          const isFileType = form.querySelector('[type="file"]')
          const netlifyForm = action === `/${form.id}`
          const googleScript = action.includes('script.google.com')
          const formSubmitCo = action.includes('formsubmit.co')
          const workersLGTN = action.includes('lagrantribunomada.workers.dev')
          const formSubmitCoAjax = formSubmitCo && !isFileType
          if (!netlifyForm && !googleScript && !formSubmitCoAjax && !workersLGTN) {
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
            formSubmit.classList.add('form__submit')
            formSubmit.innerHTML = '<svg class="spin"><use href="/draws.svg#rotate"></use></svg> Enviando…'
            form.append(formSubmit)

            changeCheckbox(form, true)
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
                  }
                })

                await Promise.all(filePromises)
              } else {
                formData = new FormData(form)
              }
              formOptions.headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
              formOptions.body = new URLSearchParams(formData).toString()
            }
            changeCheckbox(form, false)

            // Send by AJAX
            fetch(action, formOptions)
              .then(response => {
                if (!response.ok && !response.result === 'success' && !response.error) {
                  throw new Error('HTTP status ' + (response.status || response.error))
                }
              })
              .then(response => { formSubmitSuccess(form) })
              .catch(error => { formSubmitError(error) })
          }

          // Phone Prefixes Restore
          form.querySelectorAll('[type="tel"]').forEach(input => {
            if (input.dataset.value) {
              input.value = input.dataset.value
              input.removeAttribute('data-value')
            }
          })
        // } else {
        //   scrollTo(formError)
        }
      })
    })
  })
}
