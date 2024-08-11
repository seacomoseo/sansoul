export function initResizeWindow () {
  const updateVw = () => {
    const vw = window.innerWidth
    if (vw >= 375) {
      document.body.style.setProperty('--vw', vw)
    }
  }
  updateVw()
  window.addEventListener('resize', updateVw)
}
