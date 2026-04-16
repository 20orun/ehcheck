import { useParams, Link } from 'react-router-dom'
import { useApp } from '@/store/AppContext'
import { StatusBadge, PriorityBadge, EmptyState } from '@/components/ui'
import { Search } from 'lucide-react'
import { useState, useMemo } from 'react'
import { DOCTORS } from '@/types'
import { getTaskGroupStatuses } from '@/lib/taskEngine'
import clsx from 'clsx'

export default function DoctorView() {
  const { code } = useParams<{ code: string }>()
  const { getPatientsWithTasks } = useApp()
  const doctor = DOCTORS.find((d) => d.code === code)

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_PROGRESS' | 'COMPLETED'>('ALL')

  const patients = useMemo(() => {
    return getPatientsWithTasks().filter((p) => p.assigned_doctor === code)
  }, [getPatientsWithTasks, code])

  if (!doctor) return <EmptyState message="Doctor not found" />

  const filtered = patients.filter((p) => {
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase()) && !p.uhid.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (statusFilter === 'ALL') return true
    if (statusFilter === 'COMPLETED') {
      const mandatory = p.tasks.filter((t) => t.is_mandatory)
      return mandatory.length > 0 && mandatory.every((t) => t.status === 'COMPLETED')
    }
    if (statusFilter === 'IN_PROGRESS') {
      const mandatory = p.tasks.filter((t) => t.is_mandatory)
      return !(mandatory.length > 0 && mandatory.every((t) => t.status === 'COMPLETED'))
    }
    return true
  })

  const completedCount = patients.filter((p) => {
    const mandatory = p.tasks.filter((t) => t.is_mandatory)
    return mandatory.length > 0 && mandatory.every((t) => t.status === 'COMPLETED')
  }).length

  return (
    <div className="space-y-6">
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
          {filtered.map((patient) => {
            const groupStatuses = getTaskGroupStatuses(patient.tasks)
            const completedTasks = patient.tasks.filter((t) => t.status === 'COMPLETED').length
            const totalTasks = patient.tasks.length
            const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
            const mandatoryDone = patient.tasks.filter((t) => t.is_mandatory).every((t) => t.status === 'COMPLETED')
            const activeGroups = groupStatuses.filter((g) => g.status === 'IN_PROGRESS')

            return (
              <Link
                key={patient.id}
                to={`/patient/${patient.id}`}
                className="block bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md hover:border-primary-200 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{patient.name}</span>
                        <PriorityBadge priority={patient.priority} />
                        {mandatoryDone && (
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
                  <span className="text-xs font-medium text-gray-500 shrink-0">{pct}%</span>
                </div>
                <div className="mt-2 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={clsx('h-full rounded-full transition-all', mandatoryDone ? 'bg-green-500' : 'bg-primary-500')}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {activeGroups.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    {activeGroups.map((g) => (
                      <StatusBadge key={g.group} status={g.status} />
                    ))}
                    <span className="text-xs text-gray-400">
                      {activeGroups.map((g) => g.group).join(', ')}
                    </span>
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
