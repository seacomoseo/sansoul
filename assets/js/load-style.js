// STYLE FILE LOAD FUNCTION
export function loadStyle (url) {
  return new Promise((resolve, reject) => {
    let link = document.querySelector(`link[href='${url}']`)

    if (!link) {
      link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = url

      link.onload = resolve

      link.onerror = () => {
        reject(new Error(`Error when load style ${url}`))
      }

      document.head.appendChild(link)
    } else if (link.getAttribute('data-loaded') === 'true') {
      resolve()
    } else {
      link.addEventListener('load', resolve)
      link.addEventListener('error', () => {
        reject(new Error(`Error when load style ${url}`))
      })
    }
  })
}
