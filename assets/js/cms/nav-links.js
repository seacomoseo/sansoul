import { translations } from '@params'

export function initNavLinks () {
  translations.forEach(e => {
    // eslint-disable-next-line
    CMS.registerAdditionalLink(e)
  })
}
