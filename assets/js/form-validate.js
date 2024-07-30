import {
  googleAnalyticsId,
  formErrorSingleQuotes,
  formErrorRequiredFields,
  formErrorRequiredCheck,
  formErrorEmail,
  formErrorNumber,
  formErrorFile,
  formErrorAcept,
  formSubmitOk,
  formSubmitWrong
} from '@params'
import { scrollTo } from './scroll-to'

export function initFormValidate () {
  window.addEventListener('load', () => {
    const forms = document.querySelectorAll('.form')
    let formError, formSubmit

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
      e.addEventListener('submit', submit => {
        submit.preventDefault()

        let valid = true
        const form = submit.target
        const closeIcon =
          '<svg class="close" onclick="this.parentElement.remove()">' +
            '<use href="/draws.svg#xmark"></use>' +
          '</svg>'
        formSubmit && formSubmit.remove()
        formError && formError.remove()
        formError = document.createElement('ul')
        formError.classList.add('form__error')
        formError.innerHTML += closeIcon
        form.prepend(formError)

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
          '[type="text"][data-required],' +
          '[type="email"][data-required],' +
          '[type="tel"][data-required],' +
          '[type="number"][data-required],' +
          '[type="date"][data-required],' +
          '[type="time"][data-required],' +
          '[type="file"][data-required],' +
          'textarea[data-required],' +
          'select[data-required]'
        ).forEach(input => {
          if (!input.value) {
            input.style.borderColor = 'red'
            const placeholder = input.placeholder || input.children[0].textContent
            formError.innerHTML += `<li>${formErrorRequiredFields}: <strong>${placeholder.replace(' *', '')}</strong></li>`
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
            formError.innerHTML += `<li>${formErrorRequiredCheck}: <strong>${fieldset.children[0].textContent.replace(' *', '')}</strong></li>`
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

        const accept = form.querySelector('.form__label--accept')
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
          const netlifyForm = action === `/${form.id}`
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
            formSubmit.classList.add('form__submit')
            formSubmit.innerHTML = '<svg class="spin"><use href="/draws.svg#rotate"></use></svg> Enviando…'
            form.append(formSubmit)

            // Response
            function formSubmitSuccess (form) {
              formSubmit.classList.add('form__submit--success')
              formSubmit.innerHTML = `<svg><use href="/draws.svg#circle-check"></use></svg> ${closeIcon} ${formSubmitOk}`
              formSubmited(form)
            }
            function formSubmitError (error) {
              formSubmit.classList.add('form__submit--error')
              formSubmit.innerHTML =
                `<svg><use href="/draws.svg#circle-xmark"></use></svg> ${closeIcon} ${formSubmitWrong}<br>` +
                `<svg><use href="/draws.svg#circle-info"></use></svg> ${error}`
            }
            const formOptions = { method: 'POST' }
            if (isFileType || formSubmitCo) {
              formOptions.timeout = 30000
              formOptions.body = new FormData(form)
            } else {
              formOptions.headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
              formOptions.body = new URLSearchParams(new FormData(form)).toString()
            }
            if (googleForm) formOptions.mode = 'no-cors'
            // Send by AJAX
            fetch(action, formOptions)
              .then(response => {
                if (!response.ok) {
                  throw new Error('HTTP status ' + response.status)
                }
              })
              .then(response => { formSubmitSuccess(form) })
              .catch(error => {
                if (googleForm && error === 'Error: HTTP status 0') {
                  formSubmitSuccess(form)
                } else {
                  formSubmitError(error)
                }
              })
          }
        } else {
          // alert('Completa correctamente los campos requeridos')
          scrollTo(formError)
        }
      })
    })
  })
}
