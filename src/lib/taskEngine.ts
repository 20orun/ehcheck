import type { PatientTask, TaskStatus, TaskGroup, TaskScore, TaskGroupStatus, Patient } from '@/types'

// ─── Task Group Mapping ──────────────────────────────
// Maps department_id → TaskGroup for the routing engine
const DEPT_TO_GROUP: Record<string, TaskGroup> = {
  'dept-reg': 'OTHER',
  'dept-lab': 'LAB',
  'dept-rad': 'IMAGING',
  'dept-card': 'CARDIAC',
  'dept-pulm': 'OTHER',
  'dept-phys': 'CONSULT',
  'dept-rev': 'CONSULT',
}

export function getDeptTaskGroup(departmentId: string): TaskGroup {
  return DEPT_TO_GROUP[departmentId] || 'OTHER'
}

// ─── Priority Weights ────────────────────────────────
const GROUP_PRIORITY_WEIGHT: Record<TaskGroup, number> = {
  NURSING: 1,
  LAB: 3,
  IMAGING: 4,
  CARDIAC: 4,
  OTHER: 5,
  CONSULT: 8,
}

// ─── Status Transitions ─────────────────────────────
const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  NOT_STARTED: ['IN_PROGRESS', 'DELAYED'],
  IN_PROGRESS: ['COMPLETED', 'DELAYED', 'NOT_STARTED'],
  DELAYED: ['IN_PROGRESS', 'NOT_STARTED'],
  COMPLETED: [],
}

export function isValidTransition(from: TaskStatus, to: TaskStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

// ─── Prerequisite Check ─────────────────────────────
// CONSULT tasks require ALL mandatory LAB + IMAGING + CARDIAC tasks COMPLETED
export function arePrerequisitesMet(task: PatientTask, allPatientTasks: PatientTask[]): boolean {
  if (task.task_group !== 'CONSULT') return true

  const prereqGroups: TaskGroup[] = ['LAB', 'IMAGING', 'CARDIAC']
  const mandatoryPrereqs = allPatientTasks.filter(
    (t) => prereqGroups.includes(t.task_group) && t.is_mandatory
  )

  return mandatoryPrereqs.every((t) => t.status === 'COMPLETED')
}

// ─── Hard Constraint: One task per department per patient ─
export function canStartInDepartment(
  departmentId: string,
  patientId: string,
  allPatientTasks: PatientTask[]
): boolean {
  return !allPatientTasks.some(
    (t) =>
      t.patient_id === patientId &&
      t.department_id === departmentId &&
      t.status === 'IN_PROGRESS'
  )
}

// ─── Get Available Tasks (not completed, eligible to start) ─
export function getAvailableTasks(patientTasks: PatientTask[], checkedIn: boolean = false): PatientTask[] {
  // Nothing can start until the patient is checked in
  if (!checkedIn) return []

  const billingTask = patientTasks.find((t) => t.step_name === 'Billing')
  const billingComplete = billingTask?.status === 'COMPLETED'

  // Enforce: only one task IN_PROGRESS per patient at a time
  const hasActiveTask = patientTasks.some((t) => t.status === 'IN_PROGRESS')

  const incomplete = patientTasks.filter((t) => t.status !== 'COMPLETED')
  return incomplete.filter((t) => {
    // Until Billing is completed, only Billing itself can be started
    if (!billingComplete && t.step_name !== 'Billing') return false
    // Exclude CONSULT tasks if prerequisites not met
    if (!arePrerequisitesMet(t, patientTasks)) return false
    // Only NOT_STARTED or DELAYED tasks can be started
    if (t.status === 'IN_PROGRESS') return false
    // If another task is already in progress, don't allow starting a new one
    if (hasActiveTask) return false
    // Check one-per-department constraint
    if (!canStartInDepartment(t.department_id, t.patient_id, patientTasks)) return false
    return true
  })
}

// ─── Department Queue Stats ──────────────────────────
export interface DeptQueueStats {
  queue_length: number
  avg_wait_time: number
}

export function getDeptQueueStats(
  departmentId: string,
  allTasks: PatientTask[]
): DeptQueueStats {
  const deptTasks = allTasks.filter((t) => t.department_id === departmentId)
  const waiting = deptTasks.filter(
    (t) => t.status === 'NOT_STARTED' || t.status === 'DELAYED'
  )
  const inProgress = deptTasks.filter((t) => t.status === 'IN_PROGRESS')
  const completed = deptTasks.filter(
    (t) => t.status === 'COMPLETED' && t.started_at && t.completed_at
  )

  const avgWait =
    completed.length > 0
      ? completed.reduce((sum, t) => {
          return (
            sum +
            (new Date(t.completed_at!).getTime() - new Date(t.started_at!).getTime()) / 60000
          )
        }, 0) / completed.length
      : 10 // default 10 min estimate

  return {
    queue_length: waiting.length + inProgress.length,
    avg_wait_time: avgWait,
  }
}

// ─── Next Best Task Selection Engine ─────────────────
// score = (queue_length * 2) + (avg_wait_time * 1.5) + (task_priority_weight)
// VIP: score *= 0.7
// Returns task with LOWEST score
export function getNextBestTask(
  patientId: string,
  patientTasks: PatientTask[],
  allTasks: PatientTask[],
  patient: Patient
): TaskScore | null {
  const myTasks = patientTasks.filter((t) => t.patient_id === patientId)
  const available = getAvailableTasks(myTasks, !!patient.checked_in_at)

  if (available.length === 0) return null

  const scored: TaskScore[] = available.map((task) => {
    const deptStats = getDeptQueueStats(task.department_id, allTasks)
    const priorityWeight = GROUP_PRIORITY_WEIGHT[task.task_group] || 5

    let score =
      deptStats.queue_length * 2 +
      deptStats.avg_wait_time * 1.5 +
      priorityWeight

    // VIP bonus: lower score = higher priority
    if (patient.priority === 'VIP') {
      score = score * 0.7
    }

    return {
      task,
      score,
      queue_length: deptStats.queue_length,
      avg_wait_time: deptStats.avg_wait_time,
    }
  })

  // Sort by step_order for natural patient journey flow, then score
  scored.sort((a, b) => {
    if (a.task.step_order !== b.task.step_order) return a.task.step_order - b.task.step_order
    return a.score - b.score
  })

  return scored[0] || null
}

// ─── Patient Completion Logic ────────────────────────
export function isPatientComplete(tasks: PatientTask[]): boolean {
  return tasks
    .filter((t) => t.is_mandatory)
    .every((t) => t.status === 'COMPLETED')
}

// ─── Group Status Derivation ─────────────────────────
// IF all tasks COMPLETED → COMPLETED
// ELSE IF any IN_PROGRESS → IN_PROGRESS
// ELSE IF any DELAYED → DELAYED
// ELSE → NOT_STARTED
export function deriveGroupStatus(tasks: PatientTask[]): TaskStatus {
  if (tasks.length === 0) return 'NOT_STARTED'
  if (tasks.every((t) => t.status === 'COMPLETED')) return 'COMPLETED'
  if (tasks.some((t) => t.status === 'IN_PROGRESS')) return 'IN_PROGRESS'
  if (tasks.some((t) => t.status === 'DELAYED')) return 'DELAYED'
  return 'NOT_STARTED'
}

export function getTaskGroupStatuses(tasks: PatientTask[]): TaskGroupStatus[] {
  const groups: TaskGroup[] = ['NURSING', 'LAB', 'IMAGING', 'CARDIAC', 'CONSULT', 'OTHER']

  return groups
    .map((group) => {
      const groupTasks = tasks.filter((t) => t.task_group === group)
      if (groupTasks.length === 0) return null
      return {
        group,
        status: deriveGroupStatus(groupTasks),
        total: groupTasks.length,
        completed: groupTasks.filter((t) => t.status === 'COMPLETED').length,
        in_progress: groupTasks.filter((t) => t.status === 'IN_PROGRESS').length,
        delayed: groupTasks.filter((t) => t.status === 'DELAYED').length,
      }
    })
    .filter((g): g is TaskGroupStatus => g !== null)
}

// ─── Auto-Delay Detection ────────────────────────────
export function getTasksToDelay(
  tasks: PatientTask[],
  thresholdMinutes: number
): PatientTask[] {
  const now = Date.now()
  const threshold = thresholdMinutes * 60 * 1000

  return tasks.filter((t) => {
    if (t.status !== 'IN_PROGRESS' || !t.started_at) return false
    const elapsed = now - new Date(t.started_at).getTime()
    return elapsed > threshold
  })
}
