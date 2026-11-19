// Kinds of site mail. Each kind can be routed to its own account from the
// panel («Correo»); unrouted kinds use the default account. A new feature that
// sends mail registers its kind here (id stable: it is stored in D1).
export const DEFAULT_ROUTE = 'default'
// Gmail account whose Drive receives large form attachments and invoice copies.
export const DRIVE_KIND = 'drive'

const kinds = new Map()

export function registerMailKind ({ id, es, en, group = 'other', gmailOnly = false }) {
  if (!/^[a-z][a-z0-9_.-]{1,40}$/.test(id) || id === DEFAULT_ROUTE) throw new Error(`mail_kind_invalid:${id}`)
  kinds.set(id, Object.freeze({ id, label: { es, en }, group, gmailOnly }))
}

export function mailKinds () {
  return [...kinds.values()]
}

export function isMailKind (id) {
  return kinds.has(id)
}

registerMailKind({ id: 'forms.owner', group: 'forms', es: 'Avisos de formularios (a ti)', en: 'Form notices (to you)' })
registerMailKind({ id: 'forms.visitor', group: 'forms', es: 'Confirmación a quien envía el formulario', en: 'Confirmation to the visitor' })
registerMailKind({ id: 'commerce.merchant', group: 'commerce', es: 'Avisos de pedidos (a la tienda)', en: 'Order notices (to the shop)' })
registerMailKind({ id: 'commerce.buyer', group: 'commerce', es: 'Correos al comprador (confirmación, envío, factura)', en: 'Buyer mail (confirmation, shipping, invoice)' })
registerMailKind({ id: DRIVE_KIND, group: 'files', gmailOnly: true, es: 'Archivos en Drive (adjuntos grandes y copia de facturas)', en: 'Files in Drive (large attachments and invoice copies)' })
