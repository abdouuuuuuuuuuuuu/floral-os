import { Component } from 'react'

// Without this, any render error leaves the till as a blank window with no
// way back. Show what happened and a safe way to continue instead.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Blossom crashed while rendering:', error, info?.componentStack)
  }

  componentDidUpdate(prevProps) {
    // Navigating elsewhere gives the new page a fresh chance to render.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div role="alert" className="min-h-screen flex items-center justify-center bg-sage p-6">
        <div className="max-w-md w-full rounded-2xl bg-white p-6 shadow-sm border border-gray-100 space-y-4">
          <h1 className="text-lg font-semibold text-gray-900">This screen stopped working</h1>
          <p className="text-sm text-gray-600">
            Nothing was saved from the action in progress unless you saw a success message.
            Check Orders before repeating a sale or payment.
          </p>
          <p className="text-xs text-gray-400 break-words">{String(this.state.error?.message || this.state.error)}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { window.location.hash = '#/orders'; this.setState({ error: null }) }}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
            >
              Go to Orders
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}
