import { loyaltyCardQrDataUrl } from '../lib/qr'
import cardFront from '../assets/loyalty-card-front.png'
import cardBack from '../assets/loyalty-card-back.png'
import cardLogo from '../assets/loyalty-card-logo.png'

// 85 x 55 mm with a 2px corner radius. The 1050 x 600 artwork is wider than the
// card, so it fills the height and loses only decorative petal edges at the sides.
const faceStyle = { position: 'relative', aspectRatio: '85 / 55', overflow: 'hidden', borderRadius: '2px', background: '#fff', containerType: 'inline-size' }
const artStyle = { display: 'block', width: '100%', height: '100%', objectFit: 'cover' }
const qrImageStyle = { display: 'block', width: '100%', height: '100%' }

// Positions are measured from the part of the artwork visible on the card.
export function LoyaltyCardFront({ code, className = '' }) {
  return (
    <div className={className} style={faceStyle}>
      <img src={cardFront} alt="" style={artStyle} />
      <div style={{ position: 'absolute', left: '34.35%', top: '25.7%', width: '31.3%', aspectRatio: '1' }}>
        <img src={loyaltyCardQrDataUrl(code)} alt={`QR code for ${code}`} style={qrImageStyle} />
        <span style={{ position: 'absolute', left: '36.5%', top: '36.5%', width: '27%', height: '27%', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={cardLogo} alt="" style={{ width: '82%', height: '82%', objectFit: 'contain' }} />
        </span>
      </div>
      <p style={{ position: 'absolute', left: 0, right: 0, top: '77%', margin: 0, textAlign: 'center', whiteSpace: 'nowrap', color: '#000', fontFamily: '"Times New Roman", serif', fontSize: '2.32cqw', letterSpacing: '.03em' }}>ID: {code}</p>
    </div>
  )
}

export function LoyaltyCardBack({ className = '' }) {
  return (
    <div className={className} style={faceStyle}>
      <img src={cardBack} alt="Blossom Flowers Store" style={artStyle} />
    </div>
  )
}
