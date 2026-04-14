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
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import type { TaskGroup } from '@/types'
import { isPatientComplete, getTaskGroupStatuses, getAvailableTasks } from '@/lib/taskEngine'

const GROUP_LABELS: Record<TaskGroup, string> = {
  BILLING: 'Billing',
  CHECK_IN: 'Check In',
  NURSING: 'Nursing',
  LAB: 'Lab',
  IMAGING: 'Imaging',
  CARDIAC: 'Cardiac',
  PULMONARY: 'Pulmonary',
  CONSULT: 'Consult',
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
    undoCheckIn,
  } = useApp()

  const patients = getPatientsWithTasks()
  const [filter, setFilter] = useState<string>('ALL')
  const [sortBy, setSortBy] = useState<string>('priority')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

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
      return b.waitingMinutes - a.waitingMinutes || a.name.localeCompare(b.name)
    }
    // Default: priority (VIP first), then alphabetical
    if (a.priority !== b.priority) return a.priority === 'VIP' ? -1 : 1
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
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          <span className="text-sm font-medium text-red-800">
            {selectedIds.size} patient{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={handleBulkDelete}
            className="inline-flex items-center gap-1.5 ml-auto px-4 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete Selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-300 text-red-700 hover:bg-red-100 transition-colors"
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
        {sortedPatients.map((patient) => {
          const activeTasks = patient.tasks.filter(
            (t) => t.status === 'IN_PROGRESS' || t.status === 'DELAYED'
          )
          const available = getAvailableTasks(patient.tasks, !!patient.checked_in_at)
          const allDone = isPatientComplete(patient.tasks)
          const completedCount = patient.tasks.filter((s) => s.status === 'COMPLETED').length
          const progressPct = Math.round((completedCount / patient.tasks.length) * 100)
          const groupStatuses = getTaskGroupStatuses(patient.tasks)
          const nextTask = getNextTask(patient.id)
          const pkgColor = PACKAGE_COLORS[patient.package_name || ''] || DEFAULT_PKG_COLOR

          return (
            <div
              key={patient.id}
              className={`rounded-lg border ${pkgColor.border} ${pkgColor.bg} overflow-hidden`}
            >
              {/* Patient header */}
              <div className="px-4 py-3 flex items-center gap-3 border-b border-gray-100/60">
                <input
                  type="checkbox"
                  checked={selectedIds.has(patient.id)}
                  onChange={() => toggleSelect(patient.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 shrink-0"
                />
                <Link
                  to={`/patient/${patient.id}`}
                  className="font-semibold text-gray-900 hover:text-primary-600 transition-colors"
                >
                  {patient.name}
                </Link>
                {patient.package_name && (
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${pkgColor.badge}`}>{patient.package_name}</span>
                )}
                <PriorityBadge priority={patient.priority} />
                <span className="text-xs text-gray-400 ml-auto">
                  {completedCount}/{patient.tasks.length} tasks
                </span>

                {/* Progress mini-bar */}
                <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full"
                    style={{ width: `${progressPct}%` }}
                  />
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
                    {/* Active tasks */}
                    {activeTasks.length > 0 && (
                      <div className="space-y-1.5">
                        {activeTasks.map((task) => (
                          <div key={task.id} className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm text-gray-700">
                              Active: <strong>{task.step_name}</strong>
                            </span>
                            <StatusBadge status={task.status} />
                            <div className="flex items-center gap-1 ml-auto">
                              <button
                                onClick={() => completeTask(task.id)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Complete
                              </button>
                              <button
                                onClick={() => skipTask(task.id)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                              >
                                <SkipForward className="w-3.5 h-3.5" /> Skip
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Next best task suggestion */}
                    {nextTask && (
                      <div className="flex items-center gap-3 flex-wrap bg-primary-50 rounded-lg px-3 py-2">
                        <Zap className="w-4 h-4 text-primary-600" />
                        <span className="text-sm text-primary-800">
                          Suggested: <strong>{nextTask.step_name}</strong>
                        </span>
                        <div className="flex items-center gap-1 ml-auto">
                          <button
                            onClick={() => startTask(nextTask.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                          >
                            <Play className="w-3.5 h-3.5" /> Start
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Available tasks to start */}
                    {available.filter((t) => t.id !== nextTask?.id).length > 0 && (
                      <div className="text-xs text-gray-500">
                        Other available:{' '}
                        {available
                          .filter((t) => t.id !== nextTask?.id)
                          .map((t) => t.step_name)
                          .join(', ')}
                      </div>
                    )}

                    {/* Advance button */}
                    <div className="flex items-center gap-1 pt-1">
                      <button
                        onClick={() => advancePatient(patient.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
                      >
                        <ChevronRight className="w-3.5 h-3.5" /> Advance
                      </button>

                      {patient.priority === 'NORMAL' && (
                        <button
                          onClick={() => setPriority(patient.id, 'VIP')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                        >
                          <Crown className="w-3.5 h-3.5" /> VIP
                        </button>
                      )}
                      {patient.priority === 'VIP' && (
                        <button
                          onClick={() => setPriority(patient.id, 'NORMAL')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                        >
                          <Star className="w-3.5 h-3.5" /> Normal
                        </button>
                      )}

                      <button
                        onClick={() => undoCheckIn(patient.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                      >
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
                      gs.status === 'COMPLETED'
                        ? 'bg-green-100 text-green-700'
                        : gs.status === 'IN_PROGRESS'
                          ? 'bg-blue-100 text-blue-700'
                          : gs.status === 'DELAYED'
                            ? 'bg-red-100 text-red-700'
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
        })}
      </div>
    </div>
  )
}
