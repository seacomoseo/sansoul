import { formValid } from './form-validate'
import { changeValues } from './form-change-values'
import { waitCSS } from './wait-css'
import params from './params'
const {
  formSubmitSending,
  formSubmitOk,
  formSubmitWrong
} = params

const closeIcon = '<i class="icon close" onclick="this.parentElement.remove()">close</i>'

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
    `<i class="icon">close</i> ${closeIcon} ${formSubmitWrong}<br>` +
    `<i class="icon">info</i> ${message}`
}

export function initFormSend () {
  waitCSS(() => {
    const forms = document.querySelectorAll('.form')
    let formMessage

    forms.forEach(e => {
      e.addEventListener('submit', async submit => {
        submit.preventDefault()

        const form = submit.target
        const { valid, message } = formValid(form)
        const now = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid', hour12: false })

        // Fix repeat sending
        if (form.dataset.sending === 'true') return

        // Delete any previous messages from the form itself
        form.querySelectorAll('.form__error, .form__submit').forEach(n => n.remove())

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
          const googleScript = form.dataset.prov === 'gas'
          const formSubmitCo = form.dataset.prov === 'fsc'
          const formSubmitCoAjax = formSubmitCo && !isFileType
          if (!googleScript && !formSubmitCoAjax) {
            if (formSubmitCo) action = action.replace('/ajax', '')
            form.action = action
            // like form.submit()
            const submitFormFunction = Object.getPrototypeOf(form).submit
            submitFormFunction.call(form)
            form.action = actionEncoded
            formSubmited(form)
            changeValues({ form, now, prev: false })
          } else {
            // Fix double clicks
            const submitBtn = form.querySelector('button[type="submit"]')
            submitBtn.disabled = true
            // Fix repeat sending
            form.dataset.sending = 'true'

            if (formSubmitCo && !action.includes('/ajax')) action = action.replace('formsubmit.co', 'formsubmit.co/ajax')

            formMessage.classList.add('form__submit')
            formMessage.innerHTML = `<i class="icon spin">sync</i> ${formSubmitSending}…`
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
                formMessage.innerHTML = `<i class="icon">check_circle</i> ${closeIcon} ${formSubmitOk}`
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
              .finally(() => {
                submitBtn.disabled = false
                form.dataset.sending = 'false'
              })
          }
        }
      })
    })
  })
}
