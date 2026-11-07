// An omitted choice keeps provider-specific behavior for existing consumers.
export function formUsesAjax (form) {
  if (form.dataset.ajax === 'true') return true
  if (form.dataset.ajax === 'false') return false
  return form.dataset.prov === 'gas' || (
    form.dataset.prov === 'fsc' && !form.querySelector('[type="file"]')
  )
}
