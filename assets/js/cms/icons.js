import { icons } from '@params'

export function initIcons () {
  icons.forEach(icon => {
    CMS.registerIcon(icon, () => h('i', { className: 'custom-icon' }, icon))
  })
}
