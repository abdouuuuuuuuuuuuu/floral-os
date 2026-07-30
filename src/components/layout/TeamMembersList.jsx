import { useTeamMembers } from '../hooks/useTeamMembers'

export default function TeamMembersList() {
  const { members, loading, error, deleteMember } = useTeamMembers()

  if (loading) return <div className="p-4">Loading team members...</div>
  if (error) return <div className="p-4 text-red-600">Error: {error}</div>

  const roleColors = {
    admin: 'bg-purple-100 text-purple-800',
    manager: 'bg-blue-100 text-blue-800',
    staff: 'bg-green-100 text-green-800'
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Team Members</h2>
      
      {members.length === 0 ? (
        <p className="text-gray-500">No team members found.</p>
      ) : (
        <div className="grid gap-4">
          {members.map(member => (
            <div key={member.id} className="border rounded-lg p-4 flex items-center justify-between bg-white shadow-sm">
              <div className="flex items-center gap-4">
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-semibold">
                    {member.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </div>
                )}
                
                <div>
                  <h3 className="font-semibold text-lg">{member.full_name}</h3>
                  <p className="text-gray-500 text-sm">{member.email}</p>
                  {member.phone && <p className="text-gray-400 text-sm">{member.phone}</p>}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${roleColors[member.role] || 'bg-gray-100'}`}>
                  {member.role}
                </span>
                
                {!member.is_active && (
                  <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">
                    Inactive
                  </span>
                )}

                <button 
                  onClick={() => deleteMember(member.id)}
                  className="text-red-500 hover:text-red-700 text-sm ml-2"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}