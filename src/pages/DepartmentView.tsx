import { useParams, Link } from 'react-router-dom'
import { useApp } from '@/store/AppContext'
import { KPICard, StatusBadge, PriorityBadge, EmptyState } from '@/components/ui'
import { Play, CheckCircle2, ArrowUpDown } from 'lucide-react'
import { useState } from 'react'

type SortOption = 'vip-wait' | 'wait-desc' | 'wait-asc' | 'name-asc'

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: 'vip-wait', label: 'VIP + Wait' },
  { key: 'wait-desc', label: 'Longest Wait' },
  { key: 'wait-asc', label: 'Shortest Wait' },
  { key: 'name-asc', label: 'Name A–Z' },
]

export default function DepartmentView() {
  const { id } = useParams<{ id: string }>()
  const { state, getDepartmentQueue, getDepartmentStats, startTask, completeTask } = useApp()
  const dept = state.departments.find((d) => d.id === id)

  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [sortBy, setSortBy] = useState<SortOption>('vip-wait')

  if (!dept) return <EmptyState message="Department not found" />

  const queue = getDepartmentQueue(id!)
  const stats = getDepartmentStats(id!)

  // Filter
  const filteredQueue = queue.filter((p) => {
    if (statusFilter === 'ALL') return true
    if (statusFilter === 'VIP') return p.priority === 'VIP'
    if (statusFilter === 'NORMAL') return p.priority === 'NORMAL'
    return p.currentStep?.status === statusFilter
  })

  // Sort
  const sortedQueue = [...filteredQueue].sort((a, b) => {
    switch (sortBy) {
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
      <h2 className="text-xl font-bold text-gray-900">{dept.name}</h2>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <KPICard title="Waiting" value={stats.waiting} color="yellow" />
        <KPICard title="Active" value={stats.active} color="primary" />
        <KPICard title="Avg Time" value={`${stats.avgTime} min`} color="gray" />
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
            {sortedQueue.map((p) => (
              <div key={p.id} className="px-4 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/patient/${p.id}`}
                      className="font-medium text-primary-600 hover:underline truncate"
                    >
                      {p.name}
                    </Link>
                    <PriorityBadge priority={p.priority} />
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {p.currentStep?.step_name} &bull; Waiting {p.waitingMinutes} min
                  </p>
                </div>

                <StatusBadge status={p.currentStep?.status || 'NOT_STARTED'} />

                <div className="flex items-center gap-1">
                  {p.currentStep?.status === 'NOT_STARTED' && (
                    <button
                      onClick={() => startTask(p.currentStep!.id)}
                      className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                      title="Start task"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  )}
                  {(p.currentStep?.status === 'IN_PROGRESS' ||
                    p.currentStep?.status === 'DELAYED') && (
                    <button
                      onClick={() => completeTask(p.currentStep!.id)}
                      className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                      title="Complete task"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
