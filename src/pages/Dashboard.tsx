import { useApp } from '@/store/AppContext'
import { KPICard, PriorityBadge, PatientStatusDot } from '@/components/ui'
import { Link } from 'react-router-dom'
import { Clock, Search } from 'lucide-react'
import { useState } from 'react'
import type { TaskStatus } from '@/types'
const GROUP_LABELS: Record<string, string> = {
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
  CONSULT: 'Physician Consultation',
  REVIEW: 'Final Review',
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  DELAYED: 'bg-red-100 text-red-700',
  NOT_STARTED: 'bg-gray-100 text-gray-500',
}

const PACKAGE_BADGE: Record<string, string> = {
  'Silver Health Check':      'bg-gray-200 text-gray-700',
  'Gold Health Check':        'bg-amber-100 text-amber-800',
  'Platinum Health Check':    'bg-violet-200 text-violet-800',
  'Diamond Health Check':     'bg-cyan-100 text-cyan-800',
  'Femina Essentialis Check': 'bg-pink-100 text-pink-800',
  'Cardiac Health Check':     'bg-rose-200 text-rose-900',
  'Child Health Check':       'bg-emerald-100 text-emerald-700',
}

export default function Dashboard() {
  const { getDashboardKPIs, getPatientsWithCurrentStep } = useApp()
  const kpis = getDashboardKPIs()
  const patients = getPatientsWithCurrentStep()
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<string>('priority')
  const [tatInHours, setTatInHours] = useState(false)
  const [waitInHours, setWaitInHours] = useState(false)

  // Derive unique package names for filter tabs
  const packageNames = Array.from(new Set(patients.map((p) => p.package_name).filter(Boolean))) as string[]

  // Sort — stable: tiebreak by name so rows don't jump when task status changes
  const sortedPatients = [...patients].sort((a, b) => {
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

  const filteredPatients = sortedPatients.filter((p) => {
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (statusFilter === 'ALL') return true
    if (statusFilter === 'VIP') return p.priority === 'VIP'
    if (statusFilter === 'NORMAL') return p.priority === 'NORMAL'
    if (statusFilter === 'NOT_CHECKED_IN') return !p.checked_in_at
    if (statusFilter === 'COMPLETED') {
      return !p.currentStep && p.activeTasks.length === 0
    }
    if (statusFilter === 'DELAYED') {
      return p.groupStatuses.some((g) => g.status === 'DELAYED')
    }
    if (statusFilter === 'IN_PROGRESS') {
      return !!p.checked_in_at && p.groupStatuses.some((g) => g.status !== 'COMPLETED')
    }
    if (statusFilter === 'NOT_STARTED') {
      return p.groupStatuses.every((g) => g.status === 'NOT_STARTED')
    }
    // Package name filter
    return p.package_name === statusFilter
  })

  // Count helpers for filter tabs
  const filterCounts: Record<string, number> = {
    ALL: patients.length,
    VIP: patients.filter((p) => p.priority === 'VIP').length,
    NORMAL: patients.filter((p) => p.priority === 'NORMAL').length,
    NOT_CHECKED_IN: patients.filter((p) => !p.checked_in_at).length,
    IN_PROGRESS: patients.filter((p) => !!p.checked_in_at && p.groupStatuses.some((g) => g.status !== 'COMPLETED')).length,
    COMPLETED: patients.filter((p) => !p.currentStep && p.activeTasks.length === 0).length,
    DELAYED: patients.filter((p) => p.groupStatuses.some((g) => g.status === 'DELAYED')).length,
    NOT_STARTED: patients.filter((p) => p.groupStatuses.every((g) => g.status === 'NOT_STARTED')).length,
  }
  packageNames.forEach((name) => {
    filterCounts[name] = patients.filter((p) => p.package_name === name).length
  })

  function getPatientTrackStatus(p: (typeof patients)[0]): 'on-track' | 'waiting' | 'delayed' {
    if (p.groupStatuses.some((g) => g.status === 'DELAYED')) return 'delayed'
    if (p.activeTasks.length === 0 && p.currentStep) return 'waiting'
    if (p.waitingMinutes > 20) return 'waiting'
    return 'on-track'
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total Patients" value={kpis.totalPatients} color="primary" />
        <KPICard title="Checked In" value={kpis.checkedIn} color="primary" />
        <KPICard title="Not Checked In" value={kpis.notCheckedIn} color="gray" />
        <KPICard title="In Progress" value={kpis.inProgress} color="primary" />
        <KPICard title="Completed" value={kpis.completed} color="green" />
        <KPICard title="Delayed" value={kpis.delayed} color="red" />
        <KPICard
          title="Avg TAT"
          value={tatInHours ? `${(kpis.averageTAT / 60).toFixed(1)} hr` : `${kpis.averageTAT} min`}
          subtitle={kpis.bottleneckDepartment ? `Bottleneck: ${kpis.bottleneckDepartment}` : undefined}
          color="gray"
          onClick={() => setTatInHours((v) => !v)}
        />
      </div>

      {/* Alerts Section – disabled for now */}

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

      {/* Status Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key: 'ALL', label: 'All' },
          { key: 'VIP', label: 'VIP Only' },
          { key: 'NORMAL', label: 'Normal Only' },
          { key: 'NOT_CHECKED_IN', label: 'Not Checked In' },
          { key: 'IN_PROGRESS', label: 'In Progress' },
          { key: 'COMPLETED', label: 'Completed' },
          { key: 'DELAYED', label: 'Delayed' },
          { key: 'NOT_STARTED', label: 'Not Started' },
          ...packageNames.map((name) => ({ key: name, label: name.replace(' Health Check', '').replace(' Check', '') })),
        ].map((tab) => {
          const pkgBadge = PACKAGE_BADGE[tab.key]
          return (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                statusFilter === tab.key
                  ? pkgBadge ? `${pkgBadge} ring-2 ring-offset-1 ring-current` : 'bg-primary-600 text-white'
                  : pkgBadge ? `${pkgBadge} opacity-70 hover:opacity-100` : 'bg-white text-gray-600 border border-gray-300 hover:border-primary-300'
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
          { key: 'alpha', label: 'A\u2013Z' },
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

      {/* Patient Grid */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Patient</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">UHID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Task Groups</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Active Tasks</th>
                <th
                  className="text-left px-4 py-3 font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700"
                  onClick={() => setWaitInHours((v) => !v)}
                  title="Click to toggle min/hr"
                >
                  <Clock className="w-4 h-4 inline mr-1" />
                  Wait ({waitInHours ? 'hr' : 'min'})
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Priority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredPatients.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <PatientStatusDot status={getPatientTrackStatus(p)} />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/patient/${p.id}`}
                      className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
                    >
                      {p.name}
                    </Link>
                    {p.package_name && (
                      <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mt-0.5 ${PACKAGE_BADGE[p.package_name] || 'bg-gray-100 text-gray-600'}`}>{p.package_name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.uhid}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {p.groupStatuses.map((gs) => (
                        <span
                          key={gs.group}
                          className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded ${STATUS_COLORS[gs.status]}`}
                          title={`${GROUP_LABELS[gs.group]}: ${gs.completed}/${gs.total}`}
                        >
                          {GROUP_LABELS[gs.group]}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700 text-xs">
                    {p.activeTasks.length > 0
                      ? p.activeTasks.map((t) => t.step_name).join(', ')
                      : !p.currentStep
                        ? 'All Complete'
                        : !p.checked_in_at
                          ? 'Not Checked In'
                          : 'Not Started'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`font-medium ${
                        p.waitingMinutes > 30
                          ? 'text-red-600'
                          : p.waitingMinutes > 15
                            ? 'text-amber-600'
                            : 'text-gray-600'
                      }`}
                    >
                      {waitInHours ? `${(p.waitingMinutes / 60).toFixed(1)} hr` : `${p.waitingMinutes} min`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={p.priority} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
