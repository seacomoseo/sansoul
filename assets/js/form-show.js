import { waitCSS } from './wait-css'
import { matchesFormCondition, formFieldHasValue } from './form-conditions'

const initializedForms = new WeakSet()

export function initFormShow () {
  waitCSS(() => {
    document.querySelectorAll('.form').forEach(form => {
      if (initializedForms.has(form)) return
      initializedForms.add(form)
      const refresh = () => {
        form.querySelectorAll('[data-show-if]').forEach(item => {
          const show = matchesFormCondition(item.dataset.showIf, name => formFieldHasValue(form, name))
          item.classList.toggle('form__item--show', show)
        })
        form.querySelectorAll('input[type="range"]').forEach(input => {
          const output = input.parentElement.querySelector('output')
          if (output) output.value = input.value
        })
      }
      form.addEventListener('change', refresh)
      form.addEventListener('input', refresh)
      // Native reset values are applied after its event has dispatched.
      form.addEventListener('reset', () => queueMicrotask(refresh))
      refresh()
    })
  })
}
