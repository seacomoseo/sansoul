// Build-time conversion of a simple SVG (a logo) into PDF path operators, so
// invoices print it as vectors without images or dependencies. Supports <svg>
// with viewBox, <g>, <path>, <rect>, <circle>, <ellipse>, <line>, <polygon> and
// <polyline>; fill, stroke, stroke-width and fill-rule as attributes or inline
// style; transform (matrix, translate, scale, rotate, skewX, skewY); colors as
// hex, rgb(), a few names or var(--name, fallback). Anything else that would
// change the drawing (text, images, gradients, CSS classes, opacity) throws, so
// the build reports it instead of printing a wrong logo.
//
// Output: { width, height, ops } with ops in viewBox units, y pointing down and
// the origin at the top-left corner of the viewBox. The caller places it with a
// `cm` that flips the y axis.

const NAMED = Object.freeze({ black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255], gray: [128, 128, 128], grey: [128, 128, 128] })
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polygon', 'polyline'])
const IGNORED = new Set(['title', 'desc', 'metadata'])
const KAPPA = 0.5522847498

export class SvgError extends Error {}

function fail (reason) {
  throw new SvgError(`svg_${reason}`)
}

function decimal (value) {
  return String(Math.round(value * 100) / 100)
}

function attributes (source) {
  const result = {}
  for (const match of source.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) result[match[1]] = match[3] ?? match[4]
  if (result.style) {
    for (const declaration of result.style.split(';')) {
      const [name, ...rest] = declaration.split(':')
      if (name?.trim() && rest.length) result[name.trim()] = rest.join(':').trim()
    }
  }
  return result
}

export function parseColor (value) {
  let color = String(value).trim()
  const variable = color.match(/^var\(\s*--[\w-]+\s*,\s*(.+)\)$/)
  if (variable) color = variable[1].trim()
  if (color === 'none' || color === 'transparent') return null
  if (color === 'currentColor') return [0, 0, 0]
  if (NAMED[color.toLowerCase()]) return NAMED[color.toLowerCase()]
  let hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1]
  if (hex) {
    if (hex.length === 3) hex = [...hex].map(char => char + char).join('')
    return [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16))
  }
  const rgb = color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/)
  if (rgb) return rgb.slice(1).map(Number).map(channel => Math.min(255, channel))
  fail('unsupported_color')
}

function multiply ([a, b, c, d, e, f], [g, h, i, j, k, l]) {
  return [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f]
}

function numbers (source) {
  return (String(source).match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || []).map(Number)
}

export function parseTransform (source) {
  let matrix = [1, 0, 0, 1, 0, 0]
  if (!source) return matrix
  for (const [, name, args] of source.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const n = numbers(args)
    let step
    if (name === 'matrix' && n.length === 6) step = n
    else if (name === 'translate') step = [1, 0, 0, 1, n[0] || 0, n[1] || 0]
    else if (name === 'scale') step = [n[0], 0, 0, n[1] ?? n[0], 0, 0]
    else if (name === 'rotate') {
      const angle = (n[0] || 0) * Math.PI / 180
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      step = [cos, sin, -sin, cos, 0, 0]
      if (n.length === 3) step = multiply(multiply([1, 0, 0, 1, n[1], n[2]], step), [1, 0, 0, 1, -n[1], -n[2]])
    } else if (name === 'skewX') step = [1, 0, Math.tan((n[0] || 0) * Math.PI / 180), 1, 0, 0]
    else if (name === 'skewY') step = [1, Math.tan((n[0] || 0) * Math.PI / 180), 0, 1, 0, 0]
    else fail('unsupported_transform')
    matrix = multiply(matrix, step)
  }
  return matrix
}

// Path data -> absolute segments: ['M', x, y] | ['L', x, y] | ['C', x1, y1, x2, y2, x, y] | ['Z'].
export function parsePathData (source) {
  const tokens = String(source).match(/[a-df-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || []
  const out = []
  let index = 0
  let command = null
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  let control = null
  let quadratic = null
  const next = () => {
    if (index >= tokens.length || /^[a-z]$/i.test(tokens[index])) fail('invalid_path')
    return Number(tokens[index++])
  }
  // Arc flags may be written without separators («a1 1 0 011 1»).
  const flag = () => {
    const token = tokens[index]
    if (token === undefined) fail('invalid_path')
    if (token === '0' || token === '1') {
      index++
      return token === '1'
    }
    if (/^[01]/.test(token)) {
      tokens[index] = token.slice(1)
      return token[0] === '1'
    }
    fail('invalid_path')
  }
  while (index < tokens.length) {
    if (/^[a-z]$/i.test(tokens[index])) command = tokens[index++]
    else if (!command) fail('invalid_path')
    const relative = command === command.toLowerCase()
    const upper = command.toUpperCase()
    const dx = relative ? x : 0
    const dy = relative ? y : 0
    let nextControl = null
    let nextQuadratic = null
    if (upper === 'M') {
      x = next() + dx
      y = next() + dy
      startX = x
      startY = y
      out.push(['M', x, y])
      command = relative ? 'l' : 'L'
    } else if (upper === 'L') {
      x = next() + dx
      y = next() + dy
      out.push(['L', x, y])
    } else if (upper === 'H') {
      x = next() + dx
      out.push(['L', x, y])
    } else if (upper === 'V') {
      y = next() + dy
      out.push(['L', x, y])
    } else if (upper === 'C' || upper === 'S') {
      const [x1, y1] = upper === 'C' ? [next() + dx, next() + dy] : control ? [2 * x - control[0], 2 * y - control[1]] : [x, y]
      const x2 = next() + dx
      const y2 = next() + dy
      x = next() + dx
      y = next() + dy
      out.push(['C', x1, y1, x2, y2, x, y])
      nextControl = [x2, y2]
    } else if (upper === 'Q' || upper === 'T') {
      const [qx, qy] = upper === 'Q' ? [next() + dx, next() + dy] : quadratic ? [2 * x - quadratic[0], 2 * y - quadratic[1]] : [x, y]
      const endX = next() + dx
      const endY = next() + dy
      out.push(['C', x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), endX + 2 / 3 * (qx - endX), endY + 2 / 3 * (qy - endY), endX, endY])
      x = endX
      y = endY
      nextQuadratic = [qx, qy]
    } else if (upper === 'A') {
      const rx = next()
      const ry = next()
      const rotation = next()
      const large = flag()
      const sweep = flag()
      const endX = next() + dx
      const endY = next() + dy
      for (const segment of arcToCurves(x, y, rx, ry, rotation, large, sweep, endX, endY)) out.push(segment)
      x = endX
      y = endY
    } else if (upper === 'Z') {
      out.push(['Z'])
      x = startX
      y = startY
      command = null
    } else {
      fail('invalid_path')
    }
    control = nextControl
    quadratic = nextQuadratic
  }
  return out
}

// Endpoint arc (SVG implementation notes, F.6) -> cubic curves of at most 90 degrees.
function arcToCurves (x1, y1, rx, ry, rotation, large, sweep, x2, y2) {
  if (x1 === x2 && y1 === y2) return []
  rx = Math.abs(rx)
  ry = Math.abs(ry)
  if (!rx || !ry) return [['L', x2, y2]]
  const phi = rotation * Math.PI / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const mx = (x1 - x2) / 2
  const my = (y1 - y2) / 2
  const px = cos * mx + sin * my
  const py = -sin * mx + cos * my
  const lambda = px * px / (rx * rx) + py * py / (ry * ry)
  if (lambda > 1) {
    rx *= Math.sqrt(lambda)
    ry *= Math.sqrt(lambda)
  }
  const sign = large === sweep ? -1 : 1
  const numerator = rx * rx * ry * ry - rx * rx * py * py - ry * ry * px * px
  const coefficient = sign * Math.sqrt(Math.max(0, numerator / (rx * rx * py * py + ry * ry * px * px)))
  const cxp = coefficient * rx * py / ry
  const cyp = -coefficient * ry * px / rx
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2
  const angle = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const theta = angle(1, 0, (px - cxp) / rx, (py - cyp) / ry)
  let delta = angle((px - cxp) / rx, (py - cyp) / ry, (-px - cxp) / rx, (-py - cyp) / ry)
  if (!sweep && delta > 0) delta -= 2 * Math.PI
  if (sweep && delta < 0) delta += 2 * Math.PI
  const count = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9))
  const step = delta / count
  const k = 4 / 3 * Math.tan(step / 4)
  const point = (a, offsetX = 0, offsetY = 0) => {
    const ex = rx * (Math.cos(a) + offsetX)
    const ey = ry * (Math.sin(a) + offsetY)
    return [cx + cos * ex - sin * ey, cy + sin * ex + cos * ey]
  }
  const curves = []
  for (let i = 0, a = theta; i < count; i++, a += step) {
    const b = a + step
    const [c1x, c1y] = point(a, -k * Math.sin(a), k * Math.cos(a))
    const [c2x, c2y] = point(b, k * Math.sin(b), -k * Math.cos(b))
    const [ex, ey] = i === count - 1 ? [x2, y2] : point(b)
    curves.push(['C', c1x, c1y, c2x, c2y, ex, ey])
  }
  return curves
}

function shapeSegments (name, a) {
  const n = key => Number(a[key] || 0)
  if (name === 'path') return parsePathData(a.d || '')
  if (name === 'rect') {
    const [x, y, w, h] = [n('x'), n('y'), n('width'), n('height')]
    if (a.rx || a.ry) fail('unsupported_rounded_rect')
    return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']]
  }
  if (name === 'circle' || name === 'ellipse') {
    const [cx, cy] = [n('cx'), n('cy')]
    const rx = name === 'circle' ? n('r') : n('rx')
    const ry = name === 'circle' ? n('r') : n('ry')
    const [kx, ky] = [rx * KAPPA, ry * KAPPA]
    return [
      ['M', cx + rx, cy],
      ['C', cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry],
      ['C', cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
      ['C', cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry],
      ['C', cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy],
      ['Z']
    ]
  }
  if (name === 'line') return [['M', n('x1'), n('y1')], ['L', n('x2'), n('y2')]]
  const points = numbers(a.points || '')
  const segments = []
  for (let i = 0; i + 1 < points.length; i += 2) segments.push([i ? 'L' : 'M', points[i], points[i + 1]])
  if (name === 'polygon' && segments.length) segments.push(['Z'])
  return segments
}

function pathOps (segments, [a, b, c, d, e, f]) {
  const point = (x, y) => `${decimal(a * x + c * y + e)} ${decimal(b * x + d * y + f)}`
  return segments.map(([op, ...values]) => {
    if (op === 'M') return `${point(values[0], values[1])} m`
    if (op === 'L') return `${point(values[0], values[1])} l`
    if (op === 'C') return `${point(values[0], values[1])} ${point(values[2], values[3])} ${point(values[4], values[5])} c`
    return 'h'
  }).join(' ')
}

function rgb (color, operator) {
  return `${color.map(channel => decimal(channel / 255)).join(' ')} ${operator}`
}

export function svgToPdf (source) {
  const text = String(source).replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '')
  const root = text.match(/<svg\b([^>]*)>/i)
  if (!root) fail('missing_root')
  const rootAttributes = attributes(root[1])
  let viewBox = numbers(rootAttributes.viewBox || '')
  if (viewBox.length !== 4) {
    const width = parseFloat(rootAttributes.width)
    const height = parseFloat(rootAttributes.height)
    if (!(width > 0 && height > 0)) fail('missing_viewbox')
    viewBox = [0, 0, width, height]
  }
  const [minX, minY, width, height] = viewBox
  if (!(width > 0 && height > 0)) fail('invalid_viewbox')

  const base = { hidden: false, fill: [0, 0, 0], stroke: null, strokeWidth: 1, rule: 'nonzero', matrix: [1, 0, 0, 1, -minX, -minY] }
  const stack = []
  let state = null
  const ops = []
  let skip = 0
  for (const match of text.slice(root.index).matchAll(/<(\/?)([\w:-]+)([^>]*?)(\/?)>/g)) {
    const [, closing, rawName, rawAttributes, selfClosing] = match
    const name = rawName.toLowerCase()
    if (skip) {
      if (IGNORED.has(name)) skip += closing ? -1 : selfClosing ? 0 : 1
      continue
    }
    if (closing) {
      if (name === 'svg' || name === 'g') state = stack.pop()
      continue
    }
    if (IGNORED.has(name)) {
      if (!selfClosing) skip = 1
      continue
    }
    if (name !== 'svg' && name !== 'g' && !SHAPES.has(name)) fail(`unsupported_element_${name}`)
    if (name === 'svg' && state) fail('unsupported_nested_svg')
    const a = name === 'svg' && !state ? rootAttributes : attributes(rawAttributes)
    if (a.class) fail('unsupported_css_class')
    for (const key of ['opacity', 'fill-opacity', 'stroke-opacity']) {
      if (a[key] !== undefined && Number(a[key]) !== 1) fail('unsupported_opacity')
    }
    if (/url\(/.test(a.fill || '') || /url\(/.test(a.stroke || '')) fail('unsupported_paint_server')
    const parent = state || base
    const current = {
      hidden: parent.hidden || a.display === 'none' || a.visibility === 'hidden',
      fill: a.fill !== undefined ? parseColor(a.fill) : parent.fill,
      stroke: a.stroke !== undefined ? parseColor(a.stroke) : parent.stroke,
      strokeWidth: a['stroke-width'] !== undefined ? parseFloat(a['stroke-width']) : parent.strokeWidth,
      rule: a['fill-rule'] || parent.rule,
      matrix: name === 'svg' && !state ? parent.matrix : multiply(parent.matrix, parseTransform(a.transform))
    }
    if (name === 'svg' || name === 'g') {
      if (!selfClosing) {
        stack.push(state)
        state = current
      }
      continue
    }
    if (current.hidden) continue
    const segments = shapeSegments(name, a)
    if (!segments.length) continue
    const path = pathOps(segments, current.matrix)
    const fill = name === 'line' ? null : current.fill
    const stroke = current.stroke && current.strokeWidth > 0 ? current.stroke : null
    if (!fill && !stroke) continue
    const [m0, m1, m2, m3] = current.matrix
    const scale = Math.sqrt(Math.abs(m0 * m3 - m1 * m2))
    const style = [fill && rgb(fill, 'rg'), stroke && rgb(stroke, 'RG'), stroke && `${decimal(current.strokeWidth * scale)} w`].filter(Boolean).join(' ')
    const evenOdd = current.rule === 'evenodd'
    const paint = fill && stroke ? (evenOdd ? 'B*' : 'B') : fill ? (evenOdd ? 'f*' : 'f') : 'S'
    ops.push(`${style} ${path} ${paint}`)
  }
  if (!ops.length) fail('empty')
  return { width, height, ops: ops.join('\n') }
}
