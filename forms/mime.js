// Minimal RFC 5322/2045/2047 writer: UTF-8 encoded words, CRLF, folded base64
// bodies and attachments. Header values are validated, never escaped into shape.
const encoder = new TextEncoder()

export function base64 (bytes) {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

// Base64 bodies folded at 76 characters. Measured in local workerd, folding
// costs ~2-7 ms CPU per MB whatever the method; native toBase64 plus sliced
// lines is the cheapest, so inline attachments stay small (see intake LIMITS).
export function base64Lines (bytes) {
  const encoded = typeof bytes.toBase64 === 'function' ? bytes.toBase64() : base64(bytes)
  const lines = []
  for (let index = 0; index < encoded.length; index += 76) lines.push(encoded.slice(index, index + 76))
  lines.push('')
  return encoder.encode(lines.join('\r\n'))
}

export function encodeWord (text) {
  if (/[\r\n\0]/.test(text)) throw new Error('mime_header_invalid')
  if (/^[\x20-\x7e]*$/.test(text) && !/=\?/.test(text)) return text
  const words = []
  let chunk = ''
  for (const char of text) {
    if (encoder.encode(chunk + char).length > 45) {
      words.push(`=?UTF-8?B?${base64(encoder.encode(chunk))}?=`)
      chunk = ''
    }
    chunk += char
  }
  words.push(`=?UTF-8?B?${base64(encoder.encode(chunk))}?=`)
  return words.join('\r\n ')
}

export function validAddress (address) {
  return typeof address === 'string' && address.length <= 254 &&
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(address)
}

function addressHeader (name, addresses) {
  if (!addresses.length || !addresses.every(validAddress)) throw new Error('mime_address_invalid')
  return `${name}: ${addresses.join(',\r\n ')}`
}

function fileName (name) {
  return encodeWord(name.replace(/["\\]/g, '_'))
}

export function buildMime ({ from, fromName, to = [], bcc = [], replyTo, subject, text, html, attachments = [], messageId }) {
  const boundary = `sf-${messageId.replace(/[^A-Za-z0-9]/g, '').slice(0, 40)}`
  const headers = [
    `From: ${encodeWord(fromName)} <${from}>`,
    to.length ? addressHeader('To', to) : null,
    bcc.length ? addressHeader('Bcc', bcc) : null,
    replyTo ? addressHeader('Reply-To', [replyTo]) : null,
    `Subject: ${encodeWord(subject)}`,
    `Message-ID: <${messageId}@sansoul.invalid>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}-m"`
  ].filter(Boolean)
  if (!validAddress(from) || (!to.length && !bcc.length)) throw new Error('mime_address_invalid')
  const chunks = [
    `${headers.join('\r\n')}\r\n\r\n--${boundary}-m\r\nContent-Type: multipart/alternative; boundary="${boundary}-a"\r\n\r\n` +
    `--${boundary}-a\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`,
    base64Lines(encoder.encode(text)),
    `--${boundary}-a\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`,
    base64Lines(encoder.encode(html)),
    `--${boundary}-a--\r\n`
  ]
  for (const file of attachments) {
    chunks.push(
      `--${boundary}-m\r\nContent-Type: ${file.type}; name="${fileName(file.name)}"\r\n` +
      `Content-Disposition: attachment; filename="${fileName(file.name)}"\r\n` +
      'Content-Transfer-Encoding: base64\r\n\r\n',
      base64Lines(file.bytes)
    )
  }
  chunks.push(`--${boundary}-m--\r\n`)
  const parts = chunks.map(chunk => typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
  const mime = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    mime.set(part, offset)
    offset += part.length
  }
  return mime
}
