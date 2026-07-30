import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

const icons = {
  success: <CheckCircle size={20} className="text-green-500" />,
  error: <AlertCircle size={20} className="text-red-500" />,
  info: <Info size={20} className="text-blue-500" />,
}

const bgColors = {
  success: 'bg-green-50 border-green-200',
  error: 'bg-red-50 border-red-200',
  info: 'bg-blue-50 border-blue-200',
}

function Toast({ notification, onDismiss }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg ${bgColors[notification.type]} animate-fade-in`}>
      {icons[notification.type]}
      <p className="text-sm text-gray-700 flex-1">{notification.message}</p>
      <button
        onClick={() => onDismiss(notification.id)}
        className="p-1 rounded hover:bg-black/5 transition-colors"
      >
        <X size={16} className="text-gray-400" />
      </button>
    </div>
  )
}

export default Toast