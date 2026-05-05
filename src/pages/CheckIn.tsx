import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '@/store/AppContext'
import { LogIn, X, Check, Users, Pencil, Trash2, Save, ArrowUp, ArrowDown } from 'lucide-react'
import clsx from 'clsx'

function formatISTTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 5.5 * 3600000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

// Parse an IST display time "HH:MM" or "HH:MM:SS" or "HH:MM:SS.mmm" back into a UTC ISO string.
function parseISTTimeToISO(display: string, originalISO: string): string {
  const match = display.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/)
  if (!match) return originalISO
  const h = parseInt(match[1], 10)
  const min = parseInt(match[2], 10)
  const sec = match[3] ? parseInt(match[3], 10) : 0
  const ms = match[4] ? parseInt(match[4].padEnd(3, '0'), 10) : 0
  const orig = new Date(new Date(originalISO).getTime() + 5.5 * 3600000)
  const year = orig.getUTCFullYear()
  const month = orig.getUTCMonth()
  const day = orig.getUTCDate()
  const istMs = Date.UTC(year, month, day, h, min, sec, ms) - 5.5 * 3600000
  return new Date(istMs).toISOString()
}

const GROUP_COLORS = [
  { border: 'border-l-blue-400',    badge: 'bg-blue-100 text-blue-700' },
  { border: 'border-l-emerald-400', badge: 'bg-emerald-100 text-emerald-700' },
  { border: 'border-l-violet-400',  badge: 'bg-violet-100 text-violet-700' },
  { border: 'border-l-orange-400',  badge: 'bg-orange-100 text-orange-700' },
  { border: 'border-l-pink-400',    badge: 'bg-pink-100 text-pink-700' },
  { border: 'border-l-teal-400',    badge: 'bg-teal-100 text-teal-700' },
  { border: 'border-l-amber-400',   badge: 'bg-amber-100 text-amber-700' },
  { border: 'border-l-rose-400',    badge: 'bg-rose-100 text-rose-800' },
]

export default function CheckIn() {
  const { state, checkInNewPatient, assignGroup, updatePatientGroup, updatePatientInfo, updateCheckInTime, deletePatient } = useApp()

  const [name, setName] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sortAsc, setSortAsc] = useState(true)

  // Inline editing state — only one row at a time
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editTime, setEditTime] = useState('')

  // Confirm-delete state
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  // All checked-in patients for today, sorted ascending (stable serial numbers)
  const checkedInPatients = useMemo(() => {
    return state.patients
      .filter((p) => p.checked_in_at !== null)
      .sort((a, b) => new Date(a.checked_in_at!).getTime() - new Date(b.checked_in_at!).getTime())
  }, [state.patients])

  // Display order can be toggled; serial numbers are always based on ascending order
  const displayedPatients = useMemo(
    () => sortAsc ? checkedInPatients : [...checkedInPatients].reverse(),
    [checkedInPatients, sortAsc]
  )

  // Map groupId -> sequential label + color
  const groupMap = useMemo(() => {
    const map = new Map<string, { label: string; color: typeof GROUP_COLORS[number] }>()
    let idx = 0
    for (const p of checkedInPatients) {
      if (p.group_id && !map.has(p.group_id)) {
        map.set(p.group_id, {
          label: `Group ${idx + 1}`,
          color: GROUP_COLORS[idx % GROUP_COLORS.length],
        })
        idx++
      }
    }
    return map
  }, [checkedInPatients])

  // Derive group action from selection
  const selectedPatients = useMemo(
    () => checkedInPatients.filter((p) => selectedIds.has(p.id)),
    [checkedInPatients, selectedIds]
  )
  const anyHasGroup    = selectedPatients.some((p) => p.group_id)
  const anyHasNoGroup  = selectedPatients.some((p) => !p.group_id)
  const allSameGroup   = selectedPatients.length >= 2
    && selectedPatients.every((p) => p.group_id)
    && new Set(selectedPatients.map((p) => p.group_id)).size === 1

  const showAddGroup    = selectedIds.size >= 2 && !anyHasGroup
  const showRemoveGroup = selectedIds.size >= 2 && allSameGroup
  const showUpdateGroup = selectedIds.size >= 2 && anyHasGroup && anyHasNoGroup

  function handleCheckIn() {
    const trimmed = name.trim()
    if (!trimmed) return
    checkInNewPatient(trimmed)
    setName('')
  }

  function toggleSelect(id: string) {
    if (editingId) return // don't toggle while editing
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleAddAsGroup() {
    assignGroup(Array.from(selectedIds))
    setSelectedIds(new Set())
  }

  function handleUpdateGroup() {
    assignGroup(Array.from(selectedIds))
    setSelectedIds(new Set())
  }

  function handleRemoveGroup() {
    selectedPatients.forEach((p) => updatePatientGroup(p.id, null))
    setSelectedIds(new Set())
  }

  function handleRemoveFromGroup(patientId: string, e: React.MouseEvent) {
    e.stopPropagation()
    updatePatientGroup(patientId, null)
  }

  function startEdit(patient: { id: string; name: string; checked_in_at: string | null }, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingId(patient.id)
    setEditName(patient.name)
    if (patient.checked_in_at) {
      // Pre-fill with full precision: HH:MM:SS.mmm in IST
      const d = new Date(new Date(patient.checked_in_at).getTime() + 5.5 * 3600000)
      const hh = String(d.getUTCHours()).padStart(2, '0')
      const mm = String(d.getUTCMinutes()).padStart(2, '0')
      const ss = String(d.getUTCSeconds()).padStart(2, '0')
      const ms = String(d.getUTCMilliseconds()).padStart(3, '0')
      setEditTime(`${hh}:${mm}:${ss}.${ms}`)
    } else {
      setEditTime('')
    }
    setSelectedIds(new Set([patient.id]))
  }

  function saveEdit(patient: { id: string; uhid: string; phone: string | null; checked_in_at: string | null }, e: React.MouseEvent) {
    e.stopPropagation()
    const trimmedName = editName.trim()
    if (trimmedName) {
      updatePatientInfo(patient.id, trimmedName, patient.uhid, patient.phone)
    }
    if (patient.checked_in_at && editTime.trim()) {
      const newISO = parseISTTimeToISO(editTime.trim(), patient.checked_in_at)
      if (newISO !== patient.checked_in_at) {
        updateCheckInTime(patient.id, newISO)
      }
    }
    setEditingId(null)
    setSelectedIds(new Set())
  }

  function cancelEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setEditingId(null)
  }

  function handleDelete(patientId: string, e: React.MouseEvent) {
    e.stopPropagation()
    setPendingDeleteId(patientId)
  }

  function confirmDelete() {
    if (!pendingDeleteId) return
    deletePatient(pendingDeleteId)
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(pendingDeleteId); return next })
    setPendingDeleteId(null)
  }

  // Name to show in confirm dialog
  const pendingDeleteName = pendingDeleteId
    ? (state.patients.find((p) => p.id === pendingDeleteId)?.name ?? 'this patient')
    : ''

  return (
    <div className="p-3 sm:p-6 max-w-4xl mx-auto space-y-6 sm:space-y-8">
      {/* Confirm Delete Modal */}
      {pendingDeleteId && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setPendingDeleteId(null)}
        >
          <div
            className="w-full sm:max-w-sm bg-white rounded-2xl shadow-xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Remove patient?</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  <span className="font-medium text-gray-700">{pendingDeleteName}</span> will be permanently removed from the check-in list.
                </p>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setPendingDeleteId(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Check In</h1>
        <p className="text-sm text-gray-500 mt-1">
          {checkedInPatients.length} patient{checkedInPatients.length !== 1 ? 's' : ''} checked in today
        </p>
      </div>

      {/* Quick Check-In Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">New Check-In</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCheckIn() }}
            placeholder="Enter patient name"
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <button
            onClick={handleCheckIn}
            disabled={!name.trim()}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Check In
          </button>
        </div>
      </div>

      {/* Checked-In Patients */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            Checked-In Patients
            {checkedInPatients.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500 font-normal">
                {checkedInPatients.length}
              </span>
            )}
          </h2>
          {selectedIds.size > 0 && (
            <button
              onClick={() => { setSelectedIds(new Set()); setEditingId(null) }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Clear selection
            </button>
          )}
        </div>

        {checkedInPatients.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            No patients checked in yet today
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {/* Column header */}
            <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 bg-gray-50 border-b border-gray-100 select-none">
              <div className="w-4 shrink-0" />
              <span className="w-5 shrink-0" />
              <span className="flex-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</span>
              <button
                onClick={() => setSortAsc((v) => !v)}
                className="flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors w-10 justify-end"
              >
                Time
                {sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
              </button>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider hidden sm:block w-36 text-right">Package</span>
              <div className="w-14 shrink-0" />
            </div>

            {displayedPatients.map((patient) => {
              // Serial number is always position in ascending order
              const serial = checkedInPatients.indexOf(patient) + 1
              const groupInfo = patient.group_id ? groupMap.get(patient.group_id) : null
              const pkg = state.packages.find((p) => p.id === patient.package_id)
              const isSelected = selectedIds.has(patient.id)
              const isEditing = editingId === patient.id

              // Is this the first selected patient in list order?
              const isFirstSelected = isSelected && checkedInPatients.find((p) => selectedIds.has(p.id))?.id === patient.id

              return (
                <div
                  key={patient.id}
                  onClick={() => toggleSelect(patient.id)}
                  className={clsx(
                    'flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 sm:py-3 transition-colors border-l-4',
                    !isEditing && 'cursor-pointer select-none',
                    isSelected ? 'bg-primary-50' : 'hover:bg-gray-50',
                    groupInfo ? groupInfo.color.border : 'border-l-transparent'
                  )}
                >
                  {/* Checkbox */}
                  <div
                    className={clsx(
                      'w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors',
                      isSelected ? 'bg-primary-600 border-primary-600' : 'border-gray-300 bg-white'
                    )}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                  </div>

                  {/* Serial — stable, always ascending order */}
                  <span className="w-5 text-xs text-gray-400 font-mono shrink-0 text-right">{serial}</span>

                  {/* Group buttons — shown left of name, only on the first selected row */}
                  {isFirstSelected && selectedIds.size >= 2 && (
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {showAddGroup && (
                        <button
                          onClick={handleAddAsGroup}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-primary-600 text-white text-xs font-medium hover:bg-primary-700 transition-colors whitespace-nowrap"
                          title="Add as Group"
                        >
                          <Users className="w-3 h-3" />
                          <span className="hidden sm:inline">Add as Group</span>
                        </button>
                      )}
                      {showUpdateGroup && (
                        <button
                          onClick={handleUpdateGroup}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 transition-colors whitespace-nowrap"
                          title="Update Group"
                        >
                          <Users className="w-3 h-3" />
                          <span className="hidden sm:inline">Update Group</span>
                        </button>
                      )}
                      {showRemoveGroup && (
                        <button
                          onClick={handleRemoveGroup}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors whitespace-nowrap"
                          title="Remove Group"
                        >
                          <Users className="w-3 h-3" />
                          <span className="hidden sm:inline">Remove Group</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Name — editable or link */}
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => { if (e.key === 'Escape') cancelEdit(e as unknown as React.MouseEvent) }}
                      className="flex-1 min-w-0 w-0 px-2 py-0.5 text-sm border border-primary-400 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 bg-white"
                    />
                  ) : (
                    <Link
                      to={`/patient/${patient.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 min-w-0 font-medium text-sm text-primary-700 hover:underline truncate"
                    >
                      {patient.name}
                    </Link>
                  )}

                  {/* Check-in time — editable or display */}
                  {isEditing ? (
                    <input
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="HH:MM:SS.mmm"
                      className="w-24 sm:w-36 shrink-0 px-2 py-0.5 text-xs border border-primary-400 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 bg-white tabular-nums"
                    />
                  ) : (
                    <span className="text-xs text-gray-500 shrink-0 tabular-nums w-10 text-right">
                      {formatISTTime(patient.checked_in_at!)}
                    </span>
                  )}

                  {/* Package */}
                  <span className="text-xs text-gray-400 shrink-0 hidden sm:block w-36 truncate text-right">
                    {pkg ? pkg.name : '-'}
                  </span>


                  {/* Row action buttons — edit / save / delete, only on selected (single) or editing row */}
                  <div className="shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {isEditing ? (
                      <>
                        <button
                          onClick={(e) => saveEdit(patient, e)}
                          title="Save"
                          className="p-1.5 rounded text-green-600 hover:bg-green-50 transition-colors"
                        >
                          <Save className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={cancelEdit}
                          title="Cancel"
                          className="p-1.5 rounded text-gray-400 hover:bg-gray-100 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : isSelected ? (
                      <>
                        {groupInfo && (
                          <button
                            onClick={(e) => handleRemoveFromGroup(patient.id, e)}
                            title="Remove from group"
                            className="p-1.5 rounded text-gray-300 hover:text-orange-500 hover:bg-orange-50 transition-colors"
                          >
                            <Users className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={(e) => startEdit(patient, e)}
                          title="Edit"
                          className="p-1.5 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDelete(patient.id, e)}
                          title="Delete"
                          className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      // Spacer so columns stay aligned
                      <div className="w-14" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
