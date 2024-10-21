export function initFormShow () {
  window.addEventListener('load', () => {
    const forms = document.querySelectorAll('.form:has([data-showof])')
    if (forms) {
      forms.forEach(form => {
        form.addEventListener('change', changed => {
          const input = changed.target
          const nameShow = input.closest('.form__item').dataset.showof
          if (nameShow) {
            form.querySelectorAll(`[data-showif*="${nameShow}"]`).forEach(itemShowIf => {
              let show
              const selectorShowOfs = `[data-showof*="${
                itemShowIf.dataset.showif
                .replace('||', '"],[data-showof*="')
                .replace('&&', '"][data-showof*="')
              }"]`
              console.log(selectorShowOfs)
              form.querySelectorAll(selectorShowOfs).forEach(itemShowOf => {
                const nameShowOf = itemShowOf.dataset.showof
                const inputShowOf = itemShowOf.querySelector(`[name="${nameShowOf.replace(/^.|.$/g, '')}"]`)
                const add = inputShowOf.type === 'checkbox' ? inputShowOf.checked : inputShowOf.value
                if (add) show = true
              })
              if (show) {
                console.log(itemShowIf)
                itemShowIf.classList.add('form__item--show')
              } else {
                itemShowIf.classList.remove('form__item--show')
              }
            })
          }
        })
      })
    }
  })
}
