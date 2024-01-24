// STYLE FILE LOAD FUNCTION
export function loadStyle (url, callback) {
  if (!document.querySelector(`link[rel='stylesheet'][href='${url}']`)) {
    const s = document.createElement('link')
    s.onload = callback
    s.rel = 'stylesheet'
    s.href = url
    document.head.appendChild(s)
  }
}
