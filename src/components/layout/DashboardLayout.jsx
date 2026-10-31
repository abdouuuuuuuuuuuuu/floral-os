import { useEffect, useState } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { useSettings } from '../../hooks/useSettings'
import { useNewOrderSound } from '../../hooks/useNewOrderSound'

function DashboardLayout({ children }) {
  const { settings } = useSettings()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    if (!mobileNavOpen) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMobileNavOpen(false)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [mobileNavOpen])

  // Mounted here rather than on a page, so the chime works wherever the
  // user happens to be standing in the app.
  useNewOrderSound(settings?.new_order_sound !== false)

  return (
    // Page sits one step below the white chrome, so panels read as
    // raised without needing borders everywhere.
    <div className="min-h-screen bg-sage">
      <Sidebar isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-30 bg-primary/25 backdrop-blur-[1px] lg:hidden"
        />
      )}
      <TopBar
        isNavigationOpen={mobileNavOpen}
        onMenuClick={() => setMobileNavOpen((open) => !open)}
      />

      {/* Was ml-64 (16rem) against a w-58 (14.5rem) sidebar — a 1.5rem
          gap down the left of every page. */}
      <main className="dashboard-main">
        {children}
      </main>
    </div>
  )
}

export default DashboardLayout
