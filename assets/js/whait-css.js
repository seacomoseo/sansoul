export function whaitCSS (callback) {
  const init = () => {
    const stylesLink = document.querySelector('link[as="style"][href^="/css/styles."]')
    if (stylesLink?.sheet) {
      // CSS is loaded and parsed
      callback()
    } else {
      // Wait for CSS to load
      stylesLink?.addEventListener('load', callback)
    }
  }

  if (document.readyState === 'loading') {
    // Wait for the DOM to be ready
    document.addEventListener('DOMContentLoaded', init)
  } else {
    // DOM is already ready
    init()
  }
}
