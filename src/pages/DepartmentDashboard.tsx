import { Link } from 'react-router-dom'
import { useApp } from '@/store/AppContext'
import { Users, Activity, Stethoscope } from 'lucide-react'
import { DOCTORS } from '@/types'

type CardStatus = 'offline' | 'in-progress' | 'available'

const STATUS_CONFIG: Record<CardStatus, {
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
  const { state, isDeptOffline, isDoctorOffline } = useApp()

  // ─── Department helpers ───────────────────────────

  function getDeptStatus(deptId: string): CardStatus {
    if (isDeptOffline(deptId)) return 'offline'
    const hasActive = state.patientTasks.some(
      (t) => t.department_id === deptId && (t.status === 'IN_PROGRESS' || t.status === 'DELAYED')
    )
    return hasActive ? 'in-progress' : 'available'
  }

  function getDeptActivePatientsCount(deptId: string): number {
    return new Set(
      state.patientTasks
        .filter((t) => t.department_id === deptId && (t.status === 'IN_PROGRESS' || t.status === 'DELAYED'))
        .map((t) => t.patient_id)
    ).size
  }

  function getDeptWaitingPatientsCount(deptId: string): number {
    const pids = [...new Set(
      state.patientTasks
        .filter((t) => t.department_id === deptId && t.status === 'NOT_STARTED')
        .map((t) => t.patient_id)
    )]
    return pids.filter((pid) => {
      const allTasks = state.patientTasks.filter((t) => t.patient_id === pid)
      const deptTask = allTasks.find((t) => t.department_id === deptId && t.status === 'NOT_STARTED')
      if (!deptTask) return false
      return !allTasks.some((t) => t.step_order < deptTask.step_order && t.status !== 'COMPLETED')
    }).length
  }

  function getDeptRemainingPatientsCount(deptId: string): number {
    return new Set(
      state.patientTasks
        .filter((t) => t.department_id === deptId && t.status !== 'COMPLETED')
        .map((t) => t.patient_id)
    ).size
  }

  // ─── Doctor helpers ───────────────────────────────

  function getDoctorStatus(code: string): CardStatus {
    if (isDoctorOffline(code)) return 'offline'
    const assignedPids = state.patients.filter((p) => p.assigned_doctor === code).map((p) => p.id)
    const hasActive = state.patientTasks.some(
      (t) =>
        assignedPids.includes(t.patient_id) &&
        (t.task_group === 'CONSULT' || t.task_group === 'REVIEW') &&
        (t.status === 'IN_PROGRESS' || t.status === 'DELAYED')
    )
    return hasActive ? 'in-progress' : 'available'
  }

  function getDoctorActiveCount(code: string): number {
    const assignedPids = state.patients.filter((p) => p.assigned_doctor === code).map((p) => p.id)
    return new Set(
      state.patientTasks
        .filter((t) =>
          assignedPids.includes(t.patient_id) &&
          (t.task_group === 'CONSULT' || t.task_group === 'REVIEW') &&
          (t.status === 'IN_PROGRESS' || t.status === 'DELAYED')
        )
        .map((t) => t.patient_id)
    ).size
  }

  function getDoctorWaitingCount(code: string): number {
    const assignedPids = state.patients.filter((p) => p.assigned_doctor === code).map((p) => p.id)
    return assignedPids.filter((pid) => {
      const allTasks = state.patientTasks.filter((t) => t.patient_id === pid)
      const consultTask = allTasks.find(
        (t) => (t.task_group === 'CONSULT' || t.task_group === 'REVIEW') && t.status === 'NOT_STARTED'
      )
      if (!consultTask) return false
      return !allTasks.some((t) => t.step_order < consultTask.step_order && t.status !== 'COMPLETED')
    }).length
  }

  function getDoctorRemainingCount(code: string): number {
    const assignedPids = state.patients.filter((p) => p.assigned_doctor === code).map((p) => p.id)
    return new Set(
      state.patientTasks
        .filter((t) =>
          assignedPids.includes(t.patient_id) &&
          (t.task_group === 'CONSULT' || t.task_group === 'REVIEW') &&
          t.status !== 'COMPLETED'
        )
        .map((t) => t.patient_id)
    ).size
  }

  const deptTotals = {
    available: state.departments.filter((d) => getDeptStatus(d.id) === 'available').length,
    inProgress: state.departments.filter((d) => getDeptStatus(d.id) === 'in-progress').length,
    offline: state.departments.filter((d) => getDeptStatus(d.id) === 'offline').length,
  }

  const doctorTotals = {
    available: DOCTORS.filter((d) => getDoctorStatus(d.code) === 'available').length,
    inProgress: DOCTORS.filter((d) => getDoctorStatus(d.code) === 'in-progress').length,
    offline: DOCTORS.filter((d) => getDoctorStatus(d.code) === 'offline').length,
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-900">Department Overview</h2>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{deptTotals.available + doctorTotals.available} available</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />{deptTotals.inProgress + doctorTotals.inProgress} in progress</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{deptTotals.offline + doctorTotals.offline} offline</span>
        </div>
      </div>

      {/* ── Departments ── compact rows */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Departments</h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-1.5">
          {state.departments.map((dept) => {
            const status = getDeptStatus(dept.id)
            const cfg = STATUS_CONFIG[status]
            const active = getDeptActivePatientsCount(dept.id)
            const waiting = getDeptWaitingPatientsCount(dept.id)
            const remaining = getDeptRemainingPatientsCount(dept.id)

            return (
              <div
                key={dept.id}
                className={`flex items-center gap-2 px-3 rounded-lg border-2 min-h-[45px] ${cfg.border} ${cfg.bg}`}
              >
                <Link
                  to={`/department/${dept.id}`}
                  className="flex-1 text-xs font-semibold text-gray-800 hover:text-primary-600 truncate leading-tight"
                >
                  {dept.name}
                </Link>
                <div className="flex items-center gap-1.5 shrink-0 text-[11px] text-gray-400">
                  {active > 0 && (
                    <span className="flex items-center gap-0.5 text-yellow-600">
                      <Activity className="w-2.5 h-2.5" />{active}
                    </span>
                  )}
                  {waiting > 0 && (
                    <span className="flex items-center gap-0.5 text-blue-500">
                      <Users className="w-2.5 h-2.5" />{waiting}
                    </span>
                  )}
                  {remaining > 0 && <span>{remaining}r</span>}
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${cfg.badgeBg} ${cfg.badgeText}`}>
                    {cfg.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Doctors ── compact horizontal cards */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Doctors</h3>
        <div className="grid grid-cols-3 gap-3">
          {DOCTORS.map((doc) => {
            const status = getDoctorStatus(doc.code)
            const cfg = STATUS_CONFIG[status]
            const active = getDoctorActiveCount(doc.code)
            const waiting = getDoctorWaitingCount(doc.code)
            const remaining = getDoctorRemainingCount(doc.code)
            const isOffline = status === 'offline'

            return (
              <div
                key={doc.code}
                className={`rounded-xl border-2 overflow-hidden ${cfg.border} ${cfg.bg}`}
              >
                <div className={`h-1 w-full ${cfg.bar}`} />
                <div className="px-4 py-3 flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${cfg.badgeBg} ${cfg.badgeText}`}>
                    {doc.code}
                  </span>
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/doctor/${doc.code}`}
                      className="block text-sm font-semibold text-gray-900 hover:text-primary-600 truncate leading-tight"
                    >
                      {doc.name}
                    </Link>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${cfg.badgeBg} ${cfg.badgeText}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} inline-block`} />
                        {cfg.label}
                      </span>
                      <span className="text-xs text-gray-400 flex items-center gap-2">
                        {active > 0 && (
                          <span className="flex items-center gap-0.5 text-yellow-600">
                            <Stethoscope className="w-3 h-3" />{active} consulting
                          </span>
                        )}
                        {waiting > 0 && (
                          <span className="flex items-center gap-0.5 text-blue-500">
                            <Users className="w-3 h-3" />{waiting} waiting
                          </span>
                        )}
                        {remaining > 0 && <span className="text-gray-400">{remaining} remaining</span>}
                        {active === 0 && waiting === 0 && remaining === 0 && !isOffline && (
                          <span className="text-green-600">Ready</span>
                        )}
                        {isOffline && <span className="text-red-500">Not available</span>}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
