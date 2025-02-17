import {
  formSubmitSending,
  formSubmitOk,
  formSubmitWrong,
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
  // Files
  const files = form.querySelectorAll('.form .form__file input[type="file"]')
  files.forEach(input => {
    if (prev) {
      if (input.name) {
        input.dataset.name = input.name
        input.name = ''
        input.value = ''
      }
    } else {
      if (input.dataset.name) {
        input.name = input.dataset.name
        input.removeAttribute('data-name')
      }
    }
  })
  // BCC
  const _cc = form.querySelector('input[name="_cc"]')
  if (_cc) {
    if (prev) {
      _cc.value = atob(_cc.value)
    } else {
      _cc.value = btoa(_cc.value)
    }
  }
}

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
              // Send withouth files (googleScript convert to base64)
              const formData = new FormData(form)
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
