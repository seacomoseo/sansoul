import test from 'node:test'
import assert from 'node:assert/strict'
import { createCommerceWorker } from '../../worker.js'

test('Workers adapter routes only commerce and preserves Pages context', async () => {
  const seen = []
  const routes = Object.fromEntries(['checkout', 'webhook', 'status', 'admin'].map(name => [name, context => {
    seen.push({ name, context })
    return new Response(name)
  }]))
  const worker = createCommerceWorker({ functionsEnabled: true }, routes)
  const env = { ASSETS: { fetch: () => new Response('asset') } }
  const execution = { waitUntil () {} }
  for (const [path, name] of [['checkout', 'checkout'], ['webhook', 'webhook'], ['status/order-1', 'status'], ['admin/export.csv', 'admin']]) {
    const request = new Request(`https://fixture.invalid/api/commerce/${path}`)
    assert.equal(await (await worker.fetch(request, env, execution)).text(), name)
    assert.equal(seen.at(-1).context.request, request)
    assert.equal(seen.at(-1).context.env, env)
    assert.equal(typeof seen.at(-1).context.waitUntil, 'function')
  }
  assert.deepEqual(seen[2].context.params, { orderId: 'order-1' })
  assert.deepEqual(seen[3].context.params, { path: ['export.csv'] })
  for (const path of ['/api/commerce/unknown', '/api/commerce/status/a/b', '/api/commerceevil/checkout', '/api/commerce', '/API/commerce/checkout', '/api/commerce%2Fcheckout']) {
    assert.equal(await (await worker.fetch(new Request(`https://fixture.invalid${path}`), env)).text(), 'asset')
  }
  assert.equal(await (await worker.fetch(new Request('https://fixture.invalid/'), env)).text(), 'asset')
  assert.equal(seen.length, 4)
  const disabled = createCommerceWorker({ functionsEnabled: false }, routes)
  assert.equal((await disabled.fetch(new Request('https://fixture.invalid/api/commerce/webhook'), env)).status, 404)
  assert.equal(seen.length, 4)
  for (const [path, name] of [['checkout/', 'checkout'], ['webhook/', 'webhook'], ['status/order-1/', 'status'], ['admin/export.csv/', 'admin']]) {
    assert.equal(await (await worker.fetch(new Request(`https://fixture.invalid/api/commerce/${path}`), env)).text(), name)
  }
  assert.equal(seen.length, 8)
})
