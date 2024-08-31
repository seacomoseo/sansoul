import { icons } from '@params'

export function initIcons () {
  icons.forEach(icon => {
    // eslint-disable-next-line
    CMS.registerIcon(icon, () => h('svg', {}, [ h('use', { href: `/draws.svg#${icon}` }) ]))
  })
}
