// SCRIPT FILE LOAD FUNCTION
export function loadScript (url) {
  return new Promise((resolve, reject) => {
    let script = document.querySelector(`script[src='${url}']`)

    if (!script) {
      script = document.createElement('script')
      script.src = url

      script.onload = resolve

      script.onerror = () => {
        reject(new Error(`Error when load script ${url}`))
      }

      document.head.appendChild(script)
    } else if (script.getAttribute('data-loaded') === 'true') {
      resolve()
    } else {
      script.addEventListener('load', resolve)
      script.addEventListener('error', () => {
        reject(new Error(`Error when load script ${url}`))
      })
    }
  })
}
