// Quotes tab of the orders panel (14.11): cart quote requests (core/forms) and the
// proformas made from them. The editor prefills lines from the request's cart
// summary (by SKU against the catalog) and its contact fields; the Worker computes
// the authoritative totals on save. Amounts are integers in minor units.

const TEXT = {
  es: {
    requests: 'Solicitudes pendientes',
    proformas: 'Proformas',
    noRequests: 'No hay solicitudes de presupuesto pendientes.',
    noQuotes: 'Todavía no hay proformas.',
    prepare: 'Preparar proforma',
    blank: 'Proforma sin solicitud',
    colDate: 'Fecha',
    colCustomer: 'Cliente',
    colReference: 'Nº',
    colTotal: 'Total',
    colStatus: 'Estado',
    status: { draft: 'Borrador', sent: 'Enviada', paid: 'Pagada', cancelled: 'Cancelada', expired: 'Caducada' },
    method: { card: 'tarjeta', transfer: 'transferencia' },
    newQuote: 'Nueva proforma',
    request: 'Solicitud',
    customer: 'Cliente',
    name: 'Nombre',
    email: 'Correo',
    phone: 'Teléfono',
    country: 'País',
    postal: 'Código postal',
    line1: 'Dirección',
    line2: 'Dirección (2.ª línea)',
    locality: 'Localidad',
    region: 'Provincia',
    business: 'Razón social (si factura a empresa)',
    taxId: 'NIF/CIF',
    addressHint: 'La dirección completa solo hace falta para marcar un pago por transferencia: con tarjeta la pide Stripe.',
    lines: 'Líneas',
    product: 'Producto',
    other: 'Otro concepto',
    description: 'Concepto',
    quantity: 'Cant.',
    unit: 'Precio',
    amount: 'Importe',
    addLine: 'Añadir línea',
    removeLine: 'Quitar línea',
    shipping: 'Portes',
    discount: 'Descuento',
    discountAmount: 'Importe (€)',
    discountPercent: 'Porcentaje (%)',
    tax: 'IVA',
    taxStandard: rate => `IVA ${rate} %`,
    taxExempt: 'Exento de IVA',
    exemptHint: 'Canarias, Ceuta, Melilla y fuera de la UE suelen ir sin IVA. Confírmalo con tu asesoría.',
    delivery: 'Plazo de envío',
    deliveryPlaceholder: 'p. ej. 7-10 días laborables',
    validity: 'Validez (días)',
    note: 'Nota para el cliente (opcional)',
    invoice: 'Enviar la factura al cliente cuando pague',
    subtotal: 'Subtotal',
    total: 'Total',
    taxIncluded: 'IVA incluido',
    save: 'Guardar',
    saved: 'Guardado.',
    pdf: 'Ver PDF',
    send: 'Enviar al cliente',
    resend: 'Reenviar al cliente',
    sendConfirm: email => `Se enviará la proforma a ${email} desde el correo de la tienda. ¿Seguir?`,
    sentOk: email => `Proforma enviada a ${email}.`,
    transfer: 'Marcar pagado por transferencia',
    transferConfirm: 'Se creará el pedido como pagado por transferencia y se emitirá la factura. ¿Seguir?',
    transferOk: 'Pedido creado y pagado. Lo tienes en la pestaña Pedidos.',
    cancel: 'Cancelar presupuesto',
    cancelConfirm: 'El enlace de pago dejará de funcionar. ¿Cancelar?',
    noPayment: 'El correo no llevará forma de pago: los cobros con tarjeta están cerrados y no hay IBAN configurado. El cliente tendrá que responder al correo.',
    cardOff: 'Pago con tarjeta: cerrado ahora (el correo no llevará botón de pago).',
    editedAfterSend: 'Has cambiado una proforma enviada: el enlace anterior ya no sirve. Vuelve a enviarla.',
    locked: 'Esta proforma ya no se puede cambiar.',
    linkedOrder: status => `Pedido del pago: ${status}`,
    sentAt: 'Enviada',
    validUntil: 'Válida hasta',
    errors: {
      invalid_quote_email: 'Revisa el correo del cliente.',
      invalid_quote_country: 'Elige el país.',
      invalid_quote_lines: 'Revisa las líneas: cada una necesita concepto, cantidad (1-999) y precio.',
      invalid_quote_discount: 'Revisa el descuento.',
      invalid_quote: 'Revisa los datos: falta algo obligatorio o hay un valor no válido.',
      quote_address_required: 'Para marcar la transferencia completa dirección, localidad y código postal del cliente.',
      invalid_postal_code: 'El código postal no es válido para ese país.',
      quote_exists: 'Esa solicitud ya tiene proforma.',
      quote_locked: 'Esta proforma ya no se puede cambiar.',
      quote_changed: 'La proforma ha cambiado en otra pestaña. Actualiza y vuelve a intentarlo.',
      quote_total_too_large: 'El importe es demasiado alto.',
      quotes_disabled: 'Esta tienda no tiene activadas las proformas.',
      invoice_not_configured: 'Falta configurar la facturación (invoice) en la tienda.'
    }
  },
  en: {
    requests: 'Pending requests',
    proformas: 'Pro formas',
    noRequests: 'No pending quote requests.',
    noQuotes: 'No pro formas yet.',
    prepare: 'Prepare pro forma',
    blank: 'Pro forma without a request',
    colDate: 'Date',
    colCustomer: 'Customer',
    colReference: 'No.',
    colTotal: 'Total',
    colStatus: 'Status',
    status: { draft: 'Draft', sent: 'Sent', paid: 'Paid', cancelled: 'Cancelled', expired: 'Expired' },
    method: { card: 'card', transfer: 'transfer' },
    newQuote: 'New pro forma',
    request: 'Request',
    customer: 'Customer',
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    country: 'Country',
    postal: 'Postal code',
    line1: 'Address',
    line2: 'Address (line 2)',
    locality: 'City',
    region: 'Region',
    business: 'Company name (for company invoices)',
    taxId: 'Tax ID',
    addressHint: 'The full address is only needed to mark a bank transfer: card payments collect it on Stripe.',
    lines: 'Lines',
    product: 'Product',
    other: 'Other item',
    description: 'Description',
    quantity: 'Qty',
    unit: 'Price',
    amount: 'Amount',
    addLine: 'Add line',
    removeLine: 'Remove line',
    shipping: 'Shipping',
    discount: 'Discount',
    discountAmount: 'Amount',
    discountPercent: 'Percent (%)',
    tax: 'VAT',
    taxStandard: rate => `VAT ${rate} %`,
    taxExempt: 'VAT exempt',
    exemptHint: 'Canary Islands, Ceuta, Melilla and outside the EU usually go without VAT. Check with your accountant.',
    delivery: 'Delivery time',
    deliveryPlaceholder: 'e.g. 7-10 working days',
    validity: 'Valid for (days)',
    note: 'Note for the customer (optional)',
    invoice: 'Send the invoice to the customer when they pay',
    subtotal: 'Subtotal',
    total: 'Total',
    taxIncluded: 'VAT included',
    save: 'Save',
    saved: 'Saved.',
    pdf: 'View PDF',
    send: 'Send to customer',
    resend: 'Send again',
    sendConfirm: email => `The pro forma will be emailed to ${email} from the shop address. Continue?`,
    sentOk: email => `Pro forma sent to ${email}.`,
    transfer: 'Mark paid by bank transfer',
    transferConfirm: 'The order will be created as paid by transfer and the invoice issued. Continue?',
    transferOk: 'Order created and paid. It is in the Orders tab.',
    cancel: 'Cancel quote',
    cancelConfirm: 'The payment link will stop working. Cancel?',
    noPayment: 'The email will carry no payment method: card payments are closed and no IBAN is configured. The customer will have to reply.',
    cardOff: 'Card payment: closed right now (the email will have no pay button).',
    editedAfterSend: 'You changed a sent pro forma: the previous link no longer works. Send it again.',
    locked: 'This pro forma can no longer be changed.',
    linkedOrder: status => `Payment order: ${status}`,
    sentAt: 'Sent',
    validUntil: 'Valid until',
    errors: {
      invalid_quote_email: 'Check the customer email.',
      invalid_quote_country: 'Choose the country.',
      invalid_quote_lines: 'Check the lines: each needs a description, quantity (1-999) and price.',
      invalid_quote_discount: 'Check the discount.',
      invalid_quote: 'Check the data: something required is missing or a value is not valid.',
      quote_address_required: 'To mark the transfer, fill in the customer address, city and postal code.',
      invalid_postal_code: 'The postal code is not valid for that country.',
      quote_exists: 'That request already has a pro forma.',
      quote_locked: 'This pro forma can no longer be changed.',
      quote_changed: 'The pro forma changed in another tab. Refresh and try again.',
      quote_total_too_large: 'The amount is too high.',
      quotes_disabled: 'This shop does not have pro formas enabled.',
      invoice_not_configured: 'The shop invoice settings (invoice) are missing.'
    }
  }
}

// Countries offered in the editor (ISO code, Spanish and English names).
const COUNTRIES = [
  ['ES', 'España', 'Spain'], ['PT', 'Portugal', 'Portugal'], ['FR', 'Francia', 'France'], ['AD', 'Andorra', 'Andorra'],
  ['IT', 'Italia', 'Italy'], ['DE', 'Alemania', 'Germany'], ['BE', 'Bélgica', 'Belgium'], ['NL', 'Países Bajos', 'Netherlands'],
  ['LU', 'Luxemburgo', 'Luxembourg'], ['IE', 'Irlanda', 'Ireland'], ['AT', 'Austria', 'Austria'], ['DK', 'Dinamarca', 'Denmark'],
  ['SE', 'Suecia', 'Sweden'], ['FI', 'Finlandia', 'Finland'], ['PL', 'Polonia', 'Poland'], ['CZ', 'Chequia', 'Czechia'],
  ['GR', 'Grecia', 'Greece'], ['MT', 'Malta', 'Malta'], ['CY', 'Chipre', 'Cyprus'], ['CH', 'Suiza', 'Switzerland'],
  ['GB', 'Reino Unido', 'United Kingdom'], ['NO', 'Noruega', 'Norway'], ['US', 'Estados Unidos', 'United States'],
  ['MX', 'México', 'Mexico'], ['AR', 'Argentina', 'Argentina'], ['CO', 'Colombia', 'Colombia'], ['CL', 'Chile', 'Chile'],
  ['PE', 'Perú', 'Peru'], ['UY', 'Uruguay', 'Uruguay']
]
const EU = new Set(['ES', 'PT', 'FR', 'IT', 'DE', 'BE', 'NL', 'LU', 'IE', 'AT', 'DK', 'SE', 'FI', 'PL', 'CZ', 'GR', 'MT', 'CY'])
// Spanish postal areas outside the VAT territory: Canarias, Ceuta, Melilla.
const NO_VAT_ES = /^(35|38|51|52)/

const fold = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

function countryCode (value, fallback) {
  const text = fold(value)
  if (!text) return fallback
  const found = COUNTRIES.find(([code, es, en]) => fold(code) === text || fold(es) === text || fold(en) === text)
  return found ? found[0] : fallback
}

function suggestedTax (country, postal) {
  if (country === 'ES') return NO_VAT_ES.test(postal || '') ? 'exempt' : 'standard'
  return EU.has(country) ? 'standard' : 'exempt'
}

// "12,5" / "12.50" / "1.234,56" → minor units; null when not a number.
function parseMoney (value, minorUnit = 2) {
  let text = String(value ?? '').replace(/[€\s]/g, '')
  if (!text) return 0
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(text)) return null
  const [whole, fraction = ''] = text.split('.')
  if (fraction.length > minorUnit) return null
  return Number(whole) * (10 ** minorUnit) + Number(fraction.padEnd(minorUnit, '0') || 0)
}

function formatInput (minor, minorUnit = 2, lang = 'es') {
  if (!Number.isSafeInteger(minor)) return ''
  const text = (minor / (10 ** minorUnit)).toFixed(minorUnit)
  return lang === 'es' ? text.replace('.', ',') : text
}

// Cart summary written by commerce/quote-request.js: "2 × Name (SKU) · 140,00 € = 280,00 €".
function parseCart (summary, products) {
  const bySku = new Map(products.map(product => [product.sku, product]))
  const lines = []
  for (const row of String(summary || '').split('\n')) {
    const match = row.match(/^(\d{1,3}) × (.+?)(?: \(([A-Z0-9][A-Z0-9_-]{2,63})\))? · /)
    if (!match) continue
    const product = match[3] ? bySku.get(match[3]) : null
    lines.push({
      product_id: product?.id || '',
      description: product?.name || match[2],
      quantity: Number(match[1]),
      unit_minor: product?.price_minor ?? 0
    })
  }
  return lines
}

function roundHalfUp (numerator, denominator) {
  return Math.floor((2 * numerator + denominator) / (2 * denominator))
}

// Same arithmetic as commerce/quotes.js, for the live preview only.
function previewTotals (input, setup) {
  const tax = input.tax === 'exempt' ? { mode: 'exempt', rateBps: 0 } : setup.tax
  const split = value => {
    if (tax.mode === 'exempt' || !value) return { tax: 0, total: value }
    if (tax.mode === 'inclusive') return { tax: roundHalfUp(value * tax.rateBps, 10000 + tax.rateBps), total: value }
    const added = roundHalfUp(value * tax.rateBps, 10000)
    return { tax: added, total: value + added }
  }
  let subtotal = 0
  let taxTotal = 0
  let total = 0
  for (const line of input.lines) {
    const amount = (line.unit_minor || 0) * (line.quantity || 0)
    subtotal += amount
    const parts = split(amount)
    taxTotal += parts.tax
    total += parts.total
  }
  const discount = !input.discount ? 0 : input.discount.type === 'amount' ? Math.min(input.discount.value, subtotal) : roundHalfUp(subtotal * input.discount.value, 10000)
  const d = split(discount)
  const s = split(input.shipping_minor || 0)
  return { subtotal, discount, shipping: input.shipping_minor || 0, tax: taxTotal - d.tax + s.tax, total: total - d.total + s.total, mode: tax.mode }
}

export function createQuotesTab ({ h, api, lang, money, date, saveBlob, githubToken, render, fail }) {
  const T = TEXT[lang] || TEXT.en
  const tab = { data: null, forms: null, editing: null, message: '', error: '' }

  async function quoteForms () {
    if (tab.forms) return tab.forms
    try {
      const response = await fetch('/api/forms/admin/summary', { headers: { authorization: `GitHub ${githubToken()}` }, cache: 'no-store', credentials: 'omit' })
      tab.forms = response.ok ? ((await response.json()).quoteForms || []) : []
    } catch {
      tab.forms = []
    }
    return tab.forms
  }

  async function load () {
    const forms = await quoteForms()
    const form = forms[0]?.form
    tab.data = await api(`quotes${form ? `?form=${encodeURIComponent(form)}` : ''}`)
    tab.data.form = forms[0] || null
  }

  const field = (fields, name) => name ? (fields.find(([key]) => key === name)?.[1] ?? '') : ''

  function requestInfo (request) {
    const names = tab.data.form?.fields || {}
    return { name: field(request.fields, names.name), email: field(request.fields, names.email) }
  }

  function draftFromRequest (request) {
    const setup = tab.data.setup
    const names = tab.data.form?.fields || {}
    const country = countryCode(field(request.fields, names.country), setup.countries[0] || 'ES')
    const postal = field(request.fields, names.postal)
    const lines = parseCart(field(request.fields, tab.data.form?.cart), setup.products)
    return {
      submission_id: request.id,
      language: setup.language,
      customer: { name: field(request.fields, names.name), email: field(request.fields, names.email), phone: field(request.fields, names.phone), country, postal_code: postal },
      lines: lines.length ? lines : [{ product_id: '', description: '', quantity: 1, unit_minor: 0 }],
      shipping_minor: 0,
      discount: null,
      tax: suggestedTax(country, postal),
      delivery: '',
      note: '',
      validity_days: setup.validity_days,
      invoice_requested: false
    }
  }

  function draftFromQuote (quote) {
    const data = quote.data
    const c = data.customer
    return {
      submission_id: data.submissionId || null,
      language: data.language,
      customer: { name: c.name, email: c.email, phone: c.phone, country: c.country, postal_code: c.postalCode, line1: c.line1, line2: c.line2, locality: c.locality, region: c.region, business_name: c.businessName, tax_id: c.taxId },
      lines: data.lines.map(line => ({ product_id: line.productId || '', description: line.description, quantity: line.quantity, unit_minor: line.unitMinor })),
      shipping_minor: data.shipping?.totalMinor || 0,
      discount: data.discount ? { type: data.discount.type, value: data.discount.value } : null,
      tax: data.tax.mode === 'exempt' ? 'exempt' : 'standard',
      delivery: data.delivery,
      note: data.note,
      validity_days: data.validityDays,
      invoice_requested: Boolean(data.invoiceRequested)
    }
  }

  function open (draft, quote = null, request = null) {
    tab.editing = { draft, quote, request }
    tab.message = ''
    tab.error = ''
    render()
  }

  function errorText (error) {
    return T.errors[error.code] || `${error.code || error.status}`
  }

  async function run (action) {
    tab.message = ''
    tab.error = ''
    try {
      await action()
    } catch (error) {
      if (error.status === 401 || error.code === 'signin') return fail(error)
      tab.error = errorText(error)
    }
    render()
  }

  function statusOf (quote) {
    if (quote.status === 'sent' && quote.valid_until && quote.valid_until * 1000 < Date.now()) return 'expired'
    return quote.status
  }

  function listView () {
    const data = tab.data
    const quoted = new Set(data.quotes.map(quote => quote.submission_id).filter(Boolean))
    const pending = data.requests.filter(request => !quoted.has(request.id))
    const requestsTable = pending.length
      ? h('div', { class: 'table-scroll compact' }, h('table', { class: 'data-table' },
        h('thead', {}, h('tr', {}, [T.colDate, T.colCustomer, ''].map(label => h('th', {}, label)))),
        h('tbody', {}, pending.map(request => {
          const info = requestInfo(request)
          return h('tr', { tabindex: '0', onclick: () => open(draftFromRequest(request), null, request) },
            h('td', { class: 'nowrap' }, date(Math.floor(request.created_at / 1000))), h('td', {}, [info.name, info.email].filter(Boolean).join(' · ')),
            h('td', {}, h('button', { class: 'button primary', type: 'button' }, T.prepare)))
        }))))
      : h('p', { class: 'pad muted' }, T.noRequests)
    const quotesTable = data.quotes.length
      ? h('div', { class: 'table-scroll' }, h('table', { class: 'data-table' },
        h('thead', {}, h('tr', {}, [T.colReference, T.colCustomer, T.colTotal, T.colStatus, T.colDate].map(label => h('th', {}, label)))),
        h('tbody', {}, data.quotes.map(quote => {
          const status = statusOf(quote)
          return h('tr', { tabindex: '0', 'aria-current': tab.editing?.quote?.id === quote.id ? 'true' : null, onclick: () => open(draftFromQuote(quote), quote) },
            h('td', { class: 'nowrap' }, quote.reference), h('td', {}, quote.data.customer.name), h('td', { class: 'nowrap' }, money(quote.total_minor, quote.currency)),
            h('td', {}, h('span', { class: `chip${status === 'paid' ? ' chip-sent' : status === 'expired' ? ' chip-held' : status === 'cancelled' ? ' chip-discarded' : ''}` }, `${T.status[status]}${quote.payment_method ? ` · ${T.method[quote.payment_method]}` : ''}`)),
            h('td', { class: 'nowrap' }, date(quote.sent_at || quote.created_at)))
        }))))
      : h('p', { class: 'pad muted' }, T.noQuotes)
    return h('div', { class: 'table-pane' },
      h('div', { class: 'table-bar' }, h('strong', {}, T.requests), h('span', { class: 'spacer' }),
        h('button', { class: 'button', type: 'button', onclick: () => open({ ...draftFromRequest({ id: null, fields: [] }), submission_id: null }) }, T.blank)),
      requestsTable,
      h('div', { class: 'table-bar' }, h('strong', {}, T.proformas)),
      quotesTable)
  }

  function editorView () {
    const { draft, quote, request } = tab.editing
    const setup = tab.data.setup
    const unit = setup.minor_unit
    const locked = quote && !['draft', 'sent'].includes(quote.status)
    const input = (value, attrs = {}) => h('input', { class: 'input', type: 'text', value: value ?? '', disabled: locked, ...attrs })
    const labelled = (label, control, wide = false) => h('label', { class: `editor-field${wide ? ' wide' : ''}` }, h('span', {}, label), control)

    const c = draft.customer
    const inputs = {
      name: input(c.name, { maxlength: '120', autocomplete: 'off' }),
      email: input(c.email, { type: 'email', maxlength: '254' }),
      phone: input(c.phone, { maxlength: '32' }),
      country: h('select', { class: 'select', disabled: locked }, COUNTRIES.map(([code, es, en]) => h('option', { value: code, selected: code === c.country }, lang === 'es' ? es : en))),
      postal: input(c.postal_code, { maxlength: '16' }),
      line1: input(c.line1, { maxlength: '200' }),
      line2: input(c.line2, { maxlength: '200' }),
      locality: input(c.locality, { maxlength: '100' }),
      region: input(c.region, { maxlength: '100' }),
      business: input(c.business_name, { maxlength: '200' }),
      taxId: input(c.tax_id, { maxlength: '40' }),
      shipping: input(formatInput(draft.shipping_minor, unit, lang), { inputmode: 'decimal', class: 'input money' }),
      discountType: h('select', { class: 'select', disabled: locked }, h('option', { value: 'amount', selected: draft.discount?.type !== 'percent' }, T.discountAmount), h('option', { value: 'percent', selected: draft.discount?.type === 'percent' }, T.discountPercent)),
      discountValue: input(draft.discount ? (draft.discount.type === 'percent' ? String(draft.discount.value / 100).replace('.', lang === 'es' ? ',' : '.') : formatInput(draft.discount.value, unit, lang)) : '', { inputmode: 'decimal', class: 'input money' }),
      tax: h('select', { class: 'select', disabled: locked },
        h('option', { value: 'standard', selected: draft.tax !== 'exempt' }, T.taxStandard(String(setup.tax.rateBps / 100).replace('.', lang === 'es' ? ',' : '.'))),
        h('option', { value: 'exempt', selected: draft.tax === 'exempt' }, T.taxExempt)),
      delivery: input(draft.delivery, { maxlength: '200', placeholder: T.deliveryPlaceholder }),
      validity: input(String(draft.validity_days), { type: 'number', min: '1', max: '90', class: 'input small-number' }),
      note: h('textarea', { class: 'input', rows: '3', maxlength: '1000', disabled: locked }, draft.note || ''),
      invoice: h('input', { type: 'checkbox', checked: draft.invoice_requested, disabled: locked })
    }

    // Lines: rebuilt on add/remove; inputs read back on collect().
    const lineRows = []
    const linesBody = h('tbody', {})
    const productOptions = selected => [h('option', { value: '' }, T.other), ...setup.products.map(product => h('option', { value: product.id, selected: product.id === selected }, `${product.name} (${product.sku})`))]
    function addLine (line) {
      const row = {
        product: h('select', { class: 'select', disabled: locked }, productOptions(line.product_id)),
        description: input(line.description, { maxlength: '200' }),
        quantity: input(String(line.quantity), { type: 'number', min: '1', max: '999', class: 'input small-number' }),
        unit: input(formatInput(line.unit_minor, unit, lang), { inputmode: 'decimal', class: 'input money' }),
        amount: h('td', { class: 'nowrap amount' })
      }
      row.product.addEventListener('change', () => {
        const product = setup.products.find(item => item.id === row.product.value)
        if (product) {
          row.description.value = product.name
          if (product.price_minor !== null) row.unit.value = formatInput(product.price_minor, unit, lang)
        }
        update()
      })
      const remove = h('button', { class: 'button icon-button', type: 'button', title: T.removeLine, 'aria-label': T.removeLine, disabled: locked, onclick: () => { lineRows.splice(lineRows.indexOf(row), 1); row.node.remove(); update() } }, h('span', { class: 'ms', 'aria-hidden': 'true' }, 'delete'))
      row.node = h('tr', {}, h('td', {}, row.product), h('td', {}, row.description), h('td', {}, row.quantity), h('td', {}, row.unit), row.amount, h('td', {}, remove))
      lineRows.push(row)
      linesBody.append(row.node)
    }
    draft.lines.forEach(addLine)

    function collect () {
      const percent = inputs.discountType.value === 'percent'
      const rawDiscount = inputs.discountValue.value.trim()
      let discount = null
      if (rawDiscount) {
        const value = percent ? parseMoney(rawDiscount, 2) : parseMoney(rawDiscount, unit)
        discount = value === null ? { type: percent ? 'percent' : 'amount', value: -1 } : { type: percent ? 'percent' : 'amount', value }
      }
      return {
        ...(quote ? { id: quote.id } : {}),
        submission_id: draft.submission_id || null,
        language: draft.language,
        customer: {
          name: inputs.name.value, email: inputs.email.value, phone: inputs.phone.value, country: inputs.country.value, postal_code: inputs.postal.value,
          line1: inputs.line1.value, line2: inputs.line2.value, locality: inputs.locality.value, region: inputs.region.value, business_name: inputs.business.value, tax_id: inputs.taxId.value
        },
        lines: lineRows.map(row => ({ product_id: row.product.value || null, description: row.description.value, quantity: Number(row.quantity.value), unit_minor: parseMoney(row.unit.value, unit) ?? -1 })),
        shipping_minor: parseMoney(inputs.shipping.value, unit) ?? -1,
        discount,
        tax: inputs.tax.value,
        delivery: inputs.delivery.value,
        note: inputs.note.value,
        validity_days: Number(inputs.validity.value),
        invoice_requested: inputs.invoice.checked
      }
    }

    const totalsNode = h('dl', { class: 'fields totals' })
    function update () {
      const value = collect()
      lineRows.forEach((row, index) => {
        const line = value.lines[index]
        row.amount.textContent = line.unit_minor >= 0 && line.quantity > 0 ? money(line.unit_minor * line.quantity, setup.currency) : '—'
      })
      const valid = value.lines.every(line => line.unit_minor >= 0) && value.shipping_minor >= 0 && (!value.discount || value.discount.value >= 0)
      const totals = valid ? previewTotals(value, setup) : null
      const row = (label, amount) => [h('dt', {}, label), h('dd', {}, amount)]
      totalsNode.replaceChildren(...(totals
        ? [...row(T.subtotal, money(totals.subtotal, setup.currency)),
            ...(totals.discount ? row(T.discount, money(-totals.discount, setup.currency)) : []),
            ...(totals.shipping ? row(T.shipping, money(totals.shipping, setup.currency)) : []),
            ...row(T.total, h('strong', {}, money(totals.total, setup.currency))),
            ...(totals.mode === 'inclusive' && totals.tax ? row(T.taxIncluded, money(totals.tax, setup.currency)) : totals.mode === 'exclusive' ? row(T.tax, money(totals.tax, setup.currency)) : [])]
        : row(T.total, '—')))
    }
    const form = h('div', { class: 'editor', oninput: update, onchange: update })

    async function save () {
      const result = await api('quotes', { method: 'POST', body: collect() })
      tab.editing.quote = result.quote
      tab.editing.draft = draftFromQuote(result.quote)
      await load()
      return result.quote
    }

    const actions = []
    if (!locked) {
      actions.push(h('button', { class: 'button', type: 'button', onclick: () => run(async () => { const wasSent = quote?.status === 'sent'; await save(); tab.message = wasSent ? T.editedAfterSend : T.saved }) }, T.save))
      actions.push(h('button', { class: 'button primary', type: 'button', onclick: () => { const email = inputs.email.value.trim(); if (confirm(T.sendConfirm(email))) run(async () => { const saved = await save(); const result = await api(`quotes/${saved.id}/send`, { method: 'POST' }); tab.editing.quote = result.quote; tab.editing.draft = draftFromQuote(result.quote); await load(); tab.message = T.sentOk(email) }) } }, quote?.status === 'sent' ? T.resend : T.send))
    }
    if (quote) actions.push(h('button', { class: 'button', type: 'button', onclick: () => run(async () => { const saved = locked ? quote : await save(); saveBlob(await (await api(`quotes/${saved.id}/proforma.pdf`, { raw: true })).blob(), `${saved.reference}.pdf`) }) }, T.pdf))
    if (!locked && quote) {
      actions.push(h('button', { class: 'button', type: 'button', onclick: () => { if (confirm(T.transferConfirm)) run(async () => { const saved = await save(); const result = await api(`quotes/${saved.id}/transfer`, { method: 'POST' }); tab.editing.quote = result.quote; await load(); tab.message = T.transferOk }) } }, T.transfer))
      actions.push(h('button', { class: 'button danger', type: 'button', onclick: () => { if (confirm(T.cancelConfirm)) run(async () => { const result = await api(`quotes/${quote.id}/cancel`, { method: 'POST' }); tab.editing.quote = result.quote; await load() }) } }, T.cancel))
    }

    const status = quote ? statusOf(quote) : null
    const requestFields = request?.fields?.length ? request.fields : null
    form.append(...[
      h('div', { class: 'detail-head' },
        h('button', { class: 'button back', type: 'button', onclick: () => { tab.editing = null; render() } }, '←'),
        h('h2', {}, quote ? `${quote.reference} · ${T.status[status]}` : T.newQuote)),
      quote?.sent_at ? h('p', { class: 'muted small' }, `${T.sentAt}: ${date(quote.sent_at)}${quote.valid_until ? ` · ${T.validUntil}: ${date(quote.valid_until)}` : ''}${quote.order_payment_status ? ` · ${T.linkedOrder(quote.order_payment_status)}` : ''}`) : null,
      tab.message ? h('div', { class: 'alert alert-warning' }, tab.message) : null,
      tab.error ? h('div', { class: 'alert alert-error' }, tab.error) : null,
      locked ? h('div', { class: 'alert alert-warning' }, T.locked) : null,
      !locked && !setup.card && !setup.transfer ? h('div', { class: 'alert alert-warning' }, T.noPayment) : !locked && !setup.card ? h('p', { class: 'muted small' }, T.cardOff) : null,
      requestFields ? [h('h3', {}, T.request), h('dl', { class: 'fields' }, requestFields.flatMap(([key, value]) => [h('dt', {}, key), h('dd', {}, String(value ?? ''))]))] : null,
      h('h3', {}, T.customer),
      h('div', { class: 'editor-grid' },
        labelled(T.name, inputs.name), labelled(T.email, inputs.email), labelled(T.phone, inputs.phone), labelled(T.country, inputs.country),
        labelled(T.postal, inputs.postal), labelled(T.locality, inputs.locality), labelled(T.line1, inputs.line1, true), labelled(T.line2, inputs.line2, true),
        labelled(T.region, inputs.region), labelled(T.taxId, inputs.taxId), labelled(T.business, inputs.business, true)),
      h('p', { class: 'muted small' }, T.addressHint),
      h('h3', {}, T.lines),
      h('div', { class: 'table-scroll editor-lines' }, h('table', { class: 'data-table' },
        h('thead', {}, h('tr', {}, [T.product, T.description, T.quantity, T.unit, T.amount, ''].map(label => h('th', {}, label)))), linesBody)),
      locked ? null : h('div', { class: 'actions' }, h('button', { class: 'button', type: 'button', onclick: () => { addLine({ product_id: '', description: '', quantity: 1, unit_minor: 0 }); update() } }, T.addLine)),
      h('div', { class: 'editor-grid' },
        labelled(T.shipping, inputs.shipping), labelled(T.tax, inputs.tax),
        labelled(T.discount, h('span', { class: 'inline' }, inputs.discountType, inputs.discountValue)), labelled(T.validity, inputs.validity),
        labelled(T.delivery, inputs.delivery, true), labelled(T.note, inputs.note, true)),
      h('p', { class: 'muted small' }, T.exemptHint),
      h('label', { class: 'editor-check' }, inputs.invoice, h('span', {}, T.invoice)),
      totalsNode,
      h('div', { class: 'actions' }, actions)].flat().filter(Boolean))
    update()
    return h('section', { class: 'detail-pane' }, form)
  }

  return {
    load,
    view () {
      if (!tab.data) return [h('p', { class: 'pad muted' }, '…')]
      return [h('div', { class: `layout${tab.editing ? ' has-detail' : ''}` }, listView(), tab.editing ? editorView() : h('div', { class: 'detail-pane empty muted' }, T.prepare))]
    },
    reset () {
      tab.editing = null
      tab.message = ''
      tab.error = ''
    }
  }
}
