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

// Forms panel as a CMS page, only where the project Worker serves the forms
// admin API (an unauthenticated probe answers 401 JSON; static hosting, 404).
async function registerFormsPanel (CMS) {
  if (typeof CMS.registerCustomPage !== 'function') return
  try {
    const response = await fetch('/api/forms/admin/summary', { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(2000) })
    if (response.status !== 401 || !(response.headers.get('content-type') || '').startsWith('application/json')) return
    // Pages are registered before Sveltia starts, so its interface language is
    // not on <html> yet: read the same preference it will use. The label is a
    // fixed string: a language change in the CMS shows after a reload.
    const label = cmsLanguage() === 'es' ? 'Formularios' : 'Forms'
    CMS.registerCustomPage({ id: 'forms', label, icon: 'inbox', url: '/admin/forms/' })
  } catch {}
}

// Sign-in/publishing help and project links, always available in the CMS.
function registerHelpPage (CMS) {
  if (typeof CMS.registerCustomPage !== 'function') return
  CMS.registerCustomPage({ id: 'help', label: cmsLanguage() === 'es' ? 'Ayuda' : 'Help', icon: 'help', url: '/admin/help/' })
}

async function initializeCMS () {
  const CMS = window.CMS
  registerHelpPage(CMS)
  const formsPanel = registerFormsPanel(CMS)
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
  await formsPanel
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
