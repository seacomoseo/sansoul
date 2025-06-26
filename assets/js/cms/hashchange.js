export function initHashChange () {
  CMS.registerEventListener({
    name: 'change',
    handler: () => {
      document.body.dataset.hash = location.hash
    }
  })
}
