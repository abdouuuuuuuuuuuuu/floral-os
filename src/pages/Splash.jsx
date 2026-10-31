import { useShopName } from '../hooks/useShopName'
import BlossomGlyph from '../components/brand/BlossomGlyph'

function Splash({ isExiting = false }) {
  const shopName = useShopName()

  return (
    <main className={`splash-screen${isExiting ? ' splash-exiting' : ''}`} aria-label={`Opening ${shopName}`}>
      <div className="splash-light splash-light-a" aria-hidden="true" />
      <div className="splash-light splash-light-b" aria-hidden="true" />
      <div className="splash-content" role="status" aria-live="polite">
        <div className="splash-emblem-wrap" aria-hidden="true">
          <span className="splash-halo splash-halo-one" />
          <span className="splash-halo splash-halo-two" />
          <span className="splash-trail" />
          <BlossomGlyph className="splash-glyph" />
        </div>
        <p className="splash-wordmark">Blossom</p>
        <p className="splash-caption">{shopName} <span>·</span> Flower studio</p>
        <div className="splash-progress" aria-hidden="true"><span /></div>
        <p className="splash-loading-label">Preparing your studio</p>
      </div>
      <span className="splash-version" aria-hidden="true">A softer start to your day</span>
    </main>
  )
}

export default Splash
