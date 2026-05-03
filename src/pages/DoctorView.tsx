import { useParams, Link } from 'react-router-dom'
import { useApp } from '@/store/AppContext'
import { TaskStatusIcon, EmptyState } from '@/components/ui'
import { Search, Wifi, WifiOff, Play, CheckCircle2, Users } from 'lucide-react'
import { useState, useMemo } from 'react'
import { DOCTORS } from '@/types'
import { getTaskGroupStatuses } from '@/lib/taskEngine'
import clsx from 'clsx'

const GROUP_PALETTE = [
  { border: 'border-teal-400',   bg: 'bg-teal-50/40',   label: 'text-teal-700',   header: 'bg-teal-50' },
  { border: 'border-indigo-400', bg: 'bg-indigo-50/40', label: 'text-indigo-700', header: 'bg-indigo-50' },
  { border: 'border-orange-400', bg: 'bg-orange-50/40', label: 'text-orange-700', header: 'bg-orange-50' },
  { border: 'border-purple-400', bg: 'bg-purple-50/40', label: 'text-purple-700', header: 'bg-purple-50' },
  { border: 'border-cyan-400',   bg: 'bg-cyan-50/40',   label: 'text-cyan-700',   header: 'bg-cyan-50' },
]

export default function DoctorView() {
  const { code } = useParams<{ code: string }>()
  const { getPatientsWithTasks, startTask, completeTask, isDoctorOffline, toggleDoctorOffline } = useApp()
  const doctor = DOCTORS.find((d) => d.code === code)

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_PROGRESS' | 'COMPLETED'>('ALL')

  const patients = useMemo(() => {
    return getPatientsWithTasks().filter((p) => p.assigned_doctor === code)
  }, [getPatientsWithTasks, code])

  if (!doctor) return <EmptyState message="Doctor not found" />

  const offline = isDoctorOffline(doctor.code)

  const isConsultDone = (p: typeof patients[0]) =>
    p.tasks.find((t) => t.task_group === 'CONSULT')?.status === 'COMPLETED'

  const filtered = patients.filter((p) => {
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase()) && !p.uhid.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (statusFilter === 'ALL') return true
    if (statusFilter === 'COMPLETED') return isConsultDone(p)
    if (statusFilter === 'IN_PROGRESS') return !isConsultDone(p)
    return true
  })

  const completedCount = patients.filter(isConsultDone).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-primary-100 text-primary-700 font-bold text-lg">
            {doctor.code}
          </span>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{doctor.name}</h2>
            <p className="text-sm text-gray-500">
              {patients.length} patient{patients.length !== 1 ? 's' : ''} &bull; {completedCount} completed
            </p>
          </div>
        </div>

        {/* Online/Offline toggle */}
        <button
          onClick={() => toggleDoctorOffline(doctor.code)}
          className={clsx(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors',
            offline
              ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
              : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
          )}
        >
          {offline ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
          {offline ? 'Offline' : 'Online'}
        </button>
      </div>

      {/* Offline banner */}
      {offline && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>{doctor.name} is currently offline. Tasks cannot be started.</span>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name or UHID…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        {(['ALL', 'IN_PROGRESS', 'COMPLETED'] as const).map((f) => {
          const label = f === 'ALL' ? 'All' : f === 'IN_PROGRESS' ? 'In Progress' : 'Completed'
          const count = f === 'ALL' ? patients.length : f === 'COMPLETED' ? completedCount : patients.length - completedCount
          return (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
                statusFilter === f
                  ? 'bg-primary-50 border-primary-300 text-primary-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              )}
            >
              {label} ({count})
            </button>
          )
        })}
      </div>

      {/* Patient list */}
      {filtered.length === 0 ? (
        <EmptyState message="No patients assigned to this doctor" />
      ) : (
        <div className="space-y-3">
          {(() => {
            // Build render units for visual grouping
            const allGroupIds = [...new Set(filtered.filter((p) => p.group_id).map((p) => p.group_id as string))]
            const groupPaletteMap = Object.fromEntries(allGroupIds.map((gid, i) => [gid, GROUP_PALETTE[i % GROUP_PALETTE.length]]))

            type RenderUnit =
              | { type: 'solo'; patient: typeof filtered[0] }
              | { type: 'group'; groupId: string; patients: typeof filtered }
            const units: RenderUnit[] = []
            const seenGroups = new Set<string>()
            filtered.forEach((p) => {
              if (!p.group_id) {
                units.push({ type: 'solo', patient: p })
              } else if (!seenGroups.has(p.group_id)) {
                seenGroups.add(p.group_id)
                units.push({ type: 'group', groupId: p.group_id, patients: filtered.filter((fp) => fp.group_id === p.group_id) })
              }
            })

            const renderCard = (patient: typeof filtered[0]) => {
              const groupStatuses = getTaskGroupStatuses(patient.tasks)
              const completedTasks = patient.tasks.filter((t) => t.status === 'COMPLETED').length
              const totalTasks = patient.tasks.length
              const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
              const activeGroups = groupStatuses.filter((g) => g.status === 'IN_PROGRESS')

              // Only manage the CONSULT (physician consultation) task
              const consultTask = patient.tasks.find((t) => t.task_group === 'CONSULT')
              const consultDone = consultTask?.status === 'COMPLETED'

              return (
                <div
                  key={patient.id}
                  className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md hover:border-primary-200 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div>
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/patient/${patient.id}`}
                            className={clsx(
                              'text-sm font-semibold text-gray-900 hover:text-primary-600',
                              patient.priority === 'VIP' && 'border-b-2 border-amber-400'
                            )}
                          >
                            {patient.name}
                          </Link>
                          {consultDone && (
                            <span className="text-[10px] font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
                              Complete
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          UHID: {patient.uhid} &bull; {patient.package_name || 'No package'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-medium text-gray-500">{pct}%</span>
                      {consultDone ? (
                        <span className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border bg-green-50 border-green-200 text-green-700">
                          <CheckCircle2 className="w-3 h-3" />
                          Consulted
                        </span>
                      ) : consultTask && (consultTask.status === 'NOT_STARTED' || consultTask.status === 'DELAYED') ? (
                        <button
                          onClick={() => startTask(consultTask.id)}
                          disabled={offline}
                          title={offline ? 'Doctor is offline' : 'Start consultation'}
                          className={clsx(
                            'flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                            offline
                              ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                              : 'bg-primary-50 border-primary-200 text-primary-700 hover:bg-primary-100'
                          )}
                        >
                          <Play className="w-3 h-3" />
                          Start
                        </button>
                      ) : consultTask && consultTask.status === 'IN_PROGRESS' ? (
                        <button
                          onClick={() => completeTask(consultTask.id)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border bg-green-50 border-green-200 text-green-700 hover:bg-green-100 transition-colors"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Complete
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={clsx('h-full rounded-full transition-all', consultDone ? 'bg-green-500' : 'bg-primary-500')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {activeGroups.length > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      {activeGroups.map((g) => (
                        <TaskStatusIcon key={g.group} status={g.status} />
                      ))}
                      <span className="text-xs text-gray-400">
                        {activeGroups.map((g) => g.group).join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              )
            }

            return units.map((unit) => {
              if (unit.type === 'solo') return renderCard(unit.patient)
              const palette = groupPaletteMap[unit.groupId]
              return (
                <div key={`group-${unit.groupId}`} className={clsx('rounded-xl border-2', palette.border, palette.bg, 'p-2 space-y-2')}>
                  <div className={clsx('flex items-center gap-2 px-2 py-1.5 rounded-lg', palette.header)}>
                    <Users className={clsx('w-4 h-4', palette.label)} />
                    <span className={clsx('text-xs font-semibold', palette.label)}>
                      Checked In Together · {unit.patients.length} patients
                    </span>
                  </div>
                  {unit.patients.map((p) => renderCard(p))}
                </div>
              )
            })
          })()}
        </div>
      )}
    </div>
  )
}
