import { translations } from '@params'

export function initNavLinks () {
  translations.forEach(e => {
    // eslint-disable-next-line
    CMS.registerAdditionalLink(e)
  })
  // eslint-disable-next-line
  CMS.registerAdditionalLink({
    id: 'info',
    title: 'Info',
    data: '/admin/info/',
    options: { icon: 'circle-info' }
  })
}
