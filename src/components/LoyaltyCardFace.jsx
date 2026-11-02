import { loyaltyCardQrDataUrl } from '../lib/qr'
import cardFront from '../assets/loyalty-card-front.png'
import cardBack from '../assets/loyalty-card-back.png'
import cardLogo from '../assets/loyalty-card-logo.png'

const faceStyle = { position: 'relative', aspectRatio: '1050 / 600', overflow: 'hidden', background: '#fff', containerType: 'inline-size' }
const artStyle = { display: 'block', width: '100%', height: '100%' }

// Positions come from the supplied 1050 x 600 artwork.
export function LoyaltyCardFront({ code, className = '' }) {
  return (
    <div className={className} style={faceStyle}>
      <img src={cardFront} alt="" style={artStyle} />
      <div style={{ position: 'absolute', left: '36.2%', top: '25.7%', width: '27.6%', aspectRatio: '1' }}>
        <img src={loyaltyCardQrDataUrl(code)} alt={`QR code for ${code}`} style={artStyle} />
        <span style={{ position: 'absolute', left: '36.5%', top: '36.5%', width: '27%', height: '27%', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={cardLogo} alt="" style={{ width: '82%', height: '82%', objectFit: 'contain' }} />
        </span>
      </div>
      <p style={{ position: 'absolute', left: 0, right: 0, top: '77%', margin: 0, textAlign: 'center', whiteSpace: 'nowrap', color: '#000', fontFamily: 'Georgia, serif', fontSize: '2.05cqw', letterSpacing: '.03em' }}>ID: {code}</p>
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
