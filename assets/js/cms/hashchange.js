export function initHashChange () {
  CMS.registerEventListener({
    name: 'change',
    handler: () => {
      document.body.dataset.hash = window.location.hash
    }
  })
}
