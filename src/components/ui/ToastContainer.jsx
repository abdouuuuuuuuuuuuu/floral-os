import { useNotification } from '../../context/NotificationContext'
import Toast from './Toast'

function ToastContainer() {
  const { notifications, dismissNotification } = useNotification()

  if (notifications.length === 0) return null

  return (
    <div className="fixed top-20 right-6 z-50 space-y-2 w-80">
      {notifications.map((notification) => (
        <Toast
          key={notification.id}
          notification={notification}
          onDismiss={dismissNotification}
        />
      ))}
    </div>
  )
}

export default ToastContainer