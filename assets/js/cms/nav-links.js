import { translations } from '@params'

export function initNavLinks () {
  translations.forEach(e => {
    CMS.registerAdditionalLink(e)
  })
  CMS.registerAdditionalLink({
    id: 'info',
    title: 'Info',
    data: '../info/',
    options: { icon: 'circle-info' }
  })
}
