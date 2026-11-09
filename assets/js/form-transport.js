// An omitted choice keeps provider-specific behavior for existing consumers.
export function formUsesAjax (form) {
  // The project Worker answers with a JSON receipt; it is always fetched.
  if (form.dataset.prov === 'sw') return true
  if (form.dataset.ajax === 'true') return true
  if (form.dataset.ajax === 'false') return false
  return form.dataset.prov === 'gas' || (
    form.dataset.prov === 'fsc' && !form.querySelector('[type="file"]')
  )
}
