// Netlify mirror in front of the project Worker. netlify.toml rewrites /api/*
// to the Worker with `signed = "SANSOUL_PROXY_SECRET"`: Netlify then adds
// x-nf-sign, a JWS (HS256) whose claims carry iss "netlify" and a short exp
// (5 minutes, measured 2026-11). Netlify reads the secret on every request.
// A valid signature proves the request crossed this project's Netlify site,
// so its client-IP header can be trusted. It does not bind method, path or
// body: authorization, CSRF and idempotency stay with each handler.

const verified = new WeakMap()

export function verifiedProxy (request, env, now = Date.now()) {
  if (!verified.has(request)) verified.set(request, verifySignature(request.headers.get('x-nf-sign'), env?.SANSOUL_PROXY_SECRET, now))
  return verified.get(request)
}

// Visitor IP for rate limits: Cloudflare's connecting IP, or the one Netlify
// forwards when the request is a verified proxy (otherwise every visitor of a
// Netlify-fronted site would share Netlify's egress IP).
export async function clientIp (request, env, now) {
  if (await verifiedProxy(request, env, now)) {
    const forwarded = request.headers.get('x-nf-client-connection-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0]
    if (forwarded?.trim()) return forwarded.trim()
  }
  return request.headers.get('cf-connecting-ip')
}

async function verifySignature (token, secret, now) {
  if (typeof token !== 'string' || typeof secret !== 'string' || secret.length < 32) return false
  const parts = token.split('.')
  if (parts.length !== 3 || parts.some(part => !/^[\w-]+$/.test(part))) return false
  try {
    const header = JSON.parse(decode(parts[0]))
    const claims = JSON.parse(decode(parts[1]))
    if (header.alg !== 'HS256' || claims.iss !== 'netlify') return false
    if (typeof claims.exp !== 'number' || claims.exp * 1000 < now) return false
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    return await crypto.subtle.verify('HMAC', key, bytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))
  } catch {
    return false
  }
}

function bytes (base64url) {
  const text = atob(base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - base64url.length % 4) % 4))
  return Uint8Array.from(text, char => char.charCodeAt(0))
}

function decode (base64url) {
  return new TextDecoder().decode(bytes(base64url))
}
