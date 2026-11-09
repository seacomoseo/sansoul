import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { clientIp, verifiedProxy } from '../../../edge/proxy.js'
import { isSameOrigin } from '../../http.js'

const secret = 'proxy-secret-for-tests-only-0123456789abcdef'
const now = 1_800_000_000_000
const part = value => Buffer.from(JSON.stringify(value)).toString('base64url')
function sign (claims, key = secret, header = { alg: 'HS256', typ: 'JWT' }) {
  const unsigned = `${part(header)}.${part(claims)}`
  return `${unsigned}.${createHmac('sha256', key).update(unsigned).digest('base64url')}`
}
const request = (headers, url = 'https://shop.acme.workers.dev/api/commerce/quote') => new Request(url, { method: 'POST', headers })
const valid = sign({ iss: 'netlify', exp: now / 1000 + 60 })

test('signed proxy: only a current Netlify HS256 signature with the project secret counts', async () => {
  const env = { SANSOUL_PROXY_SECRET: secret }
  assert.equal(await verifiedProxy(request({ 'x-nf-sign': valid }), env, now), true)
  for (const token of [
    sign({ iss: 'netlify', exp: now / 1000 - 1 }),
    sign({ iss: 'netlify' }),
    sign({ iss: 'other', exp: now / 1000 + 60 }),
    sign({ iss: 'netlify', exp: now / 1000 + 60 }, 'another-secret-of-sufficient-length-000000'),
    sign({ iss: 'netlify', exp: now / 1000 + 60 }, secret, { alg: 'none' }),
    'not.a.jws',
    ''
  ]) assert.equal(await verifiedProxy(request({ 'x-nf-sign': token }), env, now), false, token)
  assert.equal(await verifiedProxy(request({ 'x-nf-sign': valid }), { SANSOUL_PROXY_SECRET: 'short' }, now), false)
  assert.equal(await verifiedProxy(request({ 'x-nf-sign': valid }), {}, now), false)
})

test('client IP comes from Netlify only behind a verified signature', async () => {
  const env = { SANSOUL_PROXY_SECRET: secret }
  const headers = { 'cf-connecting-ip': '198.51.100.1', 'x-nf-client-connection-ip': '203.0.113.5', 'x-forwarded-for': '203.0.113.6, 198.51.100.1' }
  assert.equal(await clientIp(request({ ...headers, 'x-nf-sign': valid }), env, now), '203.0.113.5')
  assert.equal(await clientIp(request({ 'cf-connecting-ip': '198.51.100.1', 'x-forwarded-for': '203.0.113.6, 198.51.100.1', 'x-nf-sign': valid }), env, now), '203.0.113.6')
  assert.equal(await clientIp(request(headers), env, now), '198.51.100.1')
})

test('commerce origin: canonical host directly, or the public Origin through a verified proxy', () => {
  const origin = 'https://shop.example'
  assert.equal(isSameOrigin(request({ origin }, `${origin}/api/commerce/quote`), origin), true)
  assert.equal(isSameOrigin(request({ origin }), origin), false)
  assert.equal(isSameOrigin(request({ origin }), origin, true), true)
  assert.equal(isSameOrigin(request({ origin: 'https://evil.test' }), origin, true), false)
})
