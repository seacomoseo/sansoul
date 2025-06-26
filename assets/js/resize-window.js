export function initResizeWindow () {
  const updateVw = () => document.documentElement.style.setProperty('--vw', window.innerWidth)
  if (window.innerWidth >= 375) updateVw()
  window.addEventListener('resize', updateVw)
}
