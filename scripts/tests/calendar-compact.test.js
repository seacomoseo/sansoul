import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const engine = new URL('../../', import.meta.url)

test('compact calendar renders full years with inclusive date markers, stable overlap references and reusable details', async t => {
  if (spawnSync('hugo', ['version']).status !== 0) return t.skip('Hugo unavailable')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-calendar-compact-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  for (const directory of ['layouts/partials/blocks', 'layouts/partials/func', 'layouts/_default', 'content/events', 'i18n']) {
    await fs.mkdir(path.join(root, directory), { recursive: true })
  }
  for (const file of ['blocks/calendar-compact.html', 'func/color-background.html', 'func/event-dates.html', 'func/date-tag.html', 'func/date-format.html']) {
    await fs.copyFile(new URL(`layouts/partials/${file}`, engine), path.join(root, 'layouts/partials', file))
  }
  await fs.writeFile(path.join(root, 'layouts/partials/icon.html'), '{{ return "" }}')
  await fs.copyFile(new URL('i18n/en.yml', engine), path.join(root, 'i18n/en.yml'))
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\nbuildFuture: true\ndefaultContentLanguage: en\ntimeZone: Europe/Madrid\n')
  const events = [
    ['leap', 'Leap', '2024-02-29T12:00:00+01:00', null],
    ['dst', 'DST', '2024-03-30T12:00:00+01:00', '2024-04-02T14:00:00+02:00'],
    ['year', 'Year boundary', '2024-12-31T12:00:00+01:00', '2025-01-02T14:00:00+01:00'],
    ['overlap', 'Overlap', '2025-01-01T12:00:00+01:00', '2025-01-01T14:00:00+01:00']
  ]
  for (const [slug, title, date, end] of events) {
    await fs.writeFile(path.join(root, `content/events/${slug}.md`), `---\ntitle: ${title}\ndate: ${date}\n${end ? `end: ${end}\n` : ''}---\n`)
  }
  await fs.writeFile(path.join(root, 'layouts/index.html'), '{{ partial "blocks/calendar-compact" (dict "entries" site.RegularPages.ByDate "years" (slice "2024" "2025") "id" "calendar-1") }}')
  await fs.writeFile(path.join(root, 'layouts/_default/single.html'), '{{ .Title }}')
  await fs.writeFile(path.join(root, 'layouts/_default/list.html'), '')
  const built = spawnSync('hugo', ['--source', root], { encoding: 'utf8' })
  assert.equal(built.status, 0, built.stdout + built.stderr)
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  assert.equal((html.match(/data-calendar-tile=/g) || []).length, 24)
  assert.match(html, /data-calendar-tile="2024-01"/)
  assert.match(html, /data-calendar-tile="2025-12"/)
  const markers = new Map([...html.matchAll(/<button[^>]*data-calendar-day="([^"]+)"[^>]*data-calendar-events="([^"]+)"[^>]*>/g)].map(match => [match[1], match[2]]))
  assert.deepEqual([...markers], [
    ['2024-02-29', '0'],
    ['2024-03-30', '1'], ['2024-03-31', '1'], ['2024-04-01', '1'], ['2024-04-02', '1'],
    ['2024-12-31', '2'], ['2025-01-01', '2,3'], ['2025-01-02', '2']
  ])
  assert.equal((html.match(/class="calendar__mini-day"/g) || []).length + markers.size, 366 + 365)
  assert.match(html, /data-calendar-day="2025-01-01"[^>]*aria-label="Wednesday 1 January 2025, 2 events"/)
  assert.match(html, /data-calendar-day="2024-02-29"[^>]*aria-controls="calendar-1-details" aria-expanded="false"/)
  assert.match(html, /data-calendar-day="2024-02-29"[^>]*data-calendar-day-label="Thursday 29 February 2024"/)
  assert.equal((html.match(/class="calendar__date-count"/g) || []).length, 1)
  assert.ok(html.indexOf('data-calendar-details') < html.indexOf('data-calendar-compact'), 'details precede the compact grid for keyboard access')
  assert.match(html, /<template data-calendar-event-template>/)
  assert.match(html, /<article class="calendar__detail-event bg bg-light"[^>]*>\s*<div class="bg-color"><\/div>/)
  for (let index = 0; index < events.length; index++) {
    assert.match(html, new RegExp(`data-calendar-event="${index}"`))
  }
  assert.match(html, /href="\/events\/dst\/"/)
  assert.equal((html.match(/id="calendar-1-details"/g) || []).length, 1)
  const january = html.split('data-calendar-tile="2024-01"')[1].split('</section>')[0]
  assert.doesNotMatch(january, /calendar__mini-empty/, 'Monday-start month needs no leading blanks')
  const february = html.split('data-calendar-tile="2024-02"')[1].split('</section>')[0]
  assert.equal((february.match(/calendar__mini-empty/g) || []).length, 3, 'Thursday-start month has three leading blanks')
})
