export class CommerceError extends Error {
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
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers
    }
  })
}

export function errorResponse (error) {
  const status = error instanceof CommerceError ? error.status : 500
  const code = error instanceof CommerceError ? error.code : 'internal_error'
  return jsonResponse({ error: code }, status)
}

export async function readJsonBody (request, maxBytes = 8192) {
  const declaredLength = request.headers.get('content-length')
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes)) throw new CommerceError('payload_too_large', 413)
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw new CommerceError('content_type_required', 415)
  const reader = request.body?.getReader()
  if (!reader) throw new CommerceError('invalid_body')
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        throw new CommerceError('payload_too_large', 413)
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof CommerceError) throw error
    throw new CommerceError('invalid_body')
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  let raw
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new CommerceError('invalid_body_encoding')
  }
  try {
    return { raw, value: JSON.parse(raw) }
  } catch {
    throw new CommerceError('invalid_json')
  }
}

export function isSameOrigin (request, allowedOrigin) {
  let requestOrigin
  try {
    requestOrigin = new URL(request.url).origin
  } catch {
    return false
  }
  if (requestOrigin !== allowedOrigin) return false
  const suppliedOrigin = request.headers.get('origin')
  return suppliedOrigin === allowedOrigin
}

export function methodNotAllowed (allowed) {
  return jsonResponse({ error: 'method_not_allowed' }, 405, { allow: allowed.join(', ') })
}

export function requireDatabase (env) {
  if (!env?.COMMERCE_DB || typeof env.COMMERCE_DB.prepare !== 'function' || typeof env.COMMERCE_DB.batch !== 'function') throw new CommerceError('database_unavailable', 503)
  return env.COMMERCE_DB
}

export function requireEnabledCatalog (catalog) {
  if (!catalog?.enabled) throw new CommerceError('commerce_unavailable', 404)
}
