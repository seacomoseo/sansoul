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
const pendingStorageKey = 'sansoul.form.pending'
const submissionInputName = '_submission_id'

function createSubmissionId () {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const random = new Uint32Array(4)
    crypto.getRandomValues(random)

    return `${Date.now()}-${Array.from(random, value => value.toString(16)).join('')}`
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getPendingSubmissions () {
  const pending = []

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key?.startsWith(`${pendingStorageKey}.`)) continue

      try {
        const submission = JSON.parse(localStorage.getItem(key))
        if (submission?.submissionId && submission?.action && submission?.body) {
          pending.push(submission)
        }
      } catch (_) {}
    }
  } catch (_) {
    return []
  }

  return pending
}

function setPendingSubmission ({ submissionId, action, body }) {
  try {
    localStorage.setItem(`${pendingStorageKey}.${submissionId}`, JSON.stringify({
      submissionId,
      action,
      body,
      createdAt: new Date().toISOString()
    }))
    return true
  } catch (_) {
    return false
  }
}

function removePendingSubmission (submissionId) {
  try {
    localStorage.removeItem(`${pendingStorageKey}.${submissionId}`)
  } catch (_) {}
}

function getSubmissionInput (form) {
  let input = form.querySelector(`[name="${submissionInputName}"]`)

  if (!input) {
    input = document.createElement('input')
    input.type = 'hidden'
    input.name = submissionInputName
    input.value = createSubmissionId()
    form.appendChild(input)
  }

  return input
}

function isPersistedSubmission (data, submissionId) {
  if (!data || data.result !== 'success') return false

  // Keep compatibility with existing Apps Script handlers while upgraded
  // handlers return a durable receipt that can be verified.
  if (typeof data.persisted === 'undefined' && typeof data.submissionId === 'undefined') return true

  return data.persisted === true && data.submissionId === submissionId
}

async function retryPendingSubmissions () {
  const pending = getPendingSubmissions()
  if (!pending.length) return

  for (const submission of pending) {
    let retryTimeout
    const retryController = typeof AbortController === 'function'
      ? new AbortController()
      : null

    try {
      const response = await Promise.race([
        fetch(submission.action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: submission.body,
          signal: retryController?.signal
        }),
        new Promise((resolve, reject) => {
          retryTimeout = setTimeout(() => {
            retryController?.abort()
            reject(new Error('Submission retry timed out'))
          }, 30000)
        })
      ])
      if (!response.ok) continue

      const data = await response.json()
      if (isPersistedSubmission(data, submission.submissionId)) {
        removePendingSubmission(submission.submissionId)
      }
    } catch (_) {
    } finally {
      clearTimeout(retryTimeout)
    }
  }
}

function formSubmited (form, data) {
  const customEventSubmit = new CustomEvent('submited-' + form.id)
  document.dispatchEvent(customEventSubmit)
  if ((!data?.status || data.status === 'accepted') && typeof gtag === 'function') {
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
  retryPendingSubmissions()

  waitCSS(() => {
    const forms = document.querySelectorAll('.form')

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

        const formMessage = document.createElement('div')
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
            formMessage.innerHTML = `<i class="icon spin--reverse">sync</i> ${formSubmitSending}…`
            form.append(formMessage)

            const submissionInput = googleScript ? getSubmissionInput(form) : null
            const submissionId = submissionInput?.value

            const formOptions = { method: 'POST' }
            const formData = new FormData(form)

            if (googleScript) {
              formData.set('User Agent', navigator.userAgent)
              formData.set('IP', '')
              const pendingStored = setPendingSubmission({
                submissionId,
                action,
                body: new URLSearchParams(formData).toString()
              })

              if (!pendingStored) {
                changeValues({ form, now, prev: false })
                formSubmitError(formMessage, 'No se pudo proteger una copia local del envío. Libera espacio del navegador y vuelve a intentarlo.')
                submitBtn.disabled = false
                form.dataset.sending = 'false'
                return
              }

              let ipTimeout
              const ipController = typeof AbortController === 'function'
                ? new AbortController()
                : null
              try {
                const data = await Promise.race([
                  fetch('https://api64.ipify.org?format=json', {
                    signal: ipController?.signal,
                    referrerPolicy: 'no-referrer'
                  })
                    .then(response => response.ok ? response.json() : {}),
                  new Promise(resolve => {
                    ipTimeout = setTimeout(() => {
                      ipController?.abort()
                      resolve({})
                    }, 1500)
                  })
                ])
                formData.set('IP', data.ip || '')
              } catch (_) {
                formData.set('IP', '')
              } finally {
                clearTimeout(ipTimeout)
              }
            }

            if ((!googleScript && isFileType) || formSubmitCo) {
              // Send with files
              formOptions.timeout = 30000
              // formOptions.headers = { Accept: 'application/json' }
              formOptions.body = formData
            } else {
              // Send withouth files (googleScript convert to base64)
              formOptions.headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
              formOptions.body = new URLSearchParams(formData).toString()
            }

            if (googleScript) {
              setPendingSubmission({
                submissionId,
                action,
                body: formOptions.body
              })
            }

            changeValues({ form, now, prev: false })

            // Send by AJAX
            const formController = typeof AbortController === 'function'
              ? new AbortController()
              : null
            let formTimeout
            formOptions.signal = formController?.signal
            Promise.race([
              fetch(action, formOptions),
              new Promise((_resolve, reject) => {
                formTimeout = setTimeout(() => {
                  formController?.abort()
                  reject(new Error('Submission timed out'))
                }, 30000)
              })
            ])
              .then(response => {
                if (!response.ok) {
                  throw new Error('HTTP status ' + response.status)
                }
                return googleScript ? response.json() : response
              })
              .then(data => {
                if (googleScript && !isPersistedSubmission(data, submissionId)) {
                  throw new Error(data.message || 'Unknown error, data: ' + JSON.stringify(data))
                }
                if (googleScript) {
                  removePendingSubmission(submissionId)
                  submissionInput.remove()
                }
                formMessage.classList.add('form__submit--success')
                formMessage.innerHTML = `<i class="icon">check_circle</i> ${closeIcon} ${formSubmitOk}`
                formSubmited(form, googleScript ? data : null)
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
                clearTimeout(formTimeout)
                submitBtn.disabled = false
                form.dataset.sending = 'false'
              })
          }
        }
      })
    })
  })
}
