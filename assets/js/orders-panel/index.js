// Orders panel of the project. Runs at /admin/orders/, normally inside Sveltia
// CMS (CMS.registerCustomPage). People are authorized with the GitHub session
// of the CMS; the Worker checks push access to the site repository. Styles are
// the forms panel's (same tokens and components).
const API = '/api/commerce/admin/'

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
    title: 'Pedidos',
    orders: 'Pedidos',
    contacts: 'Contactos',
    refresh: 'Actualizar',
    more: 'Cargar más',
    select: 'Elige un pedido para ver el detalle.',
    empty: 'No hay pedidos.',
    emptyContacts: 'Todavía no hay contactos con permiso.',
    all: 'Todos',
    ready: 'A fabricar',
    manufacturing: 'En fabricación',
    shipped: 'Enviados',
    colDate: 'Fecha',
    colBuyer: 'Comprador',
    colTotal: 'Total',
    colPayment: 'Pago',
    colStatus: 'Estado',
    colEmail: 'Correo',
    colLanguage: 'Idioma',
    colConsent: 'Permiso desde',
    colVersion: 'Texto',
    payment: { pending: 'Pendiente', paid: 'Pagado', failed: 'Fallido', expired: 'Caducado', partially_refunded: 'Reembolso parcial', refunded: 'Reembolsado' },
    status: { awaiting_payment: 'Esperando pago', ready: 'A fabricar', manufacturing: 'En fabricación', shipped: 'Enviado', cancelled: 'Cancelado', inventory_exception: 'Revisar' },
    items: 'Artículos',
    buyer: 'Comprador',
    contact: 'Contacto',
    shipping: 'Enviar a',
    phone: 'Teléfono',
    notes: 'Notas de entrega',
    company: 'Empresa',
    taxId: 'NIF/CIF',
    invoiceRequested: 'Ha pedido factura',
    terms: 'Condiciones aceptadas',
    total: 'Total',
    invoice: 'Descargar factura',
    manufacture: 'Pasar a «En fabricación»',
    ship: 'Marcar como enviado',
    tracking: 'Seguimiento (enlace o código, opcional)',
    shipConfirm: 'El pedido pasará a «Enviado» y, si la tienda lo tiene activado, el comprador recibirá un correo. ¿Seguir?',
    csv: 'Descargar CSV',
    csvConsented: 'Descargar CSV (con permiso)',
    unsubscribe: 'Dar de baja',
    unsubscribeConfirm: 'No se incluirá en las exportaciones. ¿Dar de baja?',
    unsubscribed: 'Baja',
    signin: 'Entra en el CMS con GitHub para ver los pedidos.',
    openCms: 'Abrir el CMS',
    denied: 'Tu cuenta de GitHub no tiene permiso de escritura en el repositorio de esta web.',
    unavailable: 'La tienda de esta web no responde ahora.',
    notEnabled: 'Esta web no tiene activado el panel de pedidos.',
    error: 'No se ha podido completar la acción',
    back: 'Volver'
  },
  en: {
    title: 'Orders',
    orders: 'Orders',
    contacts: 'Contacts',
    refresh: 'Refresh',
    more: 'Load more',
    select: 'Pick an order to see its details.',
    empty: 'No orders.',
    emptyContacts: 'No contacts with consent yet.',
    all: 'All',
    ready: 'To make',
    manufacturing: 'In production',
    shipped: 'Shipped',
    colDate: 'Date',
    colBuyer: 'Buyer',
    colTotal: 'Total',
    colPayment: 'Payment',
    colStatus: 'Status',
    colEmail: 'Email',
    colLanguage: 'Language',
    colConsent: 'Consent since',
    colVersion: 'Text',
    payment: { pending: 'Pending', paid: 'Paid', failed: 'Failed', expired: 'Expired', partially_refunded: 'Partially refunded', refunded: 'Refunded' },
    status: { awaiting_payment: 'Awaiting payment', ready: 'To make', manufacturing: 'In production', shipped: 'Shipped', cancelled: 'Cancelled', inventory_exception: 'Needs review' },
    items: 'Items',
    buyer: 'Buyer',
    contact: 'Contact',
    shipping: 'Ship to',
    phone: 'Phone',
    notes: 'Delivery notes',
    company: 'Company',
    taxId: 'Tax ID',
    invoiceRequested: 'Asked for an invoice',
    terms: 'Terms accepted',
    total: 'Total',
    invoice: 'Download invoice',
    manufacture: 'Move to "In production"',
    ship: 'Mark as shipped',
    tracking: 'Tracking (link or code, optional)',
    shipConfirm: 'The order will move to "Shipped" and, if the shop has it on, the buyer gets an email. Continue?',
    csv: 'Download CSV',
    csvConsented: 'Download CSV (with consent)',
    unsubscribe: 'Unsubscribe',
    unsubscribeConfirm: 'They will be left out of exports. Unsubscribe?',
    unsubscribed: 'Unsubscribed',
    signin: 'Sign in to the CMS with GitHub to see the orders.',
    openCms: 'Open the CMS',
    denied: 'Your GitHub account has no write access to the repository of this site.',
    unavailable: 'The shop of this site is not answering right now.',
    notEnabled: 'This site does not have the orders panel enabled.',
    error: 'The action could not be completed',
    back: 'Back'
  }
}[lang]

const app = document.getElementById('app')
const state = { tab: 'orders', filter: 'all', orders: [], next: null, detail: null, contacts: null, message: '', busy: false }

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

async function api (path, { method = 'GET', raw = false, body } = {}) {
  const token = githubToken()
  if (!token) throw new ApiError(401, 'signin')
  const headers = { authorization: `GitHub ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }
  const response = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', credentials: 'omit' })
  if (raw && response.ok) return response
  const type = response.headers.get('content-type') || ''
  const data = type.startsWith('application/json') ? await response.json().catch(() => ({})) : {}
  if (!response.ok) throw new ApiError(response.status, data.error || (type.startsWith('application/json') ? 'error' : 'not_enabled'))
  return data
}

const money = (minor, currency = 'eur') => {
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits
  return new Intl.NumberFormat(lang, { style: 'currency', currency, maximumFractionDigits: digits }).format(minor / (10 ** digits))
}
const date = seconds => seconds ? new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(seconds * 1000)) : ''

function saveBlob (blob, name) {
  const url = URL.createObjectURL(blob)
  const link = h('a', { href: url, download: name })
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

function fail (error) {
  const screen = (text, action) => app.replaceChildren(h('div', { class: 'empty-state' }, h('p', {}, text), action || null))
  if (error.code === 'signin') return screen(T.signin, h('a', { class: 'button primary', href: '/admin/', target: '_top' }, T.openCms))
  if (error.status === 401) return screen(T.denied, h('a', { class: 'button', href: '/admin/', target: '_top' }, T.openCms))
  if (error.code === 'not_enabled' || error.code === 'admin_panel_disabled') return screen(T.notEnabled)
  if (!state.orders.length && state.contacts === null) return screen(T.unavailable)
  state.message = `${T.error} (${error.code || error.status}).`
  render()
}

async function loadOrders (more = false) {
  const query = new URLSearchParams({ limit: '50' })
  if (state.filter !== 'all') query.set('fulfillment_status', state.filter)
  if (more && state.next) query.set('cursor', state.next)
  const page = await api(`orders?${query}`)
  state.orders = more ? [...state.orders, ...page.orders] : page.orders
  state.next = page.next_cursor
}

async function load () {
  state.busy = true
  state.message = ''
  try {
    if (state.tab === 'orders') await loadOrders()
    else state.contacts = (await api('contacts')).contacts
  } catch (error) {
    state.busy = false
    return fail(error)
  }
  state.busy = false
  render()
}

async function act (action) {
  state.message = ''
  try {
    await action()
  } catch (error) {
    if (error.status === 401 || error.code === 'signin') return fail(error)
    state.message = `${T.error} (${error.code || error.status}).`
  }
  render()
}

function detailPane (order) {
  const snapshot = order.snapshot || {}
  const buyer = order.delivery?.buyer || {}
  const ship = order.delivery?.shipping || {}
  const row = (label, value) => value ? [h('dt', {}, label), h('dd', {}, value)] : []
  const address = [ship.line1, ship.line2, [ship.postal_code, ship.locality].filter(Boolean).join(' '), ship.region_name || ship.administrative_area, ship.country_name || ship.country_code].filter(Boolean).join('\n')
  const tracking = h('input', { class: 'input', type: 'text', maxlength: '200', placeholder: T.tracking, 'aria-label': T.tracking })
  const refreshOrder = async () => {
    await loadOrders()
    state.detail = state.orders.find(item => item.id === order.id) || null
  }
  return h('section', { class: 'detail-pane' },
    h('div', { class: 'detail-head' }, h('button', { class: 'button back', type: 'button', onclick: () => { state.detail = null; render() } }, T.back), h('h2', {}, `${buyer.name || ship.recipient || order.id.slice(0, 8)} · ${money(order.amount_total_minor, order.currency)}`)),
    h('p', { class: 'muted small' }, `${date(order.created_at)} · ${T.payment[order.payment_status] || order.payment_status} · ${T.status[order.fulfillment_status] || order.fulfillment_status}`),
    h('h3', {}, T.items),
    h('ul', { class: 'files' }, (snapshot.items || []).map(item => h('li', {}, h('span', { class: 'file-name' }, `${item.quantity} × ${item.name || item.sku}`), h('span', {}, money(item.lineTotalMinor, order.currency))))),
    h('h3', {}, T.buyer),
    h('dl', { class: 'fields' }, ...row(T.contact, [buyer.name, buyer.email].filter(Boolean).join(' · ')), ...row(T.phone, buyer.phone), ...row(T.company, buyer.business_name), ...row(T.taxId, buyer.tax_id), ...row(T.invoiceRequested, snapshot.invoiceRequested ? '✓' : ''), ...row(T.terms, snapshot.terms ? `${snapshot.terms.version} · ${date(snapshot.terms.acceptedAt)}` : '')),
    ship.line1 ? [h('h3', {}, T.shipping), h('dl', { class: 'fields' }, ...row(ship.recipient || '', address), ...row(T.phone, ship.phone), ...row(T.notes, ship.notes))] : null,
    h('div', { class: 'actions' },
      order.payment_status !== 'pending' ? h('button', { class: 'button', type: 'button', onclick: () => act(async () => saveBlob(await (await api(`orders/${order.id}/invoice.pdf`, { raw: true })).blob(), `invoice-${order.id.slice(0, 8)}.pdf`)) }, T.invoice) : null,
      order.fulfillment_status === 'ready' ? h('button', { class: 'button primary', type: 'button', onclick: () => act(async () => { await api(`orders/${order.id}/manufacture`, { method: 'POST' }); await refreshOrder() }) }, T.manufacture) : null,
      order.fulfillment_status === 'manufacturing'
        ? [tracking, h('button', { class: 'button primary', type: 'button', onclick: () => { if (confirm(T.shipConfirm)) act(async () => { await api(`orders/${order.id}/ship`, { method: 'POST', body: { tracking: tracking.value.trim() } }); await refreshOrder() }) } }, T.ship)]
        : null))
}

function ordersView () {
  const filters = [['all', T.all], ['ready', T.ready], ['manufacturing', T.manufacturing], ['shipped', T.shipped]]
  const table = h('div', { class: 'table-scroll' }, h('table', { class: 'data-table' },
    h('thead', {}, h('tr', {}, [T.colDate, T.colBuyer, T.colTotal, T.colPayment, T.colStatus].map(label => h('th', {}, label)))),
    h('tbody', {}, state.orders.map(order => h('tr', { tabindex: '0', onclick: () => { state.detail = order; render() } },
      h('td', {}, date(order.created_at)), h('td', {}, order.delivery?.buyer?.name || ''), h('td', {}, money(order.amount_total_minor, order.currency)),
      h('td', {}, T.payment[order.payment_status] || order.payment_status), h('td', {}, T.status[order.fulfillment_status] || order.fulfillment_status))))))
  return [
    h('div', { class: 'toolbar' }, h('div', { class: 'tabs' }, filters.map(([key, label]) => h('button', { class: `tab${state.filter === key ? ' active' : ''}`, type: 'button', onclick: () => { state.filter = key; state.detail = null; load() } }, label))),
      h('button', { class: 'button', type: 'button', onclick: () => act(async () => saveBlob(await (await api('export.csv?limit=100', { raw: true })).blob(), 'orders.csv')) }, T.csv)),
    h('div', { class: 'layout' },
      h('div', { class: 'table-pane' }, state.orders.length ? table : h('p', { class: 'pad muted' }, T.empty), state.next ? h('div', { class: 'list-footer' }, h('button', { class: 'button', type: 'button', onclick: () => act(async () => loadOrders(true)) }, T.more)) : null),
      state.detail ? detailPane(state.detail) : h('div', { class: 'detail-pane muted' }, T.select))
  ]
}

function contactsView () {
  const list = state.contacts || []
  return [
    h('div', { class: 'toolbar' }, h('span', {}), h('button', { class: 'button', type: 'button', onclick: () => act(async () => saveBlob(await (await api('contacts.csv', { raw: true })).blob(), 'contacts.csv')) }, T.csvConsented)),
    list.length
      ? h('div', { class: 'table-scroll' }, h('table', { class: 'data-table' },
        h('thead', {}, h('tr', {}, [T.colEmail, T.colBuyer, T.colLanguage, T.colConsent, T.colVersion, ''].map(label => h('th', {}, label)))),
        h('tbody', {}, list.map(contact => h('tr', {}, h('td', {}, contact.email), h('td', {}, contact.name || ''), h('td', {}, contact.locale || ''), h('td', {}, date(contact.consent_at)), h('td', {}, contact.consent_version || ''),
          h('td', {}, contact.unsubscribed_at ? T.unsubscribed : h('button', { class: 'button', type: 'button', onclick: () => { if (confirm(T.unsubscribeConfirm)) act(async () => { await api('contacts/unsubscribe', { method: 'POST', body: { email: contact.email } }); state.contacts = (await api('contacts')).contacts }) } }, T.unsubscribe)))))))
      : h('p', { class: 'pad muted' }, T.emptyContacts)
  ]
}

function render () {
  const tabs = h('div', { class: 'toolbar' }, h('h1', {}, T.title), h('div', { class: 'tabs' },
    [['orders', T.orders], ['contacts', T.contacts]].map(([key, label]) => h('button', { class: `tab${state.tab === key ? ' active' : ''}`, type: 'button', onclick: () => { state.tab = key; state.detail = null; load() } }, label))),
  h('button', { class: 'button icon-button', type: 'button', title: T.refresh, 'aria-label': T.refresh, onclick: load }, h('span', { class: 'ms', 'aria-hidden': 'true' }, 'refresh')))
  app.replaceChildren(...[tabs, state.message ? h('div', { class: 'alert alert-error' }, state.message) : null, ...(state.tab === 'orders' ? ordersView() : contactsView())].filter(Boolean))
  app.setAttribute('aria-busy', String(state.busy))
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
