import { icons, timestamp } from '@params'

export function initIcons () {
  icons.forEach(icon => {
    // eslint-disable-next-line
    CMS.registerIcon(icon, () => h('svg', {}, [h('use', { href: `/draws.${timestamp}.svg#${icon}` })]))
  })
}
