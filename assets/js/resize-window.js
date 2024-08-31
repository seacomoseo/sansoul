export function initResizeWindow () {
  const updateVw = (start) => {
    const vw = window.innerWidth
    const cond = start === 'start' ? vw >= 375 : true
    if (cond) document.body.style.setProperty('--vw', vw)
  }
  updateVw('start')
  window.addEventListener('resize', updateVw)
}
