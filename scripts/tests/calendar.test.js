import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { calendarMonthIndex, calendarCurrentMonth, calendarTileVisible, initCalendars } from '../../assets/js/calendar.js'

const engine = new URL('../../', import.meta.url)

test('calendar current month follows the declared site timezone across UTC month boundaries', () => {
  const boundary = new Date('2024-03-01T00:30:00Z')
  assert.equal(calendarCurrentMonth(boundary, 'Europe/Madrid'), '2024-03')
  assert.equal(calendarCurrentMonth(boundary, 'America/Argentina/Ushuaia'), '2024-02')
})

test('calendar month selection handles empty, past, present and future month ranges', () => {
  assert.equal(calendarMonthIndex([], '2026-10'), 0)
  assert.equal(calendarMonthIndex(['2026-08', '2026-09'], '2026-10'), 1)
  assert.equal(calendarMonthIndex(['2026-10', '2026-12'], '2026-10'), 0)
  assert.equal(calendarMonthIndex(['2026-08', '2026-12'], '2026-10'), 1)
})

test('calendar enhances each instance once, switches months and exposes bounded native controls', () => {
  const nodes = []
  const make = (properties = {}) => ({
    hidden: true,
    listeners: {},
    addEventListener (name, handler) { this.listeners[name] = handler },
    ...properties
  })
  const months = ['2024-02', '2024-03'].map(value => make({ dataset: { calendarMonth: value } }))
  const select = make({ options: [{ textContent: 'February 2024' }, { textContent: 'March 2024' }], selectedIndex: 0 })
  const previous = make()
  const next = make()
  const nav = make()
  const status = make()
  const matches = { '[data-calendar-select]': select, '[data-calendar-prev]': previous, '[data-calendar-next]': next, '.calendar__nav': nav, '[data-calendar-status]': status }
  const calendar = {
    querySelectorAll: () => months,
    querySelector: selector => matches[selector]
  }
  nodes.push(calendar)
  const root = { querySelectorAll: () => nodes }
  initCalendars(root)
  assert.equal(nav.hidden, false)
  assert.equal(select.value, '1')
  assert.equal(months[0].hidden, true)
  assert.equal(months[1].hidden, false)
  assert.equal(next.disabled, true)
  previous.listeners.click()
  assert.equal(select.value, '0')
  assert.equal(previous.disabled, true)
  assert.equal(status.textContent, 'February 2024')
  next.listeners.click()
  assert.equal(select.value, '1')
  select.selectedIndex = 0
  select.listeners.change()
  assert.equal(select.value, '0')
  const handler = next.listeners.click
  initCalendars(root)
  assert.equal(next.listeners.click, handler)
  initCalendars({ querySelectorAll: () => [] })
})

test('calendar uses filtered dated pages, leap-day grids and original links/dates without paginating its months', async t => {
  if (spawnSync('hugo', ['version']).status !== 0) return t.skip('Hugo unavailable')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-calendar-test-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  for (const directory of ['layouts/partials/blocks', 'layouts/partials/func', 'layouts/partials/boxes', 'content/events', 'content/articles', 'content/products', 'data/types', 'i18n']) {
    await fs.mkdir(path.join(root, directory), { recursive: true })
  }
  for (const file of ['blocks/list.html', 'blocks/calendar.html', 'blocks/calendar-compact.html', 'blocks/margin-style.html', 'boxes/tags.html', 'func/attrs.html', 'func/color-background.html', 'func/event-dates.html', 'func/date-tag.html', 'func/date-format.html']) {
    await fs.copyFile(new URL(`layouts/partials/${file}`, engine), path.join(root, 'layouts/partials', file))
  }
  await fs.writeFile(path.join(root, 'layouts/partials/icon.html'), '{{ return (printf `<i data-icon-default="%s"></i>` .def | safeHTML) }}')
  await fs.copyFile(new URL('i18n/en.yml', engine), path.join(root, 'i18n/en.yml'))
  await fs.writeFile(path.join(root, 'data/styles.yml'), 'inputs:\n  fill: false\n')
  await fs.writeFile(path.join(root, 'data/types/all.yml'), 'tpl:\n  list:\n    cols: 3\n')
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\nbuildFuture: true\ndefaultContentLanguage: en\ntimeZone: Europe/Madrid\n')
  for (const [type, base] of [['events', 'event'], ['articles', 'article'], ['products', 'product']]) {
    await fs.writeFile(path.join(root, `content/${type}/_index.md`), `---\ntitle: ${type}\nbase: ${base}\n---\n`)
  }
  const entries = [
    ['events', 'leap', 'Leap', '2024-02-29T23:30:00+01:00', '2024-03-01T01:00:00+01:00', false],
    ['events', 'march', 'March', '2024-03-03T12:00:00+01:00', '2024-03-03T14:00:00+01:00', false],
    ['events', 'overlap', 'Overlap', '2024-03-01T10:00:00+01:00', '2024-03-04T17:00:00+01:00', false],
    ['events', 'long', 'Long', '2024-03-29T10:00:00+01:00', '2024-04-03T17:00:00+02:00', false],
    ['events', 'hidden', 'Hidden', '2024-02-10T12:00:00+01:00', null, true],
    ['events', 'old', 'Old', '2023-12-01T12:00:00+01:00', null, false],
    ['articles', 'article', 'Article', '2024-02-15T00:00:00-05:00', null, false],
    ['products', 'product', 'Product', '2024-02-01T00:00:00Z', null, false]
  ]
  for (const [type, slug, title, date, end, hide] of entries) {
    await fs.writeFile(path.join(root, `content/${type}/${slug}.md`), `---\ntitle: ${title}\nbase: ${type === 'events' ? 'event' : 'article'}\ndate: ${date}\n${end ? `end: ${end}\n` : ''}hide: ${hide}\n---\n`)
  }
  await fs.writeFile(path.join(root, 'layouts/partials/func/summary.html'), '{{ return "Summary" }}')
  const render = `{{ range slice (dict "name" "calendar" "type" "events" "view" "calendar" "max" 4) (dict "name" "normal" "type" "events" "max" 2) (dict "name" "articles" "type" "articles" "view" "calendar" "date" "2024-02-01") (dict "name" "products" "type" "products" "view" "calendar") }}<div id="{{ .name }}">{{ $group := partial "blocks/list" (dict "list" . "type" "single" "level" 1) }}{{ with $group.calendar }}{{ partial "blocks/calendar" $group }}{{ else }}<div data-normal="{{ len $group.boxes }}"></div>{{ end }}</div>{{ end }}`
  await fs.writeFile(path.join(root, 'layouts/index.html'), render + `
    {{ range slice "events/old" "events/march" "events/leap" }}
      {{ $event := site.GetPage . }}
      <div data-tags="{{ . }}">{{ partial "boxes/tags" (dict "Page" $event "tags" (slice (dict "type" "date"))) }}</div>
    {{ end }}
    <div id="hide-hours">{{ range partial "func/event-dates" (dict "Page" (site.GetPage "events/march") "hide_hour" true) }}{{ .label | safeHTML }}{{ end }}</div>
  `)
  await fs.writeFile(path.join(root, 'layouts/_default.html'), '')
  await fs.mkdir(path.join(root, 'layouts/_default'), { recursive: true })
  await fs.writeFile(path.join(root, 'layouts/_default/single.html'), '{{ .Title }}')
  await fs.writeFile(path.join(root, 'layouts/_default/list.html'), '{{ $group := partial "blocks/list" (dict "list" (dict "type" "events" "view" "calendar" "max" 4) "type" "single" "level" 1) }}{{ with $group.calendar }}{{ partial "blocks/calendar" $group }}{{ end }}')
  const built = spawnSync('hugo', ['--source', root], { encoding: 'utf8' })
  assert.equal(built.status, 0, built.stdout + built.stderr)
  assert.match(built.stdout + built.stderr, /requires article\/event base/)
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  const calendar = html.split('<div id="calendar">')[1].split('<div id="normal">')[0].replaceAll('&#43;', '+')
  assert.equal((calendar.match(/class="calendar__day(?: |")/g) || []).length, 105, 'complete five-week grids include outside-month cells in February, March and April')
  assert.match(calendar, /datetime="2024-02-29"/)
  assert.match(calendar, /href="\/events\/leap\/"/)
  assert.match(calendar, /datetime="2024-02-29T23:30:00\+01:00"/)
  assert.match(calendar, /datetime="2024-03-01T01:00:00\+01:00"/)
  assert.match(calendar, /href="\/events\/leap\/" style="grid-column:4 \/ span 2;grid-row:2"/, 'February 29 starts in Thursday column and spans into the visible March day')
  assert.match(calendar, /href="\/events\/overlap\/" style="grid-column:5 \/ span 3;grid-row:3"/, 'overlap occupies a separate lane through Sunday')
  assert.match(calendar, /href="\/events\/overlap\/" style="grid-column:1 \/ span 1;grid-row:2"/, 'week continuation starts on Monday')
  const marchGrid = calendar.split('data-calendar-month="2024-03"')[1].split('</section>')[0]
  assert.match(marchGrid, /href="\/events\/leap\/" style="grid-column:4 \/ span 2;grid-row:2"/, 'March includes the visible February day instead of clipping its event')
  const februaryGrid = calendar.split('data-calendar-month="2024-02"')[1].split('</section>')[0]
  assert.match(februaryGrid, /calendar__entry--outside-month[^>]*href="\/events\/march\/"/, 'visible next-month events render with an agenda exclusion marker')
  assert.match(calendar, /data-calendar-month="2024-04"/, 'end-only months remain navigable')
  assert.match(calendar, /href="\/events\/long\/" style="grid-column:1 \/ span 3;grid-row:2"/, 'DST does not shorten the three-day April continuation')
  assert.doesNotMatch(calendar, /Hidden|Old|pagination/)
  assert.match(html, /id="normal">\s*<div data-normal="2"/)
  assert.match(html, /id="products">\s*<div data-normal="1"/)
  assert.match(html, /href="\/articles\/article\/"/)
  assert.match(calendar, /class="calendar__entry btn main/)
  const sameDay = calendar.match(/<a class="calendar__entry[^>]*href="\/events\/march\/"[^>]*>([\s\S]*?)<\/a>/)[1]
  assert.equal((sameDay.match(/3 Mar 2024/g) || []).length, 1, 'same-day range prints the day once')
  assert.match(sameDay, /data-icon-default="calendar"/)
  assert.match(sameDay, /data-icon-default="clock"/)
  assert.match(sameDay, /12:00<\/i> \/ <time[^>]+>14:00<\/time>/)
  const multiDay = calendar.match(/<a class="calendar__entry[^>]*href="\/events\/leap\/"[^>]*>([\s\S]*?)<\/a>/)[1]
  assert.match(multiDay, /data-icon-default="calendar_start"/)
  assert.match(multiDay, /data-icon-default="calendar_end"/)
  const article = html.split('<div id="articles">')[1].split('<div id="products">')[0]
  assert.match(article, /data-icon-default="calendar_start"/)
  assert.doesNotMatch(article, /data-icon-default="calendar_end"|data-icon-default="clock"/)
  const noEnd = html.match(/<div data-tags="events\/old">([\s\S]*?)<\/div>/)[1]
  assert.match(noEnd, /data-icon-default="calendar_start"/)
  assert.doesNotMatch(noEnd, /data-icon-default="clock"|data-icon-default="calendar_end"/)
  for (const [slug, defaults] of [['march', ['calendar', 'clock']], ['leap', ['calendar_start', 'calendar_end']]]) {
    const tags = html.match(new RegExp(`<div data-tags="events/${slug}">([\\s\\S]*?)</div>`))[1]
    for (const icon of defaults) assert.match(tags, new RegExp(`data-icon-default="${icon}"`))
  }
  const hiddenHours = html.match(/<div id="hide-hours">([\s\S]*?)<\/div>/)[1]
  assert.match(hiddenHours, /3 Mar 2024/)
  assert.doesNotMatch(hiddenHours.replace(/<[^>]+>/g, ''), /12:00|14:00/)
  const collection = await fs.readFile(path.join(root, 'public/events/index.html'), 'utf8')
  assert.match(collection, /events\/leap/)
  assert.match(collection, /events\/march/)
  assert.doesNotMatch(collection, /pagination/)
  assert.match(calendar, /class="calendar__nav" hidden/, 'fill:false retains the normal shared input appearance and progressive fallback')
  assert.doesNotMatch(calendar, /form--fill-inputs/)
  assert.match(calendar, /class="form__item-border"/)
  await fs.writeFile(path.join(root, 'data/styles.yml'), 'inputs:\n  fill: true\n')
  const filled = spawnSync('hugo', ['--source', root], { encoding: 'utf8' })
  assert.equal(filled.status, 0, filled.stdout + filled.stderr)
  const filledHtml = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  assert.match(filledHtml, /class="calendar__nav form--fill-inputs" hidden/, 'fill:true reuses the shared filled input class')
})


test('compact calendar filters all twelve year tiles independently from monthly selection', () => {
  assert.equal(calendarTileVisible('2024-01', 'year', '2024-03', '2024'), true)
  assert.equal(calendarTileVisible('2024-12', 'year', '2024-03', '2024'), true)
  assert.equal(calendarTileVisible('2025-01', 'year', '2024-03', '2024'), false)
  assert.equal(calendarTileVisible('2024-03', 'month', '2024-03', '2024'), true)
  assert.equal(calendarTileVisible('2024-04', 'month', '2024-03', '2024'), false)
})

test('calendar preserves modes, transient hover, pinned clicks and focus across native popovers', async () => {
  const make = (properties = {}) => ({
    hidden: true, dataset: {}, listeners: {}, attrs: {},
    addEventListener (name, fn) { this.listeners[name] = fn },
    getAttribute (name) { return this.attrs[name] },
    setAttribute (name, value) { this.attrs[name] = value },
    ...properties
  })
  const months = ['2024-02', '2025-03'].map(calendarMonth => make({ dataset: { calendarMonth } }))
  const select = make({ options: [{ textContent: 'February 2024' }, { textContent: 'March 2025' }], selectedIndex: 0 })
  const mode = make({ value: 'month', focus () { ownerDocument.activeElement = this } })
  const year = make({ options: [{ value: '2024' }, { value: '2025' }] })
  const compact = make({ querySelectorAll: () => [] })
  const ownerDocument = make({ documentElement: { clientHeight: 900 } })
  const heading = make({ focus () { ownerDocument.activeElement = this } })
  const closeButton = make()
  const content = make({ replaceChildren (...nodes) { this.children = nodes } })
  const day = make({
    dataset: { calendarDayLabel: 'March 5', calendarEvents: '0' },
    closest () { return this },
    getBoundingClientRect: () => ({ top: 300, bottom: 340 }),
    contains: node => node === day,
    focus () { ownerDocument.activeElement = this; compact.listeners.focusin({ target: this }) }
  })
  const panel = make({
    open: false,
    style: { setProperty () {} },
    contains: node => node === heading,
    matches () { return this.open },
    showPopover () { this.open = true },
    // Native popovers can restore focus synchronously while they close.
    hidePopover () { this.open = false; day.focus() },
    querySelector: key => ({ '[data-calendar-detail-date]': heading, '[data-calendar-detail-events]': content, '[data-calendar-close]': closeButton })[key]
  })
  const template = { content: { children: [{ dataset: { calendarEvent: '0' }, cloneNode: () => ({ title: 'Event' }) }] } }
  const previous = make()
  const next = make()
  const matches = {
    '[data-calendar-select]': select, '[data-calendar-prev]': previous, '[data-calendar-next]': next,
    '.calendar__nav': make(), '[data-calendar-status]': make(), '[data-calendar-mode]': mode,
    '[data-calendar-year-select]': year, '[data-calendar-compact]': compact, '[data-calendar-months]': make(),
    '[data-calendar-month-control]': make(), '[data-calendar-year-control]': make(),
    '[data-calendar-details]': panel, '[data-calendar-event-template]': template
  }
  const calendar = {
    dataset: {}, ownerDocument, querySelectorAll: () => months, querySelector: key => matches[key],
    getBoundingClientRect: () => ({ width: 1000 })
  }
  const previousStyle = globalThis.getComputedStyle
  const previousObserver = globalThis.ResizeObserver
  globalThis.getComputedStyle = () => ({ fontSize: '16' })
  globalThis.ResizeObserver = class { observe () {} }
  try {
    initCalendars({ querySelectorAll: () => [calendar] })
    select.selectedIndex = 0
    select.listeners.change()
    mode.value = 'agenda'
    mode.listeners.change()
    assert.equal(select.value, '0')
    assert.equal(months[0].hidden, false)
    assert.equal(year.value, '2024')
    mode.value = 'year'
    mode.listeners.change()
    assert.equal(year.value, '2024')
    next.listeners.click()
    assert.equal(year.value, '2025')
    mode.value = 'month'
    mode.listeners.change()
    assert.equal(select.value, '1')
    const pause = () => new Promise(resolve => setTimeout(resolve, 210))
    const pointer = { pointerType: 'mouse', target: day, relatedTarget: null }
    ownerDocument.activeElement = mode
    compact.listeners.pointerover(pointer)
    assert.equal(panel.hidden, false)
    compact.listeners.pointerout(pointer)
    await pause()
    assert.equal(panel.hidden, true, 'transient hover closes after leaving the day')
    ownerDocument.activeElement = mode
    compact.listeners.pointerover(pointer)
    compact.listeners.pointerout(pointer)
    panel.listeners.pointerenter({ pointerType: 'mouse' })
    await pause()
    assert.equal(panel.hidden, false, 'pointer can cross to the detail panel')
    panel.listeners.pointerleave({ pointerType: 'mouse' })
    await pause()
    assert.equal(panel.hidden, true, 'leaving both closes unpinned details')
    ownerDocument.activeElement = day
    compact.listeners.focusin({ target: day })
    compact.listeners.pointerout(pointer)
    await pause()
    assert.equal(panel.hidden, false, 'keyboard focus keeps details available')
    ownerDocument.activeElement = mode
    compact.listeners.focusout()
    await pause()
    assert.equal(panel.hidden, true, 'leaving keyboard focus dismisses details')
    compact.listeners.click({ target: day })
    assert.equal(panel.open, true)
    assert.equal(content.children.length, 1)
    assert.equal(ownerDocument.activeElement, heading)
    assert.equal(panel.style.top, '348px', 'details stay below the originating day')
    compact.listeners.pointerout(pointer)
    panel.listeners.pointerleave({ pointerType: 'mouse' })
    await pause()
    assert.equal(panel.hidden, false, 'a clicked or tapped date stays pinned')
    ownerDocument.listeners.keydown({ key: 'Escape', preventDefault () {} })
    assert.equal(panel.hidden, true)
    assert.equal(panel.open, false, 'restoring focus must not reopen the popover')
    assert.equal(day.attrs['aria-expanded'], 'false')
    assert.equal(ownerDocument.activeElement, day)
    compact.listeners.click({ target: day })
    mode.value = 'agenda'
    mode.listeners.change()
    assert.equal(ownerDocument.activeElement, mode, 'hiding compact days keeps focus on a visible control')
  } finally {
    globalThis.getComputedStyle = previousStyle
    globalThis.ResizeObserver = previousObserver
  }
})
