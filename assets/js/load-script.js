// SCRIPT FILE LOAD FUNCTION
function loadScript (url, callback) {
  if (!document.querySelector(`script[src='${url}']`)) {
    const s = document.createElement('script')
    s.onload = callback
    s.src = url
    document.head.appendChild(s)
  }
}
