export function initHashChange () {
  const updateHash = () => {
    document.body.dataset.hash = location.hash
  }

  // Run on mount
  updateHash()

  // Listen for hash changes
  window.addEventListener('hashchange', updateHash)
}
