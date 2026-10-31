// Small, dependency-free byte-mode QR encoder for short Blossom card IDs.
// Version 1-L supports up to 17 ASCII bytes, including the letter-prefixed IDs.
export function qrDataUrl(text) {
  const bytes = [...new TextEncoder().encode(text)]
  if (bytes.length > 17) throw new Error('Card code is too long for this QR encoder')
  const bits = []
  const append = (value, length) => { for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1) }
  append(0b0100, 4)
  append(bytes.length, 8)
  bytes.forEach((byte) => append(byte, 8))
  for (let i = 0; i < Math.min(4, 152 - bits.length); i += 1) bits.push(0)
  while (bits.length % 8) bits.push(0)
  const data = []
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((value, bit) => (value << 1) | bit, 0))
  for (let pad = 0; data.length < 19; pad += 1) data.push(pad % 2 ? 0x11 : 0xec)

  const multiply = (x, y) => {
    let result = 0
    for (let i = 7; i >= 0; i -= 1) {
      result = (result << 1) ^ ((result >>> 7) * 0x11d)
      result ^= ((y >>> i) & 1) * x
    }
    return result
  }
  const generator = [1]
  let root = 1
  for (let i = 0; i < 7; i += 1) {
    const next = Array(generator.length + 1).fill(0)
    generator.forEach((value, index) => { next[index] ^= value; next[index + 1] ^= multiply(value, root) })
    generator.splice(0, generator.length, ...next)
    root = multiply(root, 2)
  }
  const remainder = [...data, ...Array(7).fill(0)]
  for (let i = 0; i < data.length; i += 1) {
    const factor = remainder[i]
    generator.forEach((value, index) => { remainder[i + index] ^= multiply(value, factor) })
  }
  const codewords = [...data, ...remainder.slice(data.length)]
  const matrix = Array.from({ length: 21 }, () => Array(21).fill(null))
  const set = (x, y, value) => { if (x >= 0 && x < 21 && y >= 0 && y < 21) matrix[y][x] = Boolean(value) }
  const finder = (ox, oy) => {
    for (let dy = -1; dy <= 7; dy += 1) for (let dx = -1; dx <= 7; dx += 1) {
      const x = ox + dx, y = oy + dy
      const inside = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6
      set(x, y, inside && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)))
    }
  }
  finder(0, 0); finder(14, 0); finder(0, 14)
  for (let i = 8; i < 13; i += 1) { set(i, 6, i % 2 === 0); set(6, i, i % 2 === 0) }
  // Version 1-L format information, mask 0.
  let format = 0b01000
  let remainderBits = format
  for (let i = 0; i < 10; i += 1) remainderBits = (remainderBits << 1) ^ ((remainderBits >>> 9) * 0x537)
  format = ((format << 10) | remainderBits) ^ 0x5412
  for (let i = 0; i <= 5; i += 1) set(8, i, (format >>> i) & 1)
  set(8, 7, (format >>> 6) & 1); set(8, 8, (format >>> 7) & 1); set(7, 8, (format >>> 8) & 1)
  for (let i = 9; i < 15; i += 1) set(14 - i, 8, (format >>> i) & 1)
  for (let i = 0; i < 8; i += 1) set(20 - i, 8, (format >>> i) & 1)
  for (let i = 8; i < 15; i += 1) set(8, 20 - (14 - i), (format >>> i) & 1)
  set(8, 13, true)

  let bitIndex = 0
  let upward = true
  for (let right = 20; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < 21; vert += 1) {
      const y = upward ? 20 - vert : vert
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset
        if (matrix[y][x] !== null) continue
        const bit = bitIndex < codewords.length * 8 ? (codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1 : 0
        set(x, y, bit ^ ((x + y) % 2 === 0 ? 1 : 0))
        bitIndex += 1
      }
    }
    upward = !upward
  }

  const modules = []
  matrix.forEach((row, y) => row.forEach((dark, x) => { if (dark) modules.push(`<rect x="${x + 4}" y="${y + 4}" width="1" height="1"/>`) }))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29"><rect width="29" height="29" fill="white"/><g fill="#241827">${modules.join('')}</g></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
