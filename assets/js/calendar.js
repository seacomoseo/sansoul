const initialized = new WeakSet()

// Select an existing month without parsing dates in the viewer's timezone.
export function calendarMonthIndex (months, currentMonth) {
  const next = months.findIndex(month => month >= currentMonth)
  return next < 0 ? Math.max(0, months.length - 1) : next
}

export function calendarCurrentMonth (date, timeZone = 'UTC') {
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(date)
  return `${parts.find(part => part.type === 'year').value}-${parts.find(part => part.type === 'month').value}`
}

export function calendarTileVisible (tile, mode, month, year) {
  return mode === 'year' ? tile.startsWith(`${year}-`) : tile === month
}

function initDayDetails (calendar, compact) {
  const panel = calendar.querySelector('[data-calendar-details]')
  const template = calendar.querySelector('[data-calendar-event-template]')
  if (!panel || !template) return () => {}
  const heading = panel.querySelector('[data-calendar-detail-date]')
  const content = panel.querySelector('[data-calendar-detail-events]')
  const catalog = new Map([...template.content.children].map(node => [node.dataset.calendarEvent, node]))
  let selected
  let restoringFocus = false
  let pinned = false
  let hoveredDay
  let hoveredPanel = false
  let dismissTimer
  const popover = typeof panel.showPopover === 'function'
  if (popover) panel.setAttribute('popover', 'manual')
  const close = (restore = false) => {
    clearTimeout(dismissTimer)
    pinned = false
    hoveredDay = null
    hoveredPanel = false
    restoringFocus = true
    const focusedInside = panel.contains(calendar.ownerDocument.activeElement)
    if (popover && panel.matches(':popover-open')) panel.hidePopover()
    panel.hidden = true
    if (!restore && focusedInside) calendar.querySelector('[data-calendar-mode]').focus()
    selected?.setAttribute('aria-expanded', 'false')
    if (restore && selected) {
      selected.focus({ preventScroll: true })
    }
    selected = null
    restoringFocus = false
  }
  const show = (button, focus) => {
    if (button !== selected) {
      selected?.setAttribute('aria-expanded', 'false')
      selected = button
      heading.textContent = button.dataset.calendarDayLabel
      content.replaceChildren(...button.dataset.calendarEvents.split(',').map(index => catalog.get(index)).filter(Boolean).map(node => node.cloneNode(true)))
    }
    panel.hidden = false
    button.setAttribute('aria-expanded', 'true')
    if (popover) {
      if (!panel.matches(':popover-open')) panel.showPopover()
      // Keep the day exposed when hover opens the panel before a mouse click.
      const bounds = button.getBoundingClientRect()
      const height = calendar.ownerDocument.documentElement.clientHeight
      const below = height - bounds.bottom - 16
      const above = bounds.top - 16
      const after = below >= above
      panel.style.top = after ? `${bounds.bottom + 8}px` : 'auto'
      panel.style.bottom = after ? 'auto' : `${height - bounds.top + 8}px`
      panel.style.setProperty('--calendar-detail-space', `${Math.max(0, after ? below : above)}px`)
    }
    if (focus) {
      heading.focus({ preventScroll: true })
      if (!popover) panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }
  const cancelDismiss = () => clearTimeout(dismissTimer)
  const dismissWhenIdle = () => {
    cancelDismiss()
    dismissTimer = setTimeout(() => {
      const active = calendar.ownerDocument.activeElement
      if (!pinned && !hoveredDay && !hoveredPanel && !panel.contains(active) && !selected?.contains(active)) close()
    }, 180)
  }
  compact.addEventListener('pointerover', event => {
    if (event.pointerType !== 'mouse' || pinned) return
    const button = event.target.closest('[data-calendar-day]')
    if (button && !button.contains(event.relatedTarget)) {
      hoveredDay = button
      cancelDismiss()
      show(button, false)
    }
  })
  compact.addEventListener('pointerout', event => {
    if (event.pointerType !== 'mouse') return
    const button = event.target.closest('[data-calendar-day]')
    if (button && !button.contains(event.relatedTarget)) {
      hoveredDay = null
      dismissWhenIdle()
    }
  })
  panel.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse') { hoveredPanel = true; cancelDismiss() }
  })
  panel.addEventListener('pointerleave', event => {
    if (event.pointerType === 'mouse') { hoveredPanel = false; dismissWhenIdle() }
  })
  compact.addEventListener('focusin', event => {
    const button = event.target.closest('[data-calendar-day]')
    if (button && !restoringFocus) {
      pinned = false
      cancelDismiss()
      show(button, false)
    }
  })
  panel.addEventListener('focusin', cancelDismiss)
  compact.addEventListener('focusout', dismissWhenIdle)
  panel.addEventListener('focusout', dismissWhenIdle)
  compact.addEventListener('click', event => {
    const button = event.target.closest('[data-calendar-day]')
    if (button) {
      pinned = true
      cancelDismiss()
      show(button, true)
    }
  })
  panel.querySelector('[data-calendar-close]').addEventListener('click', () => close(true))
  const escape = event => {
    if (event.key === 'Escape' && !panel.hidden) {
      event.preventDefault()
      close(true)
    }
  }
  calendar.ownerDocument.addEventListener('keydown', escape)
  return close
}

export function initCalendars (root = document) {
  root.querySelectorAll('[data-calendar]').forEach(calendar => {
    if (initialized.has(calendar)) return
    const months = [...calendar.querySelectorAll('[data-calendar-month]')]
    const select = calendar.querySelector('[data-calendar-select]')
    const previous = calendar.querySelector('[data-calendar-prev]')
    const next = calendar.querySelector('[data-calendar-next]')
    const nav = calendar.querySelector('.calendar__nav')
    const status = calendar.querySelector('[data-calendar-status]')
    if (!months.length || !select || !previous || !next || !nav || !status) return
    initialized.add(calendar)
    const modeSelect = calendar.querySelector('[data-calendar-mode]')
    const yearSelect = calendar.querySelector('[data-calendar-year-select]')
    const compact = calendar.querySelector('[data-calendar-compact]')
    const full = calendar.querySelector('[data-calendar-months]')
    const enhanced = modeSelect && yearSelect && compact && full
    const tiles = enhanced ? [...compact.querySelectorAll('[data-calendar-tile]')] : []
    const years = enhanced ? [...yearSelect.options].map(option => option.value) : []
    const closeDetails = enhanced ? initDayDetails(calendar, compact) : () => {}
    const monthLabels = enhanced ? [previous.getAttribute('aria-label'), next.getAttribute('aria-label')] : []
    let index = calendarMonthIndex(months.map(month => month.dataset.calendarMonth), calendarCurrentMonth(new Date(), calendar.dataset?.calendarTimezone || 'UTC'))
    let year = months[index].dataset.calendarMonth.slice(0, 4)
    const show = (value, resetDetails = true) => {
      if (resetDetails) closeDetails()
      index = Math.max(0, Math.min(months.length - 1, value))
      const mode = enhanced ? modeSelect.value : 'month'
      const yearly = mode === 'year'
      if (!yearly) year = months[index].dataset.calendarMonth.slice(0, 4)
      months.forEach((month, position) => { month.hidden = position !== index })
      select.value = String(index)
      const position = yearly ? years.indexOf(year) : index
      previous.disabled = position <= 0
      next.disabled = position >= (yearly ? years.length : months.length) - 1
      status.textContent = yearly ? year : select.options[index].textContent
      if (enhanced) {
        const narrow = calendar.getBoundingClientRect().width < 50 * parseFloat(getComputedStyle(calendar).fontSize)
        const mini = yearly || (mode === 'month' && narrow)
        calendar.dataset.calendarView = yearly ? 'year' : mode === 'agenda' ? 'agenda' : 'month'
        if (!mini) closeDetails()
        full.hidden = mini
        compact.hidden = !mini
        tiles.forEach(tile => { tile.hidden = !calendarTileVisible(tile.dataset.calendarTile, mode, months[index].dataset.calendarMonth, year) })
        calendar.querySelector('[data-calendar-month-control]').hidden = yearly
        calendar.querySelector('[data-calendar-year-control]').hidden = !yearly
        yearSelect.value = year
        previous.setAttribute('aria-label', yearly ? previous.dataset.calendarYearLabel : monthLabels[0])
        next.setAttribute('aria-label', yearly ? next.dataset.calendarYearLabel : monthLabels[1])
      }
    }
    const step = amount => {
      if (enhanced && modeSelect.value === 'year') {
        year = years[Math.max(0, Math.min(years.length - 1, years.indexOf(year) + amount))]
        show(index)
      } else show(index + amount)
    }
    previous.addEventListener('click', () => step(-1))
    next.addEventListener('click', () => step(1))
    select.addEventListener('change', () => show(select.selectedIndex))
    if (enhanced) {
      modeSelect.addEventListener('change', () => {
        if (modeSelect.value === 'year') year = months[index].dataset.calendarMonth.slice(0, 4)
        else {
          const inYear = months.findIndex(month => month.dataset.calendarMonth.startsWith(`${year}-`))
          if (inYear >= 0 && !months[index].dataset.calendarMonth.startsWith(`${year}-`)) index = inYear
        }
        show(index)
      })
      yearSelect.addEventListener('change', () => { year = yearSelect.value; show(index) })
      let lastWidth = calendar.getBoundingClientRect().width
      const resize = new ResizeObserver(() => {
        const width = calendar.getBoundingClientRect().width
        if (width !== lastWidth) {
          lastWidth = width
          show(index, false)
        }
      })
      resize.observe(calendar)
    }
    show(index)
    nav.hidden = false
  })
}
