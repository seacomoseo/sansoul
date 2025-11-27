import { waitCSS } from './wait-css'

// const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

export function initFormShow () {
  waitCSS(() => {
    const forms = document.querySelectorAll('.form:has([data-show-of])')
    if (forms) {
      forms.forEach(form => {
        // Mark the callback as async to be able to use await
        form.addEventListener('change', /* async */ changed => {
          const input = changed.target
          const nameShow = input.name
          // Convert the NodeList to array to be able to iterate with for...of
          const itemsShowIf = [...form.querySelectorAll(`[data-show-if*="{${nameShow}}"]`)]
          for (const itemShowIf of itemsShowIf) {
            let show = []
            const namesShowIf = itemShowIf.dataset.showIf
            // Use for...of instead of forEach to be able to use await in each iteration
            const splitNames = namesShowIf.split(/\|\||&&/)
            for (const nameShowOf of splitNames) {
              const nameShowOfClean = nameShowOf.replace(/^.|.$/g, '')
              const inputShowOf = form.querySelector(`[name="${nameShowOfClean}"]`)
              if (inputShowOf) {
                let add
                if (inputShowOf.type === 'checkbox') {
                  add = inputShowOf.checked
                } else if (inputShowOf.type === 'file') {
                  // Wait 1 second
                  // await delay(1000)
                  add = inputShowOf.files.length || inputShowOf.dataset.length || inputShowOf.closest('.form__item').querySelector('.form__preview input')
                } else {
                  add = inputShowOf.value
                }
                show.push(!!add)
              }
            }
            // Process the logic according to whether it is AND or OR
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
          }
        })
      })
    }
  })
}
