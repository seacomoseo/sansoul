import i18n from './params'

const PRODUCT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_ITEMS = 10
const MAX_QUANTITY = 10
const SNAPSHOT_KEY = 'sansoul-commerce-checkout:v1'

export function normalizeStoredCart (value) {
  const validObject = value && typeof value === 'object' && !Array.isArray(value)
  const validRoot = validObject && Object.keys(value).length === 1 && Array.isArray(value.items)
  const source = validRoot ? value.items : []
  const items = []
  const seen = new Set()
  let discarded = !validRoot

  for (const item of source) {
    const validItem = item && typeof item === 'object' && !Array.isArray(item) &&
      Object.keys(item).every(key => key === 'id' || key === 'quantity') &&
      Object.keys(item).length === 2 && PRODUCT_ID.test(item.id || '') &&
      Number.isSafeInteger(item.quantity) && item.quantity >= 1 && item.quantity <= MAX_QUANTITY &&
      !seen.has(item.id)
    if (!validItem || items.length >= MAX_ITEMS) {
      discarded = true
      continue
    }
    seen.add(item.id)
    items.push({ id: item.id, quantity: item.quantity })
  }
  return { items, discarded }
}

function message (key) {
  return i18n.commerce?.[key.replace(/^commerce_/, '')] || key
}

function parseProducts (root) {
  try {
    const source = root.querySelector('[data-commerce-products]')
    const entries = JSON.parse(source?.textContent || '[]')
    if (!Array.isArray(entries)) return new Map()
    return new Map(entries.filter(item => item && PRODUCT_ID.test(item.id || '')).map(item => {
      const price = Number(item.price)
      const minorUnit = new Intl.NumberFormat('en', {
        style: 'currency',
        currency: root.dataset.commerceCurrency.toUpperCase()
      }).resolvedOptions().maximumFractionDigits
      const priceMinor = Number.isFinite(price) ? Math.round(price * (10 ** minorUnit)) : null
      return [item.id, { ...item, priceMinor }]
    }))
  } catch {
    return new Map()
  }
}

function sameItems (left, right) {
  return JSON.stringify([...left].sort((a, b) => a.id.localeCompare(b.id))) ===
    JSON.stringify([...right].sort((a, b) => a.id.localeCompare(b.id)))
}

function money (minor, currency) {
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits
  return new Intl.NumberFormat(i18n.lang || document.documentElement.lang || 'es', {
    style: 'currency', currency, maximumFractionDigits: digits
  }).format(minor / (10 ** digits))
}

function makeLine (item, products, currency, template) {
  const product = products.get(item.id)
  const name = product?.name || message('commerce_unavailable_product')
  const line = template.content.firstElementChild.cloneNode(true)
  const part = selector => line.querySelector(selector)

  const thumb = part('[data-line-link]')
  const image = part('[data-line-img]')
  if (product?.image) image.src = product.image
  else image.remove()
  const nameNode = part('[data-line-name]')
  nameNode.textContent = name
  if (product?.url) {
    thumb.href = product.url
    nameNode.href = product.url
  } else {
    thumb.removeAttribute('href')
    nameNode.removeAttribute('href')
  }

  const unit = part('[data-line-unit]')
  if (product?.quote) unit.textContent = message('commerce_quote_only')
  else if (Number.isSafeInteger(product?.priceMinor)) unit.textContent = money(product.priceMinor, currency)
  else unit.textContent = message('commerce_unavailable_product')

  const stepper = part('.commerce__stepper')
  const total = part('[data-line-total]')
  if (product && !product.quote) {
    const quantity = part('[data-line-quantity]')
    quantity.value = String(item.quantity)
    quantity.dataset.commerceLineQuantity = item.id
    quantity.setAttribute('aria-label', `${message('commerce_quantity_of')} ${name}`)
    stepper.querySelector('[data-commerce-step="-1"]').disabled = item.quantity <= 1
    stepper.querySelector('[data-commerce-step="1"]').disabled = item.quantity >= MAX_QUANTITY
    if (Number.isSafeInteger(product.priceMinor)) total.textContent = money(product.priceMinor * item.quantity, currency)
    else total.remove()
  } else {
    stepper.remove()
    total.remove()
  }

  const remove = part('[data-commerce-remove]')
  remove.dataset.commerceRemove = item.id
  remove.setAttribute('aria-label', `${message('commerce_remove')} ${name}`)
  return line
}

export function initCommerce () {
  const root = document.querySelector('[data-commerce-root]')
  if (!root || root.dataset.commerceInitialized === 'true') return
  root.dataset.commerceInitialized = 'true'
  const surfaces = [root, ...document.querySelectorAll('[data-commerce-cart-page]')]
  const commerceNodes = selector => surfaces.flatMap(surface => [...surface.querySelectorAll(selector)])

  const currency = (root.dataset.commerceCurrency || 'EUR').toUpperCase()
  const products = parseProducts(root)
  const dialog = root.querySelector('[data-commerce-drawer]')
  const trigger = root.querySelector('[data-commerce-open]')
  const closeButton = root.querySelector('[data-commerce-close]')
  const lineTemplate = root.querySelector('[data-commerce-line-template]')
  let persistent = true
  let statusMessage = ''
  let opener = null
  let checkoutAttempt = null
  let checkoutBusy = false
  let quoteBusy = false
  let items = []
  // Destination and quote live only in memory: the postal code is never stored.
  let destination = null
  let currentQuote = null
  let quoteRequired = false
  let renderedCount = null

  const storageKey = `sansoul-commerce-cart:v1:${new URL(root.dataset.commerceStore || location.origin, location.href).origin}`
  const sessionSnapshot = () => {
    try {
      const value = JSON.parse(sessionStorage.getItem(SNAPSHOT_KEY) || 'null')
      return normalizeStoredCart(value)
    } catch {
      return { items: [], discarded: true }
    }
  }

  try {
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      try {
        const cart = normalizeStoredCart(JSON.parse(stored))
        items = cart.items
        if (cart.discarded) statusMessage = message('commerce_storage_recovered')
      } catch {
        statusMessage = message('commerce_storage_recovered')
      }
    }
  } catch {
    persistent = false
    statusMessage = message('commerce_storage_unavailable')
  }

  function save () {
    if (!persistent) return
    try {
      localStorage.setItem(storageKey, JSON.stringify({ items }))
    } catch {
      persistent = false
      statusMessage = message('commerce_storage_unavailable')
    }
  }

  function render () {
    const focusedQuantity = document.activeElement?.dataset.commerceLineQuantity
    const focusedSurface = document.activeElement?.closest('[data-commerce-drawer], [data-commerce-cart-page]')
    const count = items.reduce((total, item) => total + item.quantity, 0)
    root.querySelectorAll('[data-commerce-count]').forEach(node => {
      node.textContent = count > 99 ? '99+' : String(count)
      node.hidden = count === 0
    })
    commerceNodes('[data-commerce-count-label]').forEach(node => { node.textContent = count ? `(${count})` : '' })
    if (trigger) {
      trigger.hidden = false
      trigger.setAttribute('aria-label', count ? `${message('commerce_open_cart')} (${count})` : message('commerce_open_cart'))
      if (count > renderedCount && renderedCount !== null) {
        trigger.classList.remove('commerce__cart-trigger--bump')
        void trigger.offsetWidth
        trigger.classList.add('commerce__cart-trigger--bump')
      }
    }
    renderedCount = count
    commerceNodes('[data-commerce-empty]').forEach(node => { node.hidden = items.length > 0 })
    commerceNodes('[data-commerce-filled]').forEach(node => { node.hidden = items.length === 0 })
    commerceNodes('[data-commerce-catalog-link]').forEach(node => { node.hidden = items.length > 0 })
    commerceNodes('[data-commerce-lines]').forEach(list => {
      list.replaceChildren(...(lineTemplate ? items.map(item => makeLine(item, products, currency, lineTemplate)) : []))
    })
    if (focusedQuantity) {
      focusedSurface?.querySelector(`[data-commerce-line-quantity="${focusedQuantity}"]`)?.focus()
    }

    const complete = items.length > 0 && items.every(item => {
      const product = products.get(item.id)
      return product && !product.quote && Number.isSafeInteger(product.priceMinor)
    })
    const subtotalMinor = complete
      ? items.reduce((total, item) => total + products.get(item.id).priceMinor * item.quantity, 0)
      : null
    const quote = complete && quoteIsCurrent() ? currentQuote.quote : null
    commerceNodes('[data-commerce-subtotal]').forEach(node => { node.textContent = quote ? money(quote.subtotal_minor, currency) : subtotalMinor === null ? '—' : money(subtotalMinor, currency) })
    commerceNodes('[data-commerce-shipping]').forEach(node => {
      node.textContent = quote ? (quote.shipping_minor ? money(quote.shipping_minor, currency) : message('commerce_free')) : message('commerce_calculated_later')
      node.toggleAttribute('data-pending', !quote)
    })
    commerceNodes('[data-commerce-tax-label]').forEach(node => { node.textContent = message(quote && quote.added_tax_minor === 0 ? 'commerce_tax_included' : 'commerce_tax') })
    commerceNodes('[data-commerce-tax]').forEach(node => {
      node.textContent = quote ? money(quote.tax_minor, currency) : message('commerce_calculated_later')
      node.toggleAttribute('data-pending', !quote)
    })
    commerceNodes('[data-commerce-quote-hint]').forEach(node => { node.hidden = Boolean(quote) || quoteRequired || !complete })
    commerceNodes('[data-commerce-total]').forEach(node => {
      node.textContent = quote ? money(quote.total_minor, currency) : '—'
      node.toggleAttribute('data-pending', !quote)
    })
    commerceNodes('[data-commerce-quote]').forEach(button => {
      button.disabled = !complete || quoteBusy || checkoutBusy
      button.toggleAttribute('aria-busy', quoteBusy)
    })
    commerceNodes('[data-commerce-quote-request]').forEach(node => { node.hidden = !(quoteRequired && items.length > 0) })
    commerceNodes('[data-commerce-checkout]').forEach(button => {
      button.disabled = !quote || root.dataset.commerceCheckoutApproved !== 'true' || checkoutBusy || quoteBusy
      button.toggleAttribute('aria-busy', checkoutBusy)
      button.hidden = quoteRequired && items.length > 0
    })
    commerceNodes('[data-commerce-checkout-note]').forEach(node => {
      node.hidden = quoteRequired && items.length > 0
      node.textContent = root.dataset.commerceCheckoutApproved === 'true'
        ? message('commerce_checkout_note')
        : message('commerce_checkout_disabled')
    })
    commerceNodes('[data-commerce-status]').forEach(node => {
      node.textContent = statusMessage
      node.hidden = !statusMessage
    })
    document.querySelectorAll('[data-commerce-product-actions]').forEach(node => {
      node.hidden = !products.has(node.dataset.productId)
    })
  }

  function updateItems (next) {
    quoteRequired = false
    const normalized = normalizeStoredCart({ items: next })
    items = normalized.items.sort((a, b) => a.id.localeCompare(b.id))
    if (!sameItems(items, checkoutAttempt?.items || [])) checkoutAttempt = null
    save()
    render()
  }

  const quoteScope = () => JSON.stringify({ items, destination })

  function quoteIsCurrent () {
    return Boolean(currentQuote && destination && currentQuote.scope === quoteScope())
  }

  function readDestination (form) {
    const country = form?.querySelector('[data-commerce-country]')?.value || ''
    const postalCode = (form?.querySelector('[data-commerce-postal]')?.value || '').trim()
    return /^[A-Z]{2}$/.test(country) && postalCode ? { country, postalCode } : null
  }

  function syncDestinationInputs (source) {
    commerceNodes('[data-commerce-destination]').forEach(form => {
      if (form === source || !destination) return
      const country = form.querySelector('[data-commerce-country]')
      const postal = form.querySelector('[data-commerce-postal]')
      if (country) country.value = destination.country
      if (postal) postal.value = destination.postalCode
    })
  }

  // The server is the only source of shipping, tax and total; the browser displays them.
  async function requestQuote (form) {
    if (quoteBusy || checkoutBusy) return
    const next = readDestination(form)
    if (!next) {
      announce('commerce_invalid_postal_code')
      form?.querySelector('[data-commerce-postal]')?.focus()
      return
    }
    destination = next
    currentQuote = null
    quoteRequired = false
    checkoutAttempt = null
    syncDestinationInputs(form)
    quoteBusy = true
    statusMessage = message('commerce_quoting')
    render()
    const scope = quoteScope()
    try {
      const response = await fetch('/api/commerce/quote', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ items, destination })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        const errorKeys = {
          destination_quote_required: 'commerce_quote_required',
          shipping_quote_required: 'commerce_quote_required',
          invalid_postal_code: 'commerce_invalid_postal_code',
          destination_not_supported: 'commerce_quote_required',
          quote_only: 'commerce_quote_only',
          product_unavailable: 'commerce_unavailable_product',
          checkout_not_approved: 'commerce_checkout_disabled'
        }
        quoteRequired = errorKeys[result.error] === 'commerce_quote_required'
        throw new Error(errorKeys[result.error] || 'commerce_checkout_unavailable')
      }
      if (!validQuote(result.quote) || scope !== quoteScope()) throw new Error('commerce_checkout_unavailable')
      currentQuote = { scope, quote: result.quote }
      statusMessage = ''
    } catch (error) {
      statusMessage = message(error.message.startsWith('commerce_') ? error.message : 'commerce_checkout_unavailable')
    } finally {
      quoteBusy = false
      render()
    }
  }

  function validQuote (quote) {
    return quote && typeof quote.policy_version === 'string' && quote.currency === currency.toLowerCase() &&
      ['subtotal_minor', 'shipping_minor', 'tax_minor', 'added_tax_minor', 'total_minor'].every(key => Number.isSafeInteger(quote[key]) && quote[key] >= 0)
  }

  function openCart (button) {
    if (!dialog?.showModal) return
    opener = button || trigger
    trigger?.setAttribute('aria-expanded', 'true')
    if (!dialog.open) dialog.showModal()
    closeButton?.focus()
  }

  function closeCart () {
    if (dialog?.open) dialog.close()
  }

  function announce (key) {
    statusMessage = persistent ? message(key) : `${message(key)} ${message('commerce_storage_unavailable')}`
    render()
  }

  // Returning from the hosted payment page: show the verified outcome in the open drawer.
  function notifyReturn (key) {
    announce(key)
    openCart()
  }

  async function verifyPaymentReturn () {
    const returnState = window.__sansoulCommerceReturn || {}
    try { delete window.__sansoulCommerceReturn } catch {}
    const mode = returnState.mode
    if (!['cancel', 'success'].includes(mode)) return

    const orderId = returnState.orderId || ''
    if (!PRODUCT_ID.test(orderId)) {
      notifyReturn('commerce_payment_unverified')
      return
    }

    let paymentStatus = 'pending'
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetch(`/api/commerce/status/${encodeURIComponent(orderId)}`, {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { accept: 'application/json' },
          referrerPolicy: 'no-referrer'
        })
        if (!response.ok) throw new Error('status_unavailable')
        const result = await response.json()
        if (result.order_id !== orderId || !['pending', 'paid', 'failed', 'expired', 'partially_refunded', 'refunded'].includes(result.payment_status)) throw new Error('invalid_status')
        paymentStatus = result.payment_status
        if (paymentStatus !== 'pending' || attempt === 2) break
        await new Promise(resolve => setTimeout(resolve, 1200 * (attempt + 1)))
      }
    } catch {
      notifyReturn('commerce_payment_unverified')
      return
    }

    const statusKeys = {
      pending: 'commerce_payment_pending',
      paid: 'commerce_payment_paid',
      failed: 'commerce_payment_failed',
      expired: 'commerce_payment_expired',
      partially_refunded: 'commerce_payment_partially_refunded',
      refunded: 'commerce_payment_refunded'
    }
    notifyReturn(statusKeys[paymentStatus])
    if (paymentStatus !== 'paid') return

    const snapshot = sessionSnapshot()
    try { sessionStorage.removeItem(SNAPSHOT_KEY) } catch {}
    if (!snapshot.discarded && sameItems(items, snapshot.items)) updateItems([])
  }

  async function beginCheckout () {
    if (root.dataset.commerceCheckoutApproved !== 'true' || checkoutBusy) return
    const normalized = normalizeStoredCart({ items })
    if (!normalized.items.length || normalized.discarded || !sameItems(normalized.items, items)) {
      announce('commerce_invalid_cart')
      return
    }
    const productsAvailable = items.every(item => {
      const product = products.get(item.id)
      return product && !product.quote && Number.isSafeInteger(product.priceMinor)
    })
    if (!productsAvailable) {
      announce('commerce_invalid_cart')
      return
    }

    if (!quoteIsCurrent()) {
      announce('commerce_quote_needed')
      return
    }
    const quote = currentQuote.quote
    try {
      // A new destination or quote needs a new idempotency key; identical retries reuse it.
      if (checkoutAttempt && checkoutAttempt.scope !== currentQuote.scope + quote.total_minor + quote.policy_version) checkoutAttempt = null
      checkoutAttempt ||= { key: `browser-${crypto.randomUUID()}`, items: items.map(item => ({ ...item })), scope: currentQuote.scope + quote.total_minor + quote.policy_version }
    } catch {
      announce('commerce_checkout_unavailable')
      return
    }
    checkoutBusy = true
    statusMessage = message('commerce_checkout_sending')
    render()
    const scope = currentQuote.scope
    try {
      const response = await fetch('/api/commerce/checkout', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'idempotency-key': checkoutAttempt.key
        },
        body: JSON.stringify({ items, destination, quote: { policy_version: quote.policy_version, total_minor: quote.total_minor } })
      })
      const result = await response.json().catch(() => ({}))
      if (response.status === 409 && result.error === 'quote_changed' && validQuote(result.quote)) {
        if (scope === quoteScope()) currentQuote = { scope, quote: result.quote }
        checkoutAttempt = null
        throw new Error('commerce_quote_changed')
      }
      if (!response.ok) {
        const errorKeys = {
          destination_quote_required: 'commerce_quote_required',
          shipping_quote_required: 'commerce_quote_required',
          out_of_stock: 'commerce_out_of_stock',
          quote_only: 'commerce_quote_only',
          product_unavailable: 'commerce_unavailable_product',
          checkout_not_approved: 'commerce_checkout_disabled'
        }
        throw new Error(errorKeys[result.error] || 'commerce_checkout_failed')
      }
      const checkoutUrl = new URL(result.checkout_url)
      if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.stripe.com' || checkoutUrl.username || checkoutUrl.password || checkoutUrl.port) throw new Error('commerce_checkout_failed')
      try { sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ items: checkoutAttempt.items })) } catch {}
      location.assign(checkoutUrl.href)
    } catch (error) {
      announce(error.message.startsWith('commerce_') ? error.message : 'commerce_checkout_unavailable')
    } finally {
      checkoutBusy = false
      render()
    }
  }

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null
    const openButton = target?.closest('[data-commerce-open]')
    if (openButton) {
      openCart(openButton)
      return
    }
    if (target?.closest('[data-commerce-close]')) {
      closeCart()
      return
    }
    if (target === dialog) {
      closeCart()
      return
    }
    const addButton = target?.closest('[data-commerce-add]')
    if (addButton) {
      const control = addButton.closest('[data-commerce-product-actions]')
      const id = control?.dataset.productId
      const product = products.get(id)
      const quantityInput = control?.querySelector('[data-commerce-quantity]')
      const quantity = Number(quantityInput?.value)
      if (!product || product.quote || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
        announce('commerce_invalid_quantity')
        quantityInput?.focus()
        return
      }
      const existing = items.find(item => item.id === id)?.quantity || 0
      if (existing + quantity > MAX_QUANTITY) {
        announce('commerce_invalid_quantity')
        quantityInput?.focus()
        return
      }
      const next = items.filter(item => item.id !== id)
      next.push({ id, quantity: existing + quantity })
      updateItems(next)
      announce('commerce_added')
      if (quantityInput) quantityInput.value = '1'
      openCart(addButton)
      return
    }
    const stepButton = target?.closest('[data-commerce-step]')
    if (stepButton) {
      const input = stepButton.closest('.commerce__stepper')?.querySelector('input')
      if (!input) return
      const next = Math.min(MAX_QUANTITY, Math.max(1, (Number.parseInt(input.value, 10) || 1) + Number(stepButton.dataset.commerceStep)))
      if (String(next) === input.value) return
      input.value = String(next)
      if (input.dataset.commerceLineQuantity) {
        const id = input.dataset.commerceLineQuantity
        const step = stepButton.dataset.commerceStep
        const surface = stepButton.closest('[data-commerce-drawer], [data-commerce-cart-page]')
        updateItems(items.map(item => item.id === id ? { ...item, quantity: next } : item))
        announce('commerce_updated')
        const again = surface?.querySelector(`[data-commerce-line-quantity="${id}"]`)?.closest('.commerce__stepper')?.querySelector(`[data-commerce-step="${step}"]`)
        if (again && !again.disabled) again.focus()
        else surface?.querySelector(`[data-commerce-line-quantity="${id}"]`)?.focus()
      }
      return
    }
    const removeButton = target?.closest('[data-commerce-remove]')
    if (removeButton) {
      const surface = removeButton.closest('[data-commerce-drawer], [data-commerce-cart-page]')
      updateItems(items.filter(item => item.id !== removeButton.dataset.commerceRemove))
      announce('commerce_removed')
      surface?.querySelector('[data-commerce-remove], [data-commerce-empty-link], [data-commerce-close]')?.focus()
      return
    }
    if (target?.closest('[data-commerce-checkout]')) beginCheckout()
  })

  // Editing the destination invalidates the displayed quote until it is recalculated,
  // so checkout can never send a destination the buyer no longer sees.
  const invalidateDestination = event => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-commerce-destination]')) return
    if (!currentQuote && !quoteRequired) return
    currentQuote = null
    quoteRequired = false
    checkoutAttempt = null
    statusMessage = ''
    render()
  }
  document.addEventListener('input', invalidateDestination)
  document.addEventListener('change', invalidateDestination)

  document.addEventListener('change', event => {
    const postal = event.target instanceof HTMLInputElement && event.target.matches('[data-commerce-postal]') ? event.target : null
    if (postal?.value.trim()) requestQuote(postal.form)
  })

  document.addEventListener('submit', event => {
    const form = event.target instanceof HTMLFormElement && event.target.matches('[data-commerce-destination]') ? event.target : null
    if (!form) return
    event.preventDefault()
    requestQuote(form)
  })

  document.addEventListener('change', event => {
    const target = event.target instanceof HTMLInputElement ? event.target : null
    if (!target?.dataset.commerceLineQuantity) return
    target.focus()
    const quantity = Number(target.value)
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      announce('commerce_invalid_quantity')
      return
    }
    const id = target.dataset.commerceLineQuantity
    updateItems(items.map(item => item.id === id ? { ...item, quantity } : item))
    announce('commerce_updated')
  })

  dialog?.addEventListener('close', () => {
    trigger?.setAttribute('aria-expanded', 'false')
    opener?.focus()
    opener = null
  })
  window.addEventListener('storage', event => {
    if (event.key !== storageKey || event.newValue === null) return
    try {
      const cart = normalizeStoredCart(JSON.parse(event.newValue))
      items = cart.items.sort((a, b) => a.id.localeCompare(b.id))
      statusMessage = cart.discarded ? message('commerce_storage_recovered') : ''
      render()
    } catch {
      statusMessage = message('commerce_storage_recovered')
      render()
    }
  })

  // Templates print ISO codes; show localized country names when the browser supports it.
  try {
    const names = new Intl.DisplayNames([i18n.lang || document.documentElement.lang || 'es'], { type: 'region' })
    commerceNodes('[data-commerce-country] option').forEach(option => { option.textContent = names.of(option.value) || option.value })
    commerceNodes('[data-commerce-country-name]').forEach(node => { node.textContent = names.of(node.dataset.commerceCountryName) || node.textContent })
  } catch {}

  render()
  verifyPaymentReturn()
}
