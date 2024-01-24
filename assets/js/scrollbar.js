// CUSTOM SCROLLBAR
export function initScrollbar () {
  // Creating invisible container
  const tempDiv = document.createElement('div')
  tempDiv.style.visibility = 'hidden'
  tempDiv.style.overflow = 'scroll' // forcing scrollbar to appear
  tempDiv.style.msOverflowStyle = 'scrollbar' // needed for WinJS apps
  document.body.appendChild(tempDiv)

  // Creating inner element and placing it in the container
  const innerTempDiv = document.createElement('div')
  tempDiv.appendChild(innerTempDiv)

  // Calculating difference between container's full width and the child width
  if (tempDiv.offsetWidth - innerTempDiv.offsetWidth) {
    document.documentElement.classList.add('custom-scrollbar')
  }

  // Removing temporary elements from the DOM
  tempDiv.parentNode.removeChild(tempDiv)
}
