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

function makeLine (item, products, currency) {
  const product = products.get(item.id)
  const name = product?.name || message('commerce_unavailable_product')
  const line = document.createElement('li')
  line.className = 'commerce__line'

  const main = document.createElement('div')
  main.className = 'commerce__line-main'
  if (product?.url) {
    const link = document.createElement('a')
    link.href = product.url
    link.textContent = name
    main.append(link)
  } else {
    const title = document.createElement('strong')
    title.textContent = name
    main.append(title)
  }

  const unit = document.createElement('span')
  if (product?.quote) unit.textContent = message('commerce_quote_only')
  else if (Number.isSafeInteger(product?.priceMinor)) unit.textContent = money(product.priceMinor, currency)
  else unit.textContent = message('commerce_unavailable_product')
  main.append(unit)

  const controls = document.createElement('div')
  controls.className = 'commerce__line-controls'
  if (product && !product.quote) {
    const quantity = document.createElement('input')
    quantity.className = 'commerce__line-quantity'
    quantity.type = 'number'
    quantity.min = '1'
    quantity.max = String(MAX_QUANTITY)
    quantity.step = '1'
    quantity.value = String(item.quantity)
    quantity.inputMode = 'numeric'
    quantity.dataset.commerceLineQuantity = item.id
    quantity.setAttribute('aria-label', `${message('commerce_quantity_of')} ${name}`)
    controls.append(quantity)

    if (Number.isSafeInteger(product.priceMinor)) {
      const total = document.createElement('span')
      total.textContent = money(product.priceMinor * item.quantity, currency)
      controls.append(total)
    }
  }

  const remove = document.createElement('button')
  remove.className = 'btn'
  remove.type = 'button'
  remove.dataset.commerceRemove = item.id
  remove.textContent = message('commerce_remove')
  remove.setAttribute('aria-label', `${message('commerce_remove')} ${name}`)
  controls.append(remove)
  line.append(main, controls)
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
  let persistent = true
  let statusMessage = ''
  let opener = null
  let checkoutAttempt = null
  let checkoutBusy = false
  let items = []

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
    root.querySelectorAll('[data-commerce-count]').forEach(node => { node.textContent = String(count) })
    if (trigger) trigger.hidden = false
    commerceNodes('[data-commerce-empty]').forEach(node => { node.hidden = items.length > 0 })
    commerceNodes('[data-commerce-catalog-link]').forEach(node => { node.hidden = items.length > 0 })
    commerceNodes('[data-commerce-lines]').forEach(list => {
      list.replaceChildren(...items.map(item => makeLine(item, products, currency)))
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
    commerceNodes('[data-commerce-subtotal]').forEach(node => { node.textContent = subtotalMinor === null ? '—' : money(subtotalMinor, currency) })
    commerceNodes('[data-commerce-shipping], [data-commerce-tax]').forEach(node => { node.textContent = message('commerce_calculated_later') })
    commerceNodes('[data-commerce-total]').forEach(node => { node.textContent = '—' })
    commerceNodes('[data-commerce-checkout]').forEach(button => {
      button.disabled = !complete || root.dataset.commerceCheckoutApproved !== 'true' || checkoutBusy
    })
    commerceNodes('[data-commerce-checkout-note]').forEach(node => {
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
    const normalized = normalizeStoredCart({ items: next })
    items = normalized.items.sort((a, b) => a.id.localeCompare(b.id))
    if (!sameItems(items, checkoutAttempt?.items || [])) checkoutAttempt = null
    save()
    render()
  }

  function openCart (button) {
    if (!dialog?.showModal) return
    opener = button || trigger
    opener?.setAttribute('aria-expanded', 'true')
    dialog.showModal()
    closeButton?.focus()
  }

  function closeCart () {
    if (dialog?.open) dialog.close()
  }

  function announce (key) {
    statusMessage = persistent ? message(key) : `${message(key)} ${message('commerce_storage_unavailable')}`
    render()
  }

  async function verifyPaymentReturn () {
    const returnState = window.__sansoulCommerceReturn || {}
    try { delete window.__sansoulCommerceReturn } catch {}
    const mode = returnState.mode
    if (!['cancel', 'success'].includes(mode)) return

    const orderId = returnState.orderId || ''
    if (!PRODUCT_ID.test(orderId)) {
      announce('commerce_payment_unverified')
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
      announce('commerce_payment_unverified')
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
    announce(statusKeys[paymentStatus])
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

    try {
      checkoutAttempt ||= { key: `browser-${crypto.randomUUID()}`, items: items.map(item => ({ ...item })) }
    } catch {
      announce('commerce_checkout_unavailable')
      return
    }
    checkoutBusy = true
    statusMessage = message('commerce_checkout_sending')
    render()
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
        body: JSON.stringify({ items })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        const errorKeys = {
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
      return
    }
    const removeButton = target?.closest('[data-commerce-remove]')
    if (removeButton) {
      const surface = removeButton.closest('[data-commerce-drawer], [data-commerce-cart-page]')
      updateItems(items.filter(item => item.id !== removeButton.dataset.commerceRemove))
      announce('commerce_removed')
      surface?.querySelector('[data-commerce-remove], [data-commerce-catalog-link], [data-commerce-close]')?.focus()
      return
    }
    if (target?.closest('[data-commerce-checkout]')) beginCheckout()
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

  render()
  verifyPaymentReturn()
}
