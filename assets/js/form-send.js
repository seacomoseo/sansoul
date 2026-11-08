import { sendGa4Events } from './ga4-event'
import { formValid } from './form-validate'
import { changeValues } from './form-change-values'
import { waitCSS } from './wait-css'
import { formUsesAjax } from './form-transport'
import params from './params'
const {
  formSubmitSending,
  formSubmitOk,
  formSubmitWrong
} = params

const closeIcon = '<i class="icon icon--mat icon--submit-close" part="close" onclick="this.parentElement.remove()"></i>'
const pendingStorageKey = 'sansoul.form.pending'
const submissionInputName = '_submission_id'
let clientIpPromise = Promise.resolve('')
let clientIpRequested = false
let pendingRetry
const initialized = new WeakSet()

async function getClientIp () {
  if (typeof AbortController !== 'function') return ''

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1500)

  try {
    const response = await fetch('https://api64.ipify.org?format=json', {
      signal: controller.signal,
      referrerPolicy: 'no-referrer'
    })
    const data = response.ok ? await response.json() : {}
    return data.ip || ''
  } catch (_) {
    return ''
  } finally {
    clearTimeout(timeout)
  }
}

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

function setPendingSubmission ({ submissionId, action, body, strict = false }) {
  try {
    localStorage.setItem(`${pendingStorageKey}.${submissionId}`, JSON.stringify({
      submissionId,
      action,
      body,
      strict,
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

// Worker forms: each file goes first as one raw upload (the Worker streams it
// to storage without parsing it) and the submission references it by index.
// The SHA-256 lets the server verify the stored copy.
async function workerBody (formData, action, signal) {
  const body = new FormData()
  const query = { submission: formData.get(submissionInputName), page: formData.get('_page'), form: formData.get('_form') }
  let index = 0
  for (const [name, value] of formData.entries()) {
    if (!(value instanceof File)) {
      body.append(name, value)
      continue
    }
    if (!value.size) {
      body.append(name, '')
      continue
    }
    const digest = await crypto.subtle.digest('SHA-256', await value.arrayBuffer())
    const sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
    const url = `${action.replace(/submit$/, 'upload')}?${new URLSearchParams({ ...query, field: name, index })}`
    const response = await fetch(url, {
      method: 'POST',
      body: value,
      signal,
      headers: { 'Content-Type': value.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(value.name), 'X-File-Sha256': sha256 }
    })
    // 409: an earlier attempt already committed; the submit returns its receipt.
    if (!response.ok && response.status !== 409) throw new Error('Upload HTTP status ' + response.status)
    body.append(name, String(index++))
  }
  return body
}

function isPersistedSubmission (data, submissionId, strict = false) {
  if (!data || data.result !== 'success') return false

  // Keep compatibility with existing Apps Script handlers while upgraded
  // handlers return a durable receipt that can be verified.
  if (!strict && typeof data.persisted === 'undefined' && typeof data.submissionId === 'undefined') return true

  return data.persisted === true && Boolean(data.submissionId) && (
    data.submissionId === submissionId || data.status === 'review'
  )
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
      if (isPersistedSubmission(data, submission.submissionId, submission.strict)) {
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
    sendGa4Events(true, form.dataset.ga4, {
      id: form.parentElement.closest('[id]')?.id || '',
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
    `<i class="icon icon--mat" part="close"></i> ${closeIcon} ${formSubmitWrong}<br>` +
    `<i class="icon icon--mat" part="info"></i> ${message}`
}

export function initFormSend () {
  if (!pendingRetry) {
    pendingRetry = retryPendingSubmissions().finally(() => { pendingRetry = null })
  }

  waitCSS(() => {
    const forms = document.querySelectorAll('.form')
    if (!clientIpRequested && [...forms].some(form => form.dataset.prov === 'gas' && formUsesAjax(form))) {
      clientIpRequested = true
      clientIpPromise = getClientIp()
    }

    forms.forEach(e => {
      if (initialized.has(e)) return
      initialized.add(e)
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
          const workerForm = form.dataset.prov === 'sw'
          const durable = googleScript || workerForm
          const formSubmitCo = form.dataset.prov === 'fsc'
          if (!formUsesAjax(form)) {
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
            formMessage.innerHTML = `<i class="icon icon--mat spin--reverse" part="sync"></i> ${formSubmitSending}…`
            form.append(formMessage)

            const submissionInput = durable ? getSubmissionInput(form) : null
            let submissionId = submissionInput?.value

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

              formData.set('IP', await Promise.race([
                clientIpPromise,
                new Promise(resolve => setTimeout(() => resolve(''), 200))
              ]))
            }

            let fileBytes = 0
            if (workerForm) {
              // Multipart keeps order and repeated/empty values; files are
              // uploaded first (workerBody). Only text-only submissions get a
              // local copy for background retry.
              fileBytes = [...formData.values()].reduce((total, value) => total + (value instanceof File ? value.size : 0), 0)
              if (![...formData.values()].some(value => value instanceof File && value.size)) {
                const text = [...formData.entries()].filter(([, value]) => typeof value === 'string')
                setPendingSubmission({ submissionId, action, body: new URLSearchParams(text).toString(), strict: true })
              }
            } else if ((!googleScript && isFileType) || formSubmitCo) {
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
            // The same ID with different content means the form changed after
            // an ambiguous attempt: send the current content once as new.
            const post = async retried => {
              if (workerForm) formOptions.body = await workerBody(formData, action, formOptions.signal)
              const response = await fetch(action, formOptions)
              if (workerForm && response.status === 409 && !retried) {
                removePendingSubmission(submissionId)
                submissionId = createSubmissionId()
                submissionInput.value = submissionId
                formData.set(submissionInputName, submissionId)
                return post(true)
              }
              return response
            }
            Promise.race([
              post(false),
              new Promise((_resolve, reject) => {
                formTimeout = setTimeout(() => {
                  formController?.abort()
                  reject(new Error('Submission timed out'))
                  // Uploads get extra time: ~100 KB/s on a slow connection.
                }, 60000 + Math.round(fileBytes / 100))
              })
            ])
              .then(response => {
                if (!response.ok) {
                  throw new Error('HTTP status ' + response.status)
                }
                return durable ? response.json() : response
              })
              .then(data => {
                if (durable && !isPersistedSubmission(data, submissionId, workerForm)) {
                  throw new Error(data.message || 'Unknown error, data: ' + JSON.stringify(data))
                }
                if (durable) {
                  removePendingSubmission(submissionId)
                  submissionInput.remove()
                }
                formMessage.classList.add('form__submit--success')
                formMessage.innerHTML = `<i class="icon icon--mat" part="check_circle"></i> ${closeIcon} ${formSubmitOk}`
                formSubmited(form, durable ? data : null)
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
