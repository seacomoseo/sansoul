const imgDeployStatus = document.querySelector('.deploy-status img')
const imgDeployStatusSrc = imgDeployStatus.src
setInterval(() => {
  imgDeployStatus.src = imgDeployStatusSrc + '?' + new Date().getTime()
}, 5000)
{{ if .IsTranslated }}
  // languages
  document.querySelectorAll('.languages > a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault()
      window.open(e.target.closest('a').href + location.hash)
    })
  })
{{ end }}

{{/*
const imgDeployStatus = document.querySelector('.deploy-status img')
const imgDeployStatusSrc = imgDeployStatus.src
setInterval(() => {
  imgDeployStatus.src = imgDeployStatusSrc + '?' + new Date().getTime()
}, 5000)
{{ if .IsTranslated }}
  // languages
  document.querySelectorAll('.languages > a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault()
      window.open(e.target.closest('a').href + location.hash)
    })
  })
{{ end }}
*/}}