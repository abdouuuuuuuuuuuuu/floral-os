// A USB scanner sends key positions, not letters, so what Windows "types" depends
// on the keyboard language: on a French keyboard ORD1299 arrives as ORD&éçç.
// Each scan is read several ways, and only a reading that is a valid Blossom code
// is accepted, so the keyboard language never matters.

const FR_LETTER_SWAPS = { KeyQ: 'A', KeyA: 'Q', KeyW: 'Z', KeyZ: 'W', Semicolon: 'M' }

function usCharacter(code, shift) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Numpad[0-9]$/.test(code)) return code.slice(-1)
  if (code === 'NumpadSubtract') return '-'
  if (/^Digit[0-9]$/.test(code)) return shift ? '?' : code.slice(-1)
  if (code === 'Minus') return shift ? '?' : '-'
  return '?'
}

function frCharacter(code, shift) {
  if (FR_LETTER_SWAPS[code]) return FR_LETTER_SWAPS[code]
  if (code === 'KeyM') return '?'
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Numpad[0-9]$/.test(code)) return code.slice(-1)
  if (code === 'NumpadSubtract') return '-'
  if (/^Digit[0-9]$/.test(code)) {
    if (shift) return code.slice(-1)
    return code === 'Digit6' ? '-' : '?'
  }
  return '?'
}

// Text a US-position scanner produces on French (FR/BE) keyboards, back to what was scanned.
const AZERTY_TEXT = {
  '&': '1', 'é': '2', '"': '3', "'": '4', '(': '5', '-': '6', '§': '6',
  'è': '7', '_': '8', '!': '8', 'ç': '9', 'à': '0', ')': '-',
  a: 'Q', q: 'A', A: 'Q', Q: 'A', z: 'W', w: 'Z', Z: 'W', W: 'Z', ';': 'M', ',': 'M',
}

export function fromAzertyText(text) {
  return [...String(text ?? '')].map((character) => AZERTY_TEXT[character] ?? character).join('')
}

/** The possible readings of a scan. `keys` holds { key, code, shift } for each key press. */
export function scanReadings(keys) {
  const typed = keys.map(({ key }) => (key.length === 1 ? key : '?')).join('')
  return [
    typed,
    keys.map(({ code, shift }) => usCharacter(code, shift)).join(''),
    keys.map(({ code, shift }) => frCharacter(code, shift)).join(''),
    fromAzertyText(typed),
  ]
}

const CARD_CODE = /^[A-Z]{1,3}-[A-F0-9]{12}$/

/** Returns the card code in its stored form, or null. Also repairs text scanned on a French keyboard. */
export function parseCardCode(text) {
  const raw = String(text ?? '').trim()
  for (const reading of [raw, fromAzertyText(raw)]) {
    const code = reading.toUpperCase()
    if (CARD_CODE.test(code)) return code
  }
  return null
}

/**
 * Tells the app a card was scanned. A screen that wants the card (checkout, or a
 * customer being linked) claims it; otherwise the top bar opens the card window.
 */
export function announceCardScan(code) {
  const claimed = !window.dispatchEvent(new CustomEvent('blossom:card-scanned', { cancelable: true, detail: { code } }))
  if (!claimed) window.dispatchEvent(new CustomEvent('blossom:card-scan-unclaimed', { detail: { code } }))
}
