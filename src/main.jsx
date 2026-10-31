// src/main.jsx
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import { NotificationProvider } from './context/NotificationContext'
import { ConfirmProvider } from './context/ConfirmContext'
import { UndoProvider } from './context/UndoContext'
import { initializeTheme, ThemeProvider } from './context/ThemeContext'
import App from './App.jsx'

import './index.css'
// Was './print.css'. The file on disk is Print.css — fine on Windows,
// breaks on any case-sensitive build (Linux CI, Docker).
import './Print.css'

// Order matters. NotificationProvider and ConfirmProvider sit OUTSIDE
// Auth and Cart so those contexts can raise a toast or ask for
// confirmation — a provider cannot consume a context below it.
initializeTheme()
createRoot(document.getElementById('root')).render(
  <ThemeProvider>
    <NotificationProvider>
      <UndoProvider>
        <ConfirmProvider>
          <AuthProvider>
            <CartProvider>
              <App />
            </CartProvider>
          </AuthProvider>
        </ConfirmProvider>
      </UndoProvider>
    </NotificationProvider>
  </ThemeProvider>,
)
