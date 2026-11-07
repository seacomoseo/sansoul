import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

test('Markdown links preserve left, inline and right icons in text order', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-link-icons-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'layouts/partials/func'), { recursive: true })
  await fs.mkdir(path.join(root, 'layouts/_default/_markup'), { recursive: true })
  for (const name of ['func/link-icons', 'func/attrs', 'func/is-mail', 'func/ga4-event', 'link']) {
    await fs.copyFile(path.join(engine, `layouts/partials/${name}.html`), path.join(root, `layouts/partials/${name}.html`))
  }
  await fs.copyFile(path.join(engine, 'layouts/_default/_markup/render-link.html'), path.join(root, 'layouts/_default/_markup/render-link.html'))
  await fs.writeFile(path.join(root, 'layouts/partials/icon.html'), '<i class="icon {{ .class }}" data-icon="{{ .icon | default .def }}"></i>')
  await fs.writeFile(path.join(root, 'layouts/index.html'), `{{ site.Home.RenderString "[::check:: Texto del ::link:: enlacerl ::close::](https://example.com/ \\\"{ga4:download sublock}\\\")" }}`.replaceAll('\\"', '\\"'))
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\ndisableKinds: [taxonomy, term, RSS, sitemap]\n')
  const result = spawnSync('hugo', ['--source', root], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  assert.match(html, /icon--left[^>]*data-icon="check"/)
  assert.match(html, /Texto del <i[^>]*icon--inline[^>]*data-icon="link"[^>]*><\/i> enlace/)
  assert.match(html, /icon--right[^>]*data-icon="close"/)
  assert.match(html, /data-ga4="download"/)
  assert.doesNotMatch(html, /::|ga4:download|sublock/)
})
