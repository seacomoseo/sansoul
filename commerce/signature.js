export async function hmacSha256Hex (payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('')
}

function constantTimeEqual (left, right) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false
  let difference = 0
  for (let index = 0; index < 64; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}

export async function makeStripeSignature (rawBody, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const digest = await hmacSha256Hex(`${timestamp}.${rawBody}`, secret)
  return `t=${timestamp},v1=${digest}`
}

export async function verifyStripeSignature (rawBody, header, secret, now = Date.now(), toleranceSeconds = 300) {
  if (typeof rawBody !== 'string' || typeof header !== 'string' || typeof secret !== 'string' || !secret) return false
  const values = header.split(',').map(part => part.split('='))
  const timestamp = values.find(([key]) => key === 't')?.[1]
  const signatures = values.filter(([key]) => key === 'v1').map(([, value]) => value)
  if (!/^\d{1,12}$/.test(timestamp || '') || !signatures.length) return false
  const seconds = Number(timestamp)
  if (!Number.isSafeInteger(seconds) || Math.abs(Math.floor(now / 1000) - seconds) > toleranceSeconds) return false
  const expected = await hmacSha256Hex(`${timestamp}.${rawBody}`, secret)
  return signatures.some(signature => constantTimeEqual(signature, expected))
}
