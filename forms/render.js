// Notification bodies. Visitor values are always escaped; only author texts that
// pass the sanitizer below can contain markup.
export function escapeHtml (value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Ported from the audited GAS processor: a small allowlist for confirmation texts.
export function sanitizeHtml (value) {
  const allowedTags = /^(p|br|strong|em|ul|ol|li|blockquote|code|pre|h[1-6]|hr)$/i
  return String(value || '').slice(0, 20000).replace(/<[^>]*>/g, tag => {
    const basic = tag.match(/^<\s*(\/?)\s*([a-z0-9]+)\s*\/?\s*>$/i)
    if (basic && allowedTags.test(basic[2])) {
      const name = basic[2].toLowerCase()
      if (basic[1] && (name === 'br' || name === 'hr')) return ''
      return basic[1] ? `</${name}>` : `<${name}>`
    }
    if (/^<\s*\/\s*a\s*>$/i.test(tag)) return '</a>'
    if (/^<\s*a\b/i.test(tag)) {
      const href = (tag.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2] || '').trim()
      return /^(https?:\/\/|mailto:)/i.test(href) ? `<a href="${escapeHtml(href)}" rel="noopener noreferrer">` : ''
    }
    return ''
  })
}

// `[[Field name]]` placeholders take the first submitted value, escaped.
export function fillPlaceholders (html, fields) {
  const values = new Map()
  for (const [name, value] of fields) {
    const key = name.toLowerCase()
    if (!values.has(key)) values.set(key, escapeHtml(value))
  }
  return html.replace(/\[\[([^\]\r\n]{1,100})\]\]/g, (match, name) => values.get(name.trim().toLowerCase()) ?? match)
}

const size = bytes => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

function rows (fields, files, links) {
  const list = fields.map(([name, value]) => ({ name, value }))
  for (const file of files) list.push({ name: file.field, value: `📎 ${file.name} (${size(file.size)})`, link: links?.get(file.index) })
  return list
}

const CELL = 'padding:6px 10px;border-bottom:1px solid #e5e5e5;vertical-align:top'

function table (list) {
  const cells = list.map(({ name, value, link }) =>
    `<tr><th align="left" valign="top" style="${CELL};text-align:left;background:#f4f4f4">${escapeHtml(name)}</th>` +
    `<td style="${CELL};white-space:pre-wrap">${link ? `<a href="${escapeHtml(link)}">${escapeHtml(value)}</a>` : escapeHtml(value).replace(/\n/g, '<br>')}</td></tr>`
  ).join('')
  return `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;margin:0 0 16px">${cells}</table>`
}

const textTable = list => list.map(({ name, value, link }) => `${name}: ${value}${link ? ` ${link}` : ''}`).join('\n')

// The footer links straight to the form on its page: https://<site><page>#<form id>.
function footerOf (submission, authority) {
  const hash = String(submission.form_key || '').lastIndexOf('#')
  const formId = hash >= 0 ? submission.form_key.slice(hash + 1) : ''
  const url = `https://${authority.site}${submission.page}${formId ? `#${formId}` : ''}`
  const label = `${authority.pageTitle || submission.page}${formId ? ` · #${formId}` : ''}`
  return { url, label, id: submission.id }
}

// `links` (Map index → Drive URL) replaces inline attachments for large files.
export function renderOwner ({ submission, authority, links = null }) {
  const list = rows(submission.fields, submission.files, links)
  const footer = footerOf(submission, authority)
  return {
    subject: authority.subject,
    text: `${textTable(list)}\n\n--\n${footer.label}\n${footer.url}\n${footer.id}\n`,
    html: `${table(list)}<p style="color:#777;font-size:12px"><a href="${escapeHtml(footer.url)}" style="color:#777">${escapeHtml(footer.label)}</a><br>${escapeHtml(footer.url)}<br>${escapeHtml(footer.id)}</p>`
  }
}

export function renderConfirmation ({ submission, authority }) {
  const confirm = authority.confirm
  const intro = fillPlaceholders(sanitizeHtml(confirm.introHtml), submission.fields)
  const notice = fillPlaceholders(sanitizeHtml(confirm.noticeHtml), submission.fields)
  const list = confirm.fields ? rows(submission.fields, submission.files) : []
  const plain = html => html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim()
  return {
    subject: confirm.subject,
    text: [plain(intro), list.length ? textTable(list) : '', plain(notice)].filter(Boolean).join('\n\n') + '\n',
    html: `${intro}${list.length ? table(list) : ''}${notice}`
  }
}
