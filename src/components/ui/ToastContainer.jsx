import { useNotification } from '../../context/NotificationContext'
import Toast from './Toast'

function ToastContainer() {
  const { toasts, dismissToast } = useNotification()

  if (toasts.length === 0) return null
  const visibleToasts = toasts.slice(0, 4)

  return (
    <div className="fixed top-20 right-3 sm:right-6 z-[90] space-y-2 w-[min(22rem,calc(100vw-1.5rem))]" role="region" aria-label="Recent notifications">
      {visibleToasts.map((notification) => (
        <Toast
          key={notification.id}
          notification={notification}
          onDismiss={dismissToast}
        />
      ))}
    </div>
  )
}

export default ToastContainer
