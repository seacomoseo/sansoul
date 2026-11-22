// Site mail panel («Correo»). Runs at /admin/mail/, normally inside Sveltia CMS
// (CMS.registerCustomPage). Same authorization as the forms panel: the GitHub
// session of the CMS, checked by the Worker for push access to the repository.
const API = '/api/mail/admin/'

function pageLang () {
  let value = document.documentElement.lang
  try {
    if (window.parent !== window && window.parent.location.origin === location.origin) value = window.parent.document.documentElement.lang || value
  } catch {}
  return value.toLowerCase().startsWith('es') ? 'es' : 'en'
}
const lang = pageLang()
const PROVIDERS = { gmail: 'Gmail', brevo: 'Brevo', smtp2go: 'SMTP2GO', smtp: 'SMTP' }
const T = {
  es: {
    title: 'Correo',
    refresh: 'Actualizar',
    intro: 'Cuentas desde las que la web envía sus correos (formularios, pedidos y lo que se añada) y cuál usa cada envío.',
    accounts: 'Cuentas de envío',
    noAccounts: 'Todavía no hay ninguna cuenta. Añade una para que la web pueda enviar correos.',
    add: 'Añadir cuenta',
    connectGmail: 'Conectar Gmail',
    reconnect: 'Reconectar',
    test: 'Probar',
    testTo: 'Enviar la prueba a',
    sendTest: 'Enviar prueba',
    edit: 'Editar',
    remove: 'Quitar',
    removeConfirm: id => `Se quitará la cuenta «${id}» y su reparto. Los envíos ya hechos no cambian; los pendientes con esta cuenta quedarán retenidos. ¿Seguir?`,
    cancel: 'Cancelar',
    save: 'Guardar',
    secret: 'Secreto del Worker (solo lectura)',
    sent24h: n => `${n} ${n === 1 ? 'correo' : 'correos'} en 24 h`,
    lastTest: ok => ok ? 'Última prueba correcta' : 'Última prueba fallida',
    testOk: to => `Prueba enviada a ${to}. Revisa la bandeja (y el spam).`,
    testFailed: code => `La prueba ha fallado (${code}).`,
    drive: 'Con Drive',
    noDrive: 'Sin permiso de Drive',
    fields: {
      displayName: 'Nombre de la cuenta (opcional)',
      sender: 'Correo remitente',
      senderName: 'Nombre del remitente (opcional)',
      label: 'Nota (opcional)',
      apiKey: 'Clave API',
      host: 'Servidor SMTP',
      port: 'Puerto',
      username: 'Usuario',
      password: 'Contraseña',
      keepSecret: 'Déjalo vacío para conservar la guardada'
    },
    help: {
      brevo: 'Brevo → SMTP y API → Claves API → Generar. El remitente debe ser un remitente o dominio verificado en Brevo.',
      smtp2go: 'SMTP2GO → Sending → API Keys → Add API Key (permiso «Emails»). El remitente debe estar verificado en Sender Domains.',
      smtp: 'Servidor de envío de tu proveedor de correo. Puerto 587 (STARTTLS) o 465 (TLS); el 25 no está permitido.',
      dns: 'Para que los correos no vayan a spam, verifica tu dominio en el proveedor (registros SPF y DKIM que te indique). Con Gmail no hace falta.'
    },
    routing: 'Qué cuenta usa cada envío',
    defaultAccount: 'Cuenta por defecto',
    defaultHint: 'La usan todos los envíos que no tengan otra elegida.',
    advanced: 'Configurar una cuenta por tipo de envío',
    routeGroups: { forms: 'Formularios', commerce: 'Pedidos', files: 'Archivos en Drive', other: 'Otros envíos' },
    driveAccount: 'Cuenta que guarda archivos y copias de facturas',
    saveRoutes: 'Guardar cuentas por tipo de envío',
    useDefault: 'La cuenta por defecto',
    driveDefault: 'La de avisos de formularios, si es Gmail',
    gmailPermission: 'Al conectar Gmail, autorizas el envío de avisos y el acceso a los archivos que SanSoul crea en tu Drive.',
    fileLimit: limit => `Hasta ${limit} MB en total por aviso pueden ir adjuntos si el proveedor admite el formato.`,
    filesCopy: account => `Todos los archivos se guardan en Drive (${account}), incluidos los que van adjuntos. El aviso incluye un enlace.`,
    filesDrive: account => `Los archivos que no se puedan adjuntar van a Drive (${account}). El aviso incluye un enlace.`,
    filesPanel: 'Sin una cuenta de Drive para formularios, los archivos que no se puedan adjuntar quedan en Formularios y el aviso enlaza al panel.',
    filesSetup: 'Para usar Drive, conecta Gmail y úsala para avisos de formularios, o elige una cuenta de Drive en el reparto avanzado.',
    none: '— Ninguna —',
    variableDefault: id => `${id} (variable del Worker FORMS_GMAIL_DEFAULT)`,
    effective: (id, source) => id ? `En uso: ${id}${source ? ` (${source})` : ''}` : 'En uso: ninguna',
    sources: { route: 'elegida aquí', default: 'por defecto', variable: 'variable del Worker', form: 'formulario', 'forms.owner': 'la de avisos de formularios' },
    routesSaved: 'Reparto guardado.',
    hold: 'Envío desactivado en este entorno: los formularios se guardan, pero no se manda ningún correo.',
    unconfigured: n => `${n} ${n === 1 ? 'aviso espera' : 'avisos esperan'} a que haya una cuenta de correo.`,
    releasePending: 'Enviar pendientes',
    released: (n, left) => `${n} ${n === 1 ? 'aviso puesto' : 'avisos puestos'} en cola.${left ? ` Quedan ${left} pendientes de liberar.` : ''}`,
    grantKey: 'Falta el secreto FORMS_GRANT_KEY en el Worker: no se pueden guardar cuentas desde aquí.',
    signin: 'Entra en el CMS con GitHub para ver el correo.',
    openCms: 'Abrir el CMS',
    denied: 'Tu cuenta de GitHub no tiene permiso de escritura en el repositorio de esta web.',
    unavailable: 'El correo de esta web no responde ahora.',
    notEnabled: 'Esta web no tiene activado el backend de correo.',
    error: code => `No se ha podido completar la acción (${code}).`,
    gmailFailed: 'No se ha podido iniciar la conexión con Google.',
    dismiss: 'Cerrar'
  },
  en: {
    title: 'Mail',
    refresh: 'Refresh',
    intro: 'Accounts the site sends its mail from (forms, orders and whatever comes next) and which one each kind of mail uses.',
    accounts: 'Sending accounts',
    noAccounts: 'No account yet. Add one so the site can send mail.',
    add: 'Add account',
    connectGmail: 'Connect Gmail',
    reconnect: 'Reconnect',
    test: 'Test',
    testTo: 'Send the test to',
    sendTest: 'Send test',
    edit: 'Edit',
    remove: 'Remove',
    removeConfirm: id => `The account "${id}" and its routes will be removed. Mail already sent does not change; pending mail with this account will be held. Continue?`,
    cancel: 'Cancel',
    save: 'Save',
    secret: 'Worker secret (read-only)',
    sent24h: n => `${n} ${n === 1 ? 'mail' : 'mails'} in 24 h`,
    lastTest: ok => ok ? 'Last test passed' : 'Last test failed',
    testOk: to => `Test sent to ${to}. Check the inbox (and spam).`,
    testFailed: code => `The test failed (${code}).`,
    drive: 'With Drive',
    noDrive: 'No Drive permission',
    fields: {
      displayName: 'Account name (optional)',
      sender: 'Sender address',
      senderName: 'Sender name (optional)',
      label: 'Note (optional)',
      apiKey: 'API key',
      host: 'SMTP server',
      port: 'Port',
      username: 'Username',
      password: 'Password',
      keepSecret: 'Leave empty to keep the stored one'
    },
    help: {
      brevo: 'Brevo → SMTP & API → API keys → Generate. The sender must be a verified sender or domain in Brevo.',
      smtp2go: 'SMTP2GO → Sending → API Keys → Add API Key ("Emails" permission). The sender must be verified in Sender Domains.',
      smtp: 'Your mail provider\'s submission server. Port 587 (STARTTLS) or 465 (TLS); port 25 is not allowed.',
      dns: 'To keep mail out of spam, verify your domain with the provider (the SPF and DKIM records it gives you). Gmail does not need it.'
    },
    routing: 'Which account each kind of mail uses',
    defaultAccount: 'Default account',
    defaultHint: 'Used by every kind of mail without its own choice.',
    advanced: 'Choose an account for each kind of mail',
    routeGroups: { forms: 'Forms', commerce: 'Orders', files: 'Files in Drive', other: 'Other mail' },
    driveAccount: 'Account that stores files and invoice copies',
    saveRoutes: 'Save sending accounts',
    useDefault: 'The default account',
    driveDefault: 'The form notices account, if it is Gmail',
    gmailPermission: 'Connecting Gmail allows SanSoul to send notices and access files it creates in your Drive.',
    fileLimit: limit => `Up to ${limit} MB in total can be attached per notice if the provider supports the file types.`,
    filesCopy: account => `All files are saved to Drive (${account}), including those attached to the email. The notice includes a link.`,
    filesDrive: account => `Files that cannot be attached go to Drive (${account}). The notice includes a link.`,
    filesPanel: 'Without a Drive account for forms, files that cannot be attached stay in Forms and the notice links to the panel.',
    filesSetup: 'To use Drive, connect Gmail and use it for form notices, or choose an account for Drive under advanced routing.',
    none: '— None —',
    variableDefault: id => `${id} (Worker variable FORMS_GMAIL_DEFAULT)`,
    effective: (id, source) => id ? `In use: ${id}${source ? ` (${source})` : ''}` : 'In use: none',
    sources: { route: 'chosen here', default: 'default', variable: 'Worker variable', form: 'form', 'forms.owner': 'the form notices one' },
    routesSaved: 'Routing saved.',
    hold: 'Sending is off in this environment: forms are stored, but no mail is sent.',
    unconfigured: n => `${n} ${n === 1 ? 'notice is' : 'notices are'} waiting for a mail account.`,
    releasePending: 'Send pending',
    released: (n, left) => `${n} ${n === 1 ? 'notice' : 'notices'} queued.${left ? ` ${left} still awaiting release.` : ''}`,
    grantKey: 'The Worker lacks the FORMS_GRANT_KEY secret: accounts cannot be saved from here.',
    signin: 'Sign in to the CMS with GitHub to see the mail settings.',
    openCms: 'Open the CMS',
    denied: 'Your GitHub account has no write access to the repository of this site.',
    unavailable: 'The site mail is not responding right now.',
    notEnabled: 'This site has no mail backend.',
    error: code => `The action could not be completed (${code}).`,
    gmailFailed: 'Could not start the connection with Google.',
    dismiss: 'Close'
  }
}[lang]

// Elements are built with textContent only.
function h (tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value)
    else if (key === 'class') node.className = value
    else if (key === 'value') node.value = value
    else node.setAttribute(key, value === true ? '' : value)
  }
  for (const child of children.flat()) if (child != null && child !== false) node.append(child)
  return node
}

function icon (name) {
  return h('span', { class: 'ms', 'aria-hidden': 'true' }, name)
}

function adoptTheme () {
  document.documentElement.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
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
  const lightness = Number(style.getPropertyValue('--sui-background-color-1-hsl').trim().split(/\s+/)[2]?.replace('%', ''))
  if (Number.isFinite(lightness)) document.documentElement.dataset.theme = lightness < 50 ? 'dark' : 'light'
  document.documentElement.dataset.embedded = 'true'
}

function framedElsewhere () {
  try {
    return window.top !== window && window.top.location.origin !== location.origin
  } catch {
    return true
  }
}

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

async function api (path, { method = 'GET', body } = {}) {
  const token = githubToken()
  if (!token) throw new ApiError(401, 'signin')
  const headers = { authorization: `GitHub ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }
  const response = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', credentials: 'omit' })
  const type = response.headers.get('content-type') || ''
  const data = type.startsWith('application/json') ? await response.json().catch(() => ({})) : {}
  if (!response.ok) throw new ApiError(response.status, data.error || (type.startsWith('application/json') ? 'error' : 'not_enabled'))
  return data
}

const state = { summary: null, busy: false, message: null, notice: null, editing: null, testing: null, routes: null, advanced: false }
const app = document.getElementById('app')

const accountName = account => account.displayName ? `${account.displayName} · ${account.sender}` : account.sender
const accountOptions = (accounts, selected, first) => [
  first ? h('option', { value: '' }, first) : null,
  ...accounts.map(account => h('option', { value: account.id, selected: account.id === selected }, `${accountName(account)} (${PROVIDERS[account.provider] || account.provider})`))
]

function banners () {
  const s = state.summary
  const list = []
  if (s.hold) list.push(h('div', { class: 'alert alert-info', role: 'status' }, T.hold))
  if (!s.grantKey) list.push(h('div', { class: 'alert alert-warning', role: 'status' }, T.grantKey))
  if (s.unconfigured) {
    list.push(h('div', { class: 'alert alert-warning alert-dismissible', role: 'status' }, h('span', {}, T.unconfigured(s.unconfigured)),
      s.accounts.length ? h('button', { type: 'button', class: 'button primary', disabled: state.busy, onclick: releasePending }, T.releasePending) : null))
  }
  if (state.message) list.push(h('div', { class: 'alert alert-error', role: 'alert' }, state.message))
  if (state.notice) {
    list.push(h('div', { class: 'alert alert-info alert-dismissible', role: 'status' }, h('span', {}, state.notice),
      h('button', { type: 'button', class: 'button icon-button', 'aria-label': T.dismiss, title: T.dismiss, onclick: () => { state.notice = null; render() } }, icon('close'))))
  }
  return list
}

function accountCard (account) {
  const panel = account.source === 'panel'
  const meta = [
    PROVIDERS[account.provider] || account.provider,
    account.senderName || null,
    account.settings?.host ? `${account.settings.host}:${account.settings.port}` : null,
    account.provider === 'gmail' && account.drive != null ? (account.drive ? T.drive : T.noDrive) : null,
    account.sent24h ? T.sent24h(account.sent24h) : null
  ].filter(Boolean).join(' · ')
  const tested = account.testedAt ? h('span', { class: `chip ${account.testError ? 'chip-failed' : 'chip-sent'}`, title: account.testError || undefined }, T.lastTest(!account.testError)) : null
  const testing = state.testing?.id === account.id
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('strong', {}, accountName(account)), account.source === 'secret' ? h('span', { class: 'chip' }, T.secret) : tested),
    h('p', { class: 'muted small' }, meta),
    account.label ? h('p', { class: 'small' }, account.label) : null,
    testing
      ? h('form', { class: 'actions', onsubmit: event => { event.preventDefault(); sendTest(account, new FormData(event.target).get('to')) } },
        h('label', { class: 'editor-field' }, T.testTo, h('input', { class: 'input', type: 'email', name: 'to', required: true, value: state.testing.to || account.sender, autocomplete: 'email' })),
        h('button', { type: 'submit', class: 'button primary', disabled: state.busy }, T.sendTest),
        h('button', { type: 'button', class: 'button', onclick: () => { state.testing = null; render() } }, T.cancel))
      : h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'button', disabled: state.busy, onclick: () => { state.testing = { id: account.id }; render() } }, icon('send'), T.test),
        panel && account.provider === 'gmail' && state.summary.google.configured ? h('button', { type: 'button', class: 'button', disabled: state.busy, onclick: () => connectGmail(account.id) }, T.reconnect) : null,
        panel ? h('button', { type: 'button', class: 'button', disabled: state.busy || !state.summary.grantKey, onclick: () => { state.editing = { ...account, ...account.settings }; render() } }, T.edit) : null,
        panel ? h('button', { type: 'button', class: 'button danger', disabled: state.busy, onclick: () => removeAccount(account) }, T.remove) : null))
}

function field (label, input, { wide = false, hint } = {}) {
  return h('label', { class: `editor-field${wide ? ' wide' : ''}` }, label, input, hint ? h('span', { class: 'muted small' }, hint) : null)
}

function editor () {
  const e = state.editing
  const isNew = !e.id || e.isNew
  const gmail = e.provider === 'gmail'
  const input = (name, attrs = {}) => h('input', { class: 'input', name, value: e[name] ?? '', ...attrs })
  const secretHint = isNew ? null : T.fields.keepSecret
  return h('form', { class: 'card editor', onsubmit: event => { event.preventDefault(); saveAccount(new FormData(event.target)) } },
    h('div', { class: 'card-head' }, h('strong', {}, isNew ? PROVIDERS[e.provider] : accountName(e))),
    gmail ? null : h('p', { class: 'muted small' }, T.help[e.provider]),
    h('div', { class: 'editor-grid' },
      field(T.fields.displayName, input('displayName', { maxlength: 80 }), { wide: gmail }),
      gmail ? null : [
      field(T.fields.sender, input('sender', { type: 'email', required: true, autocomplete: 'email' })),
      field(T.fields.senderName, input('senderName', { maxlength: 80 })),
      e.provider === 'smtp' ? field(T.fields.host, input('host', { required: true, placeholder: 'smtp.example.com' })) : null,
      e.provider === 'smtp' ? field(T.fields.port, h('select', { class: 'select', name: 'port' }, ...[587, 465, 2525].map(port => h('option', { value: String(port), selected: Number(e.port || 587) === port }, String(port))))) : null,
      e.provider === 'smtp' ? field(T.fields.username, input('username', { required: true, autocomplete: 'off' })) : null,
      field(e.provider === 'smtp' ? T.fields.password : T.fields.apiKey, h('input', { class: 'input', name: 'secret', type: 'password', required: isNew, autocomplete: 'new-password' }), { hint: secretHint }),
      field(T.fields.label, input('label', { maxlength: 80 }), { wide: true })]),
    gmail ? null : h('p', { class: 'muted small' }, T.help.dns),
    h('div', { class: 'actions' },
      h('button', { type: 'submit', class: 'button primary', disabled: state.busy }, T.save),
      h('button', { type: 'button', class: 'button', onclick: () => { state.editing = null; render() } }, T.cancel)))
}

function accountsSection () {
  const s = state.summary
  const adders = [
    s.google.configured ? h('button', { type: 'button', class: 'button', disabled: state.busy, onclick: () => connectGmail(newGmailRef()) }, icon('mail'), T.connectGmail) : null,
    ...['brevo', 'smtp2go', 'smtp'].map(provider => h('button', { type: 'button', class: 'button', disabled: state.busy || !s.grantKey, onclick: () => { state.editing = { provider, isNew: true }; render() } }, icon('add'), PROVIDERS[provider]))
  ]
  return h('section', {},
    h('h3', {}, T.accounts),
    s.accounts.length ? s.accounts.map(accountCard) : h('p', { class: 'muted' }, T.noAccounts),
    state.editing ? editor() : h('div', { class: 'account-add' }, h('p', { class: 'muted small' }, T.add), h('div', { class: 'actions' }, ...adders),
      s.google.configured ? h('p', { class: 'muted small account-hint' }, T.gmailPermission) : null))
}

function routingSection () {
  const s = state.summary
  const routes = state.routes
  const gmail = s.accounts.filter(account => account.provider === 'gmail')
  const sourceText = choice => choice ? T.sources[choice.source] || choice.source : ''
  const routeName = choice => {
    const account = s.accounts.find(item => item.id === choice?.id)
    return account ? accountName(account) : choice?.id
  }
  const owner = s.accounts.find(account => account.id === s.effective['forms.owner']?.id)
  const driveAccount = s.formsDriveEnabled === false ? null : gmail.find(account => account.id === s.effective.drive?.id && account.drive !== false)
  const limit = !driveAccount && owner?.provider === 'gmail' ? 2 : 1
  const filesDestination = driveAccount
    ? (s.routes.drive ? T.filesCopy : T.filesDrive)(accountName(driveAccount))
    : T.filesPanel
  const kindGroups = new Map(Object.keys(T.routeGroups).map(group => [group, []]))
  for (const kind of s.kinds) (kindGroups.get(kind.group) || kindGroups.get('other')).push(kind)
  const sections = Array.from(kindGroups, ([group, kinds]) => kinds.length ? h('section', { class: 'route-group' },
    h('h4', {}, T.routeGroups[group]),
    kinds.map(kind => {
      const id = `route-${kind.id}`
      const current = s.effective[kind.id]
      return h('div', { class: 'route-row' },
        h('label', { for: id }, kind.id === 'drive' ? T.driveAccount : kind.label[lang] || kind.label.es),
        h('select', { id, class: 'select', 'aria-describedby': `${id}-effective`, onchange: event => { routes[kind.id] = event.target.value } },
          ...accountOptions(kind.gmailOnly ? gmail : s.accounts, routes[kind.id] || '', kind.gmailOnly ? T.driveDefault : T.useDefault)),
        h('p', { id: `${id}-effective`, class: 'muted small route-effective' }, T.effective(routeName(current), sourceText(current))))
    }),
    group === 'files' ? h('div', { class: 'route-files muted small' },
      h('p', {}, `${T.fileLimit(limit)} ${filesDestination}`),
      s.formsDriveEnabled !== false && !driveAccount && s.google.configured ? h('p', {}, T.filesSetup) : null) : null) : null)
  return h('section', {},
    h('h3', {}, T.routing),
    field(T.defaultAccount, h('select', { class: 'select', onchange: event => { routes.default = event.target.value } }, ...accountOptions(s.accounts, routes.default || '', s.variables.FORMS_GMAIL_DEFAULT ? T.variableDefault(s.variables.FORMS_GMAIL_DEFAULT) : T.none)), { hint: T.defaultHint }),
    h('details', { open: state.advanced, ontoggle: event => { state.advanced = event.target.open } },
      h('summary', {}, T.advanced),
      h('div', { class: 'route-groups' }, sections)),
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'button primary', disabled: state.busy || !s.accounts.length, onclick: saveRoutes }, T.saveRoutes)))
}

function render () {
  if (!state.summary) return
  app.replaceChildren(
    h('div', { class: 'toolbar' }, h('h1', {}, T.title),
      h('button', { type: 'button', class: 'button icon-button', 'aria-label': T.refresh, title: T.refresh, disabled: state.busy, onclick: () => load() }, icon('refresh'))),
    ...banners(),
    h('div', { class: 'mail-page' }, h('p', { class: 'muted' }, T.intro), accountsSection(), routingSection()))
  app.setAttribute('aria-busy', String(state.busy))
}

function fullScreenMessage (text, action) {
  app.replaceChildren(h('div', { class: 'empty-state' }, h('p', {}, text), action || null))
}

function fail (error) {
  state.busy = false
  if (error.code === 'signin') return fullScreenMessage(T.signin, h('a', { class: 'button primary', href: '/admin/', target: '_top' }, T.openCms))
  if (error.status === 401) return fullScreenMessage(T.denied, h('a', { class: 'button', href: '/admin/', target: '_top' }, T.openCms))
  if (error.code === 'not_enabled' || error.code === 'not_found') return fullScreenMessage(T.notEnabled)
  if (!state.summary) return fullScreenMessage(T.unavailable)
  state.message = T.error(error.code || error.status)
  render()
}

async function load () {
  state.busy = true
  state.message = null
  render()
  try {
    state.summary = await api('summary')
    state.routes = { ...state.summary.routes }
    state.advanced ||= Object.keys(state.summary.routes).some(kind => kind !== 'default')
  } catch (error) {
    return fail(error)
  }
  state.busy = false
  render()
}

async function act (work, notice) {
  state.busy = true
  state.message = null
  render()
  try {
    const result = await work()
    state.notice = typeof notice === 'function' ? notice(result) : notice || null
  } catch (error) {
    return fail(error)
  }
  await load()
}

function newGmailRef () {
  const ids = new Set(state.summary.accounts.map(account => account.id))
  const preferred = state.summary.google.connectRef
  if (preferred && !ids.has(preferred)) return preferred
  let index = 2
  while (ids.has(`gmail-${index}`)) index++
  return `gmail-${index}`
}

async function connectGmail (ref) {
  try {
    const { url, nonce } = await api('google/connect', { method: 'POST', body: { ref } })
    document.cookie = `forms_oauth=${nonce}; Path=/api/forms/admin/google/callback; Max-Age=600; Secure; SameSite=Lax`
    ;(window.top || window).location.assign(url)
  } catch (error) {
    state.message = error.status === 401 ? T.denied : `${T.gmailFailed} (${error.code})`
    render()
  }
}

function saveAccount (data) {
  const e = state.editing
  const body = { provider: e.provider, id: e.id }
  for (const key of ['displayName', 'sender', 'senderName', 'label', 'secret', 'host', 'port', 'username']) if (data.has(key)) body[key] = String(data.get(key)).trim()
  if (body.port) body.port = Number(body.port)
  act(async () => {
    const route = e.provider === 'gmail' ? `accounts/${encodeURIComponent(e.id)}/name` : 'accounts'
    await api(route, { method: 'POST', body })
    state.editing = null
  })
}

function removeAccount (account) {
  if (!window.confirm(T.removeConfirm(accountName(account)))) return
  act(() => api(`accounts/${encodeURIComponent(account.id)}/delete`, { method: 'POST', body: {} }))
}

function sendTest (account, to) {
  state.testing = null
  act(() => api(`accounts/${encodeURIComponent(account.id)}/test`, { method: 'POST', body: { to, lang } }), result => result.ok ? T.testOk(to) : T.testFailed(result.error))
}

function saveRoutes () {
  const routes = {}
  for (const kind of ['default', ...state.summary.kinds.map(item => item.id)]) {
    if ((state.routes[kind] || '') !== (state.summary.routes[kind] || '')) routes[kind] = state.routes[kind] || ''
  }
  act(() => api('routes', { method: 'POST', body: { routes } }), T.routesSaved)
}

function releasePending () {
  act(() => api('pending/release', { method: 'POST', body: {} }), result => T.released(result.released, result.remaining))
}

if (framedElsewhere()) {
  document.documentElement.replaceChildren()
} else {
  adoptTheme()
  document.title = `${T.title} · ${document.title.split(' · ').slice(1).join(' · ')}`.replace(/ · $/, '')
  load()
  window.addEventListener('storage', event => { if (event.key === 'sveltia-cms.user') load() })
  window.addEventListener('focus', adoptTheme)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', adoptTheme)
}
