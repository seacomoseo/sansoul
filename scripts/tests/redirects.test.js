import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const cmsWildcards = ['/admin/info/* /admin/ 301', '/:lang/admin/info/* /admin/ 301']
const fallbacks = ['/index.php/* /:splat 301', '/media/* /m/:splat 301']
const templ = new URL('../../layouts/partials/files/redirects.html', import.meta.url)

async function render (t, redirects) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sansoul-redirects-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'layouts/partials/files'), { recursive: true })
  await fs.mkdir(path.join(root, 'data'))
  await fs.copyFile(templ, path.join(root, 'layouts/partials/files/redirects.html'))
  await fs.writeFile(path.join(root, 'hugo.yml'), 'baseURL: https://fixture.example/\n')
  await fs.writeFile(path.join(root, 'data/redirects.json'), JSON.stringify(redirects))
  await fs.writeFile(path.join(root, 'layouts/index.html'), '{{ (resources.FromString "_redirects" (partial "files/redirects" .)).Publish }}')
  const result = spawnSync('hugo', ['--source', root], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  return (await fs.readFile(path.join(root, 'public/_redirects'), 'utf8'))
    .split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'))
}

test('CMS patterns follow more than 100 exact redirects without reordering project rules', async t => {
  const exact = Array.from({ length: 142 }, (_, index) => ({ from: `/old/${index}`, to: `/new/${index}`, type: 302 }))
  exact.push({ from: '/old/0', to: '/second' })
  const lines = await render(t, [...exact, { from: '/archive/:year/*', to: '/all/:splat' }])
  const firstDynamic = lines.findIndex(line => /\*|:[A-Za-z]/.test(line.split(' ')[0]))
  assert.equal(firstDynamic, exact.length + 2)
  assert.deepEqual(lines.slice(2, firstDynamic), exact.map(({ from, to, type }) => `${from} ${to} ${type ?? 301}`))
  assert.deepEqual(lines.slice(firstDynamic), [...cmsWildcards, '/archive/:year/* /all/:splat 301', ...fallbacks])
})

test('CMS patterns keep priority over potentially overlapping sources', async t => {
  const cases = ['/admin/info/guide', '/es/admin/info/guide', '/old/*', '/old/:year', '/old/../admin/info/x', '/admin%2Finfo/x', 'https://fixture.example/es/admin/info/x']
  for (const source of cases) {
    await t.test(source, async t => {
      const lines = await render(t, [{ from: '/docs', to: '/new' }, { from: source, to: '/keep' }, { from: '/later', to: '/same' }])
      assert.deepEqual(lines, [
        '/index.php / 301', '/admin/info /admin/ 301', '/docs /new 301',
        ...cmsWildcards, `${source} /keep 301`, '/later /same 301', ...fallbacks
      ])
    })
  }
})

test('default built-in redirect order stays the same without project rules', async t => {
  const lines = await render(t, [])
  assert.deepEqual(lines, ['/index.php / 301', '/admin/info /admin/ 301', ...cmsWildcards, ...fallbacks])
})
