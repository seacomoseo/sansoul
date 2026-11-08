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
    openForm: 'Abrir el formulario en la web'
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
    openForm: 'Open the form on the site'
  }
}[lang]
const STATES = {
  es: { pending: 'En cola', leased: 'Enviando', sent: 'Enviado', held: 'Retenido', failed: 'Fallido' },
  en: { pending: 'Queued', leased: 'Sending', sent: 'Sent', held: 'Held', failed: 'Failed' }
}[lang]
const REASONS = {
  es: {
    review: 'En revisión: posible spam o datos no esperados',
    delivery_disabled: 'Envío desactivado en este entorno',
    released: 'Liberado a mano',
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
const sizeText = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1048576).toFixed(1)} MB`

// Elements are built with textContent only: no submitted value is ever HTML.
function h (tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value)
    else if (key === 'class') node.className = value
    else node.setAttribute(key, value === true ? '' : value)
  }
  for (const child of children.flat()) if (child != null && child !== false) node.append(child)
  return node
}

// Inside the CMS, adopt its theme (light/dark and tokens) from the parent page.
function adoptTheme () {
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

async function api (path, { method = 'GET', raw = false } = {}) {
  const token = githubToken()
  if (!token) throw new ApiError(401, 'signin')
  const response = await fetch(API + path, { method, headers: { authorization: `GitHub ${token}` }, cache: 'no-store', credentials: 'omit' })
  if (raw && response.ok) return response
  const type = response.headers.get('content-type') || ''
  const body = type.startsWith('application/json') ? await response.json().catch(() => ({})) : {}
  if (!response.ok) throw new ApiError(response.status, body.error || (type.startsWith('application/json') ? 'error' : 'not_enabled'))
  return body
}

const state = { view: null, summary: null, items: [], next: null, selected: null, detail: null, busy: false, message: null }
const app = document.getElementById('app')

function icon (name) {
  const node = document.createElement('span')
  node.className = 'ms'
  node.setAttribute('aria-hidden', 'true')
  node.textContent = name
  return node
}
const ICONS = { refresh: 'refresh', back: 'arrow_back', file: 'description', clip: 'attach_file' }

function stateChip (job) {
  return h('span', { class: `chip chip-${job.state}${job.reason === 'review' ? ' chip-review' : ''}`, title: reasonText(job.reason) }, job.state === 'held' && job.reason === 'review' ? T.review : (STATES[job.state] || job.state))
}

function fullScreenMessage (text, action) {
  app.replaceChildren(h('div', { class: 'empty-state' }, h('p', {}, text), action || null))
}

function banners () {
  const summary = state.summary
  const list = []
  if (summary.provider === 'hold') list.push(h('div', { class: 'alert alert-info', role: 'status' }, T.holdBanner))
  if (summary.attention) list.push(h('div', { class: 'alert alert-warning', role: 'status' }, T.attentionBanner(summary.attention)))
  if (state.message) list.push(h('div', { class: 'alert alert-error', role: 'alert' }, state.message))
  return list
}

function toolbar () {
  const summary = state.summary
  const tabs = ['all', 'attention', 'review'].map(view => h('button', {
    type: 'button',
    role: 'tab',
    class: 'tab',
    'aria-selected': String(state.view === view),
    onclick: () => selectView(view)
  }, T[view], view !== 'all' && summary[view] ? h('span', { class: 'badge' }, String(summary[view])) : null))
  return h('header', { class: 'toolbar' },
    h('h1', {}, T.title),
    h('div', { class: 'tabs', role: 'tablist' }, tabs),
    h('button', { type: 'button', class: 'button icon-button', title: T.refresh, 'aria-label': T.refresh, onclick: () => load(), disabled: state.busy }, icon(ICONS.refresh)))
}

function listPane () {
  const rows = state.items.map(item => {
    const job = item.jobs.find(entry => entry.channel === 'owner') || item.jobs[0]
    return h('li', {},
      h('button', { type: 'button', class: 'row', 'aria-current': String(state.selected === item.id), onclick: () => select(item.id) },
        h('span', { class: 'row-main' },
          h('span', { class: 'row-title' }, item.preview || item.form.split('#')[1]),
          h('span', { class: 'row-meta' }, `${dateText(item.createdAt)} · ${item.form.split('#')[1]}`, item.files ? [' · ', icon(ICONS.clip), String(item.files)] : null)),
        job ? stateChip(job) : null))
  })
  const footer = state.summary
  return h('section', { class: 'list-pane', 'aria-label': T[state.view] },
    rows.length ? h('ul', { class: 'rows' }, rows) : h('p', { class: 'muted pad' }, T.empty[state.view]),
    state.next ? h('button', { type: 'button', class: 'button more', onclick: () => load({ more: true }), disabled: state.busy }, T.more) : null,
    h('footer', { class: 'list-footer muted' },
      footer.sent24h.map(row => h('p', {}, T.sent24h(row.sent, row.account))),
      footer.drive.files ? h('p', {}, T.drive(footer.drive.files, footer.drive.pending)) : null,
      h('p', {}, T.retention(footer.retentionDays))))
}

function jobCard (job) {
  const actionable = job.state === 'held' || job.state === 'failed'
  const review = job.reason === 'review'
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('strong', {}, T[job.channel]), stateChip(job)),
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
  if (!detail) return h('section', { class: 'detail-pane empty' }, h('p', { class: 'muted' }, T.select))
  const busy = detail.jobs.some(job => job.state === 'pending' || job.state === 'leased')
  return h('section', { class: 'detail-pane', 'aria-label': detail.id },
    h('div', { class: 'detail-head' },
      h('button', { type: 'button', class: 'button icon-button back', 'aria-label': T.back, title: T.back, onclick: () => select(null) }, icon(ICONS.back)),
      h('div', {}, h('h2', {}, detail.form.split('#')[1]), h('p', { class: 'muted small' }, `${dateText(detail.createdAt)} · `, h('a', { href: `${detail.page}#${detail.form.split('#')[1]}`, target: '_blank', rel: 'noopener noreferrer', title: T.openForm }, `${detail.page}#${detail.form.split('#')[1]}`), ` · ${detail.id}`))),
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
  const layout = h('div', { class: `layout${state.detail ? ' has-detail' : ''}` }, listPane(), detailPane())
  app.replaceChildren(toolbar(), ...banners(), layout)
  app.setAttribute('aria-busy', String(state.busy))
}

function fail (error) {
  if (error.code === 'signin') return fullScreenMessage(T.signin, h('a', { class: 'button primary', href: '/admin/', target: '_top' }, T.openCms))
  if (error.status === 401) return fullScreenMessage(T.denied, h('a', { class: 'button', href: '/admin/', target: '_top' }, T.openCms))
  if (error.code === 'not_enabled' || error.code === 'not_found') return fullScreenMessage(T.notEnabled)
  if (!state.summary) return fullScreenMessage(T.unavailable)
  state.message = `${T.error} (${error.code || error.status}).`
  render()
}

async function load ({ more = false } = {}) {
  state.busy = true
  state.message = null
  render()
  try {
    // First load: open the first view with something in it.
    if (!state.view) {
      state.summary = await api('summary')
      state.view = state.summary.attention ? 'attention' : state.summary.review ? 'review' : 'all'
    }
    const query = `submissions?view=${state.view}${more && state.next ? `&before=${encodeURIComponent(state.next)}` : ''}`
    const [summary, page] = await Promise.all([more ? state.summary : api('summary'), api(query)])
    state.summary = summary
    state.items = more ? [...state.items, ...page.items] : page.items
    state.next = page.next
    if (state.selected) state.detail = await api(`submissions/${state.selected}`).catch(() => null)
    if (!state.detail) state.selected = null
  } catch (error) {
    state.busy = false
    return fail(error)
  }
  state.busy = false
  render()
}

function selectView (view) {
  state.view = view
  state.next = null
  load()
}

async function select (id) {
  state.selected = id
  state.detail = null
  if (!id) return render()
  state.busy = true
  render()
  try {
    state.detail = await api(`submissions/${id}`)
  } catch (error) {
    state.busy = false
    return fail(error)
  }
  state.busy = false
  render()
  app.querySelector('.detail-pane h2')?.focus?.()
}

async function act (path, { deleted = false } = {}) {
  state.busy = true
  render()
  try {
    await api(path, { method: 'POST' })
    if (deleted) {
      state.selected = null
      state.detail = null
    }
  } catch (error) {
    state.busy = false
    fail(error)
    return
  }
  await load()
}

async function downloadFile (file) {
  try {
    const response = await api(`submissions/${state.detail.id}/files/${file.index}`, { raw: true })
    const url = URL.createObjectURL(await response.blob())
    const link = h('a', { href: url, download: file.name })
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 30000)
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
  window.addEventListener('storage', event => { if (event.key === 'sveltia-cms.user') load() })
}
