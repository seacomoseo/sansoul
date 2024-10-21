export function initFormShow () {
  window.addEventListener('load', () => {
    const forms = document.querySelectorAll('.form:has([data-showof])')
    if (forms) {
      forms.forEach(form => {
        form.addEventListener('change', changed => {
          const input = changed.target
          const nameShow = input.name
          form.querySelectorAll(`[data-showif*="${nameShow}"]`).forEach(itemShowIf => {
            let show = []
            const namesShowIf = itemShowIf.dataset.showif
            namesShowIf.split(/\|\||&&/).forEach(nameShowOf => {
              const inputShowOf = form.querySelector(`[name="${nameShowOf.replace(/^.|.$/g, '')}"]`)
              const add = inputShowOf.type === 'checkbox' ? inputShowOf.checked : inputShowOf.value
              show.push(!!add)
            })
            if (namesShowIf.includes('&&')) {
              show = show.every(v => v === true)
            } else {
              show = show.includes(true)
            }
            if (show) {
              itemShowIf.classList.add('form__item--show')
            } else {
              itemShowIf.classList.remove('form__item--show')
            }
          })
        })
      })
    }
  })
}
