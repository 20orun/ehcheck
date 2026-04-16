// ─── Enums ───────────────────────────────────────────
export type Priority = 'NORMAL' | 'VIP'

export type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED'

export type TaskGroup = 'BILLING' | 'CHECK_IN' | 'NURSING' | 'PHLEB' | 'USG' | 'BREAKFAST' | 'PPBS' | 'XRAY' | 'MAMMO' | 'BMD' | 'ECG' | 'ECHO' | 'TMT' | 'PFT' | 'LUNCH' | 'DIET' | 'CONSULT' | 'REVIEW'

// Legacy alias
export type StepStatus = TaskStatus

// ─── Database Row Types ──────────────────────────────
export interface Department {
  id: string
  name: string
  task_group: TaskGroup
}

export interface Package {
  id: string
  name: string
  price: number | null
  tracker_blood_sample: string
  tracker_usg: string
  tracker_breakfast: string
  tracker_ppbs: string
  tracker_xray: string
  tracker_mammography: string
  tracker_bmd: string
  tracker_ecg: string
  tracker_echo: string
  tracker_tmt: string
  tracker_pft: string
  tracker_lunch: string
  tracker_consultation: string
  tracker_dental: string
}

export interface PackageStep {
  id: string
  package_id: string
  step_name: string
  department_id: string
  step_order: number
  task_group: TaskGroup
  is_mandatory: boolean
}

export type DoctorCode = 'S' | 'A' | 'I' | null

export const DOCTORS: { code: 'S' | 'A' | 'I'; name: string }[] = [
  { code: 'S', name: 'Dr Sunny P Orathel' },
  { code: 'A', name: 'Dr Anchu A K' },
  { code: 'I', name: 'Dr Muhamed Ismail' },
]

export interface Patient {
  id: string
  name: string
  uhid: string
  package_id: string | null
  assigned_doctor: DoctorCode
  priority: Priority
  created_at: string
  checked_in_at: string | null
  clinic_date: string // YYYY-MM-DD
}

export interface PatientTask {
  id: string
  patient_id: string
  step_id: string | null
  department_id: string
  task_group: TaskGroup
  status: TaskStatus
  is_mandatory: boolean
  skipped: boolean
  started_at: string | null
  completed_at: string | null
  step_order: number
  step_name: string
}

// Legacy alias
export type PatientStep = PatientTask

// ─── Joined / Enriched Types ─────────────────────────
export interface PatientWithTasks extends Patient {
  tasks: PatientTask[]
  package_name?: string
}

// Legacy alias
export type PatientWithSteps = PatientWithTasks & { steps: PatientTask[] }

export interface TaskGroupStatus {
  group: TaskGroup
  status: TaskStatus
  total: number
  completed: number
  in_progress: number
  delayed: number
}

export interface PatientWithGroupStatuses extends Patient {
  groupStatuses: TaskGroupStatus[]
  overallProgress: number
  waitingMinutes: number
  package_name?: string
  activeTasks: PatientTask[]
}

export interface DepartmentQueueInfo {
  department: Department
  waiting_count: number
  in_progress_count: number
  avg_wait_time: number
}

export interface PatientWithCurrentStep extends Patient {
  currentStep: PatientTask | null
  activeTasks: PatientTask[]
  groupStatuses: TaskGroupStatus[]
  waitingMinutes: number
  package_name?: string
}

export interface Alert {
  id: string
  type: 'DELAY' | 'QUEUE_OVERFLOW' | 'TASK_NOT_STARTED'
  message: string
  patient_id?: string
  department_id?: string
  timestamp: string
  severity: 'warning' | 'critical'
}

// ─── Dashboard KPIs ──────────────────────────────────
export interface DashboardKPIs {
  totalPatients: number
  completed: number
  inProgress: number
  checkedIn: number
  notCheckedIn: number
  delayed: number
  averageTAT: number // minutes
  bottleneckDepartment: string | null
}

// ─── Config ──────────────────────────────────────────
export interface AlertConfig {
  delayThresholdMinutes: number
  queueThreshold: number
  taskNotStartedMinutes: number
}

// ─── Task Scoring ────────────────────────────────────
export interface TaskScore {
  task: PatientTask
  score: number
  queue_length: number
  avg_wait_time: number
}
