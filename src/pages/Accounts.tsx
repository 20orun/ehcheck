import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/store/AuthContext'
import { DOCTORS } from '@/types'
import type { Department } from '@/types'
import { ShieldCheck, Save, Loader2, UserCog, AlertCircle, CheckCircle2 } from 'lucide-react'

interface AuthUser {
  id: string
  email: string
}

interface UserRoleRow {
  user_id: string
  role: string
}

interface RowState {
  currentRole: string   // what's saved in DB
  selectedRole: string  // what's shown in dropdown
  saving: boolean
  saved: boolean
  error: string | null
}

function roleLabel(role: string, departments: Department[]): string {
  if (role === 'coordinator') return 'Coordinator'
  if (role.startsWith('department:')) {
    const deptId = role.slice('department:'.length)
    const dept = departments.find((d) => d.id === deptId)
    return dept ? `Dept – ${dept.name}` : role
  }
  if (role.startsWith('doctor:')) {
    const code = role.slice('doctor:'.length) as 'S' | 'A' | 'I'
    const doc = DOCTORS.find((d) => d.code === code)
    return doc ? `Doctor – ${doc.name}` : role
  }
  if (role === 'admin') return 'Admin'
  return role
}

export default function Accounts() {
  const { user: currentUser, isAdmin } = useAuth()
  const navigate = useNavigate()

  const [users, setUsers] = useState<AuthUser[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Guard: redirect non-admins
  useEffect(() => {
    if (!isAdmin) navigate('/', { replace: true })
  }, [isAdmin, navigate])

  useEffect(() => {
    if (!isAdmin) return
    async function load() {
      setLoading(true)
      setFetchError(null)

      const [usersRes, rolesRes, deptsRes] = await Promise.all([
        supabase.rpc('list_auth_users_for_admin'),
        supabase.from('user_roles').select('user_id, role'),
        supabase.from('departments').select('id, name, task_group, is_offline').order('name'),
      ])

      if (usersRes.error) {
        setFetchError(usersRes.error.message)
        setLoading(false)
        return
      }
      if (rolesRes.error) {
        setFetchError(rolesRes.error.message)
        setLoading(false)
        return
      }
      if (deptsRes.error) {
        setFetchError(deptsRes.error.message)
        setLoading(false)
        return
      }

      const authUsers: AuthUser[] = usersRes.data ?? []
      const roleMap: Record<string, string> = {}
      ;(rolesRes.data as UserRoleRow[]).forEach((r) => { roleMap[r.user_id] = r.role })
      setDepartments(deptsRes.data ?? [])
      setUsers(authUsers)

      const initialRows: Record<string, RowState> = {}
      authUsers.forEach((u) => {
        const role = roleMap[u.id] ?? 'coordinator'
        initialRows[u.id] = { currentRole: role, selectedRole: role, saving: false, saved: false, error: null }
      })
      setRows(initialRows)
      setLoading(false)
    }
    load()
  }, [isAdmin])

  function buildRoleOptions(depts: Department[]) {
    const options: { value: string; label: string }[] = [
      { value: 'coordinator', label: 'Coordinator' },
    ]
    depts.forEach((d) => {
      options.push({ value: `department:${d.id}`, label: `Dept – ${d.name}` })
    })
    DOCTORS.forEach((doc) => {
      options.push({ value: `doctor:${doc.code}`, label: `Doctor – ${doc.name}` })
    })
    return options
  }

  const roleOptions = buildRoleOptions(departments)

  function handleSelect(userId: string, value: string) {
    setRows((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], selectedRole: value, saved: false, error: null },
    }))
  }

  async function handleSave(userId: string) {
    const row = rows[userId]
    if (!row || row.selectedRole === row.currentRole) return

    setRows((prev) => ({ ...prev, [userId]: { ...prev[userId], saving: true, error: null, saved: false } }))

    // Check if a row already exists for this user
    const { data: existing } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('user_id', userId)
      .single()

    let error: string | null = null
    if (existing) {
      const res = await supabase
        .from('user_roles')
        .update({ role: row.selectedRole })
        .eq('user_id', userId)
        .eq('role', row.currentRole) // additional guard: only update if current role matches
      error = res.error?.message ?? null
    } else {
      const res = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: row.selectedRole })
      error = res.error?.message ?? null
    }

    setRows((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        saving: false,
        saved: !error,
        error: error ?? null,
        currentRole: error ? prev[userId].currentRole : row.selectedRole,
      },
    }))
  }

  if (!isAdmin) return null

  const nonAdminUsers = users.filter((u) => {
    const role = rows[u.id]?.currentRole
    return role !== 'admin' || u.id === currentUser?.id
  })
  // Show admin users (read-only) and non-admin users (editable)
  const adminUsers = users.filter((u) => rows[u.id]?.currentRole === 'admin')
  const editableUsers = users.filter((u) => rows[u.id]?.currentRole !== 'admin')

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
          <UserCog className="w-5 h-5 text-primary-700" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Accounts</h1>
          <p className="text-sm text-gray-500">Assign or change roles for non-admin users</p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
        </div>
      )}

      {fetchError && !loading && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {fetchError}
        </div>
      )}

      {!loading && !fetchError && (
        <div className="space-y-6">
          {/* Editable users */}
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">Users</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Select a role from the dropdown and click Save to apply. Admin accounts are read-only.
              </p>
            </div>

            {users.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">No users found.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-1/2">
                      Email
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {/* Admin rows — read-only */}
                  {adminUsers.map((u) => (
                    <tr key={u.id} className="bg-amber-50/40">
                      <td className="px-5 py-3 text-gray-700 font-medium">
                        {u.email}
                        {u.id === currentUser?.id && (
                          <span className="ml-2 text-xs text-primary-600 font-semibold">(you)</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-100 text-amber-800 text-xs font-semibold">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Admin
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="text-xs text-gray-400 italic">read-only</span>
                      </td>
                    </tr>
                  ))}

                  {/* Non-admin rows — editable */}
                  {editableUsers.map((u) => {
                    const row = rows[u.id]
                    if (!row) return null
                    const isDirty = row.selectedRole !== row.currentRole

                    return (
                      <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 text-gray-700">
                          {u.email}
                        </td>
                        <td className="px-5 py-3">
                          <select
                            value={row.selectedRole}
                            onChange={(e) => handleSelect(u.id, e.target.value)}
                            disabled={row.saving}
                            className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-60 w-full max-w-xs"
                          >
                            {roleOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {row.error && (
                              <span className="text-xs text-red-600 max-w-30 truncate" title={row.error}>
                                {row.error}
                              </span>
                            )}
                            {row.saved && !isDirty && (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            )}
                            <button
                              onClick={() => handleSave(u.id)}
                              disabled={!isDirty || row.saving}
                              className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              {row.saving ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Save className="w-3.5 h-3.5" />
                              )}
                              Save
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Info note */}
          <p className="text-xs text-gray-400 px-1">
            Role changes take effect on the user's next login or page refresh.
            Admin accounts cannot be modified from this panel — use the Supabase dashboard instead.
          </p>
        </div>
      )}
    </div>
  )
}
