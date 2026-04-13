import { useParams, Link, useNavigate } from 'react-router-dom'
import { useApp } from '@/store/AppContext'
import { StatusBadge, PriorityBadge, EmptyState } from '@/components/ui'
import { ArrowLeft, CheckCircle2, Circle, Clock, AlertCircle, Loader2, SkipForward, Play, Timer, LogIn, LogOut, XCircle, Trash2, X } from 'lucide-react'
import clsx from 'clsx'
import { useState, useEffect, useMemo } from 'react'
import type { TaskGroup, PatientTask } from '@/types'
import { getTaskGroupStatuses, isPatientComplete, getAvailableTasks } from '@/lib/taskEngine'

const GROUP_LABELS: Record<TaskGroup, string> = {
  NURSING: 'Nursing',
  LAB: 'Laboratory',
  IMAGING: 'Imaging',
  CARDIAC: 'Cardiac',
  CONSULT: 'Consultation',
  OTHER: 'Other',
}

const PKG_COLORS: Record<string, { border: string; bg: string; badge: string; text: string }> = {
  'Silver Health Check':      { border: 'border-gray-300',    bg: 'bg-gray-50',     badge: 'bg-gray-200 text-gray-700',       text: 'text-gray-800' },
  'Gold Health Check':        { border: 'border-amber-300',   bg: 'bg-amber-50',    badge: 'bg-amber-100 text-amber-800',     text: 'text-amber-800' },
  'Platinum Health Check':    { border: 'border-violet-300',  bg: 'bg-violet-50',   badge: 'bg-violet-200 text-violet-800',   text: 'text-violet-800' },
  'Diamond Health Check':     { border: 'border-cyan-300',    bg: 'bg-cyan-50',     badge: 'bg-cyan-100 text-cyan-800',       text: 'text-cyan-800' },
  'Femina Essentialis Check': { border: 'border-pink-300',    bg: 'bg-pink-50',     badge: 'bg-pink-100 text-pink-800',       text: 'text-pink-800' },
  'Cardiac Health Check':     { border: 'border-rose-400',    bg: 'bg-rose-50',     badge: 'bg-rose-200 text-rose-900',       text: 'text-rose-900' },
  'Child Health Check':       { border: 'border-emerald-300', bg: 'bg-emerald-50',  badge: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-800' },
}

const DEFAULT_PKG_COLOR = { border: 'border-gray-200', bg: 'bg-white', badge: 'bg-gray-100 text-gray-600', text: 'text-gray-700' }

function TaskIcon({ status }: { status: PatientTask['status'] }) {
  if (status === 'COMPLETED') return <CheckCircle2 className="w-5 h-5 text-green-600" />
  if (status === 'IN_PROGRESS') return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
  if (status === 'DELAYED') return <AlertCircle className="w-5 h-5 text-red-600" />
  return <Circle className="w-5 h-5 text-gray-400" />
}

function useElapsedTimer(checkedInAt: string | null) {
  const [elapsed, setElapsed] = useState('')
  useEffect(() => {
    if (!checkedInAt) return
    function update() {
      const diff = Math.max(0, Math.floor((Date.now() - new Date(checkedInAt!).getTime()) / 1000))
      const h = Math.floor(diff / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      setElapsed(h > 0 ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s` : `${m}m ${String(s).padStart(2, '0')}s`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [checkedInAt])
  return elapsed
}

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { getPatientById, startTask, completeTask, skipTask, cancelTask, deletePatient, checkInPatient, undoCheckIn, state, updatePatientPackage } = useApp()
  const patient = getPatientById(id!)
  const elapsed = useElapsedTimer(patient?.checked_in_at ?? null)
  const [billingTaskId, setBillingTaskId] = useState<string | null>(null)
  const [billingPkgSearch, setBillingPkgSearch] = useState('')

  const filteredBillingPackages = useMemo(() => {
    if (!billingPkgSearch.trim()) return state.packages
    const q = billingPkgSearch.toLowerCase()
    return state.packages.filter((p) => p.name.toLowerCase().includes(q))
  }, [billingPkgSearch, state.packages])

  if (!patient) {
    return <EmptyState message="Patient not found" />
  }

  const tasks = patient.tasks
  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length
  const mandatoryTasks = tasks.filter((t) => t.is_mandatory)
  const mandatoryCompleted = mandatoryTasks.filter((t) => t.status === 'COMPLETED').length
  const totalTasks = tasks.length
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
  const allComplete = isPatientComplete(tasks)

  const groupStatuses = getTaskGroupStatuses(tasks)

  const availableTaskIds = new Set(getAvailableTasks(tasks, !!patient.checked_in_at).map((t) => t.id))

  // Group tasks by task_group
  const tasksByGroup = tasks.reduce<Record<string, PatientTask[]>>((acc, t) => {
    ;(acc[t.task_group] = acc[t.task_group] || []).push(t)
    return acc
  }, {})

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900">{patient.name}</h2>
            <PriorityBadge priority={patient.priority} />
            {allComplete && (
              <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                Complete
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            UHID: {patient.uhid} &bull; {patient.package_name || <span className="italic text-gray-400">No package selected</span>}
          </p>
          {patient.checked_in_at ? (
            <div className="flex items-center gap-1.5 mt-1">
              <LogIn className="w-3.5 h-3.5 text-primary-500" />
              <span className="text-xs text-gray-500">
                Checked in at{' '}
                <span className="font-medium text-gray-700">
                  {new Date(patient.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                </span>
              </span>
              <span className="text-gray-300">|</span>
              <Timer className="w-3.5 h-3.5 text-primary-500" />
              <span className="text-xs font-mono font-medium text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full">
                {elapsed || '0m 00s'}
              </span>
              <span className="text-xs text-gray-400">elapsed</span>
              <button
                onClick={() => undoCheckIn(patient.id)}
                className="inline-flex items-center gap-1 ml-2 px-2.5 py-1 text-xs font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
              >
                <LogOut className="w-3 h-3" /> Undo Check-In
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs text-gray-400">Not checked in</span>
              <button
                onClick={() => checkInPatient(patient.id)}
                className="inline-flex items-center gap-1 ml-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" /> Check In
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => {
            if (confirm('Are you sure you want to delete this patient? This cannot be undone.')) {
              deletePatient(patient.id)
              navigate('/')
            }
          }}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Progress</span>
          <span className="text-sm text-gray-500">
            {completedTasks}/{totalTasks} tasks ({progressPct}%) &bull; Mandatory: {mandatoryCompleted}/{mandatoryTasks.length}
          </span>
        </div>
        <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Group status overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {groupStatuses.map((gs) => (
          <div
            key={gs.group}
            className={clsx(
              'rounded-lg border p-3',
              gs.status === 'COMPLETED' && 'border-green-200 bg-green-50',
              gs.status === 'IN_PROGRESS' && 'border-blue-200 bg-blue-50',
              gs.status === 'DELAYED' && 'border-red-200 bg-red-50',
              gs.status === 'NOT_STARTED' && 'border-gray-200 bg-gray-50'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-900">{GROUP_LABELS[gs.group]}</span>
              <StatusBadge status={gs.status} />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {gs.completed}/{gs.total} done
              {gs.in_progress > 0 && ` \u2022 ${gs.in_progress} active`}
              {gs.delayed > 0 && ` \u2022 ${gs.delayed} delayed`}
            </p>
          </div>
        ))}
      </div>

      {/* Tasks by Group */}
      <div className="space-y-4">
        {Object.entries(tasksByGroup).map(([group, groupTasks]) => (
          <div key={group} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">
                {GROUP_LABELS[group as TaskGroup]}
              </h3>
              <span className="text-xs text-gray-400">
                {groupTasks.filter((t) => t.status === 'COMPLETED').length}/{groupTasks.length}
              </span>
            </div>
            <div className="divide-y divide-gray-50">
              {groupTasks.map((task) => {
                const duration =
                  task.started_at && task.completed_at
                    ? Math.round(
                        (new Date(task.completed_at).getTime() - new Date(task.started_at).getTime()) / 60000
                      )
                    : null
                const elapsed = task.started_at && !task.completed_at
                  ? Math.round((Date.now() - new Date(task.started_at).getTime()) / 60000)
                  : null

                return (
                  <div key={task.id} className="px-4 py-3 flex items-center gap-3">
                    <div
                      className={clsx(
                        'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                        task.status === 'COMPLETED' && 'bg-green-100',
                        task.status === 'IN_PROGRESS' && 'bg-blue-100',
                        task.status === 'DELAYED' && 'bg-red-100',
                        task.status === 'NOT_STARTED' && 'bg-gray-100'
                      )}
                    >
                      <TaskIcon status={task.status} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{task.step_name}</span>
                        {!task.is_mandatory && (
                          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            Optional
                          </span>
                        )}
                        {task.skipped && (
                          <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <SkipForward className="w-3 h-3" /> Skipped
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-3">
                        {task.started_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(task.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                          </span>
                        )}
                        {task.completed_at && duration !== null && (
                          <span className="text-green-600">{duration} min</span>
                        )}
                        {task.status === 'IN_PROGRESS' && elapsed !== null && (
                          <span className="text-blue-600 font-medium">In progress {elapsed} min</span>
                        )}
                        {task.status === 'DELAYED' && elapsed !== null && (
                          <span className="text-red-600 font-medium">Delayed {elapsed} min</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {task.status === 'NOT_STARTED' && availableTaskIds.has(task.id) && (
                        <button
                          onClick={() => startTask(task.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                        >
                          <Play className="w-3 h-3" /> Start
                        </button>
                      )}
                      {task.status === 'DELAYED' && (
                        <button
                          onClick={() => startTask(task.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                        >
                          <Play className="w-3 h-3" /> Resume
                        </button>
                      )}
                      {(task.status === 'IN_PROGRESS' || task.status === 'DELAYED') && (
                        <>
                          <button
                            onClick={() => {
                              if (task.step_name === 'Billing') {
                                setBillingTaskId(task.id)
                              } else {
                                completeTask(task.id)
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                          >
                            <CheckCircle2 className="w-3 h-3" /> Complete
                          </button>
                          <button
                            onClick={() => cancelTask(task.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                          >
                            <XCircle className="w-3 h-3" /> Close
                          </button>
                          <button
                            onClick={() => skipTask(task.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                          >
                            <SkipForward className="w-3 h-3" /> Skip
                          </button>
                        </>
                      )}
                      <StatusBadge status={task.status} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Package Selection Modal for Billing */}
      {billingTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">Select Package</h3>
              <button
                onClick={() => { setBillingTaskId(null); setBillingPkgSearch('') }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
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
                const colors = PKG_COLORS[pkg.name] || DEFAULT_PKG_COLOR
                const isCurrent = pkg.id === patient.package_id
                return (
                  <button
                    key={pkg.id}
                    onClick={() => {
                      if (!isCurrent) {
                        updatePatientPackage(patient.id, pkg.id)
                      } else {
                        completeTask(billingTaskId)
                      }
                      setBillingTaskId(null)
                      setBillingPkgSearch('')
                    }}
                    className={clsx(
                      'w-full text-left px-4 py-3 rounded-xl border-2 transition-all flex items-center justify-between',
                      colors.border, colors.bg,
                      'hover:shadow-md hover:scale-[1.01] active:scale-100'
                    )}
                  >
                    <span className={clsx('text-sm font-semibold', colors.text)}>{pkg.name}</span>
                    {isCurrent && (
                      <span className={clsx('text-xs font-medium px-2.5 py-1 rounded-full', colors.badge)}>
                        Current
                      </span>
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
    </div>
  )
}
