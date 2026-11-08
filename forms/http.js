export class FormsError extends Error {
  constructor (code, status = 400) {
    super(code)
    this.code = code
    this.status = status
  }
}

export function jsonResponse (data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      ...headers
    }
  })
}

// Error bodies keep the receipt shape the browser already parses, without data.
export function errorResponse (error) {
  const known = error instanceof FormsError
  if (!known) console.error('forms_internal_error', error?.name, String(error?.message || error).slice(0, 300))
  return jsonResponse({ result: 'error', error: known ? error.code : 'internal_error' }, known ? error.status : 500)
}

export function isSameOrigin (request) {
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    return new URL(request.url).origin === origin
  } catch {
    return false
  }
}

export async function sha256Hex (data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function timingSafeEqual (a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  let diff = left.length ^ right.length
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    diff |= (left[index] || 0) ^ (right[index] || 0)
  }
  return diff === 0
}
