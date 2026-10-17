import { langs } from '@params/config'

const lang = document.documentElement.dataset.baseLang || 'es'
export default langs[lang]
