import { useParams, Link } from 'react-router-dom'
import { useApp } from '@/store/AppContext'
import { KPICard, TaskStatusIcon, EmptyState } from '@/components/ui'
import { Play, CheckCircle2, ArrowUpDown, Globe, Search, Wifi, WifiOff, Users, X } from 'lucide-react'
import { useState, useMemo, useEffect } from 'react'
import { DOCTORS } from '@/types'
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

  // Billing modal state
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
                return (
                  <div key={p.id} className="px-3 py-2 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
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
                    </div>

                    <TaskStatusIcon status={p.currentStep?.status || 'NOT_STARTED'} />

                    <div className="flex items-center gap-1">
                      {p.currentStep?.status === 'NOT_STARTED' && canStart && (
                        <button
                          onClick={() => !isOffline && startTask(p.currentStep!.id)}
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
                          onClick={() => {
                            if (isBilling) {
                              setBillingModal({ patientId: p.id })
                            } else {
                              completeTask(p.currentStep!.id)
                            }
                          }}
                          className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                          title="Complete task"
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

      {/* Package Selection Modal for Billing (step 1) */}
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
                const currentPatient = queue.find((p) => p.id === billingModal.patientId)
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
                    const currentPatient = queue.find((p) => p.id === billingModal.patientId)
                    updatePatientPackage(billingModal.patientId, billingSelectedPkgId, doc.code)
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
