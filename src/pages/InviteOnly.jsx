import { Link } from 'react-router-dom'
import { ArrowLeft, UserPlus } from 'lucide-react'

export default function InviteOnly() {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <UserPlus size={22} aria-hidden="true" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900">Blossom is invite-only</h2>
      <p className="mt-2 text-sm leading-6 text-gray-600">
        Ask your shop owner to create your staff account. Your access will be set up for your role.
      </p>
      <Link to="/auth/login" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-dark">
        <ArrowLeft size={16} aria-hidden="true" /> Back to sign in
      </Link>
    </div>
  )
}
