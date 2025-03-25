import {
  formSubmitSending,
  formSubmitOk,
  formSubmitWrong,
  timestamp
} from '@params'
import { formValid } from './form-validate'
import { changeValues } from './form-change-values'

const closeIcon =
'<svg class="icon close" onclick="this.parentElement.remove()">' +
  `<use href="/draws.${timestamp}.svg#xmark"></use>` +
'</svg>'

function formSubmited (form) {
  const customEventSubmit = new CustomEvent('submited-' + form.id)
  document.dispatchEvent(customEventSubmit)
  if (typeof gtag === 'function') {
    gtag('event', 'contact', {
      id: form.parentElement.closest('[id]').id,
      type: 'form',
      label: form.id
    })
  }
  if (form.dataset.to) {
    location.href = atob(form.dataset.to)
  }
}

function formSubmitError (formMessage, message) {
  formMessage.classList.add('form__submit--error')
  formMessage.innerHTML =
    `<svg class="icon"><use href="/draws.${timestamp}.svg#circle-xmark"></use></svg> ${closeIcon} ${formSubmitWrong}<br>` +
    `<svg class="icon"><use href="/draws.${timestamp}.svg#circle-info"></use></svg> ${message}`
}

export function initFormSend () {
  window.addEventListener('load', () => {
    const forms = document.querySelectorAll('.form')
    let formMessage

    forms.forEach(e => {
      e.addEventListener('submit', async submit => {
        submit.preventDefault()

        const form = submit.target
        const { valid, message } = formValid(form)
        const now = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid', hour12: false })

        formMessage && formMessage.remove()
        formMessage = document.createElement('div')
        formMessage.innerHTML += closeIcon

        if (!valid) {
          formMessage.classList.add('form__error')
          formMessage.append(message)
          form.append(formMessage)
        } else {
          changeValues({ form, now, prev: true })
          const timestampInput = form.querySelector('.form-timestamp')
          if (timestampInput) timestampInput.value = now

          const actionEncoded = form.getAttribute('action')
          let action = atob(actionEncoded)
          const isFileType = form.querySelector('[type="file"]')
          const netlifyForm = form.dataset.prov === 'ntlf'
          const googleScript = form.dataset.prov === 'gas'
          const formSubmitCo = form.dataset.prov === 'fsc'
          const formSubmitCoAjax = formSubmitCo && !isFileType
          if (!netlifyForm && !googleScript && !formSubmitCoAjax) {
            if (formSubmitCo) action = action.replace('/ajax', '')
            form.action = action
            // like form.submit()
            const submitFormFunction = Object.getPrototypeOf(form).submit
            submitFormFunction.call(form)
            form.action = actionEncoded
            formSubmited(form)
            changeValues({ form, now, prev: false })
          } else {
            if (formSubmitCo && !action.includes('/ajax')) action = action.replace('formsubmit.co', 'formsubmit.co/ajax')

            formMessage.classList.add('form__submit')
            formMessage.innerHTML = `<svg class="icon spin"><use href="/draws.${timestamp}.svg#rotate"></use></svg> ${formSubmitSending}…`
            form.append(formMessage)

            const formOptions = { method: 'POST' }
            if ((!googleScript && isFileType) || formSubmitCo) {
              // Send with files
              formOptions.timeout = 30000
              // formOptions.headers = { Accept: 'application/json' }
              formOptions.body = new FormData(form)
            } else {
              // Send withouth files (googleScript convert to base64)
              const formData = new FormData(form)
              formOptions.headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
              formOptions.body = new URLSearchParams(formData).toString()
            }

            changeValues({ form, now, prev: false })

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
                formMessage.innerHTML = `<svg class="icon"><use href="/draws.${timestamp}.svg#circle-check"></use></svg> ${closeIcon} ${formSubmitOk}`
                formSubmited(form)
                // Reset
                form.reset()
                // Remove previews
                form.querySelectorAll('.form__preview').forEach(e => { e.innerHTML = '' })
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
