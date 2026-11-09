// Forms panel of the project. Runs at /admin/forms/, normally inside Sveltia
// CMS (CMS.registerCustomPage). People are authorized with the GitHub session
// of the CMS; the Worker checks push access to the site repository.
const API = '/api/forms/admin/'
// Inside the CMS follow its interface language (same origin), else this page's.
function pageLang () {
  let value = document.documentElement.lang
  try {
    if (window.parent !== window && window.parent.location.origin === location.origin) value = window.parent.document.documentElement.lang || value
  } catch {}
  return value.toLowerCase().startsWith('es') ? 'es' : 'en'
}
const lang = pageLang()
const T = {
  es: {
    title: 'Formularios',
    refresh: 'Actualizar',
    attention: 'Atención',
    review: 'Revisión',
    all: 'Todos',
    empty: { attention: 'Nada pendiente.', review: 'No hay envíos en revisión.', all: 'Todavía no hay envíos.' },
    more: 'Cargar más',
    select: 'Elige un envío para ver el detalle.',
    back: 'Volver',
    fields: 'Datos',
    files: 'Archivos',
    delivery: 'Entrega',
    owner: 'Aviso al propietario',
    confirmation: 'Confirmación al visitante',
    to: 'Para',
    from: 'Cuenta',
    attempts: n => n === 1 ? 'intento' : 'intentos',
    release: 'Enviar',
    approve: 'Aprobar y enviar',
    discard: 'Descartar',
    spam: 'Descartar (spam)',
    delete: 'Borrar envío',
    deleteConfirm: 'Se borrarán para siempre los datos y archivos guardados de este envío (los archivos ya copiados a Drive se quedan en Drive). ¿Seguir?',
    discardConfirm: 'El aviso no se enviará. ¿Descartar?',
    download: 'Descargar',
    driveOpen: 'Abrir en Drive',
    drivePending: 'Drive: pendiente de subir',
    purged: 'Ya no está guardado en la web',
    signin: 'Entra en el CMS con GitHub para ver los formularios.',
    openCms: 'Abrir el CMS',
    denied: 'Tu cuenta de GitHub no tiene permiso de escritura en el repositorio de esta web.',
    unavailable: 'Los formularios de esta web no responden ahora.',
    notEnabled: 'Esta web no tiene activado el backend de formularios.',
    error: 'No se ha podido completar la acción',
    holdBanner: 'Envío desactivado en este entorno: los envíos se guardan, pero no se manda ningún correo.',
    attentionBanner: n => `${n} ${n === 1 ? 'envío necesita' : 'envíos necesitan'} una decisión.`,
    sent24h: (n, account) => `${n} ${n === 1 ? 'correo enviado' : 'correos enviados'} en 24 h desde ${account || 'la cuenta de envío'}. La cuota diaria de Gmail se comparte con otras webs que usen esta cuenta.`,
    retention: d => d ? `Los envíos cerrados se borran a los ${d} días.` : 'Sin borrado automático de envíos.',
    drive: (n, p) => `Drive: ${n} ${n === 1 ? 'archivo' : 'archivos'}${p ? `, ${p} pendientes` : ''}.`,
    reasonsTitle: 'Motivos de revisión',
    openForm: 'Abrir el formulario en la web',
    table: 'Tabla',
    formLabel: 'Formulario',
    csv: 'Descargar CSV',
    noForms: 'Todavía no hay formularios con envíos.',
    state: 'Estado',
    date: 'Fecha del envío',
    submissionId: 'Identificador del envío',
    created: 'Fecha',
    form: 'Formulario',
    summary: 'Valores',
    search: 'Buscar en los valores',
    sort: 'Ordenar',
    sortBy: 'Ordenar por',
    groupBy: 'Agrupar por',
    filter: 'Filtrar',
    group: 'Agrupar',
    noGroup: 'Sin agrupar',
    asc: 'Ascendente',
    desc: 'Descendente',
    addFilter: 'Añadir filtro',
    removeFilter: 'Quitar filtro',
    clearFilters: 'Quitar todos',
    filterHint: 'Se cumplen todos los filtros a la vez.',
    value: 'Valor',
    empty_: '(vacío)',
    ops: { contains: 'contiene', not_contains: 'no contiene', is: 'es', is_not: 'no es', empty: 'está vacío', not_empty: 'no está vacío', after: 'desde', before: 'hasta' },
    filesOps: { empty: 'sin archivos', not_empty: 'con archivos' },
    selectAll: 'Seleccionar todos los cargados',
    selectRow: 'Seleccionar este envío',
    deleteRow: 'Borrar este envío',
    deleteSelected: n => `Borrar ${n}`,
    deleteManyConfirm: n => `Se borrarán para siempre ${n} ${n === 1 ? 'envío' : 'envíos'} con sus datos y archivos guardados (lo ya copiado a Drive se queda en Drive). ¿Seguir?`,
    deleted: (n, busy) => `${n} ${n === 1 ? 'envío borrado' : 'envíos borrados'}.${busy ? ` ${busy} ${busy === 1 ? 'se está enviando y no se ha borrado' : 'se están enviando y no se han borrado'}; prueba en un momento.` : ''}`,
    count: (shown, total) => total == null ? `${shown}` : `${shown} de ${total}`,
    csvView: 'CSV',
    csvZip: 'CSV por formulario (ZIP)',
    csvTitle: 'Descargar los envíos de esta vista (con sus filtros y orden)',
    zipTitle: 'Un CSV por cada formulario de esta vista, en un ZIP',
    preparing: n => `Preparando la descarga… ${n} envíos.`,
    truncated: n => `La descarga se ha limitado a los ${n} primeros envíos: filtra para bajar el resto.`,
    files_: 'Archivos',
    page: 'Página',
    id: 'ID',
    siteMismatch: site => `Esta base de datos ya la usa otra web (${site}). Cada proyecto necesita su propia D1 y su propio KV: revisa wrangler.workers.toml.`,
    dismiss: 'Cerrar'
  },
  en: {
    title: 'Forms',
    refresh: 'Refresh',
    attention: 'Attention',
    review: 'Review',
    all: 'All',
    empty: { attention: 'Nothing pending.', review: 'No submissions in review.', all: 'No submissions yet.' },
    more: 'Load more',
    select: 'Pick a submission to see its details.',
    back: 'Back',
    fields: 'Data',
    files: 'Files',
    delivery: 'Delivery',
    owner: 'Owner notification',
    confirmation: 'Visitor confirmation',
    to: 'To',
    from: 'Account',
    attempts: n => n === 1 ? 'attempt' : 'attempts',
    release: 'Send',
    approve: 'Approve and send',
    discard: 'Discard',
    spam: 'Discard (spam)',
    delete: 'Delete submission',
    deleteConfirm: 'The data and stored files of this submission will be deleted for good (files already copied to Drive stay there). Continue?',
    discardConfirm: 'The notification will not be sent. Discard?',
    download: 'Download',
    driveOpen: 'Open in Drive',
    drivePending: 'Drive: upload pending',
    purged: 'No longer stored on the site',
    signin: 'Sign in to the CMS with GitHub to see the forms.',
    openCms: 'Open the CMS',
    denied: 'Your GitHub account has no write access to the repository of this site.',
    unavailable: 'The forms of this site are not answering right now.',
    notEnabled: 'This site does not have the forms backend enabled.',
    error: 'The action could not be completed',
    holdBanner: 'Delivery is disabled here: submissions are stored, but no email is sent.',
    attentionBanner: n => `${n} ${n === 1 ? 'submission needs' : 'submissions need'} a decision.`,
    sent24h: (n, account) => `${n} ${n === 1 ? 'email' : 'emails'} sent in 24 h from ${account || 'the sender account'}. The daily Gmail quota is shared with other sites using this account.`,
    retention: d => d ? `Closed submissions are deleted after ${d} days.` : 'No automatic deletion of submissions.',
    drive: (n, p) => `Drive: ${n} ${n === 1 ? 'file' : 'files'}${p ? `, ${p} pending` : ''}.`,
    reasonsTitle: 'Review reasons',
    openForm: 'Open the form on the site',
    table: 'Table',
    formLabel: 'Form',
    csv: 'Download CSV',
    noForms: 'No forms with submissions yet.',
    state: 'State',
    date: 'Submission date',
    submissionId: 'Submission ID',
    created: 'Date',
    form: 'Form',
    summary: 'Values',
    search: 'Search the values',
    sort: 'Sort',
    sortBy: 'Sort by',
    groupBy: 'Group by',
    filter: 'Filter',
    group: 'Group',
    noGroup: 'No grouping',
    asc: 'Ascending',
    desc: 'Descending',
    addFilter: 'Add filter',
    removeFilter: 'Remove filter',
    clearFilters: 'Remove all',
    filterHint: 'All filters must match.',
    value: 'Value',
    empty_: '(empty)',
    ops: { contains: 'contains', not_contains: 'does not contain', is: 'is', is_not: 'is not', empty: 'is empty', not_empty: 'is not empty', after: 'from', before: 'until' },
    filesOps: { empty: 'without files', not_empty: 'with files' },
    selectAll: 'Select all loaded',
    selectRow: 'Select this submission',
    deleteRow: 'Delete this submission',
    deleteSelected: n => `Delete ${n}`,
    deleteManyConfirm: n => `${n} ${n === 1 ? 'submission' : 'submissions'} will be deleted for good with their stored data and files (anything already copied to Drive stays there). Continue?`,
    deleted: (n, busy) => `${n} ${n === 1 ? 'submission' : 'submissions'} deleted.${busy ? ` ${busy} ${busy === 1 ? 'is' : 'are'} being sent and ${busy === 1 ? 'was' : 'were'} not deleted; try again in a moment.` : ''}`,
    count: (shown, total) => total == null ? `${shown}` : `${shown} of ${total}`,
    csvView: 'CSV',
    csvZip: 'CSV per form (ZIP)',
    csvTitle: 'Download the submissions of this view (with its filters and order)',
    zipTitle: 'One CSV per form of this view, in a ZIP',
    preparing: n => `Preparing the download… ${n} submissions.`,
    truncated: n => `The download was limited to the first ${n} submissions: filter to get the rest.`,
    files_: 'Files',
    page: 'Page',
    id: 'ID',
    siteMismatch: site => `This database is already used by another site (${site}). Each project needs its own D1 and KV: check wrangler.workers.toml.`,
    dismiss: 'Close'
  }
}[lang]
const STATES = {
  es: { pending: 'En cola', leased: 'Enviando', sent: 'Enviado', held: 'Retenido', failed: 'Fallido', review: 'Revisión', discarded: 'Descartado' },
  en: { pending: 'Queued', leased: 'Sending', sent: 'Sent', held: 'Held', failed: 'Failed', review: 'Review', discarded: 'Discarded' }
}[lang]
const REASONS = {
  es: {
    review: 'En revisión: posible spam o datos no esperados',
    delivery_disabled: 'Envío desactivado en este entorno',
    released: 'Liberado a mano',
    deferred: 'Se enviará en la próxima pasada programada',
    submission_missing: 'El envío ya no existe',
    discarded: 'Descartado',
    files_missing: 'Faltan los archivos del envío',
    authority_drift: 'La cuenta de envío cambió después de recibirlo',
    authority_unavailable: 'No se pudo comprobar la cuenta de envío',
    lease_expired_ambiguous: 'Puede que se enviara: comprueba el buzón antes de reenviar',
    lease_expired_repeatedly: 'El envío se cortó varias veces',
    network_error: 'Respuesta dudosa del proveedor: comprueba el buzón antes de reenviar',
    drive_checksum_mismatch: 'Drive no confirmó el archivo',
    drive_scope_missing: 'La cuenta no tiene permiso de Drive',
    drive_storage_full: 'El Drive de la cuenta está lleno',
    drive_root_missing: 'La carpeta de Drive configurada no existe'
  },
  en: {
    review: 'In review: possible spam or unexpected data',
    delivery_disabled: 'Delivery disabled here',
    released: 'Released by hand',
    deferred: 'Will be sent on the next scheduled pass',
    submission_missing: 'The submission no longer exists',
    discarded: 'Discarded',
    files_missing: 'The files of the submission are missing',
    authority_drift: 'The sender account changed after it arrived',
    authority_unavailable: 'The sender account could not be checked',
    lease_expired_ambiguous: 'It may have been sent: check the mailbox before resending',
    lease_expired_repeatedly: 'Sending was cut off several times',
    network_error: 'Unclear provider answer: check the mailbox before resending',
    drive_checksum_mismatch: 'Drive did not confirm the file',
    drive_scope_missing: 'The account has no Drive permission',
    drive_storage_full: 'The Drive of the account is full',
    drive_root_missing: 'The configured Drive folder does not exist'
  }
}[lang]
const SPAM = {
  es: { honeypot: 'campo trampa relleno (bot)', too_many_urls: 'demasiados enlaces', unexpected_script: 'código en el texto', spam_words: 'palabras de spam', invalid_email: 'email no válido', blocked_email_domain: 'dominio de email bloqueado', unknown_field: 'campos que el formulario no tiene' },
  en: { honeypot: 'trap field filled (bot)', too_many_urls: 'too many links', unexpected_script: 'code in the text', spam_words: 'spam words', invalid_email: 'invalid email', blocked_email_domain: 'blocked email domain', unknown_field: 'fields the form does not have' }
}[lang]
const spamText = code => {
  const [name, detail] = code.split(/:(.*)/)
  return `${SPAM[name] || name}${detail ? ` (${detail.split('|').join(', ')})` : ''}`
}
const reasonText = code => code ? (REASONS[code] || code) : ''
const dateText = time => new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(time))
const shortDate = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const dayText = day => new Intl.DateTimeFormat(lang, { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))
const sizeText = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1048576).toFixed(1)} MB`

// Elements are built with textContent only: no submitted value is ever HTML.
function h (tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value)
    else if (key === 'class') node.className = value
    else if (key === 'indeterminate') node.indeterminate = Boolean(value)
    else node.setAttribute(key, value === true ? '' : value)
  }
  for (const child of children.flat()) if (child != null && child !== false) node.append(child)
  return node
}

// Inside the CMS, adopt its theme (light/dark and tokens) from the parent page.
function adoptTheme () {
  const system = window.matchMedia('(prefers-color-scheme: dark)')
  document.documentElement.dataset.theme = system.matches ? 'dark' : 'light'
  let parentRoot
  try {
    if (window.parent === window || window.parent.location.origin !== location.origin) return
    parentRoot = window.parent.document.querySelector('.sui.app-shell') || window.parent.document.body
  } catch {
    return
  }
  const style = window.parent.getComputedStyle(parentRoot)
  for (let index = 0; index < style.length; index++) {
    const name = style[index]
    if (name.startsWith('--sui-')) document.documentElement.style.setProperty(name, style.getPropertyValue(name))
  }
  // The CMS theme can differ from the system's: judge it by its own background.
  const lightness = Number(style.getPropertyValue('--sui-background-color-1-hsl').trim().split(/\s+/)[2]?.replace('%', ''))
  if (Number.isFinite(lightness)) document.documentElement.dataset.theme = lightness < 50 ? 'dark' : 'light'
  document.documentElement.dataset.embedded = 'true'
}

// Framed by another origin: render nothing (clickjacking guard).
function framedElsewhere () {
  try {
    return window.top !== window && window.top.location.origin !== location.origin
  } catch {
    return true
  }
}

// The CMS keeps its GitHub session in localStorage (Sveltia, same origin).
function githubToken () {
  try {
    const user = JSON.parse(localStorage.getItem('sveltia-cms.user') || 'null')
    return user?.backendName === 'github' && typeof user.token === 'string' ? user.token : null
  } catch {
    return null
  }
}

class ApiError extends Error {
  constructor (status, code) {
    super(code)
    this.status = status
    this.code = code
  }
}

async function api (path, { method = 'GET', raw = false, body, signal } = {}) {
  const token = githubToken()
  if (!token) throw new ApiError(401, 'signin')
  const headers = { authorization: `GitHub ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }
  const response = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal, cache: 'no-store', credentials: 'omit' })
  if (raw && response.ok) return response
  const type = response.headers.get('content-type') || ''
  const data = type.startsWith('application/json') ? await response.json().catch(() => ({})) : {}
  if (!response.ok) throw new ApiError(response.status, data.error || (type.startsWith('application/json') ? 'error' : 'not_enabled'))
  return data
}

const PAGE_EXPORT_MAX = 5000
const DELETE_CHUNK = 50
const SETTINGS_KEY = 'sansoul-forms.views'
const DEFAULT_SORT = 'created:desc'
const STATE_KEYS = ['pending', 'leased', 'sent', 'held', 'failed', 'review', 'discarded']
const ICONS = {
  refresh: 'refresh',
  back: 'arrow_back',
  file: 'description',
  clip: 'attach_file',
  download: 'download',
  date: 'calendar_today',
  link: 'link',
  id: 'fingerprint',
  search: 'search',
  sort: 'swap_vert',
  filter: 'filter_list',
  group: 'view_agenda',
  close: 'close',
  remove: 'delete',
  add: 'add',
  up: 'arrow_upward',
  down: 'arrow_downward',
  expand: 'expand_more',
  collapse: 'chevron_right',
  zip: 'folder_zip'
}

const state = {
  summary: null,
  forms: null,
  view: null,
  form: null,
  items: [],
  next: null,
  total: null,
  groups: null,
  columns: [],
  loading: false,
  busy: false,
  panel: null,
  selection: new Set(),
  anchor: null,
  collapsed: new Set(),
  selected: null,
  detail: null,
  message: null,
  notice: null,
  exporting: false,
  // Text typed in search and filter inputs, kept across re-renders.
  drafts: new Map()
}
const app = document.getElementById('app')
// Scroll positions survive re-renders (and a pane hidden on mobile).
const scrolls = new Map()

// Sort, filters, grouping and search per view (and per form in the table
// view), kept in this browser.
const savedViews = (() => {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}
  } catch {
    return {}
  }
})()
const viewKey = () => state.view === 'table' ? `form:${state.form}` : state.view
function settings () {
  const saved = savedViews[viewKey()]
  return {
    q: typeof saved?.q === 'string' ? saved.q : '',
    sort: typeof saved?.sort === 'string' ? saved.sort : DEFAULT_SORT,
    group: typeof saved?.group === 'string' ? saved.group : null,
    filters: Array.isArray(saved?.filters) ? saved.filters.filter(Array.isArray) : []
  }
}
function updateSettings (change, { reload = true } = {}) {
  savedViews[viewKey()] = { ...settings(), ...change }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(savedViews))
  } catch {}
  if (reload) {
    state.next = null
    load()
  } else render()
}

function icon (name) {
  const node = document.createElement('span')
  node.className = 'ms'
  node.setAttribute('aria-hidden', 'true')
  node.textContent = name
  return node
}

const formId = key => String(key || '').split('#').slice(1).join('#') || String(key || '')
const itemState = item => item.state || (item.jobs.find(job => job.channel === 'owner') || item.jobs[0])?.state || null
const fieldValue = (item, name) => (item.fields || []).filter(([key]) => key === name).map(([, value]) => value).join(', ')

function stateChip (code, reason) {
  if (!code) return '—'
  return h('span', { class: `chip chip-${code}`, title: reasonText(reason) || undefined }, STATES[code] || code)
}

// Columns of the current table. General views: fixed columns (the values
// summary only when the table is alone on screen). Table view: the fields of
// the chosen form, as the server lists them.
function tableColumns () {
  const fixed = state.view === 'table'
    ? [
        { id: 'created', label: T.created, type: 'date' },
        ...state.columns.map(name => ({ id: `f:${name}`, label: name, type: 'text' })),
        { id: 'files', label: T.files_, type: 'count' },
        { id: 'state', label: T.state, type: 'enum' }
      ]
    : [
        { id: 'created', label: T.created, type: 'date' },
        { id: 'form', label: T.form, type: 'enum' },
        { id: 'summary', label: T.summary, type: null },
        { id: 'files', label: T.files_, type: 'count' },
        { id: 'state', label: T.state, type: 'enum' }
      ]
  return fixed
}
const columnType = id => tableColumns().find(col => col.id === id)?.type || (id.startsWith('f:') ? 'text' : null)
const OPS = { text: ['contains', 'not_contains', 'is', 'is_not', 'empty', 'not_empty'], enum: ['is', 'is_not'], count: ['not_empty', 'empty'], date: ['after', 'before'] }
const needsValue = op => !['empty', 'not_empty'].includes(op)

function enumOptions (id) {
  if (id === 'state') return STATE_KEYS.map(key => [key, STATES[key]])
  if (id === 'form') return (state.forms || []).map(entry => [entry.form, `${formId(entry.form)} · ${entry.page}`])
  return []
}

function groupLabel (id, key) {
  if (key === '' || key == null) return T.empty_
  if (id === 'created') return dayText(key)
  if (id === 'form') return `${formId(key)} · ${String(key).split('#')[0]}`
  if (id === 'state') return STATES[key] || key
  if (id === 'files') return `${key} ${T.files_.toLowerCase()}`
  return String(key)
}

// Dates are chosen as local days and sent as instants.
function filterParam (filters) {
  return filters.filter(([id, op, value]) => columnType(id) && (!needsValue(op) || value)).map(([id, op, value]) => {
    if (columnType(id) !== 'date') return [id, op, needsValue(op) ? value : '']
    const start = new Date(`${value}T00:00:00`)
    if (op === 'before') start.setDate(start.getDate() + 1)
    return [id, op, String(start.getTime())]
  })
}

function listQuery (extra = {}, { ordered = true } = {}) {
  const view = settings()
  const params = new URLSearchParams()
  params.set('view', state.view === 'table' ? 'all' : state.view)
  if (state.view === 'table') params.set('form', state.form)
  if (view.q.trim()) params.set('q', view.q.trim())
  const filters = filterParam(view.filters)
  if (filters.length) params.set('filter', JSON.stringify(filters))
  if (ordered && view.sort !== DEFAULT_SORT && columnType(view.sort.replace(/:(asc|desc)$/, ''))) params.set('sort', view.sort)
  if (ordered && view.group && columnType(view.group)) {
    params.set('group', view.group)
    params.set('tz', String(-new Date().getTimezoneOffset()))
  }
  for (const [key, value] of Object.entries(extra)) if (value != null) params.set(key, value)
  return `submissions?${params}`
}

function banners () {
  const summary = state.summary
  const list = []
  if (summary.siteMismatch) list.push(h('div', { class: 'alert alert-error', role: 'alert' }, T.siteMismatch(summary.siteMismatch)))
  if (summary.provider === 'hold') list.push(h('div', { class: 'alert alert-info', role: 'status' }, T.holdBanner))
  if (summary.attention) list.push(h('div', { class: 'alert alert-warning', role: 'status' }, T.attentionBanner(summary.attention)))
  if (state.message) list.push(h('div', { class: 'alert alert-error', role: 'alert' }, state.message))
  if (state.notice) {
    list.push(h('div', { class: 'alert alert-info alert-dismissible', role: 'status' }, h('span', {}, state.notice),
      h('button', { type: 'button', class: 'button icon-button', 'aria-label': T.dismiss, title: T.dismiss, onclick: () => { state.notice = null; render() } }, icon(ICONS.close))))
  }
  return list
}

function toolbar () {
  const summary = state.summary
  const tabs = ['all', 'attention', 'review', 'table'].map(view => h('button', {
    type: 'button',
    role: 'tab',
    class: 'tab',
    'aria-selected': String(state.view === view),
    disabled: state.exporting,
    onclick: () => selectView(view)
  }, T[view], (view === 'attention' || view === 'review') && summary[view] ? h('span', { class: 'badge' }, String(summary[view])) : null))
  return h('header', { class: 'toolbar' },
    h('h1', {}, T.title),
    h('div', { class: 'tabs', role: 'tablist' }, tabs),
    h('button', { type: 'button', class: 'button icon-button', title: T.refresh, 'aria-label': T.refresh, onclick: () => refresh(), disabled: state.busy }, icon(ICONS.refresh)))
}

// One pending timer per input; the value is read from settings() when it fires.
const timers = new Map()
function debounce (key, ms, fn) {
  clearTimeout(timers.get(key))
  timers.set(key, setTimeout(() => { timers.delete(key); fn() }, ms))
}
const draft = (key, saved) => state.drafts.has(key) ? state.drafts.get(key) : saved

function tableBar () {
  const view = settings()
  const active = { sort: view.sort !== DEFAULT_SORT, filter: filterParam(view.filters).length, group: Boolean(view.group) }
  const toggle = name => h('button', {
    type: 'button',
    class: `button${active[name] ? ' active' : ''}`,
    'aria-expanded': String(state.panel === name),
    'aria-label': T[name],
    title: T[name],
    disabled: state.exporting,
    onclick: () => { state.panel = state.panel === name ? null : name; ensureForms().then(render) }
  }, icon(ICONS[name]), h('span', { class: 'label' }, T[name]), name === 'filter' && active.filter ? h('span', { class: 'badge' }, String(active.filter)) : null)
  const chooser = state.view === 'table' && state.forms?.length
    ? h('select', { class: 'select form-select', 'aria-label': T.formLabel, 'data-focus': 'form', onchange: event => { state.form = event.target.value; resetList(); load() } },
      state.forms.map(entry => h('option', { value: entry.form, selected: entry.form === state.form }, `${formId(entry.form)} · ${entry.page} (${entry.total})`)))
    : null
  const selected = state.selection.size
  return h('div', { class: 'table-bar' },
    chooser,
    h('label', { class: 'search' }, icon(ICONS.search),
      h('input', {
        type: 'search',
        value: draft('search', view.q),
        placeholder: T.search,
        'aria-label': T.search,
        'data-focus': 'search',
        oninput: event => {
          state.drafts.set('search', event.target.value)
          debounce('search', 350, () => updateSettings({ q: state.drafts.get('search') }))
        }
      })),
    toggle('sort'), toggle('filter'), toggle('group'),
    h('span', { class: 'spacer' }),
    selected ? h('button', { type: 'button', class: 'button danger', disabled: state.busy, onclick: () => deleteMany([...state.selection]) }, icon(ICONS.remove), T.deleteSelected(selected)) : null,
    h('button', { type: 'button', class: 'button', title: T.csvTitle, 'aria-label': T.csvTitle, disabled: state.busy || !state.items.length, onclick: () => download('csv') }, icon(ICONS.download), h('span', { class: 'label' }, T.csvView)),
    state.view !== 'table' ? h('button', { type: 'button', class: 'button', title: T.zipTitle, 'aria-label': T.zipTitle, disabled: state.busy || !state.items.length, onclick: () => download('zip') }, icon(ICONS.zip), h('span', { class: 'label' }, T.csvZip)) : null)
}

function clearDrafts (prefix) {
  for (const key of [...state.drafts.keys()]) if (key.startsWith(prefix)) { state.drafts.delete(key); clearTimeout(timers.get(key)); timers.delete(key) }
}

function columnSelect (value, onchange, { allowNone = false } = {}) {
  const columns = tableColumns().filter(col => col.type)
  return h('select', { class: 'select', onchange: event => onchange(event.target.value) },
    allowNone ? h('option', { value: '', selected: !value }, T.noGroup) : null,
    columns.map(col => h('option', { value: col.id, selected: col.id === value }, col.label)))
}

function optionsPanel () {
  const view = settings()
  if (state.panel === 'sort') {
    const [id, dir] = [view.sort.replace(/:(asc|desc)$/, ''), view.sort.endsWith(':asc') ? 'asc' : 'desc']
    return h('div', { class: 'options-panel' },
      h('span', { class: 'muted' }, T.sortBy),
      columnSelect(id, value => updateSettings({ sort: `${value}:${dir}` })),
      h('select', { class: 'select', 'aria-label': T.sort, onchange: event => updateSettings({ sort: `${id}:${event.target.value}` }) },
        h('option', { value: 'asc', selected: dir === 'asc' }, T.asc), h('option', { value: 'desc', selected: dir === 'desc' }, T.desc)))
  }
  if (state.panel === 'group') {
    return h('div', { class: 'options-panel' }, h('span', { class: 'muted' }, T.groupBy), columnSelect(view.group, value => { state.collapsed.clear(); updateSettings({ group: value || null }) }, { allowNone: true }))
  }
  if (state.panel !== 'filter') return null
  const filters = view.filters
  // Text values arrive here after a pause (see the input); the rest at once.
  // The list is read again when it fires, so changes in between survive.
  const setFilter = (index, next) => updateSettings({ filters: settings().filters.map((filter, at) => at === index ? next : filter) })
  const rows = filters.map(([id, op, value], index) => {
    const type = columnType(id) || 'text'
    const ops = OPS[type]
    const valueInput = !needsValue(op)
      ? null
      : type === 'enum'
        ? h('select', { class: 'select', 'aria-label': T.value, onchange: event => setFilter(index, [id, op, event.target.value]) },
          h('option', { value: '' }, '—'), enumOptions(id).map(([key, label]) => h('option', { value: key, selected: key === value }, label)))
        : type === 'date'
          ? h('input', { class: 'input', type: 'date', value, 'aria-label': T.value, onchange: event => setFilter(index, [id, op, event.target.value]) })
          : h('input', {
            class: 'input',
            type: 'text',
            value: draft(`filter-${index}`, value),
            'aria-label': T.value,
            'data-focus': `filter-${index}`,
            oninput: event => {
              state.drafts.set(`filter-${index}`, event.target.value)
              debounce(`filter-${index}`, 450, () => {
                const [col, operator] = settings().filters[index] || []
                if (col) setFilter(index, [col, operator, state.drafts.get(`filter-${index}`)])
              })
            }
          })
    return h('div', { class: 'filter-row' },
      columnSelect(id, next => setFilter(index, [next, OPS[columnType(next)][0], ''])),
      h('select', { class: 'select', 'aria-label': T.filter, onchange: event => setFilter(index, [id, event.target.value, needsValue(event.target.value) ? value : '']) },
        ops.map(key => h('option', { value: key, selected: key === op }, type === 'count' ? T.filesOps[key] : T.ops[key]))),
      valueInput,
      h('button', { type: 'button', class: 'button icon-button', title: T.removeFilter, 'aria-label': T.removeFilter, onclick: () => { clearDrafts('filter-'); updateSettings({ filters: filters.filter((_, at) => at !== index) }) } }, icon(ICONS.close)))
  })
  const first = tableColumns().find(col => col.type === 'text') || tableColumns()[0]
  return h('div', { class: 'options-panel filters' },
    rows,
    h('div', { class: 'filter-actions' },
      filters.length < 10 ? h('button', { type: 'button', class: 'button', onclick: () => updateSettings({ filters: [...filters, [first.id, OPS[first.type][0], '']] }, { reload: false }) }, icon(ICONS.add), T.addFilter) : null,
      filters.length ? h('button', { type: 'button', class: 'button', onclick: () => { clearDrafts('filter-'); updateSettings({ filters: [] }) } }, T.clearFilters) : null,
      filters.length > 1 ? h('span', { class: 'muted small' }, T.filterHint) : null))
}

function headerCell (col) {
  const view = settings()
  if (!col.type) return h('th', { scope: 'col', class: `col-${col.id}` }, col.label)
  const [id, dir] = [view.sort.replace(/:(asc|desc)$/, ''), view.sort.endsWith(':asc') ? 'asc' : 'desc']
  const sorted = id === col.id
  const next = sorted ? (dir === 'asc' ? 'desc' : 'asc') : (col.type === 'date' ? 'desc' : 'asc')
  return h('th', { scope: 'col', class: `col-${col.id.startsWith('f:') ? 'field' : col.id}`, 'aria-sort': sorted ? (dir === 'asc' ? 'ascending' : 'descending') : undefined },
    h('button', { type: 'button', class: 'sort-button', onclick: () => updateSettings({ sort: `${col.id}:${next}` }) }, col.label, sorted ? icon(dir === 'asc' ? ICONS.up : ICONS.down) : null))
}

function cell (item, col) {
  if (col.id === 'created') return h('td', { class: 'nowrap col-created', title: dateText(item.createdAt) }, shortDate.format(new Date(item.createdAt)))
  if (col.id === 'form') return h('td', { class: 'col-form', title: item.form }, formId(item.form))
  if (col.id === 'summary') return h('td', { class: 'col-summary' }, item.preview || '—')
  if (col.id === 'files') return h('td', { class: 'col-files' }, item.files ? [icon(ICONS.clip), String(item.files)] : '—')
  if (col.id === 'state') {
    const owner = item.jobs.find(job => job.channel === 'owner') || item.jobs[0]
    return h('td', { class: 'col-state' }, stateChip(itemState(item), owner?.reason))
  }
  return h('td', { class: 'col-field' }, fieldValue(item, col.id.slice(2)) || '—')
}

// Rows on screen: those of folded groups are never selected by a range or
// by "select all".
function visibleItems () {
  const group = settings().group
  return group ? state.items.filter(item => !state.collapsed.has(item.group)) : state.items
}

function toggleRow (id, checked, range) {
  const ids = visibleItems().map(item => item.id)
  if (range && state.anchor && ids.includes(state.anchor)) {
    const [from, to] = [ids.indexOf(state.anchor), ids.indexOf(id)].sort((a, b) => a - b)
    for (const key of ids.slice(from, to + 1)) checked ? state.selection.add(key) : state.selection.delete(key)
  } else if (checked) state.selection.add(id)
  else state.selection.delete(id)
  state.anchor = id
  render()
}

function tablePane () {
  const columns = tableColumns()
  const view = settings()
  const busyRow = item => item.jobs.some(job => job.state === 'pending' || job.state === 'leased')
  const visible = visibleItems()
  const all = visible.length > 0 && visible.every(item => state.selection.has(item.id))
  const some = !all && visible.some(item => state.selection.has(item.id))
  const head = h('tr', {},
    h('th', { scope: 'col', class: 'col-check' }, h('input', { type: 'checkbox', checked: all, indeterminate: some, 'aria-label': T.selectAll, disabled: !visible.length || state.exporting, onclick: event => { for (const item of visible) event.target.checked ? state.selection.add(item.id) : state.selection.delete(item.id); render() } })),
    columns.map(headerCell),
    h('th', { scope: 'col', class: 'col-actions' }, h('span', { class: 'sr-only' }, T.deleteRow)))
  const groupCounts = new Map((state.groups || []).map(group => [group.key, group.count]))
  const body = []
  let current
  for (const item of state.items) {
    if (view.group && item.group !== current) {
      current = item.group
      const key = current
      const collapsed = state.collapsed.has(key)
      body.push(h('tr', { class: 'group-row' }, h('th', { scope: 'rowgroup', colspan: String(columns.length + 2) },
        h('button', {
          type: 'button',
          class: 'group-button',
          'aria-expanded': String(!collapsed),
          onclick: () => {
            if (collapsed) state.collapsed.delete(key)
            else {
              state.collapsed.add(key)
              for (const entry of state.items) if (entry.group === key) state.selection.delete(entry.id)
            }
            render()
          }
        },
        icon(collapsed ? ICONS.collapse : ICONS.expand), h('span', {}, groupLabel(view.group, key)), h('span', { class: 'muted' }, String(groupCounts.get(key) ?? ''))))))
    }
    if (view.group && state.collapsed.has(item.group)) continue
    const checked = state.selection.has(item.id)
    body.push(h('tr', {
      class: checked ? 'checked' : null,
      tabindex: '0',
      'aria-current': String(state.selected === item.id),
      onclick: () => select(item.id),
      onkeydown: event => { if (event.key === 'Enter' && event.target === event.currentTarget) select(item.id) }
    },
    h('td', { class: 'col-check', onclick: event => event.stopPropagation() },
      h('input', { type: 'checkbox', checked, 'aria-label': T.selectRow, onclick: event => toggleRow(item.id, event.target.checked, event.shiftKey) })),
    columns.map(col => cell(item, col)),
    h('td', { class: 'col-actions', onclick: event => event.stopPropagation() },
      h('button', { type: 'button', class: 'button icon-button danger', title: T.deleteRow, 'aria-label': T.deleteRow, disabled: state.busy || busyRow(item), onclick: () => deleteMany([item.id]) }, icon(ICONS.remove)))))
  }
  const content = state.loading && !state.items.length
    ? h('div', { class: 'loader delayed', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }))
    : state.items.length
      ? h('div', { class: 'table-scroll', 'data-scroll': `table:${viewKey()}` }, h('table', { class: 'data-table' }, h('thead', {}, head), h('tbody', {}, body)))
      : h('p', { class: 'muted pad' }, state.view === 'table' && !state.forms?.length ? T.noForms : (view.q || filterParam(view.filters).length ? T.empty.all : T.empty[state.view === 'table' ? 'all' : state.view]))
  const footer = state.summary
  return h('section', { class: 'table-pane', 'aria-label': T[state.view], 'aria-busy': String(state.loading) },
    tableBar(),
    optionsPanel(),
    content,
    h('div', { class: 'table-foot' },
      state.items.length ? h('span', { class: 'muted small' }, T.count(state.items.length, state.total)) : null,
      state.next ? h('button', { type: 'button', class: 'button', onclick: () => load({ more: true }), disabled: state.busy }, T.more) : null),
    h('footer', { class: 'list-footer muted' },
      footer.sent24h.map(row => h('p', {}, T.sent24h(row.sent, row.account))),
      footer.drive.files ? h('p', {}, T.drive(footer.drive.files, footer.drive.pending)) : null,
      h('p', {}, T.retention(footer.retentionDays))))
}

function jobCard (job) {
  const actionable = job.state === 'held' || job.state === 'failed'
  const review = job.reason === 'review'
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('strong', {}, T[job.channel]), stateChip(review ? 'review' : job.reason === 'discarded' ? 'discarded' : job.state, job.reason)),
    job.reason ? h('p', { class: 'muted' }, reasonText(job.reason)) : null,
    h('p', { class: 'muted small' },
      [job.recipients.length ? `${T.to}: ${job.recipients.join(', ')}` : null, job.account ? `${T.from}: ${job.account}` : null, `${job.attempts} ${T.attempts(job.attempts)}`, dateText(job.updatedAt)].filter(Boolean).join(' · ')),
    actionable && job.reason !== 'discarded'
      ? h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'button primary', disabled: state.busy || state.summary.provider === 'hold', title: state.summary.provider === 'hold' ? T.holdBanner : undefined, onclick: () => act(`jobs/${state.detail.id}:${job.channel}/release`) }, review ? T.approve : T.release),
        h('button', { type: 'button', class: 'button', disabled: state.busy, onclick: () => confirm(T.discardConfirm) && act(`jobs/${state.detail.id}:${job.channel}/discard`) }, review ? T.spam : T.discard))
      : null)
}

function detailPane () {
  const detail = state.detail
  if (!detail) return h('section', { class: 'detail-pane empty' }, state.selected ? h('div', { class: 'loader delayed', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' })) : h('p', { class: 'muted' }, T.select))
  const busy = detail.jobs.some(job => job.state === 'pending' || job.state === 'leased')
  return h('section', { class: 'detail-pane', 'aria-label': detail.id, 'data-scroll': `detail:${detail.id}` },
    h('div', { class: 'detail-head' },
      h('button', { type: 'button', class: 'button icon-button back', 'aria-label': T.back, title: T.back, onclick: () => select(null) }, icon(ICONS.back)),
      h('div', {},
        h('h2', { tabindex: '-1' }, formId(detail.form)),
        h('ul', { class: 'detail-meta' },
          h('li', { title: T.date }, icon(ICONS.date), h('span', {}, dateText(detail.createdAt))),
          h('li', { title: T.openForm }, icon(ICONS.link), h('a', { href: `${detail.page}#${formId(detail.form)}`, target: '_blank', rel: 'noopener noreferrer' }, `${detail.page}#${formId(detail.form)}`)),
          h('li', { title: T.submissionId }, icon(ICONS.id), h('span', {}, detail.id)))),
      h('button', { type: 'button', class: 'button icon-button close', 'aria-label': T.dismiss, title: T.dismiss, onclick: () => select(null) }, icon(ICONS.close))),
    detail.reasons.length ? h('p', { class: 'alert alert-warning' }, `${T.reasonsTitle}: ${[...new Set(detail.reasons)].map(spamText).join('; ')}`) : null,
    h('h3', {}, T.fields),
    h('dl', { class: 'fields' }, detail.fields.flatMap(([name, value]) => [h('dt', {}, name), h('dd', {}, value || '—')])),
    detail.files.length ? h('h3', {}, T.files) : null,
    detail.files.length
      ? h('ul', { class: 'files' }, detail.files.map(file => h('li', {},
        icon(ICONS.file),
        h('span', { class: 'file-name' }, file.name, h('span', { class: 'muted small' }, ` ${sizeText(file.size)}`)),
        file.drive?.link ? h('a', { class: 'button', href: file.drive.link, target: '_blank', rel: 'noopener noreferrer' }, T.driveOpen) : null,
        file.drive && !file.drive.verified ? h('span', { class: 'muted small' }, T.drivePending) : null,
        file.stored ? h('button', { type: 'button', class: 'button', onclick: () => downloadFile(file) }, T.download) : (!file.drive?.link ? h('span', { class: 'muted small' }, T.purged) : null))))
      : null,
    h('h3', {}, T.delivery),
    detail.jobs.map(jobCard),
    h('div', { class: 'actions danger-zone' },
      h('button', { type: 'button', class: 'button danger', disabled: state.busy || busy, onclick: () => confirm(T.deleteConfirm) && act(`submissions/${detail.id}/delete`, { deleted: true }) }, T.delete)))
}

function render () {
  if (!state.summary) return
  // Keep focus (search, filter values) and scroll positions across renders.
  const focused = document.activeElement?.dataset?.focus
  const caret = focused && document.activeElement.selectionStart
  const layout = h('div', { class: `layout layout-${state.view === 'table' ? 'table' : 'list'}${state.selected ? ' has-detail' : ''}` }, tablePane(), detailPane())
  app.replaceChildren(toolbar(), ...banners(), layout)
  app.setAttribute('aria-busy', String(state.busy))
  for (const node of app.querySelectorAll('[data-scroll]')) {
    const saved = scrolls.get(node.dataset.scroll)
    if (saved) [node.scrollTop, node.scrollLeft] = saved
    node.addEventListener('scroll', () => scrolls.set(node.dataset.scroll, [node.scrollTop, node.scrollLeft]), { passive: true })
  }
  if (focused) {
    const node = app.querySelector(`[data-focus="${focused}"]`)
    node?.focus()
    if (node && typeof caret === 'number' && node.setSelectionRange) node.setSelectionRange(caret, caret)
  }
}

function fail (error) {
  if (error.name === 'AbortError') return
  if (error.code === 'signin') return fullScreenMessage(T.signin, h('a', { class: 'button primary', href: '/admin/', target: '_top' }, T.openCms))
  if (error.status === 401) return fullScreenMessage(T.denied, h('a', { class: 'button', href: '/admin/', target: '_top' }, T.openCms))
  if (error.code === 'not_enabled' || error.code === 'not_found') return fullScreenMessage(T.notEnabled)
  if (!state.summary) return fullScreenMessage(T.unavailable)
  state.message = `${T.error} (${error.code || error.status}).`
  render()
}

function fullScreenMessage (text, action) {
  app.replaceChildren(h('div', { class: 'empty-state' }, h('p', {}, text), action || null))
}

async function ensureForms () {
  if (state.forms) return
  try {
    state.forms = (await api('forms')).forms
  } catch {
    state.forms = []
  }
}

function resetList () {
  clearDrafts('')
  state.items = []
  state.next = null
  state.total = null
  state.groups = null
  state.columns = []
  state.selection.clear()
  state.collapsed.clear()
  state.anchor = null
  state.panel = null
}

// Only the latest load paints: a newer one aborts the request in flight
// (tab clicks, the CMS session changing in another tab).
let loadSeq = 0
let controller = null
async function load ({ more = false, withSummary = false } = {}) {
  const seq = ++loadSeq
  controller?.abort()
  controller = new AbortController()
  const signal = controller.signal
  state.busy = true
  state.loading = !more
  state.message = null
  render()
  try {
    if (!state.summary || withSummary) state.summary = await api('summary', { signal })
    // First load: open the first view with something in it.
    if (!state.view) state.view = state.summary.attention ? 'attention' : state.summary.review ? 'review' : 'all'
    if (state.view === 'table') {
      await ensureForms()
      if (!state.forms.some(entry => entry.form === state.form)) state.form = state.forms[0]?.form || null
    } else if (settings().filters.some(([id]) => id === 'form')) await ensureForms()
    const page = state.view === 'table' && !state.form
      ? { items: [], next: null, total: 0 }
      : await api(listQuery(more && state.next ? { before: state.next } : {}), { signal })
    if (seq !== loadSeq) return
    state.items = more ? [...state.items, ...page.items.filter(item => !state.items.some(known => known.id === item.id))] : page.items
    state.next = page.next
    if (!more) {
      state.total = page.total ?? null
      state.groups = page.groups || null
      if (page.columns) state.columns = page.columns
      const ids = new Set(state.items.map(item => item.id))
      for (const id of state.selection) if (!ids.has(id)) state.selection.delete(id)
    }
    // The open detail is read again only after an action or a refresh.
    if (state.selected && (withSummary || !state.detail)) state.detail = await api(`submissions/${state.selected}`, { signal }).catch(error => error.name === 'AbortError' ? Promise.reject(error) : null)
    if (!state.detail) state.selected = null
  } catch (error) {
    if (seq !== loadSeq || error.name === 'AbortError') return
    state.busy = state.exporting
    state.loading = false
    return fail(error)
  }
  state.busy = state.exporting
  state.loading = false
  render()
}

// Refresh also drains what waits in the queue (deferred sends, retries due)
// when no scheduled drain does it.
async function refresh () {
  if (state.exporting) return
  state.forms = null
  state.next = null
  if (state.summary?.queued) await api('dispatch', { method: 'POST' }).catch(() => {})
  load({ withSummary: true })
}

function selectView (view) {
  if (view === state.view || state.exporting) return
  state.view = view
  state.notice = null
  state.selected = null
  state.detail = null
  resetList()
  load()
}

async function select (id) {
  state.selected = id
  state.detail = null
  render()
  if (!id) return
  try {
    const detail = await api(`submissions/${id}`)
    if (state.selected !== id) return
    state.detail = detail
  } catch (error) {
    return fail(error)
  }
  render()
  app.querySelector('.detail-pane h2')?.focus({ preventScroll: true })
}

async function act (path, { deleted = false } = {}) {
  state.busy = true
  render()
  try {
    await api(path, { method: 'POST' })
    if (deleted) {
      state.selection.delete(state.selected)
      state.selected = null
      state.detail = null
    }
  } catch (error) {
    state.busy = false
    fail(error)
    return
  }
  await load({ withSummary: true })
}

async function deleteMany (ids) {
  if (!ids.length || !confirm(ids.length === 1 ? T.deleteConfirm : T.deleteManyConfirm(ids.length))) return
  state.busy = true
  render()
  let deleted = 0
  let busy = 0
  try {
    for (let index = 0; index < ids.length; index += DELETE_CHUNK) {
      const result = await api('submissions/delete', { method: 'POST', body: { ids: ids.slice(index, index + DELETE_CHUNK) } })
      deleted += result.deleted.length
      busy += result.busy.length
      for (const id of [...result.deleted, ...result.missing]) state.selection.delete(id)
      if (result.deleted.includes(state.selected)) {
        state.selected = null
        state.detail = null
      }
    }
  } catch (error) {
    state.busy = false
    fail(error)
    if (deleted) await load({ withSummary: true })
    return
  }
  state.notice = T.deleted(deleted, busy)
  await load({ withSummary: true })
}

// Exports read every matching submission page by page (full values, current
// filters) in the cheap default order, then sort like the view in the
// browser: the Worker never builds a large file and D1 never re-sorts per page.
// The query is fixed when the export starts; the view is locked meanwhile.
async function exportRows () {
  const base = listQuery({ full: '1', limit: '100' }, { ordered: false })
  const rows = []
  const seen = new Set()
  let next = null
  do {
    const page = await api(next ? `${base}&before=${encodeURIComponent(next)}` : base)
    for (const item of page.items) if (!seen.has(item.id)) seen.add(item.id) && rows.push(item)
    next = page.next
    state.notice = T.preparing(rows.length)
    render()
  } while (next && rows.length < PAGE_EXPORT_MAX)
  return { rows: sortLikeView(rows), truncated: Boolean(next) }
}

function sortValue (item, id) {
  if (id === 'created') return item.createdAt
  if (id === 'files') return item.files
  if (id === 'form') return item.form
  if (id === 'state') return itemState(item) || ''
  return fieldValue(item, id.slice(2))
}
const localDay = time => new Date(time).toLocaleDateString('sv-SE')
function sortLikeView (rows) {
  const view = settings()
  const [id, dir] = [view.sort.replace(/:(asc|desc)$/, ''), view.sort.endsWith(':asc') ? 1 : -1]
  const compare = (a, b) => typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { sensitivity: 'base' })
  const group = view.group && columnType(view.group)
  const groupKey = item => view.group === 'created' ? localDay(item.createdAt) : String(sortValue(item, view.group) ?? '').slice(0, 100)
  return [...rows].sort((a, b) => {
    if (group) {
      const [ga, gb] = [groupKey(a), groupKey(b)]
      if (ga !== gb) return view.group === 'created' ? (ga < gb ? 1 : -1) : (ga === '') - (gb === '') || compare(ga, gb)
    }
    return dir * compare(sortValue(a, id), sortValue(b, id)) || b.createdAt - a.createdAt
  })
}

function csvCell (value) {
  // Values come from visitors: neutralize spreadsheet formulas (phone numbers
  // like "+34 600 000 000" are left alone).
  const text = /^[=+\-@\t\r]/.test(value) && !/^\+[\d\s().-]+$/.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}
const csvDate = time => new Date(time).toLocaleString('sv-SE')

// One form: its fields as columns. Several forms: fixed columns first.
function csvText (rows, { oneForm, columns = [] }) {
  const names = []
  for (const name of columns) if (!names.includes(name)) names.push(name)
  for (const item of rows) for (const [name] of item.fields || []) if (!names.includes(name)) names.push(name)
  const stateOf = item => STATES[itemState(item)] || itemState(item) || ''
  const table = oneForm
    ? [[T.created, ...names, T.files_, T.state, T.id], ...rows.map(item => [csvDate(item.createdAt), ...names.map(name => fieldValue(item, name)), String(item.files), stateOf(item), item.id])]
    : [[T.created, T.form, T.page, T.state, T.files_, T.id, ...names], ...rows.map(item => [csvDate(item.createdAt), formId(item.form), item.page, stateOf(item), String(item.files), item.id, ...names.map(name => fieldValue(item, name))])]
  return '﻿' + table.map(row => row.map(value => csvCell(String(value ?? ''))).join(',')).join('\r\n')
}

const fileSlug = key => `${String(key).split('#')[0].replace(/^\/|\/$/g, '').replace(/[^\w-]+/g, '-') || 'home'}-${formId(key)}`.replace(/[^\w-]+/g, '-')

// Minimal ZIP (stored, no compression): one CSV per form, no dependency.
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32 (bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
function zip (files) {
  const encoder = new TextEncoder()
  const now = new Date()
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  const parts = []
  const central = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name)
    const data = encoder.encode(file.text)
    const crc = crc32(data)
    const header = (signature, extra) => {
      const view = new DataView(new ArrayBuffer(extra ? 46 : 30))
      let at = 0
      const u32 = value => { view.setUint32(at, value, true); at += 4 }
      const u16 = value => { view.setUint16(at, value, true); at += 2 }
      u32(signature)
      if (extra) u16(20)
      u16(20); u16(0x0800); u16(0); u16(time); u16(date); u32(crc); u32(data.length); u32(data.length); u16(name.length); u16(0)
      if (extra) { u16(0); u16(0); u16(0); u32(0); u32(offset) }
      return new Uint8Array(view.buffer)
    }
    const local = header(0x04034b50, false)
    parts.push(local, name, data)
    central.push(header(0x02014b50, true), name)
    offset += local.length + name.length + data.length
  }
  const size = central.reduce((total, part) => total + part.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, size, true)
  end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' })
}

function saveBlob (blob, name) {
  const url = URL.createObjectURL(blob)
  const link = h('a', { href: url, download: name })
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

async function download (kind) {
  state.busy = true
  state.exporting = true
  state.panel = null
  render()
  try {
    const { rows, truncated } = await exportRows()
    const day = new Date().toLocaleDateString('sv-SE')
    if (kind === 'zip') {
      const byForm = new Map()
      for (const item of rows) byForm.set(item.form, [...(byForm.get(item.form) || []), item])
      const names = new Set()
      const files = [...byForm].map(([key, items]) => {
        let name = `${fileSlug(key)}.csv`
        for (let n = 2; names.has(name); n++) name = `${fileSlug(key)}-${n}.csv`
        names.add(name)
        return { name, text: csvText(items, { oneForm: true }) }
      })
      saveBlob(zip(files), `${T.title.toLowerCase()}-${state.view}-${day}.zip`)
    } else {
      const oneForm = state.view === 'table'
      saveBlob(new Blob([csvText(rows, { oneForm, columns: oneForm ? state.columns : [] })], { type: 'text/csv;charset=utf-8' }), `${oneForm ? fileSlug(state.form) : `${T.title.toLowerCase()}-${state.view}`}-${day}.csv`)
    }
    state.notice = truncated ? T.truncated(PAGE_EXPORT_MAX) : null
  } catch (error) {
    state.notice = null
    state.busy = false
    state.exporting = false
    fail(error)
    return
  }
  state.busy = false
  state.exporting = false
  render()
}

async function downloadFile (file) {
  try {
    const response = await api(`submissions/${state.detail.id}/files/${file.index}`, { raw: true })
    saveBlob(await response.blob(), file.name)
  } catch (error) {
    fail(error)
  }
}

if (framedElsewhere()) {
  document.documentElement.replaceChildren()
} else {
  adoptTheme()
  document.title = `${T.title} · ${document.title.split(' · ').slice(1).join(' · ')}`.replace(/ · $/, '')
  load()
  // The CMS session can start or end in another tab.
  window.addEventListener('storage', event => { if (event.key === 'sveltia-cms.user') refresh() })
  // The CMS theme can change while this page stays open.
  window.addEventListener('focus', adoptTheme)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', adoptTheme)
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && state.panel) { state.panel = null; render() } })
}
