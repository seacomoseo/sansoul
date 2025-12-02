import { langs } from '@params'

const lang = document.documentElement.dataset.baseLang || 'es'
export default langs[lang]
