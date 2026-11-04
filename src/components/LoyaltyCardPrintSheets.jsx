import { LoyaltyCardFront, LoyaltyCardBack } from './LoyaltyCardFace'

const CARDS_PER_SHEET = 10

function toSheets(codes) {
  const sheets = []
  for (let i = 0; i < codes.length; i += CARDS_PER_SHEET) sheets.push(codes.slice(i, i + CARDS_PER_SHEET))
  return sheets
}

// Each row of backs is reversed so both sides line up when printed double-sided.
function backSlots(sheet) {
  const slots = []
  for (let i = 0; i < sheet.length; i += 2) slots.push(sheet[i + 1] ?? null, sheet[i])
  return slots
}

// Used only when printing or exporting a PDF.
export const LOYALTY_PRINT_CSS = `.loyalty-print-root { display: none; }
@media print {
  @page { size: A4; margin: 0; }
  html, body { background: #fff !important; }
  body > *:not(.loyalty-print-root) { display: none !important; }
  .loyalty-print-root { display: block; }
  /* Print.css hides everything except a receipt, so the cards must opt back in. */
  .loyalty-print-root, .loyalty-print-root * { visibility: visible !important; }
  .loyalty-print-sheet { display: grid; grid-template-columns: repeat(2, 85mm); grid-auto-rows: 55mm; justify-content: center; align-content: start; gap: 3mm; padding-top: 5mm; break-after: page; }
  .loyalty-print-set:last-child .loyalty-print-sheet:last-child { break-after: auto; }
  .loyalty-print-face { width: 85mm; height: 55mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`

// A4 sheets of 10 cards: a page of fronts, then a page of backs.
export default function LoyaltyCardPrintSheets({ codes }) {
  return (
    <div className="loyalty-print-root">
      {toSheets(codes).map((sheet, index) => (
        <div key={index} className="loyalty-print-set">
          <div className="loyalty-print-sheet">
            {sheet.map((code) => <LoyaltyCardFront key={code} code={code} className="loyalty-print-face" />)}
          </div>
          <div className="loyalty-print-sheet">
            {backSlots(sheet).map((code, slot) => (code
              ? <LoyaltyCardBack key={code} className="loyalty-print-face" />
              : <div key={`empty-${slot}`} style={{ width: '85mm', height: '55mm' }} />))}
          </div>
        </div>
      ))}
    </div>
  )
}
