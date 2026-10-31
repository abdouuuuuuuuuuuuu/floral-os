import { Outlet } from 'react-router-dom'
import { useShopName } from '../../hooks/useShopName'
import BlossomGlyph from '../brand/BlossomGlyph'

function AuthLayout() {
  const shopName = useShopName()

  return (
    <div className="auth-shell relative isolate min-h-screen overflow-hidden">
      <div className="auth-backdrop" aria-hidden="true">
        <span className="auth-light auth-light-one" />
        <span className="auth-light auth-light-two" />
        <span className="auth-grain" />
      </div>

      <main className="auth-layout relative z-10 mx-auto grid min-h-screen w-full max-w-[1320px] grid-cols-1 items-center gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)] lg:gap-16 lg:px-12 lg:py-12">
        <section className="auth-story hidden min-w-0 flex-col justify-center lg:flex" aria-label="About Blossom">
          <div className="auth-brand-lockup">
            <div className="auth-brand-icon">
              <BlossomGlyph className="auth-brand-glyph" />
            </div>
            <div>
              <p className="font-display text-[27px] leading-none tracking-tight text-primary">Blossom</p>
              <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/50">Flower studio</p>
            </div>
          </div>

          <p className="auth-eyebrow mt-14">A calmer way to run your shop</p>
          <h1 className="auth-headline mt-4 max-w-[600px] text-5xl font-semibold leading-[1.06] tracking-[-0.045em] text-[#29213B] xl:text-6xl">
            Make room for
            <span className="auth-headline-accent"> the moments</span>
            <br />
            that matter.
          </h1>
          <p className="mt-5 max-w-[470px] text-base leading-7 text-[#716A7E]">
            Orders, flowers, and the little details that make every delivery feel personal — together in one thoughtful workspace.
          </p>

          <div className="auth-art-stage mt-8" aria-hidden="true">
            <div className="auth-orbit auth-orbit-outer" />
            <div className="auth-orbit auth-orbit-inner" />
            <div className="auth-logo-aura" />
            <div className="auth-logo-stage">
              <BlossomGlyph className="auth-hero-glyph" />
              <span className="auth-spark auth-spark-one">✦</span>
              <span className="auth-spark auth-spark-two">✧</span>
              <span className="auth-spark auth-spark-three">·</span>
            </div>
            <div className="auth-art-caption">
              <span className="auth-caption-dot" />
              <span>{shopName}</span>
              <span className="auth-caption-divider" />
              <span>in good hands</span>
            </div>
          </div>

          <div className="auth-feature-row mt-5" aria-label="Shop tools">
            <span>Orders</span><i />
            <span>Stock</span><i />
            <span>Customers</span><i />
            <span>Cash flow</span>
          </div>
        </section>

        <section className="auth-card-wrap mx-auto w-full max-w-[460px]">
          <div className="auth-mobile-brand mb-7 flex items-center justify-center gap-3 lg:hidden">
            <div className="auth-brand-icon auth-brand-icon-small">
              <BlossomGlyph className="auth-brand-glyph auth-brand-glyph-small" />
            </div>
            <div>
              <p className="font-display text-2xl leading-none text-primary">Blossom</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/50">Flower studio</p>
            </div>
          </div>

          <div className="auth-card">
            <div className="auth-card-topline">
              <span className="auth-secure-dot" />
              <span>YOUR SHOP WORKSPACE</span>
            </div>
            <Outlet />
          </div>
          <p className="mt-5 text-center text-xs text-[#928A9A]">
            A little more calm for the work you love.
          </p>
        </section>
      </main>
    </div>
  )
}

export default AuthLayout
