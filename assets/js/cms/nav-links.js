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
    data: '../info/',
    options: { icon: 'circle-info' }
  })
}
