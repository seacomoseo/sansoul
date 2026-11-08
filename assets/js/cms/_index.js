/* eslint-disable */
import { fieldGroups, t } from '@params'
import { loadFieldGroupConfig, prepareFieldGroups } from './field-groups'

// Forms panel as a CMS page, only where the project Worker serves the forms
// admin API (an unauthenticated probe answers 401 JSON; static hosting, 404).
async function registerFormsPanel (CMS) {
  if (typeof CMS.registerCustomPage !== 'function') return
  try {
    const response = await fetch('/api/forms/admin/summary', { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(2000) })
    if (response.status !== 401 || !(response.headers.get('content-type') || '').startsWith('application/json')) return
    CMS.registerCustomPage({ id: 'forms', label: t?.forms_panel || 'Formularios', icon: 'inbox', url: '/admin/forms/' })
  } catch {}
}

async function initializeCMS () {
  const CMS = window.CMS
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
