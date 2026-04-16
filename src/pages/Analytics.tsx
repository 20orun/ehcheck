import { useState } from 'react'
import { useApp } from '@/store/AppContext'
import { KPICard } from '@/components/ui'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { isPatientComplete } from '@/lib/taskEngine'
import type { PieLabelRenderProps } from 'recharts'

export default function Analytics() {
  const { getPatientsWithTasks, state } = useApp()
  const patients = getPatientsWithTasks()
  const [tatInHours, setTatInHours] = useState(false)

  // ─── Avg TAT per package ─────────────────────────
  const packageTATs = state.packages.map((pkg) => {
    const pkgPatients = patients.filter((p) => p.package_id === pkg.id)
    const completed = pkgPatients.filter((p) => isPatientComplete(p.tasks))
    const avgTAT =
      completed.length > 0
        ? Math.round(
            completed.reduce((sum, p) => {
              const checkedIn = p.checked_in_at ? new Date(p.checked_in_at).getTime() : null
              const endTimes = p.tasks.filter((t) => t.completed_at).map((t) => new Date(t.completed_at!).getTime())
              if (checkedIn && endTimes.length) {
                return sum + (Math.max(...endTimes) - checkedIn) / 60000
              }
              return sum
            }, 0) / completed.length
          )
        : 0
    return { name: pkg.name.replace('Executive Health Check - ', ''), avgTAT, count: pkgPatients.length }
  })

  // ─── Avg time per department ─────────────────────
  const deptTimes = state.departments.map((dept) => {
    const deptTasks = state.patientTasks.filter(
      (t) => t.department_id === dept.id && t.status === 'COMPLETED' && t.started_at && t.completed_at
    )
    const avgTime =
      deptTasks.length > 0
        ? Math.round(
            deptTasks.reduce(
              (sum, t) =>
                sum + (new Date(t.completed_at!).getTime() - new Date(t.started_at!).getTime()) / 60000,
              0
            ) / deptTasks.length
          )
        : 0
    return { name: dept.name, avgTime, count: deptTasks.length }
  }).filter((d) => d.count > 0)

  // ─── Status distribution (pie) ───────────────────
  const statusCounts = [
    { name: 'Completed', value: state.patientTasks.filter((t) => t.status === 'COMPLETED').length, color: '#22c55e' },
    { name: 'In Progress', value: state.patientTasks.filter((t) => t.status === 'IN_PROGRESS').length, color: '#3b82f6' },
    { name: 'Not Started', value: state.patientTasks.filter((t) => t.status === 'NOT_STARTED').length, color: '#9ca3af' },
    { name: 'Delayed', value: state.patientTasks.filter((t) => t.status === 'DELAYED').length, color: '#ef4444' },
  ].filter((s) => s.value > 0)

  // ─── Bottleneck frequency ────────────────────────
  const bottleneckData = state.departments
    .map((dept) => {
      const delays = state.patientTasks.filter(
        (t) => t.department_id === dept.id && t.status === 'DELAYED'
      ).length
      return { name: dept.name, delays }
    })
    .filter((d) => d.delays > 0)
    .sort((a, b) => b.delays - a.delays)

  // ─── Completion rate ─────────────────────────────
  const totalPatients = patients.length
  const completedPatients = patients.filter((p) => isPatientComplete(p.tasks)).length
  const completionRate = totalPatients > 0 ? Math.round((completedPatients / totalPatients) * 100) : 0

  // ─── Total Avg TAT (all completed patients) ─────
  const allCompleted = patients.filter((p) => isPatientComplete(p.tasks))
  const totalAvgTATMin =
    allCompleted.length > 0
      ? allCompleted.reduce((sum, p) => {
          const checkedIn = p.checked_in_at ? new Date(p.checked_in_at).getTime() : null
          const endTimes = p.tasks.filter((t) => t.completed_at).map((t) => new Date(t.completed_at!).getTime())
          if (checkedIn && endTimes.length) {
            return sum + (Math.max(...endTimes) - checkedIn) / 60000
          }
          return sum
        }, 0) / allCompleted.length
      : 0
  const totalAvgTATDisplay = tatInHours
    ? `${(totalAvgTATMin / 60).toFixed(1)} hrs`
    : `${Math.round(totalAvgTATMin)} min`

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard title="Total Patients" value={totalPatients} color="primary" />
        <KPICard title="Completed" value={completedPatients} color="green" />
        <KPICard title="Completion Rate" value={`${completionRate}%`} color="green" />
        <KPICard
          title="Active Tasks"
          value={state.patientTasks.filter((t) => t.status === 'IN_PROGRESS').length}
          color="primary"
        />
        <KPICard
          title="Avg TAT (click to toggle)"
          value={totalAvgTATDisplay}
          subtitle={allCompleted.length > 0 ? `${allCompleted.length} completed` : 'No data'}
          color="yellow"
          onClick={() => setTatInHours((v) => !v)}
        />
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Avg Time per Department */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Avg Time per Department (min)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={deptTimes} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="avgTime" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Task Status Distribution */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Task Status Distribution</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={statusCounts}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                label={(props: PieLabelRenderProps) => `${props.name ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`}
              >
                {statusCounts.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Avg TAT per Package */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Avg TAT per Package (min)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={packageTATs}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="avgTAT" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Bottleneck Frequency */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Bottleneck Frequency (Delays)</h3>
          {bottleneckData.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-gray-400 text-sm">
              No delays detected
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={bottleneckData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="delays" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
