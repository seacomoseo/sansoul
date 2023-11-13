
// COOKIES
const cookiesMessage = document.querySelector('.cookies')
const cookiesMessageAcept = document.querySelectorAll('.cookies__button-acept')
const cookiesMessageToogle = document.querySelector('.cookies__toggle')

if (cookiesMessage && cookiesMessageAcept && cookiesMessageToogle) {
  // Add class active from cookies message if cookies don't acept
  localStorage.controlcookie && cookiesMessage.classList.add('cookies--hide')

  // Onclick cookies acept
  cookiesMessageAcept.forEach(e => {
    e.addEventListener('click', c => {
      localStorage.controlcookie = localStorage.controlcookie || 0
      localStorage.controlcookie++
      cookiesMessage.classList.add('cookies--hide')
      // If acept all or if not acept all and if analytics ckecked
      const aceptAll = c.target.classList.value.includes('cookies__button-acept--all')
      const analyticsCkecked = document.querySelector('[value="de-analisis"]').checked
      if (aceptAll || !aceptAll && analyticsCkecked) {
        localStorage.controlcookieanalytics = localStorage.controlcookieanalytics || 0
        localStorage.controlcookieanalytics++
        {{/* if site.Data.config.cookies_legal */}}
        {{ with partial "functions/lang-param" (dict "parent" "config" "param" "google_analytics") }}
          googleAnalytics()
        {{ end }}
      }
    })
  })

  // Onclick cookies message toggle
  cookiesMessageToogle.addEventListener('click', () => {
    cookiesMessage.classList.toggle('cookies--hide')
  })
}
