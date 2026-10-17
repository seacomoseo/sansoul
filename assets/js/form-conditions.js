// OR groups contain AND terms. Braces are the rendered form-show notation.
export function matchesFormCondition (expression, hasValue) {
  return String(expression || '').split('||').some(group => {
    const terms = group.split('&&').map(term => term.trim().replace(/^\{(.*)\}$/, '$1'))
    return terms.every(term => term !== '' && hasValue(term))
  })
}

export function formFieldHasValue (form, name) {
  return [...form.querySelectorAll('[name]')].some(input => {
    if (input.name !== name || input.disabled) return false
    if (['radio', 'checkbox'].includes(input.type)) return input.checked
    if (input.type === 'file') return Boolean(input.files?.length || input.dataset.length || input.closest('.form__item')?.querySelector('.form__preview input'))
    return Boolean(input.value)
  })
}
