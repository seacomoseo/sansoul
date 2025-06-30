export function initResizeWindow () {
  const updateVw = () => document.documentElement.style.setProperty('--vw', document.documentElement.clientWidth)
  if (document.documentElement.clientWidth >= 375) updateVw()
  window.addEventListener('resize', updateVw)
}
