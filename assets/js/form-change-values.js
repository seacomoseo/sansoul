import { newFileNames } from './form-files'

// Change values pre and post get form data
export function changeValues ({ form, now, prev }) {
  // Checkboxes
  const checkboxes = form.querySelectorAll('input[type="checkbox"]')
  checkboxes.forEach(checkbox => {
    if (prev && !checkbox.checked) {
      checkbox.value = '❌'
      checkbox.checked = true
    } else if (checkbox.value === '❌') {
      checkbox.value = '✅'
      checkbox.checked = false
    }
  })
  // Phone Prefixes
  const phones = form.querySelectorAll('[type="tel"]')
  phones.forEach(input => {
    if (prev && input.value) {
      input.dataset.value = input.value
      input.value = `+${input.nextElementSibling.children[1].value} ${input.value}`
    } else if (input.dataset.value) {
      input.value = input.dataset.value
      input.removeAttribute('data-value')
    }
  })
  // Files Base
  const files = form.querySelectorAll('.form .form__file input')
  files.forEach(input => {
    if (prev && input.name) {
      input.dataset.name = input.name
      input.name = ''
      input.value = ''
    } else if (input.dataset.name) {
      input.name = input.dataset.name
      input.removeAttribute('data-name')
    }
  })
  // Files Previews
  if (prev) {
    const previews = form.querySelectorAll('.form__preview:has(.form__preview-input)')
    if (previews) {
      previews.forEach(preview => {
        const inputs = preview.querySelectorAll('.form__preview-input')
        inputs.forEach((input, i) => {
          newFileNames(form, input, i, inputs.length, now)
        })
      })
    }
  }
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
