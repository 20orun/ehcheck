import { useParams, Link } from 'react-router-dom'
import { useApp } from '@/store/AppContext'
import { KPICard, TaskStatusIcon, EmptyState } from '@/components/ui'
import { Play, CheckCircle2, ArrowUpDown, Globe, Search, Wifi, WifiOff, Users, X, Pencil } from 'lucide-react'
import { useState, useMemo, useEffect } from 'react'
import clsx from 'clsx'

type SortOption = 'vip-wait' | 'wait-desc' | 'wait-asc' | 'name-asc' | 'checkin-asc'

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: 'checkin-asc', label: 'Checked In (Earliest)' },
  { key: 'vip-wait', label: 'VIP + Wait' },
  { key: 'wait-desc', label: 'Longest Wait' },
  { key: 'wait-asc', label: 'Shortest Wait' },
  { key: 'name-asc', label: 'Name A–Z' },
]

const PACKAGE_COLORS: Record<string, { border: string; bg: string; badge: string }> = {
  'Silver Health Check':      { border: 'border-gray-300',    bg: 'bg-gray-50',     badge: 'bg-gray-200 text-gray-700' },
  'Gold Health Check':        { border: 'border-amber-300',   bg: 'bg-amber-50',    badge: 'bg-amber-100 text-amber-800' },
  'Platinum Health Check':    { border: 'border-violet-300',  bg: 'bg-violet-50',   badge: 'bg-violet-200 text-violet-800' },
  'Diamond Health Check':     { border: 'border-cyan-300',    bg: 'bg-cyan-50',     badge: 'bg-cyan-100 text-cyan-800' },
  'Femina Essentialis Check': { border: 'border-pink-300',    bg: 'bg-pink-50',     badge: 'bg-pink-100 text-pink-800' },
  'Cardiac Health Check':     { border: 'border-rose-400',    bg: 'bg-rose-50',     badge: 'bg-rose-200 text-rose-900' },
  'Child Health Check':       { border: 'border-emerald-300', bg: 'bg-emerald-50',  badge: 'bg-emerald-100 text-emerald-700' },
}

const DEFAULT_PKG_COLOR = { border: 'border-gray-200', bg: 'bg-white', badge: 'bg-gray-100 text-gray-600' }

const GROUP_PALETTE = [
  { border: 'border-l-teal-400',   bg: 'bg-teal-50/50',   label: 'text-teal-700',   header: 'bg-teal-50' },
  { border: 'border-l-indigo-400', bg: 'bg-indigo-50/50', label: 'text-indigo-700', header: 'bg-indigo-50' },
  { border: 'border-l-orange-400', bg: 'bg-orange-50/50', label: 'text-orange-700', header: 'bg-orange-50' },
  { border: 'border-l-purple-400', bg: 'bg-purple-50/50', label: 'text-purple-700', header: 'bg-purple-50' },
  { border: 'border-l-cyan-400',   bg: 'bg-cyan-50/50',   label: 'text-cyan-700',   header: 'bg-cyan-50' },
]

export default function DepartmentView() {
  const { id } = useParams<{ id: string }>()
  const {
    state,
    getDepartmentQueue,
    getDepartmentStats,
    startTask,
    completeTask,
    isDeptOffline,
    toggleDeptOffline,
    updatePatientPackage,
    updatePatientInfo,
  } = useApp()
  const dept = state.departments.find((d) => d.id === id)
  const isBilling = dept?.task_group === 'BILLING'

  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [sortBy, setSortBy] = useState<SortOption>('vip-wait')
  const [searchQuery, setSearchQuery] = useState('')

  // Default sort for billing department: checked-in earliest
  useEffect(() => {
    if (isBilling) setSortBy('checkin-asc')
  }, [isBilling])

  // Edit / billing modal state
  // editEntries: one entry per patient (group billing has multiple)
  // editIsStart: true when opened via Start button → start+complete on save
  type EditEntry = { patientId: string; taskId?: string; name: string; uhid: string; phone: string; pkgId: string | null }
  const [editEntries, setEditEntries] = useState<EditEntry[] | null>(null)
  const [editIsStart, setEditIsStart] = useState(false)
  const [editPkgSearch, setEditPkgSearch] = useState<Record<string, string>>({})

  // useMemo kept to satisfy exhaustive-deps (packages list)
  const _packages = useMemo(() => state.packages, [state.packages])

  function closeEditModal() {
    setEditEntries(null)
    setEditIsStart(false)
    setEditPkgSearch({})
  }

  function updateEntry(patientId: string, patch: Partial<EditEntry>) {
    setEditEntries((prev) => prev ? prev.map((e) => e.patientId === patientId ? { ...e, ...patch } : e) : prev)
  }

  if (!dept) return <EmptyState message="Department not found" />

  const isOffline = isDeptOffline(id!)
  const queue = getDepartmentQueue(id!)
  const stats = getDepartmentStats(id!)

  // Filter
  const filteredQueue = queue.filter((p) => {
    // Name search filter
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (statusFilter === 'ALL') return true
    if (statusFilter === 'VIP') return p.priority === 'VIP'
    if (statusFilter === 'NORMAL') return p.priority === 'NORMAL'
    return p.currentStep?.status === statusFilter
  })

  // Sort
  const sortedQueue = [...filteredQueue].sort((a, b) => {
    // International patients always come after non-international
    if (a.is_international !== b.is_international) return a.is_international ? 1 : -1
    switch (sortBy) {
      case 'checkin-asc': {
        const aTime = a.checked_in_at ? new Date(a.checked_in_at).getTime() : Infinity
        const bTime = b.checked_in_at ? new Date(b.checked_in_at).getTime() : Infinity
        return aTime - bTime || a.name.localeCompare(b.name)
      }
      case 'vip-wait':
        if (a.priority !== b.priority) return a.priority === 'VIP' ? -1 : 1
        return b.waitingMinutes - a.waitingMinutes
      case 'wait-desc':
        return b.waitingMinutes - a.waitingMinutes
      case 'wait-asc':
        return a.waitingMinutes - b.waitingMinutes
      case 'name-asc':
        return a.name.localeCompare(b.name)
      default:
        return 0
    }
  })

  // Counts for filter badges
  const filterCounts: Record<string, number> = {
    ALL: queue.length,
    VIP: queue.filter((p) => p.priority === 'VIP').length,
    NORMAL: queue.filter((p) => p.priority === 'NORMAL').length,
    NOT_STARTED: queue.filter((p) => p.currentStep?.status === 'NOT_STARTED').length,
    IN_PROGRESS: queue.filter((p) => p.currentStep?.status === 'IN_PROGRESS').length,
    COMPLETED: queue.filter((p) => p.currentStep?.status === 'COMPLETED').length,
    DELAYED: queue.filter((p) => p.currentStep?.status === 'DELAYED').length,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-bold text-gray-900">{dept.name}</h2>
        <button
          onClick={() => toggleDeptOffline(id!)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            isOffline
              ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
              : 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100'
          }`}
        >
          {isOffline ? (
            <><Wifi className="w-4 h-4" /> Go Online</>
          ) : (
            <><WifiOff className="w-4 h-4" /> Go Offline</>
          )}
        </button>
      </div>

      {isOffline && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>This department is <strong>offline</strong> — patients cannot be started here until you go online.</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard title="Waiting" value={stats.waiting} color="yellow" />
        <KPICard title="Active" value={stats.active} color="primary" />
        <KPICard title="Remaining" value={stats.remaining} color="gray" />
        <KPICard title="Avg Time" value={`${stats.avgTime} min`} color="gray" />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search patient by name…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key: 'ALL', label: 'All' },
          { key: 'VIP', label: 'VIP' },
          { key: 'NORMAL', label: 'Normal' },
          { key: 'NOT_STARTED', label: 'Not Started' },
          { key: 'IN_PROGRESS', label: 'In Progress' },
          { key: 'COMPLETED', label: 'Completed' },
          { key: 'DELAYED', label: 'Delayed' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              statusFilter === tab.key
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-600 border border-gray-300 hover:border-primary-300'
            }`}
          >
            {tab.label} ({filterCounts[tab.key] ?? 0})
          </button>
        ))}

        {/* Sort dropdown */}
        <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
          <ArrowUpDown className="w-3.5 h-3.5" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="text-xs bg-white border border-gray-300 rounded-md px-2 py-1.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Queue */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">
            Patient Queue
            <span className="ml-2 text-xs font-normal text-gray-400">
              {sortedQueue.length} of {queue.length}
            </span>
          </h3>
        </div>

        {sortedQueue.length === 0 ? (
          <EmptyState message="No patients in queue" />
        ) : (
          <div className="divide-y divide-gray-100">
            {(() => {
              // Build render units for visual grouping
              const allGroupIds = [...new Set(sortedQueue.filter((p) => p.group_id).map((p) => p.group_id as string))]
              const groupPaletteMap = Object.fromEntries(allGroupIds.map((gid, i) => [gid, GROUP_PALETTE[i % GROUP_PALETTE.length]]))

              type RenderUnit =
                | { type: 'solo'; patient: typeof sortedQueue[0] }
                | { type: 'group'; groupId: string; patients: typeof sortedQueue }
              const units: RenderUnit[] = []
              const seenGroups = new Set<string>()
              sortedQueue.forEach((p) => {
                if (!p.group_id) {
                  units.push({ type: 'solo', patient: p })
                } else if (!seenGroups.has(p.group_id)) {
                  seenGroups.add(p.group_id)
                  units.push({ type: 'group', groupId: p.group_id, patients: sortedQueue.filter((sp) => sp.group_id === p.group_id) })
                }
              })

              const renderRow = (p: typeof sortedQueue[0]) => {
                // For billing dept: hide Start button if patient not checked in
                const canStart = !isBilling || !!p.checked_in_at
                // Complete only allowed when name + UHID + package are all filled
                const billingCanComplete = !isBilling || !!(p.name?.trim() && p.uhid?.trim() && p.package_id)
                const openEditFromStart = () => {
                  // Collect all group members with NOT_STARTED billing tasks (or solo if no group)
                  const groupPatients = p.group_id
                    ? queue.filter((qp) => qp.group_id === p.group_id && qp.currentStep?.status === 'NOT_STARTED')
                    : [p]
                  setEditEntries(groupPatients.map((gp) => ({
                    patientId: gp.id,
                    taskId: gp.currentStep?.id,
                    name: gp.name ?? '',
                    uhid: gp.uhid ?? '',
                    phone: gp.phone ?? '',
                    pkgId: gp.package_id ?? null,
                  })))
                  setEditIsStart(true)
                  setEditPkgSearch({})
                }
                return (
                  <div key={p.id} className="px-3 py-2 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Link
                          to={`/patient/${p.id}`}
                          className={clsx(
                            'font-medium text-primary-600 truncate',
                            p.priority === 'VIP' ? 'border-b-2 border-amber-400' : 'hover:underline'
                          )}
                        >
                          {p.name}
                        </Link>
                        {p.is_international && (
                          <span title="International patient">
                            <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          </span>
                        )}
                        {isBilling && !p.checked_in_at && (
                          <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0">
                            Not checked in
                          </span>
                        )}
                      </div>
                      {isBilling && (
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-500">
                            {p.uhid ? (
                              <span className="font-mono">{p.uhid}</span>
                            ) : (
                              <span className="text-amber-500 italic">No UHID</span>
                            )}
                          </span>
                          <span className="text-gray-300">·</span>
                          <span className="text-xs text-gray-500">
                            {p.package_name ? (
                              p.package_name
                            ) : (
                              <span className="text-amber-500 italic">No Package</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>

                    <TaskStatusIcon status={p.currentStep?.status || 'NOT_STARTED'} />

                    {/* Edit button for billing dept */}
                    {isBilling && (
                      <button
                        onClick={() => {
                          setEditEntries([{
                            patientId: p.id,
                            taskId: undefined,
                            name: p.name ?? '',
                            uhid: p.uhid ?? '',
                            phone: p.phone ?? '',
                            pkgId: p.package_id ?? null,
                          }])
                          setEditIsStart(false)
                          setEditPkgSearch({})
                        }}
                        className="p-1.5 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors shrink-0"
                        title="Edit patient info"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}

                    <div className="flex items-center gap-1">
                      {p.currentStep?.status === 'NOT_STARTED' && canStart && (
                        <button
                          onClick={() => !isOffline && (isBilling ? openEditFromStart() : startTask(p.currentStep!.id))}
                          disabled={isOffline}
                          className={clsx(
                            'p-1.5 rounded-lg transition-colors',
                            isOffline
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                          )}
                          title={isOffline ? 'Department offline' : 'Start task'}
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      )}
                      {(p.currentStep?.status === 'IN_PROGRESS' || p.currentStep?.status === 'DELAYED') && (
                        <button
                          onClick={() => billingCanComplete && completeTask(p.currentStep!.id)}
                          disabled={!billingCanComplete}
                          className={clsx(
                            'p-1.5 rounded-lg transition-colors',
                            billingCanComplete
                              ? 'bg-green-50 text-green-600 hover:bg-green-100'
                              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          )}
                          title={billingCanComplete ? 'Complete task' : 'Fill name, UHID and package first'}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              }

              return units.map((unit) => {
                if (unit.type === 'solo') return renderRow(unit.patient)
                const palette = groupPaletteMap[unit.groupId]
                return (
                  <div key={`group-${unit.groupId}`} className={clsx('border-l-4', palette.border, palette.bg)}>
                    <div className={clsx('flex items-center gap-2 px-4 py-1.5 border-b border-gray-100/80', palette.header)}>
                      <Users className={clsx('w-3.5 h-3.5', palette.label)} />
                      <span className={clsx('text-xs font-semibold', palette.label)}>
                        Checked In Together · {unit.patients.length} patients
                      </span>
                    </div>
                    <div className="divide-y divide-gray-100/60">
                      {unit.patients.map((p) => renderRow(p))}
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        )}
      </div>

      {/* Edit / Billing Modal */}
      {editEntries && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">
                {editIsStart
                  ? editEntries.length > 1
                    ? `Billing — Group (${editEntries.length} patients)`
                    : 'Billing'
                  : 'Edit Patient Info'}
              </h3>
              <button onClick={closeEditModal} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto divide-y divide-gray-100">
              {editEntries.map((entry, idx) => {
                const pkgSearch = editPkgSearch[entry.patientId] ?? ''
                const filteredPkgs = pkgSearch.trim()
                  ? _packages.filter((p) => p.name.toLowerCase().includes(pkgSearch.toLowerCase()))
                  : _packages
                return (
                  <div key={entry.patientId} className="p-5 space-y-3">
                    {editEntries.length > 1 && (
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                        Patient {idx + 1}
                      </p>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Patient Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={entry.name}
                        onChange={(e) => updateEntry(entry.patientId, { name: e.target.value })}
                        placeholder="Patient name"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        autoFocus={idx === 0}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        UHID <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={entry.uhid}
                        onChange={(e) => updateEntry(entry.patientId, { uhid: e.target.value })}
                        placeholder="UHID"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Mobile (optional)</label>
                      <input
                        type="tel"
                        value={entry.phone}
                        onChange={(e) => updateEntry(entry.patientId, { phone: e.target.value })}
                        placeholder="Mobile number"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Package <span className="text-red-500">*</span>
                      </label>
                      {entry.pkgId && (
                        <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-50 border border-primary-200 text-sm font-medium text-primary-800">
                          <CheckCircle2 className="w-4 h-4 text-primary-600 shrink-0" />
                          <span className="truncate">
                            {_packages.find((pkg) => pkg.id === entry.pkgId)?.name ?? 'Selected'}
                          </span>
                          <button
                            onClick={() => updateEntry(entry.patientId, { pkgId: null })}
                            className="ml-auto text-primary-400 hover:text-primary-600"
                            title="Clear package"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <input
                        type="text"
                        value={pkgSearch}
                        onChange={(e) =>
                          setEditPkgSearch((prev) => ({ ...prev, [entry.patientId]: e.target.value }))
                        }
                        placeholder="Search packages…"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                      <div className="mt-2 grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto">
                        {filteredPkgs.map((pkg) => {
                          const colors = PACKAGE_COLORS[pkg.name] || DEFAULT_PKG_COLOR
                          const isSelected = entry.pkgId === pkg.id
                          return (
                            <button
                              key={pkg.id}
                              onClick={() => {
                                updateEntry(entry.patientId, { pkgId: pkg.id })
                                setEditPkgSearch((prev) => ({ ...prev, [entry.patientId]: '' }))
                              }}
                              className={clsx(
                                'w-full text-left px-3 py-2 rounded-xl border-2 transition-all flex items-center justify-between text-sm font-semibold',
                                isSelected
                                  ? 'border-primary-500 bg-primary-50 text-primary-800'
                                  : clsx(colors.border, colors.bg, 'text-gray-800 hover:shadow-sm hover:scale-[1.005]')
                              )}
                            >
                              {pkg.name}
                              {isSelected && <CheckCircle2 className="w-4 h-4 text-primary-600 shrink-0" />}
                            </button>
                          )
                        })}
                        {filteredPkgs.length === 0 && (
                          <p className="text-sm text-gray-400 text-center py-3">No packages found</p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
              <button
                onClick={() => {
                  editEntries.forEach((entry) => {
                    const currentPatient = queue.find((p) => p.id === entry.patientId)
                    if (entry.name.trim()) {
                      updatePatientInfo(entry.patientId, entry.name.trim(), entry.uhid.trim(), entry.phone.trim() || null)
                    }
                    if (entry.pkgId && entry.pkgId !== currentPatient?.package_id) {
                      updatePatientPackage(entry.patientId, entry.pkgId)
                    }
                    if (editIsStart && entry.taskId) {
                      startTask(entry.taskId)
                      completeTask(entry.taskId)
                    }
                  })
                  closeEditModal()
                }}
                disabled={
                  editIsStart
                    ? !editEntries.every((e) => e.name.trim() && e.uhid.trim() && e.pkgId)
                    : !editEntries.every((e) => e.name.trim())
                }
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {editIsStart
                  ? editEntries.length > 1
                    ? 'Save & Complete Billing for All'
                    : 'Save & Complete Billing'
                  : 'Save'}
              </button>
              <button
                onClick={closeEditModal}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}