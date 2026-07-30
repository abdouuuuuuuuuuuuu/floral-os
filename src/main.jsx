import { createRoot } from 'react-dom/client'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import { NotificationProvider } from './context/NotificationContext'
import './index.css'
import App from './App.jsx'
import './print.css'
createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <CartProvider>
      <NotificationProvider>
        <App />
      </NotificationProvider>
    </CartProvider>
  </AuthProvider>,
)