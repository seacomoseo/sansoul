// Minimal PDF 1.4 writer for single-purpose documents (invoices): A4 pages, the
// standard Helvetica fonts (no embedding), text, lines and filled rectangles.
// No dependencies and no compression: a one-page invoice is about 3 KB. Text is
// limited to WinAnsi (Latin-1 plus the cp1252 punctuation block, including the
// euro sign); anything else prints as "?". Coordinates are in points from the
// top-left corner of the page.

export const PAGE = Object.freeze({ width: 595.28, height: 841.89 })

// Advance widths (1/1000 em) of codes 32-255 in WinAnsi, from the Helvetica AFM
// metrics (the metric-compatible URW Nimbus Sans files give the same values).
const WIDTHS = Object.freeze({
  regular: [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 0, 556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 222, 222, 333, 333, 350, 556, 1000, 0, 1000, 500, 333, 944, 0, 500, 667, 0, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 0, 737, 333, 400, 584, 333, 333, 333, 556, 537, 0, 333, 333, 365, 556, 834, 834, 834, 611, 667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500],
  bold: [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 0, 556, 0, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 278, 278, 500, 500, 350, 556, 1000, 0, 1000, 556, 333, 944, 0, 500, 667, 0, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 0, 737, 333, 400, 584, 333, 333, 333, 611, 556, 0, 333, 333, 365, 556, 834, 834, 834, 611, 722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278, 611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556]
})

const CP1252 = Object.freeze({
  '€': 0x80,
  '‚': 0x82,
  ƒ: 0x83,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  ˆ: 0x88,
  '‰': 0x89,
  Š: 0x8a,
  '‹': 0x8b,
  Œ: 0x8c,
  Ž: 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  š: 0x9a,
  '›': 0x9b,
  œ: 0x9c,
  ž: 0x9e,
  Ÿ: 0x9f
})

// Text as WinAnsi codes. Spaces of any width become 0x20; controls are dropped.
export function toWinAnsi (text) {
  const codes = []
  for (const char of String(text ?? '')) {
    const code = char.codePointAt(0)
    if (code === 0x00a0 || code === 0x202f || code === 0x2009) codes.push(0x20)
    else if (code === 0x00ad || code < 32 || (code >= 0x7f && code < 0xa0 && !CP1252[char])) continue
    else if (CP1252[char]) codes.push(CP1252[char])
    else if (code >= 32 && code < 127) codes.push(code)
    else if (code >= 0xa1 && code <= 0xff) codes.push(code)
    else codes.push(0x3f)
  }
  return codes
}

function glyphWidth (code, bold) {
  const width = (bold ? WIDTHS.bold : WIDTHS.regular)[code - 32]
  return width || (code === 0xb7 ? 278 : 556)
}

export function textWidth (text, size, bold = false) {
  let units = 0
  for (const code of toWinAnsi(text)) units += glyphWidth(code, bold)
  return units * size / 1000
}

// Greedy word wrap; a word wider than the line is cut by characters.
export function wrapText (text, size, bold, maxWidth) {
  const lines = []
  for (const paragraph of String(text ?? '').split(/\r?\n/)) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word
      if (textWidth(candidate, size, bold) <= maxWidth) {
        line = candidate
        continue
      }
      if (line) lines.push(line)
      line = ''
      let rest = word
      while (textWidth(rest, size, bold) > maxWidth && rest.length > 1) {
        let cut = rest.length - 1
        while (cut > 1 && textWidth(rest.slice(0, cut), size, bold) > maxWidth) cut--
        lines.push(rest.slice(0, cut))
        rest = rest.slice(cut)
      }
      line = rest
    }
    lines.push(line)
  }
  return lines
}

function number (value) {
  return String(Math.round(value * 100) / 100)
}

function literal (codes) {
  let out = '('
  for (const code of codes) {
    if (code === 0x28 || code === 0x29 || code === 0x5c) out += `\\${String.fromCharCode(code)}`
    else if (code < 127) out += String.fromCharCode(code)
    else out += `\\${code.toString(8)}`
  }
  return `${out})`
}

// Document-info text: ASCII literal, otherwise UTF-16BE (PDFDocEncoding differs from WinAnsi).
function infoText (text) {
  const value = String(text ?? '')
  if (/^[\x20-\x7e]*$/.test(value)) return literal(toWinAnsi(value))
  let hex = 'FEFF'
  for (let index = 0; index < value.length; index++) hex += value.charCodeAt(index).toString(16).padStart(4, '0')
  return `<${hex}>`
}

function pdfDate (date) {
  const pad = value => String(value).padStart(2, '0')
  return `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
}

export function createPdf ({ title = '', author = '', created = new Date(0) } = {}) {
  const pages = []

  function addPage () {
    const ops = []
    const page = {
      // Baseline at y; align is 'left', 'right' or 'center' relative to x.
      text (text, x, y, { size = 10, bold = false, align = 'left', gray = 0 } = {}) {
        const width = textWidth(text, size, bold)
        const left = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x
        ops.push(`BT /${bold ? 'F2' : 'F1'} ${number(size)} Tf ${number(gray)} g ${number(left)} ${number(PAGE.height - y)} Td ${literal(toWinAnsi(text))} Tj ET`)
      },
      line (x1, y1, x2, y2, { width = 0.5, gray = 0 } = {}) {
        ops.push(`${number(gray)} G ${number(width)} w ${number(x1)} ${number(PAGE.height - y1)} m ${number(x2)} ${number(PAGE.height - y2)} l S`)
      },
      rect (x, y, width, height, { gray = 0.9 } = {}) {
        ops.push(`${number(gray)} g ${number(x)} ${number(PAGE.height - y - height)} ${number(width)} ${number(height)} re f`)
      },
      content: () => ops.join('\n')
    }
    pages.push(page)
    return page
  }

  function toBytes () {
    if (!pages.length) addPage()
    // 1 catalog, 2 pages, 3-4 fonts, 5 info, then a page and a content stream per page.
    const objects = []
    const kids = pages.map((_, index) => `${6 + index * 2} 0 R`).join(' ')
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
    objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${kids}] >>`
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
    objects[5] = `<< /Title ${infoText(title)} /Author ${infoText(author)} /Producer (SanSoul) /CreationDate (${pdfDate(created)}) >>`
    pages.forEach((page, index) => {
      const stream = page.content()
      objects[6 + index * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${7 + index * 2} 0 R >>`
      objects[7 + index * 2] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
    })
    let out = '%PDF-1.4\n'
    const offsets = []
    for (let id = 1; id < objects.length; id++) {
      offsets[id] = out.length
      out += `${id} 0 obj\n${objects[id]}\nendobj\n`
    }
    const xref = out.length
    out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
    for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
    out += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    return new TextEncoder().encode(out)
  }

  return { addPage, toBytes }
}
