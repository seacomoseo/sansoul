/* eslint-disable */
import { fieldGroups } from '@params'
import { loadFieldGroupConfig, prepareFieldGroups } from './field-groups'

// Interface language Sveltia will use (0.245): its preferences are JSON in
// localStorage['sveltia-cms.prefs']; 'auto' (also what 'en' becomes) or no
// choice means the first browser language it has a translation for.
const SVELTIA_LANGUAGES = ['ar', 'bg', 'ca', 'cs', 'da', 'de', 'el', 'en', 'es', 'fa', 'fi', 'fr', 'he', 'hr', 'it', 'ja', 'ko', 'nl', 'pl', 'pt', 'ru', 'sk', 'sv', 'tr', 'uk', 'vi', 'zh']
function cmsLanguage () {
  let locale
  try {
    locale = JSON.parse(window.localStorage.getItem('sveltia-cms.prefs') || '{}')?.locale
  } catch {}
  const candidates = locale && locale !== 'auto' ? [locale] : [...(window.navigator?.languages || []), window.navigator?.language]
  const base = candidates.map(code => String(code || '').slice(0, 2).toLowerCase()).find(code => SVELTIA_LANGUAGES.includes(code))
  return base || 'en'
}

// Optional panels answer an unauthenticated probe with 401 JSON when enabled.
async function panelAvailable (path, headers) {
  try {
    const response = await fetch(path, { cache: 'no-store', credentials: 'omit', headers, signal: AbortSignal.timeout(2000) })
    return response.status === 401 && (response.headers.get('content-type') || '').startsWith('application/json')
  } catch {}
}

async function registerPanels (CMS) {
  if (typeof CMS.registerCustomPage !== 'function') return
  const optional = [
    { id: 'forms', es: 'Formularios', en: 'Forms', icon: 'inbox', path: '/api/forms/admin/summary' },
    { id: 'mail', es: 'Correo', en: 'Mail', icon: 'mail', path: '/api/mail/admin/summary' },
    { id: 'orders', es: 'Pedidos', en: 'Orders', icon: 'shopping_cart', path: '/api/commerce/admin/orders', headers: { authorization: 'GitHub probe-probe-probe-probe' } }
  ]
  const available = await Promise.all(optional.map(page => panelAvailable(page.path, page.headers)))
  const pages = optional.filter((_, index) => available[index])
  pages.push({ id: 'help', es: 'Ayuda', en: 'Help', icon: 'help' })
  // Await all probes, then register in display order, with Help always last.
  const lang = cmsLanguage() === 'es' ? 'es' : 'en'
  for (const page of pages) CMS.registerCustomPage({ id: page.id, label: page[lang], icon: page.icon, url: `/admin/${page.id}/` })
}

async function initializeCMS () {
  const CMS = window.CMS
  const panels = registerPanels(CMS)
  const source = await loadFieldGroupConfig(window.document)
  let groups
  try {
    groups = prepareFieldGroups(source, CMS, { enabled: fieldGroups !== false })
  } catch (error) {
    console.error('SanSoul CMS groups could not initialize; using the flat editor.', error)
    groups = prepareFieldGroups(source, CMS, { enabled: false })
  }
  window.document.documentElement.dataset.sansoulFieldGroups = groups.enabled ? 'adapted' : 'flat'
  const results = await Promise.allSettled([
    import('./hashchange').then(m => m.initHashChange()),
    import('./editor-components').then(m => m.initEditorComponents()),
    import('./custom-fields').then(m => m.initCustomFields())
  ])
  results.filter(result => result.status === 'rejected').forEach(result => console.error('SanSoul CMS integration failed.', result.reason))
  try {
    const preview = await import('./live-preview')
    preview.initLivePreview(groups)
  } catch (error) {
    console.error('SanSoul live preview initialization failed.', error)
  }
  await panels
  if (window.__sansoulPreviewManualInit) {
    window.__sansoulPreviewManualInit = false
    await CMS.init({ config: { ...groups.config, load_config_file: false } })
  }
}

initializeCMS().catch(error => {
  console.error('SanSoul CMS initialization failed.', error)
  const message = document.createElement('p')
  message.setAttribute('role', 'alert')
  message.textContent = 'No se ha podido cargar la configuración segura del CMS. Recarga la página para volver a intentarlo.'
  document.body.append(message)
})
