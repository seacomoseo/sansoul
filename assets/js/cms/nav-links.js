export function initNavLinks () {
  const { CMS } = window
  if (!CMS) return

  CMS.registerAdditionalLink({
    id: 'info',
    title: 'Info',
    data: '/admin/info/',
    options: { icon: 'circle-info' }
  })
}
