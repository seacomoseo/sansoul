// Generic SMTP submission through Workers outbound TCP (`cloudflare:sockets`):
// port 587 (or 2525) with STARTTLS, or 465 with implicit TLS. Port 25 is
// blocked by Cloudflare. Credentials: AUTH PLAIN, else AUTH LOGIN.
//
// Outcomes: anything before the final "." of DATA sent nothing (4xx and
// network errors retry, 5xx and failed AUTH are fatal); after it, only an
// explicit reply counts: 250 sent, 4xx retry, 5xx fatal, silence ambiguous.
import { buildMime, validAddress } from '../../forms/mime.js'
import { DeliveryError } from '../../forms/providers/errors.js'
import { accountFor, checkSize } from './http.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const REPLY_MAX = 64 * 1024

// Reads one (possibly multi-line) SMTP reply: { code, lines }.
function replyReader (readable) {
  const reader = readable.getReader()
  let buffer = ''
  return {
    reader,
    async next () {
      const lines = []
      for (;;) {
        const end = buffer.indexOf('\r\n')
        if (end >= 0) {
          const line = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          lines.push(line)
          if (!/^\d{3}-/.test(line)) {
            const code = Number(line.slice(0, 3))
            if (!Number.isInteger(code)) throw new Error('smtp_protocol')
            return { code, lines }
          }
          continue
        }
        const { value, done } = await reader.read()
        if (done) throw new Error('smtp_closed')
        buffer += decoder.decode(value, { stream: true })
        if (buffer.length > REPLY_MAX) throw new Error('smtp_protocol')
      }
    }
  }
}

function session (socket) {
  const replies = replyReader(socket.readable)
  const writer = socket.writable.getWriter()
  return {
    replies,
    writer,
    async command (line) {
      await writer.write(encoder.encode(`${line}\r\n`))
      return replies.next()
    },
    release () {
      replies.reader.releaseLock()
      writer.releaseLock()
    }
  }
}

const b64 = text => btoa(String.fromCharCode(...encoder.encode(text)))

export function createSmtpProvider ({ connect } = {}) {
  async function open (options, tls) {
    const factory = connect || (await import('cloudflare:sockets')).connect
    return factory(options, tls)
  }

  return {
    name: 'smtp',
    async send ({ env, authority, message, signal, beforeSend }) {
      const account = await accountFor(env, authority)
      checkSize('smtp', message.attachments)
      const to = (message.to || []).filter(Boolean)
      const bcc = (message.bcc || []).filter(Boolean)
      const rcpt = [...new Set([...to, ...bcc])]
      if (!rcpt.length || !rcpt.every(validAddress)) throw new DeliveryError('mime_address_invalid', 'fatal')
      let mime
      try {
        mime = buildMime({ ...message, from: account.sender, fromName: account.senderName || message.fromName, bccHeader: false })
      } catch (error) {
        throw new DeliveryError(String(error.message || 'mime_invalid'), 'fatal')
      }
      const { host, port, security, username } = account.settings
      let socket
      let phase = 'connect'
      let current
      const abort = () => {
        try {
          socket?.close()?.catch?.(() => {})
        } catch {}
      }
      signal?.addEventListener('abort', abort, { once: true })
      // Before DATA's final dot: 4xx / network retry, 5xx fatal.
      const expect = (reply, ok, code) => {
        if (ok.includes(reply.code)) return reply
        if (reply.code >= 400 && reply.code < 500) throw new DeliveryError(`${code}_${reply.code}`, 'retry')
        throw new DeliveryError(`${code}_${reply.code}`, 'fatal')
      }
      try {
        socket = await open({ hostname: host, port }, { secureTransport: security === 'tls' ? 'on' : 'starttls', allowHalfOpen: false })
        await socket.opened
        current = session(socket)
        phase = 'greeting'
        expect(await current.replies.next(), [220], 'smtp_greeting')
        const helo = account.sender.split('@')[1]
        let ehlo = expect(await current.command(`EHLO ${helo}`), [250], 'smtp_ehlo')
        if (security !== 'tls') {
          if (!ehlo.lines.some(line => /^250[- ]STARTTLS\b/i.test(line))) throw new DeliveryError('smtp_starttls_unavailable', 'fatal')
          expect(await current.command('STARTTLS'), [220], 'smtp_starttls')
          current.release()
          socket = socket.startTls()
          current = session(socket)
          ehlo = expect(await current.command(`EHLO ${helo}`), [250], 'smtp_ehlo')
        }
        phase = 'auth'
        const auth = ehlo.lines.find(line => /^250[- ]AUTH\b/i.test(line)) || ''
        if (/\bPLAIN\b/i.test(auth) || !/\bLOGIN\b/i.test(auth)) {
          const reply = await current.command(`AUTH PLAIN ${b64(`\0${username}\0${account.secret}`)}`)
          if (reply.code === 535 || reply.code === 534 || reply.code === 530) throw new DeliveryError('smtp_auth_failed', 'fatal')
          expect(reply, [235], 'smtp_auth')
        } else {
          expect(await current.command('AUTH LOGIN'), [334], 'smtp_auth')
          expect(await current.command(b64(username)), [334], 'smtp_auth')
          const reply = await current.command(b64(account.secret))
          if (reply.code === 535 || reply.code === 534) throw new DeliveryError('smtp_auth_failed', 'fatal')
          expect(reply, [235], 'smtp_auth')
        }
        phase = 'envelope'
        expect(await current.command(`MAIL FROM:<${account.sender}>`), [250], 'smtp_mail_from')
        for (const address of rcpt) expect(await current.command(`RCPT TO:<${address}>`), [250, 251], 'smtp_rcpt')
        expect(await current.command('DATA'), [354], 'smtp_data')
        // Last fence: the lease and authority are rechecked before the message goes.
        await beforeSend()
        phase = 'data'
        // buildMime writes headers, base64 lines and boundaries only: no line
        // starts with ".", so the body needs no dot-stuffing.
        await current.writer.write(mime)
        phase = 'sent'
        await current.writer.write(encoder.encode('\r\n.\r\n'))
        const reply = await current.replies.next()
        if (reply.code === 250) {
          // No wait for the QUIT reply: the message is already accepted.
          await current.writer.write(encoder.encode('QUIT\r\n')).catch(() => {})
          return { ref: (reply.lines.at(-1).slice(4).match(/[\w.@<>-]{6,}/g) || ['smtp']).at(-1).slice(0, 200) }
        }
        if (reply.code >= 400 && reply.code < 500) throw new DeliveryError(`smtp_deferred_${reply.code}`, 'retry')
        throw new DeliveryError(`smtp_rejected_${reply.code}`, 'fatal')
      } catch (error) {
        if (error instanceof DeliveryError || error?.kind === 'lost') throw error
        // No reply once the final dot left: the server may have accepted it.
        // Cut before the dot, the server discards the message.
        if (phase === 'sent') throw new DeliveryError('smtp_send_ambiguous', 'ambiguous')
        throw new DeliveryError(phase === 'connect' || phase === 'greeting' ? 'smtp_unreachable' : 'smtp_connection_lost', 'retry')
      } finally {
        signal?.removeEventListener('abort', abort)
        try {
          await socket?.close()
        } catch {}
      }
    }
  }
}
