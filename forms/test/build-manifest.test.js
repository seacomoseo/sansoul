import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { buildManifest } from '../scripts/build-manifest.js'

const SITE = { site: 'acme.test', origin: 'https://acme.test', project: 'acme', repo: 'acme/site' }

function publish (files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-manifest-'))
  fs.mkdirSync(path.join(root, 'public/_forms'), { recursive: true })
  for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(root, 'public/_forms', name), JSON.stringify(value))
  return root
}

const load = async root => (await import(`${path.join(root, 'worker/forms.generated.js')}?${Date.now()}`)).manifest

test('without Worker forms the site identity still reaches the manifest', async () => {
  const root = publish({ '_site.json': SITE })
  try {
    assert.deepEqual(buildManifest({ root }), { forms: 0, specs: 0, target: path.join(root, 'worker/forms.generated.js') })
    const manifest = await load(root)
    assert.deepEqual(manifest.forms, {})
    assert.equal(manifest.site, 'acme.test')
    assert.equal(manifest.project, 'acme')
    assert.equal(manifest.repo, 'acme/site')
    assert.deepEqual(manifest.origins, ['https://acme.test'])
    // Policies never stay in the public assets.
    assert.equal(fs.existsSync(path.join(root, 'public/_forms')), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('form policies win over the site identity, which is not a form', async () => {
  const policy = { page: '/contacto/', id: 'form-contacto', site: 'shop.test', project: 'shop', repo: 'shop/site', origin: 'https://shop.test', lang: 'es', subject: 'Contacto', to: ['owner@shop.test'], account: '', confirm: null, fields: [{ name: 'Nombre', type: 'text' }] }
  const root = publish({ '_site.json': SITE, 'abc.json': policy })
  try {
    assert.equal(buildManifest({ root }).forms, 1)
    const manifest = await load(root)
    assert.equal(manifest.site, 'shop.test')
    assert.equal(manifest.repo, 'shop/site')
    assert.deepEqual(manifest.origins, ['https://acme.test', 'https://shop.test'])
    assert.deepEqual(Object.keys(manifest.forms), ['/contacto/#form-contacto'])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
