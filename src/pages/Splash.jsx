import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShopName } from '../hooks/useShopName'

function Splash() {
  const navigate = useNavigate()
  const shopName = useShopName()  // <-- Move here, at the top

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/auth/login')
    }, 3000)

    return () => clearTimeout(timer)
  }, [navigate])

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden">
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('/splash-bg.png')` }}
      />
      <div className="absolute inset-0 bg-white/20" />
      <div className="relative z-10 animate-fade-in">
        <h1 className="font-serif text-6xl md:text-8xl text-primary tracking-wider drop-shadow-lg">
          {shopName}
        </h1>
      </div>
    </div>
  )
}

export default Splash