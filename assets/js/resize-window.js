export function initResizeWindow () {
  const updateVw = () => {
    const vw = window.innerWidth
    document.documentElement.style.setProperty('--vw', vw)
  }
  updateVw()
  window.addEventListener('resize', updateVw)
}
