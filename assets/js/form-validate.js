// FORM VALIDATE

let formError, formSubmit

function formGA4 (form) {
  {{ if hugo.IsProduction }}
    {{ with partial "functions/lang-param" (dict "parent" "config" "param" "google_analytics") }}
      gtag('event', 'contact_form_submit', {
        event_category: 'contact',
        event_label: 'form',
        value: form.parentElement.id
      })
    {{ end }}
  {{ end }}
}

function formValidate (form) {
  let valid = true
  const closeIcon = `
    {{- "" -}} <svg class="close" onclick="this.parentElement.remove()">
    {{- "" -}}   <use xlink:href="/draws.svg#xmark"></use>
    {{- "" -}} </svg>`
  formSubmit && formSubmit.remove()
  formError && formError.remove()
  formError = document.createElement('ul')
  formError.classList.add('contact__form-error')
  formError.innerHTML += closeIcon
  form.parentElement.prepend(formError)

  form.querySelectorAll(`
    {{- " " -}} [type="text"],
    {{- " " -}} [type="email"],
    {{- " " -}} [type="number"],
    {{- " " -}} [type="date"],
    {{- " " -}} [type="time"],
    {{- " " -}} textarea
    {{- "" -}}
  `).forEach(input => {
    if (input.value.includes("'")) {
      input.style.borderColor = 'red'
      formError.innerHTML += `
        {{- "" -}} <li>
        {{- "" -}}   {{ i18n "form-error-single-quotes" }}:
        {{- "" -}}   <strong>${ input.placeholder.replace(' *', '') }</strong>
        {{- "" -}} </li>`
      valid = false
    } else {
      input.style = false
    }
  })

  form.querySelectorAll(`
    {{- " " -}} [type="text"][novalidate],
    {{- " " -}} [type="email"][novalidate],
    {{- " " -}} [type="tel"][novalidate],
    {{- " " -}} [type="number"][novalidate],
    {{- " " -}} [type="date"][novalidate],
    {{- " " -}} [type="time"][novalidate],
    {{- " " -}} [type="file"][novalidate],
    {{- " " -}} textarea[novalidate],
    {{- " " -}} select[novalidate]
    {{- "" -}}
  `).forEach(input => {
    if (!input.value) {
      input.style.borderColor = 'red'
      const placeholder = input.placeholder || input.children[0].textContent
      formError.innerHTML += '<li>{{ i18n "form-error-required" 1 }}: <strong>' + placeholder.replace(' *', '') + '</strong></li>'
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
      // const placeholder = input.placeholder || input.children[0].textContent
      formError.innerHTML += '<li>{{ i18n "form-error-required" }}: <strong>' + fieldset.children[0].textContent.replace(' *', '') + '</strong></li>'
      valid = false
    } else {
      fieldset.style = false
    }
  })

  form.querySelectorAll('[type="email"]').forEach(input => {
    const emailMatch = input.value.match(/\@.*\./)
    if (input.value && !emailMatch) {
      input.style.borderColor = 'red'
      formError.innerHTML += '<li>{{ i18n "form-error-email" }}: <strong>' + input.placeholder.replace(' *', '') + '</strong></li>'
      valid = false
    } else if (input.value && emailMatch) {
      input.style = false
    }
  })

  form.querySelectorAll('[type="tel"]').forEach(input => {
    const telMatch = input.value.match(/^[0-9]{9,15}$/)
    if (input.value && !telMatch) {
      input.style.borderColor = 'red'
      formError.innerHTML += '<li>{{ i18n "form-error-number" }}: <strong>' + input.placeholder.replace(' *', '') + '</strong></li>'
      valid = false
    } else if (input.value && telMatch) {
      input.style = false
    }
  })

  form.querySelectorAll('[type="file"]').forEach(input => {
    if (input.files.length > 0) {
      const file = input.files[0];
      if (file.size > 5 * 1024 * 1024) {
        input.style.borderColor = 'red'
        formError.innerHTML += '<li>{{ i18n "form-error-file" }}: <strong>' + input.placeholder.replace(' *', '') + '</strong></li>'
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
    formError.innerHTML += '<li>{{ i18n "form-error-acept" }}</li>'
    valid = false
  } else {
    accept.style = false
  }

  if (valid) {
    formError && formError.remove()
    const action = window.atob(form.action.replace(location.origin + '/', ''))
    const isFileType = form.querySelector('[type="file"]')
    const netlifyForm = action === '/'
    const googleForm = action.indexOf('docs.google.com/forms') !== -1
    const formSubmitCo = action.indexOf('formsubmit.co') !== -1
    if (!netlifyForm && !googleForm && !formSubmitCo) {
      formGA4(form)
      return true
    } else {
      formSubmit && formSubmit.remove()
      formSubmit = document.createElement('p')
      formSubmit.classList.add('contact__form-submit')
      form.parentElement.append(formSubmit)
      formSubmit.innerHTML = '<svg class="spin"><use xlink:href="/draws.svg#rotate"></use></svg> Enviando…'
  
      // Response
      function formSubmitOk (form) {
        formSubmit.classList.add('contact__form-submit--ok')
        formSubmit.innerHTML = '<svg><use xlink:href="/draws.svg#circle-check"></use></svg> ' + closeIcon + ' {{ i18n "form-submit" 1 }}'
        formGA4(form)
        const customEventSubmit = new CustomEvent('submited_' + form.parentElement.id)
        document.dispatchEvent(customEventSubmit)
      }
      function formSubmitError (error) {
        formSubmit.classList.add('contact__form-submit--error')
        formSubmit.innerHTML = '<svg><use xlink:href="/draws.svg#circle-xmark"></use></svg> ' + closeIcon + ' {{ i18n "form-submit" }}<br><svg><use xlink:href="/draws.svg#circle-info"></use></svg> ' + error
      }
      let formOptions = { method: 'POST' }
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
        .then(response => { formSubmitOk(form) })
        .catch(error => {
          if (googleForm && error == 'Error: HTTP status 0') {
            formSubmitOk(form)
          } else {
            formSubmitError (error)
          }
        })

      return false
    }
  } else {
    // alert('Completa correctamente los campos requeridos')
    scrollTo(formError)
    return false
  }
}
