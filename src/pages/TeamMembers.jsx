import { useState } from 'react'
import {
  Search, User, Edit3, X, Check, Crown, Briefcase, Flower2,
  Loader2, Mail, Phone, Calendar, Activity, Trash2, AlertTriangle, Shield
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useTeam } from '../hooks/useTeam'
import { useAuth } from '../hooks/useAuth'
import { useNotification } from '../context/NotificationContext'

const roleConfig = {
  owner: { label: 'Owner', icon: Crown, bg: 'bg-amber-600', text: 'text-amber-600', light: 'bg-amber-50', border: 'border-amber-200' },
  admin: { label: 'Admin', icon: Crown, bg: 'bg-emerald-600', text: 'text-emerald-600', light: 'bg-emerald-50', border: 'border-emerald-200' },
  manager: { label: 'Manager', icon: Briefcase, bg: 'bg-violet-600', text: 'text-violet-600', light: 'bg-violet-50', border: 'border-violet-200' },
  staff: { label: 'Staff', icon: Flower2, bg: 'bg-teal-600', text: 'text-teal-600', light: 'bg-teal-50', border: 'border-teal-200' },
}

const rolePermissions = {
  owner: ['All permissions', 'Manage team', 'View reports', 'System settings', 'Billing'],
  admin: ['All permissions', 'Manage team', 'View reports', 'System settings'],
  manager: ['Manage orders', 'Manage products', 'View reports', 'Manage team'],
  staff: ['Create orders', 'Manage inventory', 'View products'],
}

function Team() {
  const { members, loading, refresh, updateMember, deleteMember } = useTeam()
  const { role, profile } = useAuth()
  const { addNotification } = useNotification()

  const [searchQuery, setSearchQuery] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [selectedMember, setSelectedMember] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)

  const isAdmin = role === 'owner' || role === 'admin'

  const filteredMembers = members.filter((member) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      member.full_name?.toLowerCase().includes(q) ||
      member.email?.toLowerCase().includes(q) ||
      member.role?.toLowerCase().includes(q) ||
      member.phone?.includes(q)
    )
  })

  const startEdit = (member) => {
    setEditingId(member.id)
    setEditForm({
      full_name: member.full_name || '',
      email: member.email || '',
      phone: member.phone || '',
      role: member.role || 'staff',
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({})
  }

  const saveMember = async (memberId) => {
    setSaving(true)
    
    const updateData = {
      full_name: editForm.full_name.trim(),
      email: editForm.email.trim(),
      phone: editForm.phone,
      role: editForm.role,
    }

    try {
      await updateMember(memberId, updateData)
      setEditingId(null)
      addNotification('Member updated', 'success')
    } catch (err) {
      addNotification(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteMember = async (memberId) => {
    try {
      await deleteMember(memberId)
      setShowDeleteConfirm(null)
      setSelectedMember(null)
      addNotification('Member removed', 'success')
    } catch (err) {
      addNotification(err.message, 'error')
    }
  }

  const getInitials = (name) => {
    if (!name) return '??'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const getAvatarColor = (memberRole) => {
    const colors = {
      owner: 'bg-amber-600 text-white',
      admin: 'bg-emerald-600 text-white',
      manager: 'bg-violet-600 text-white',
      staff: 'bg-teal-600 text-white',
    }
    return colors[memberRole] || 'bg-gray-400 text-white'
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Team</h1>
            <p className="text-sm text-gray-400 mt-0.5">Manage your team members and roles</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 px-4 py-2 flex items-center gap-2">
            <Shield size={16} className="text-primary" />
            <span className="text-sm font-medium text-gray-600">{members.length} members</span>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, phone, role..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-50 border-0 text-sm text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-primary/20 outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Members Grid */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="animate-spin h-10 w-10 text-primary" />
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="bg-cream rounded-2xl border border-gray-100 p-16 text-center">
            <User size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 font-semibold text-lg">No members found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMembers.map((member) => {
              const cfg = roleConfig[member.role] || roleConfig.staff
              const RoleIcon = cfg.icon
              const isEditing = editingId === member.id

              return (
                <div key={member.id} className="bg-white rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all">
                  <div className="p-5">
                    {/* Avatar + Name */}
                    <div className="flex items-start gap-3 mb-4">
                      <div className={`w-12 h-12 rounded-xl ${getAvatarColor(member.role)} flex items-center justify-center text-sm font-black shrink-0`}>
                        {getInitials(member.full_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.full_name}
                            onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                            className="w-full px-2 py-1 rounded-lg border border-gray-200 text-sm font-semibold text-gray-900 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                          />
                        ) : (
                          <h3 className="font-bold text-gray-900 text-sm truncate">{member.full_name || 'Unnamed'}</h3>
                        )}
                        {isEditing ? (
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                            className="w-full px-2 py-0.5 rounded-lg border border-gray-200 text-xs text-gray-500 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none mt-1"
                          />
                        ) : (
                          <p className="text-xs text-gray-400 truncate">{member.email}</p>
                        )}
                      </div>
                    </div>

                    {/* Role */}
                    <div className="mb-3">
                      {isEditing ? (
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(roleConfig).map(([key, rcfg]) => {
                            const RIcon = rcfg.icon
                            return (
                              <button
                                key={key}
                                onClick={() => setEditForm({ ...editForm, role: key })}
                                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                                  editForm.role === key ? `${rcfg.bg} text-white` : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                                }`}
                              >
                                <RIcon size={10} /> {rcfg.label}
                              </button>
                            )
                          })}
                        </div>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${cfg.light} ${cfg.text} ${cfg.border}`}>
                          <RoleIcon size={11} /> {cfg.label}
                        </span>
                      )}
                    </div>

                    {/* Phone */}
                    <div className="mb-3">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <Phone size={12} className="text-gray-400" />
                          <input
                            type="tel"
                            value={editForm.phone}
                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                            placeholder="Phone"
                            className="flex-1 px-2 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                          />
                        </div>
                      ) : member.phone ? (
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Phone size={12} className="text-gray-400" /> {member.phone}
                        </div>
                      ) : null}
                    </div>

                    {/* Hire Date */}
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Calendar size={12} className="text-gray-400" />
                      Hired {member.hire_date ? new Date(member.hire_date).toLocaleDateString('fr-FR') : 'Recently'}
                    </div>
                  </div>

                  {/* Actions */}
                  {isAdmin && (
                    <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-b-2xl">
                      {isEditing ? (
                        <>
                          <button onClick={cancelEdit} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200">
                            <X size={12} /> Cancel
                          </button>
                          <button onClick={() => saveMember(member.id)} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary-dark disabled:opacity-50">
                            <Check size={12} /> {saving ? 'Saving...' : 'Save'}
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setSelectedMember(member)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary font-medium">
                            <Activity size={12} /> Details
                          </button>
                          <div className="flex items-center gap-1">
                            <button onClick={() => startEdit(member)} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-primary hover:bg-primary/5" title="Edit">
                              <Edit3 size={14} />
                            </button>
                            <button onClick={() => setShowDeleteConfirm(member)} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50" title="Delete">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selectedMember && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedMember(null)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Member Details</h2>
              <button onClick={() => setSelectedMember(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl ${getAvatarColor(selectedMember.role)} flex items-center justify-center text-xl font-black`}>
                  {getInitials(selectedMember.full_name)}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{selectedMember.full_name || 'Unnamed'}</h3>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border mt-1 ${roleConfig[selectedMember.role]?.light} ${roleConfig[selectedMember.role]?.text} ${roleConfig[selectedMember.role]?.border}`}>
                    {(() => { const R = roleConfig[selectedMember.role]?.icon || Flower2; return <R size={11} /> })()}
                    {roleConfig[selectedMember.role]?.label}
                  </span>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Mail size={16} className="text-gray-400" />
                  <div><p className="text-[10px] font-bold text-gray-400 uppercase">Email</p><p className="text-sm text-gray-700">{selectedMember.email}</p></div>
                </div>
                {selectedMember.phone && (
                  <div className="flex items-center gap-3">
                    <Phone size={16} className="text-gray-400" />
                    <div><p className="text-[10px] font-bold text-gray-400 uppercase">Phone</p><p className="text-sm text-gray-700">{selectedMember.phone}</p></div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Calendar size={16} className="text-gray-400" />
                  <div><p className="text-[10px] font-bold text-gray-400 uppercase">Hired</p><p className="text-sm text-gray-700">{selectedMember.hire_date ? new Date(selectedMember.hire_date).toLocaleDateString('fr-FR') : 'Recently'}</p></div>
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Permissions</h4>
                <div className="space-y-2">
                  {(rolePermissions[selectedMember.role] || rolePermissions.staff).map((perm, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-gray-600"><Check size={14} className="text-emerald-500" /> {perm}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={24} className="text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Remove Member?</h2>
            <p className="text-sm text-gray-500 mb-6">Remove <span className="font-semibold">{showDeleteConfirm.full_name || showDeleteConfirm.email}</span>?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200">Cancel</button>
              <button onClick={() => handleDeleteMember(showDeleteConfirm.id)} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold text-sm hover:bg-red-600">Remove</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

export default Team