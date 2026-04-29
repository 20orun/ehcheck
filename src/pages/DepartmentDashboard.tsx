import { Link } from 'react-router-dom'
import { useApp } from '@/store/AppContext'
import { Users, Activity } from 'lucide-react'

type DeptStatus = 'offline' | 'in-progress' | 'available'

const STATUS_CONFIG: Record<DeptStatus, {
  border: string
  bg: string
  bar: string
  badgeBg: string
  badgeText: string
  label: string
  dot: string
}> = {
  offline: {
    border: 'border-red-300',
    bg: 'bg-red-50',
    bar: 'bg-red-500',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-700',
    label: 'Offline',
    dot: 'bg-red-500',
  },
  'in-progress': {
    border: 'border-yellow-300',
    bg: 'bg-yellow-50',
    bar: 'bg-yellow-400',
    badgeBg: 'bg-yellow-100',
    badgeText: 'text-yellow-800',
    label: 'In Progress',
    dot: 'bg-yellow-400',
  },
  available: {
    border: 'border-green-300',
    bg: 'bg-green-50',
    bar: 'bg-green-500',
    badgeBg: 'bg-green-100',
    badgeText: 'text-green-700',
    label: 'Available',
    dot: 'bg-green-500',
  },
}

export default function DepartmentDashboard() {
  const { state, isDeptOffline } = useApp()

  function getDeptStatus(deptId: string): DeptStatus {
    if (isDeptOffline(deptId)) return 'offline'
    const hasActive = state.patientTasks.some(
      (t) =>
        t.department_id === deptId &&
        (t.status === 'IN_PROGRESS' || t.status === 'DELAYED')
    )
    return hasActive ? 'in-progress' : 'available'
  }

  function getActivePatientsCount(deptId: string): number {
    return new Set(
      state.patientTasks
        .filter(
          (t) =>
            t.department_id === deptId &&
            (t.status === 'IN_PROGRESS' || t.status === 'DELAYED')
        )
        .map((t) => t.patient_id)
    ).size
  }

  // True waiting: prior steps (by step_order) all completed, task is NOT_STARTED here
  function getWaitingPatientsCount(deptId: string): number {
    const deptTaskPatients = [...new Set(
      state.patientTasks
        .filter((t) => t.department_id === deptId && t.status === 'NOT_STARTED')
        .map((t) => t.patient_id)
    )]
    return deptTaskPatients.filter((pid) => {
      const allTasks = state.patientTasks.filter((t) => t.patient_id === pid)
      const deptTask = allTasks.find((t) => t.department_id === deptId && t.status === 'NOT_STARTED')
      if (!deptTask) return false
      return !allTasks.some((t) => t.step_order < deptTask.step_order && t.status !== 'COMPLETED')
    }).length
  }

  function getRemainingPatientsCount(deptId: string): number {
    return new Set(
      state.patientTasks
        .filter((t) => t.department_id === deptId && t.status !== 'COMPLETED')
        .map((t) => t.patient_id)
    ).size
  }

  const totals = {
    available: state.departments.filter((d) => getDeptStatus(d.id) === 'available').length,
    inProgress: state.departments.filter((d) => getDeptStatus(d.id) === 'in-progress').length,
    offline: state.departments.filter((d) => getDeptStatus(d.id) === 'offline').length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">Department Overview</h2>
        <p className="text-sm text-gray-500 mt-1">
          Real-time status of all departments — toggle online/offline from each card
        </p>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg text-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
          <span className="font-medium text-green-700">{totals.available}</span>
          <span className="text-green-600">Available</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" />
          <span className="font-medium text-yellow-800">{totals.inProgress}</span>
          <span className="text-yellow-700">In Progress</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
          <span className="font-medium text-red-700">{totals.offline}</span>
          <span className="text-red-600">Offline</span>
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {state.departments.map((dept) => {
          const status = getDeptStatus(dept.id)
          const cfg = STATUS_CONFIG[status]
          const active = getActivePatientsCount(dept.id)
          const waiting = getWaitingPatientsCount(dept.id)
          const remaining = getRemainingPatientsCount(dept.id)
          const isOffline = status === 'offline'

          return (
            <div
              key={dept.id}
              className={`rounded-xl border-2 overflow-hidden transition-all duration-200 ${cfg.border} ${cfg.bg}`}
            >
              {/* Status bar */}
              <div className={`h-1.5 w-full ${cfg.bar}`} />

              <div className="p-4 space-y-3">
                {/* Name + status badge */}
                <div className="space-y-1.5">
                  <Link
                    to={`/department/${dept.id}`}
                    className="block font-semibold text-sm text-gray-900 hover:text-primary-600 leading-snug"
                  >
                    {dept.name}
                  </Link>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badgeBg} ${cfg.badgeText}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} inline-block`} />
                    {cfg.label}
                  </span>
                </div>

                {/* Patient counts */}
                <div className="space-y-1 text-xs text-gray-500">
                  {active > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Activity className="w-3 h-3 text-yellow-500" />
                      <span>{active} being seen</span>
                    </div>
                  )}
                  {waiting > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3 h-3 text-blue-400" />
                      <span>{waiting} waiting</span>
                    </div>
                  )}
                  {remaining > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400">{remaining} remaining today</span>
                    </div>
                  )}
                  {active === 0 && waiting === 0 && remaining === 0 && !isOffline && (
                    <div className="text-green-600 text-xs">Ready for next patient</div>
                  )}
                  {isOffline && (
                    <div className="text-red-500 text-xs">Not accepting patients</div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
