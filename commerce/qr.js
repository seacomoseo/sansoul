// QR Code encoder for short texts (site URLs on invoices): byte mode, error
// correction level M, versions 1-10 (up to 213 bytes of UTF-8). No dependencies.
// Follows ISO/IEC 18004 as laid out in Project Nayuki's reference encoder (MIT).
// Returns the module matrix as an array of rows of booleans (true = dark),
// without the quiet zone.

// Level M, indexed by version.
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26]
const ECC_BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5]
const MAX_VERSION = 10
const FORMAT_LEVEL_M = 0

function rawDataModules (version) {
  let result = (16 * version + 128) * version + 64
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2
    result -= (25 * align - 10) * align - 55
    if (version >= 7) result -= 36
  }
  return result
}

function dataCodewords (version) {
  return Math.floor(rawDataModules(version) / 8) - ECC_PER_BLOCK[version] * ECC_BLOCKS[version]
}

function gfMultiply (x, y) {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z
}

function rsDivisor (degree) {
  const result = new Array(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j], root)
      if (j + 1 < degree) result[j] ^= result[j + 1]
    }
    root = gfMultiply(root, 0x02)
  }
  return result
}

function rsRemainder (data, divisor) {
  const result = new Array(divisor.length).fill(0)
  for (const byte of data) {
    const factor = byte ^ result.shift()
    result.push(0)
    divisor.forEach((coefficient, index) => { result[index] ^= gfMultiply(coefficient, factor) })
  }
  return result
}

// Data codewords with the error correction of each block, interleaved.
function codewords (bytes, version) {
  const capacity = dataCodewords(version)
  const bits = []
  const push = (value, length) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1) }
  push(0b0100, 4)
  push(bytes.length, version < 10 ? 8 : 16)
  for (const byte of bytes) push(byte, 8)
  push(0, Math.min(4, capacity * 8 - bits.length))
  push(0, (8 - bits.length % 8) % 8)
  const data = []
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0))
  for (let pad = 0xec; data.length < capacity; pad ^= 0xec ^ 0x11) data.push(pad)

  const blocks = ECC_BLOCKS[version]
  const eccLength = ECC_PER_BLOCK[version]
  const raw = Math.floor(rawDataModules(version) / 8)
  const shortBlocks = blocks - raw % blocks
  const shortLength = Math.floor(raw / blocks)
  const divisor = rsDivisor(eccLength)
  const split = []
  for (let i = 0, k = 0; i < blocks; i++) {
    const block = data.slice(k, k + shortLength - eccLength + (i < shortBlocks ? 0 : 1))
    k += block.length
    const ecc = rsRemainder(block, divisor)
    if (i < shortBlocks) block.push(0)
    split.push([...block, ...ecc])
  }
  const result = []
  for (let i = 0; i < split[0].length; i++) {
    split.forEach((block, j) => {
      if (i !== shortLength - eccLength || j >= shortBlocks) result.push(block[i])
    })
  }
  return result
}

function alignmentPositions (version, size) {
  if (version === 1) return []
  const count = Math.floor(version / 7) + 2
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2
  const result = [6]
  for (let position = size - 7; result.length < count; position -= step) result.splice(1, 0, position)
  return result
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => x * y % 2 + x * y % 3 === 0,
  (x, y) => (x * y % 2 + x * y % 3) % 2 === 0,
  (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0
]

// Standard penalty: runs of 5+, 2x2 blocks, finder-like patterns and dark balance.
function penalty (modules) {
  const size = modules.length
  let score = 0
  const lines = []
  for (let i = 0; i < size; i++) {
    lines.push(modules[i])
    lines.push(modules.map(row => row[i]))
  }
  for (const line of lines) {
    let run = 1
    for (let i = 1; i <= size; i++) {
      if (i < size && line[i] === line[i - 1]) {
        run++
        continue
      }
      if (run >= 5) score += run - 2
      run = 1
    }
    const text = line.map(dark => dark ? '1' : '0').join('')
    for (let index = text.indexOf('1011101'); index !== -1; index = text.indexOf('1011101', index + 1)) {
      const before = text.slice(Math.max(0, index - 4), index)
      const after = text.slice(index + 7, index + 11)
      // Four light modules (the edge counts as light) on either side.
      if (!before.includes('1') || !after.includes('1')) score += 40
    }
  }
  let dark = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) dark++
      if (x < size - 1 && y < size - 1) {
        const color = modules[y][x]
        if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) score += 3
      }
    }
  }
  const total = size * size
  score += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10
  return score
}

export function encodeQr (text) {
  const bytes = [...new TextEncoder().encode(String(text))]
  let version = 1
  while (version <= MAX_VERSION && 4 + (version < 10 ? 8 : 16) + bytes.length * 8 > dataCodewords(version) * 8) version++
  if (version > MAX_VERSION) throw new Error('qr_text_too_long')
  const size = version * 4 + 17
  const modules = Array.from({ length: size }, () => new Array(size).fill(false))
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false))
  const set = (x, y, dark) => {
    modules[y][x] = dark
    reserved[y][x] = true
  }

  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0)
    set(i, 6, i % 2 === 0)
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx
        const y = cy + dy
        if (x < 0 || x >= size || y < 0 || y >= size) continue
        const distance = Math.max(Math.abs(dx), Math.abs(dy))
        set(x, y, distance !== 2 && distance !== 4)
      }
    }
  }
  const aligns = alignmentPositions(version, size)
  aligns.forEach((cx, i) => aligns.forEach((cy, j) => {
    const last = aligns.length - 1
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }
  }))
  const drawFormat = mask => {
    const data = FORMAT_LEVEL_M << 3 | mask
    let remainder = data
    for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537)
    const bits = (data << 10 | remainder) ^ 0x5412
    const bit = i => ((bits >>> i) & 1) === 1
    for (let i = 0; i <= 5; i++) set(8, i, bit(i))
    set(8, 7, bit(6))
    set(8, 8, bit(7))
    set(7, 8, bit(8))
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i))
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i))
    set(8, size - 8, true)
  }
  drawFormat(0)
  if (version >= 7) {
    let remainder = version
    for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25)
    const bits = version << 12 | remainder
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1
      const a = size - 11 + i % 3
      const b = Math.floor(i / 3)
      set(a, b, dark)
      set(b, a, dark)
    }
  }

  const data = codewords(bytes, version)
  let index = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vertical = 0; vertical < size; vertical++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? size - 1 - vertical : vertical
        if (reserved[y][x] || index >= data.length * 8) continue
        modules[y][x] = ((data[index >>> 3] >>> (7 - (index & 7))) & 1) === 1
        index++
      }
    }
  }

  const apply = mask => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!reserved[y][x] && MASKS[mask](x, y)) modules[y][x] = !modules[y][x]
      }
    }
    drawFormat(mask)
  }
  let best = 0
  let bestScore = Infinity
  for (let mask = 0; mask < 8; mask++) {
    apply(mask)
    const score = penalty(modules)
    if (score < bestScore) {
      best = mask
      bestScore = score
    }
    apply(mask)
  }
  apply(best)
  return modules
}
