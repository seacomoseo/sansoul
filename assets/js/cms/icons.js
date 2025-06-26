import { icons, timestamp } from '@params'

export function initIcons () {
  icons.forEach(icon => {
    CMS.registerIcon(icon, () => h('svg', {}, [h('use', { href: `/draws.${timestamp}.svg#${icon}` })]))
  })
}
