import { Outlet } from 'react-router-dom'
import { useShopName } from '../../hooks/useShopName'

function AuthLayout() {
    const shopName = useShopName()
  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden">
      {/* Your floral background */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url('/splash-bg.png')`,
        }}
      />
      
      {/* Soft overlay */}
      <div className="absolute inset-0 bg-white/30" />

      {/* White card container */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 md:p-10">
          {/* Logo */}
          <h1 className="font-serif text-4xl text-center text-primary mb-8 tracking-wide">
            {shopName}
          </h1>
          
          {/* Child routes render here */}
          <Outlet />
        </div>
      </div>
    </div>
  )
}

export default AuthLayout