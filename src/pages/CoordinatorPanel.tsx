import { useApp } from '@/store/AppContext'
import { StatusBadge, PriorityBadge } from '@/components/ui'
import {
  Play,
  CheckCircle2,
  SkipForward,
  ChevronRight,
  Crown,
  Star,
  Zap,
  LogIn,
  LogOut,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState, useMemo } from 'react'
import type { TaskGroup } from '@/types'
import { DOCTORS } from '@/types'
import clsx from 'clsx'
import { isPatientComplete, getTaskGroupStatuses, getAvailableTasks } from '@/lib/taskEngine'

const GROUP_LABELS: Record<TaskGroup, string> = {
  BILLING: 'Billing',
  CHECK_IN: 'Check In',
  NURSING: 'Nursing',
  PHLEB: 'Phleb',
  USG: 'USG',
  BREAKFAST: 'Breakfast',
  PPBS: 'Phleb',
  XRAY: 'X-Ray',
  MAMMO: 'Mammography',
  BMD: 'BMD',
  ECG: 'ECG',
  ECHO: 'Echo',
  TMT: 'TMT',
  PFT: 'PFT',
  LUNCH: 'Lunch',
  DIET: 'Dietician',
  GYNECOLOGY: 'Gynecology',
  CONSULT: 'Physician Consultation',
  REVIEW: 'Final Review',
}

const PACKAGE_COLORS: Record<string, { border: string; bg: string; badge: string }> = {
  'Silver Health Check':   { border: 'border-gray-300',    bg: 'bg-gray-50',     badge: 'bg-gray-200 text-gray-700' },
  'Gold Health Check':     { border: 'border-amber-300',   bg: 'bg-amber-50',    badge: 'bg-amber-100 text-amber-800' },
  'Platinum Health Check': { border: 'border-violet-300',  bg: 'bg-violet-50',   badge: 'bg-violet-200 text-violet-800' },
  'Diamond Health Check':  { border: 'border-cyan-300',    bg: 'bg-cyan-50',     badge: 'bg-cyan-100 text-cyan-800' },
  'Femina Essentialis Check': { border: 'border-pink-300', bg: 'bg-pink-50',     badge: 'bg-pink-100 text-pink-800' },
  'Cardiac Health Check':  { border: 'border-rose-400',    bg: 'bg-rose-50',     badge: 'bg-rose-200 text-rose-900' },
  'Child Health Check':    { border: 'border-emerald-300', bg: 'bg-emerald-50',  badge: 'bg-emerald-100 text-emerald-700' },
}

const DEFAULT_PKG_COLOR = { border: 'border-gray-200', bg: 'bg-white', badge: 'bg-gray-100 text-gray-600' }

export default function CoordinatorPanel() {
  const {
    getPatientsWithTasks,
    startTask,
    completeTask,
    skipTask,
    deletePatient,
    setPriority,
    advancePatient,
    getNextTask,
    checkInPatient,
    checkInGroup,
    undoCheckIn,
    updatePatientPackage,
    updatePatientInfo,
    state,
  } = useApp()

  const patients = getPatientsWithTasks()
  const [filter, setFilter] = useState<string>('ALL')
  const [sortBy, setSortBy] = useState<string>('checkIn')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Billing flow state
  const [billingModal, setBillingModal] = useState<{ patientId: string } | null>(null)
  const [billingPkgSearch, setBillingPkgSearch] = useState('')
  const [billingSelectedPkgId, setBillingSelectedPkgId] = useState<string | null>(null)
  const [showPatientInfoEdit, setShowPatientInfoEdit] = useState(false)
  const [editNameInput, setEditNameInput] = useState('')
  const [editUhidInput, setEditUhidInput] = useState('')
  const [editPhoneInput, setEditPhoneInput] = useState('')

  const filteredBillingPackages = useMemo(() => {
    if (!billingPkgSearch.trim()) return state.packages
    const q = billingPkgSearch.toLowerCase()
    return state.packages.filter((p) => p.name.toLowerCase().includes(q))
  }, [billingPkgSearch, state.packages])

  function closeBillingModal() {
    setBillingModal(null)
    setBillingPkgSearch('')
    setBillingSelectedPkgId(null)
    setShowPatientInfoEdit(false)
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    const visibleIds = sortedPatients.map((p) => p.id)
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        visibleIds.forEach((id) => next.delete(id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        visibleIds.forEach((id) => next.add(id))
        return next
      })
    }
  }

  function handleBulkDelete() {
    const count = selectedIds.size
    if (count === 0) return
    if (!confirm(`Are you sure you want to delete ${count} patient${count !== 1 ? 's' : ''}? This cannot be undone.`)) return
    selectedIds.forEach((id) => deletePatient(id))
    setSelectedIds(new Set())
  }

  function handleCheckInTogether() {
    // Only check in patients who haven't been checked in yet
    const toCheckIn = sortedPatients
      .filter((p) => selectedIds.has(p.id) && !p.checked_in_at)
      .map((p) => p.id)
    if (toCheckIn.length < 2) return
    checkInGroup(toCheckIn)
    setSelectedIds(new Set())
  }

  // Derive unique package names for filter tabs
  const packageNames = Array.from(new Set(patients.map((p) => p.package_name).filter(Boolean))) as string[]

  // Filter
  const filteredPatients = patients.filter((p) => {
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (filter === 'ALL') return true
    if (filter === 'VIP') return p.priority === 'VIP'
    if (filter === 'NORMAL') return p.priority === 'NORMAL'
    if (filter === 'NOT_CHECKED_IN') return !p.checked_in_at
    if (filter === 'IN_PROGRESS') return !!p.checked_in_at && !isPatientComplete(p.tasks)
    if (filter === 'COMPLETED') return isPatientComplete(p.tasks)
    if (filter === 'DELAYED') return p.tasks.some((t) => t.status === 'DELAYED')
    return p.package_name === filter
  })

  // Sort — stable: tiebreak by name so cards don't jump when task status changes
  const sortedPatients = [...filteredPatients].sort((a, b) => {
    if (sortBy === 'alpha') return a.name.localeCompare(b.name)
    if (sortBy === 'package') {
      const cmp = (a.package_name || '').localeCompare(b.package_name || '')
      return cmp !== 0 ? cmp : a.name.localeCompare(b.name)
    }
    if (sortBy === 'waitTime') {
      // Longest wait first; not-checked-in patients go to the bottom
      const aTime = a.checked_in_at ? new Date(a.checked_in_at).getTime() : Infinity
      const bTime = b.checked_in_at ? new Date(b.checked_in_at).getTime() : Infinity
      return aTime - bTime || a.name.localeCompare(b.name)
    }
    if (sortBy === 'priority') {
      if (a.priority !== b.priority) return a.priority === 'VIP' ? -1 : 1
      return a.name.localeCompare(b.name)
    }
    // Default (checkIn): checked-in first sorted by earliest check-in, then alpha for not-checked-in
    const aTime = a.checked_in_at ? new Date(a.checked_in_at).getTime() : null
    const bTime = b.checked_in_at ? new Date(b.checked_in_at).getTime() : null
    if (aTime !== null && bTime !== null) return aTime - bTime
    if (aTime !== null) return -1
    if (bTime !== null) return 1
    return a.name.localeCompare(b.name)
  })

  // Count helpers for filter tabs
  const filterCounts: Record<string, number> = {
    ALL: patients.length,
    VIP: patients.filter((p) => p.priority === 'VIP').length,
    NORMAL: patients.filter((p) => p.priority === 'NORMAL').length,
    NOT_CHECKED_IN: patients.filter((p) => !p.checked_in_at).length,
    IN_PROGRESS: patients.filter((p) => !!p.checked_in_at && !isPatientComplete(p.tasks)).length,
    COMPLETED: patients.filter((p) => isPatientComplete(p.tasks)).length,
    DELAYED: patients.filter((p) => p.tasks.some((t) => t.status === 'DELAYED')).length,
  }
  packageNames.forEach((name) => {
    filterCounts[name] = patients.filter((p) => p.package_name === name).length
  })

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Manage patient workflows. Start, complete, skip tasks, change priority, or advance patients.
      </p>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search patients by name…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full sm:w-72 pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key: 'ALL', label: 'All' },
          { key: 'VIP', label: 'VIP Only' },
          { key: 'NORMAL', label: 'Normal Only' },
          { key: 'NOT_CHECKED_IN', label: 'Not Checked In' },
          { key: 'IN_PROGRESS', label: 'In Progress' },
          { key: 'COMPLETED', label: 'Completed' },
          { key: 'DELAYED', label: 'Delayed' },
          ...packageNames.map((name) => ({ key: name, label: name.replace(' Health Check', '').replace(' Check', '') })),
        ].map((tab) => {
          const pkgColor = PACKAGE_COLORS[tab.key]
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                filter === tab.key
                  ? pkgColor ? `${pkgColor.badge} ring-2 ring-offset-1 ring-current` : 'bg-primary-600 text-white'
                  : pkgColor ? `${pkgColor.badge} opacity-70 hover:opacity-100` : 'bg-white text-gray-600 border border-gray-300 hover:border-primary-300'
              }`}
            >
              {tab.label} ({filterCounts[tab.key] ?? 0})
            </button>
          )
        })}
      </div>

      {/* Sort options */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>Sort by:</span>
        {[
          { key: 'checkIn', label: 'Check-In Time' },
          { key: 'priority', label: 'Priority' },
          { key: 'alpha', label: 'A–Z' },
          { key: 'package', label: 'Package' },
          { key: 'waitTime', label: 'Wait Time' },
        ].map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSortBy(opt.key)}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              sortBy === opt.key
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Bulk selection bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 flex-wrap">
          <span className="text-sm font-medium text-gray-700">
            {selectedIds.size} patient{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          {/* Check In Together – only when 2+ not-yet-checked-in patients are selected */}
          {sortedPatients.filter((p) => selectedIds.has(p.id) && !p.checked_in_at).length >= 2 && (
            <button
              onClick={handleCheckInTogether}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors"
            >
              <Users className="w-3.5 h-3.5" /> Check In Together
            </button>
          )}
          <button
            onClick={handleBulkDelete}
            className="inline-flex items-center gap-1.5 ml-auto px-4 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete Selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      <div className="space-y-4">
        {/* Select all toggle */}
        {sortedPatients.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sortedPatients.length > 0 && sortedPatients.every((p) => selectedIds.has(p.id))}
              onChange={toggleSelectAll}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            Select all ({sortedPatients.length})
          </label>
        )}

        {/* Build render units: solo patients or grouped patients */}
        {(() => {
          const GROUP_PALETTE = [
            { border: 'border-teal-400', bg: 'bg-teal-50/40', label: 'text-teal-700', header: 'bg-teal-50' },
            { border: 'border-indigo-400', bg: 'bg-indigo-50/40', label: 'text-indigo-700', header: 'bg-indigo-50' },
            { border: 'border-orange-400', bg: 'bg-orange-50/40', label: 'text-orange-700', header: 'bg-orange-50' },
            { border: 'border-purple-400', bg: 'bg-purple-50/40', label: 'text-purple-700', header: 'bg-purple-50' },
            { border: 'border-cyan-400', bg: 'bg-cyan-50/40', label: 'text-cyan-700', header: 'bg-cyan-50' },
          ]

          // Assign a stable palette index to each group_id (based on order first seen)
          const allGroupIds = [...new Set(sortedPatients.filter((p) => p.group_id).map((p) => p.group_id as string))]
          const groupPaletteMap = Object.fromEntries(allGroupIds.map((gid, i) => [gid, GROUP_PALETTE[i % GROUP_PALETTE.length]]))

          // Build ordered render units
          type RenderUnit = { type: 'solo'; patient: typeof sortedPatients[0] } | { type: 'group'; groupId: string; patients: typeof sortedPatients }
          const units: RenderUnit[] = []
          const seenGroups = new Set<string>()
          sortedPatients.forEach((p) => {
            if (!p.group_id) {
              units.push({ type: 'solo', patient: p })
            } else if (!seenGroups.has(p.group_id)) {
              seenGroups.add(p.group_id)
              units.push({ type: 'group', groupId: p.group_id, patients: sortedPatients.filter((sp) => sp.group_id === p.group_id) })
            }
          })

          const renderCard = (patient: typeof sortedPatients[0]) => {
            const activeTasks = patient.tasks.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'DELAYED')
            const available = getAvailableTasks(patient.tasks, !!patient.checked_in_at)
            const allDone = isPatientComplete(patient.tasks)
            const completedCount = patient.tasks.filter((s) => s.status === 'COMPLETED').length
            const progressPct = Math.round((completedCount / patient.tasks.length) * 100)
            const groupStatuses = getTaskGroupStatuses(patient.tasks)
            const nextTask = getNextTask(patient.id)
            const pkgColor = PACKAGE_COLORS[patient.package_name || ''] || DEFAULT_PKG_COLOR

            return (
              <div key={patient.id} className={`rounded-lg border ${pkgColor.border} ${pkgColor.bg} overflow-hidden`}>
                {/* Patient header */}
                <div className="px-4 py-3 flex items-center gap-3 border-b border-gray-100/60">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(patient.id)}
                    onChange={() => toggleSelect(patient.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 shrink-0"
                  />
                  <Link to={`/patient/${patient.id}`} className="font-semibold text-gray-900 hover:text-primary-600 transition-colors">
                    {patient.name}
                  </Link>
                  {patient.checked_in_at && (
                    <span className="text-[10px] text-gray-400 font-mono">
                      &#x2713; {new Date(patient.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </span>
                  )}
                  {patient.package_name && (
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${pkgColor.badge}`}>{patient.package_name}</span>
                  )}
                  <PriorityBadge priority={patient.priority} />
                  <span className="text-xs text-gray-400 ml-auto">{completedCount}/{patient.tasks.length} tasks</span>
                  <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-500 rounded-full" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>

                {/* Active tasks & next task suggestion */}
                <div className="px-4 py-3 space-y-2">
                  {!patient.checked_in_at ? (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-500">Not checked in yet</span>
                      <button
                        onClick={() => checkInPatient(patient.id)}
                        className="inline-flex items-center gap-1 px-4 py-1.5 text-xs font-medium rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors ml-auto"
                      >
                        <LogIn className="w-3.5 h-3.5" /> Check In
                      </button>
                    </div>
                  ) : allDone ? (
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-green-600 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> All tasks completed
                      </p>
                      <button
                        onClick={() => undoCheckIn(patient.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors ml-auto"
                      >
                        <LogOut className="w-3.5 h-3.5" /> Reset
                      </button>
                    </div>
                  ) : (
                    <>
                      {activeTasks.length > 0 && (
                        <div className="space-y-1.5">
                          {activeTasks.map((task) => (
                            <div key={task.id} className="flex items-center gap-3 flex-wrap">
                              <span className="text-sm text-gray-700">Active: <strong>{task.step_name}</strong></span>
                              <StatusBadge status={task.status} />
                              <div className="flex items-center gap-1 ml-auto">
                                <button
                                  onClick={() => {
                                    if (task.step_name === 'Billing') {
                                      setBillingModal({ patientId: patient.id })
                                    } else {
                                      completeTask(task.id)
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Complete
                                </button>
                                <button onClick={() => skipTask(task.id)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                                  <SkipForward className="w-3.5 h-3.5" /> Skip
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {nextTask && (
                        <div className="flex items-center gap-3 flex-wrap bg-primary-50 rounded-lg px-3 py-2">
                          <Zap className="w-4 h-4 text-primary-600" />
                          <span className="text-sm text-primary-800">Suggested: <strong>{nextTask.step_name}</strong></span>
                          <div className="flex items-center gap-1 ml-auto">
                            <button onClick={() => startTask(nextTask.id)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors">
                              <Play className="w-3.5 h-3.5" /> Start
                            </button>
                          </div>
                        </div>
                      )}
                      {available.filter((t) => t.id !== nextTask?.id).length > 0 && (
                        <div className="text-xs text-gray-500">
                          Other available:{' '}
                          {available.filter((t) => t.id !== nextTask?.id).map((t) => t.step_name).join(', ')}
                        </div>
                      )}
                      <div className="flex items-center gap-1 pt-1">
                        <button onClick={() => advancePatient(patient.id)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors">
                          <ChevronRight className="w-3.5 h-3.5" /> Advance
                        </button>
                        {patient.priority === 'NORMAL' && (
                          <button onClick={() => setPriority(patient.id, 'VIP')} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors">
                            <Crown className="w-3.5 h-3.5" /> VIP
                          </button>
                        )}
                        {patient.priority === 'VIP' && (
                          <button onClick={() => setPriority(patient.id, 'NORMAL')} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                            <Star className="w-3.5 h-3.5" /> Normal
                          </button>
                        )}
                        <button onClick={() => undoCheckIn(patient.id)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                          <LogOut className="w-3.5 h-3.5" /> Undo Check In
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Group status pills row */}
                <div className="px-4 pb-3 flex gap-1.5 flex-wrap">
                  {groupStatuses.map((gs) => (
                    <span
                      key={gs.group}
                      className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded-full ${
                        gs.status === 'COMPLETED' ? 'bg-green-100 text-green-700'
                          : gs.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700'
                          : gs.status === 'DELAYED' ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                      title={`${GROUP_LABELS[gs.group]}: ${gs.completed}/${gs.total}`}
                    >
                      {GROUP_LABELS[gs.group]} {gs.completed}/{gs.total}
                    </span>
                  ))}
                </div>
              </div>
            )
          }

          return units.map((unit) => {
            if (unit.type === 'solo') return renderCard(unit.patient)
            const palette = groupPaletteMap[unit.groupId]
            return (
              <div key={`group-${unit.groupId}`} className={`rounded-xl border-2 ${palette.border} ${palette.bg} p-2 space-y-2`}>
                <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${palette.header}`}>
                  <Users className={`w-4 h-4 ${palette.label}`} />
                  <span className={`text-xs font-semibold ${palette.label}`}>Checked In Together · {unit.patients.length} patients</span>
                </div>
                {unit.patients.map((p) => renderCard(p))}
              </div>
            )
          })
        })()}
      </div>

      {/* Package Selection Modal for Billing */}
      {billingModal && !billingSelectedPkgId && !showPatientInfoEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">Select Package</h3>
              <button onClick={closeBillingModal} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 pt-4 pb-2 shrink-0">
              <input
                type="text"
                value={billingPkgSearch}
                onChange={(e) => setBillingPkgSearch(e.target.value)}
                placeholder="Search packages..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                autoFocus
              />
            </div>
            <div className="p-5 pt-2 overflow-y-auto grid grid-cols-1 gap-2">
              {filteredBillingPackages.map((pkg) => {
                const colors = PACKAGE_COLORS[pkg.name] || DEFAULT_PKG_COLOR
                const currentPatient = patients.find((p) => p.id === billingModal.patientId)
                const isCurrent = pkg.id === currentPatient?.package_id
                return (
                  <button
                    key={pkg.id}
                    onClick={() => {
                      setBillingSelectedPkgId(pkg.id)
                      setBillingPkgSearch('')
                    }}
                    className={clsx(
                      'w-full text-left px-4 py-3 rounded-xl border-2 transition-all flex items-center justify-between',
                      colors.border, colors.bg,
                      'hover:shadow-md hover:scale-[1.01] active:scale-100'
                    )}
                  >
                    <span className="text-sm font-semibold text-gray-800">{pkg.name}</span>
                    {isCurrent && (
                      <span className={clsx('text-xs font-medium px-2.5 py-1 rounded-full', colors.badge)}>Current</span>
                    )}
                  </button>
                )
              })}
              {filteredBillingPackages.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No packages found</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Doctor Selection Modal (step 2 of billing) */}
      {billingModal && billingSelectedPkgId && !showPatientInfoEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">Assign Doctor</h3>
              <button onClick={closeBillingModal} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 grid grid-cols-1 gap-3">
              {DOCTORS.map((doc) => (
                <button
                  key={doc.code}
                  onClick={() => {
                    updatePatientPackage(billingModal.patientId, billingSelectedPkgId, doc.code)
                    const currentPatient = patients.find((p) => p.id === billingModal.patientId)
                    setEditNameInput(currentPatient?.name ?? '')
                    setEditUhidInput(currentPatient?.uhid ?? '')
                    setEditPhoneInput(currentPatient?.phone ?? '')
                    setBillingSelectedPkgId(null)
                    setShowPatientInfoEdit(true)
                  }}
                  className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 bg-gray-50 hover:border-primary-400 hover:bg-primary-50 hover:shadow-md transition-all flex items-center gap-3"
                >
                  <span className="flex items-center justify-center w-10 h-10 rounded-full bg-primary-100 text-primary-700 font-bold text-lg">
                    {doc.code}
                  </span>
                  <span className="text-sm font-semibold text-gray-800">{doc.name}</span>
                </button>
              ))}
              <button
                onClick={() => setBillingSelectedPkgId(null)}
                className="mt-1 text-sm text-gray-500 hover:text-gray-700 underline text-center"
                type="button"
              >
                Back to package selection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Patient Info Edit Modal (step 3 of billing) */}
      {billingModal && showPatientInfoEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Update Patient Info</h3>
              <button onClick={closeBillingModal} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Patient Name</label>
                <input
                  type="text"
                  value={editNameInput}
                  onChange={(e) => setEditNameInput(e.target.value)}
                  placeholder="Patient name"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">UHID (optional)</label>
                <input
                  type="text"
                  value={editUhidInput}
                  onChange={(e) => setEditUhidInput(e.target.value)}
                  placeholder="UHID"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mobile (optional)</label>
                <input
                  type="tel"
                  value={editPhoneInput}
                  onChange={(e) => setEditPhoneInput(e.target.value)}
                  placeholder="Mobile number"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => {
                    if (editNameInput.trim()) {
                      updatePatientInfo(billingModal.patientId, editNameInput.trim(), editUhidInput.trim(), editPhoneInput.trim() || null)
                    }
                    closeBillingModal()
                  }}
                  className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={closeBillingModal}
                  className="flex-1 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Skip
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
