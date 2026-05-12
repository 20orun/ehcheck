// ─── Roles ───────────────────────────────────────────
// Stored in user_roles.role column as plain strings.
// Examples: 'admin', 'coordinator', 'department:dept-lab', 'doctor:S'
export type AppRole = string

export function parseRole(role: AppRole | null): {
  isAdmin: boolean
  isCoordinator: boolean
  isCheckIn: boolean
  isDepartment: boolean
  isDoctor: boolean
  departmentId: string | null
  doctorCode: string | null
} {
  if (!role) {
    return { isAdmin: false, isCoordinator: false, isCheckIn: false, isDepartment: false, isDoctor: false, departmentId: null, doctorCode: null }
  }
  if (role === 'admin') return { isAdmin: true, isCoordinator: false, isCheckIn: false, isDepartment: false, isDoctor: false, departmentId: null, doctorCode: null }
  if (role === 'coordinator') return { isAdmin: false, isCoordinator: true, isCheckIn: false, isDepartment: false, isDoctor: false, departmentId: null, doctorCode: null }
  if (role === 'checkin') return { isAdmin: false, isCoordinator: false, isCheckIn: true, isDepartment: false, isDoctor: false, departmentId: null, doctorCode: null }
  // Billing department gets full coordinator access; home page stays at /department/dept-reg
  if (role === 'department:dept-reg') return { isAdmin: false, isCoordinator: true, isCheckIn: false, isDepartment: true, isDoctor: false, departmentId: 'dept-reg', doctorCode: null }
  if (role.startsWith('department:')) {
    const departmentId = role.slice('department:'.length)
    return { isAdmin: false, isCoordinator: false, isCheckIn: false, isDepartment: true, isDoctor: false, departmentId, doctorCode: null }
  }
  if (role.startsWith('doctor:')) {
    const doctorCode = role.slice('doctor:'.length)
    return { isAdmin: false, isCoordinator: false, isCheckIn: false, isDepartment: false, isDoctor: true, departmentId: null, doctorCode }
  }
  return { isAdmin: false, isCoordinator: false, isCheckIn: false, isDepartment: false, isDoctor: false, departmentId: null, doctorCode: null }
}

// ─── Enums ───────────────────────────────────────────
export type Priority = 'NORMAL' | 'VIP'

export type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED'

export type TaskGroup = 'BILLING' | 'CHECK_IN' | 'NURSING' | 'PHLEB' | 'USG' | 'BREAKFAST' | 'PPBS' | 'XRAY' | 'MAMMO' | 'BMD' | 'ECG' | 'ECHO' | 'TMT' | 'PFT' | 'LUNCH' | 'DIET' | 'GYNECOLOGY' | 'CONSULT' | 'REVIEW'

// Legacy alias
export type StepStatus = TaskStatus

// ─── Database Row Types ──────────────────────────────
export interface Department {
  id: string
  name: string
  task_group: TaskGroup
  is_offline: boolean
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
  tracker_gynecology: string
  consultation_departments: string[]
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
  phone: string | null
  package_id: string | null
  assigned_doctor: DoctorCode
  priority: Priority
  is_international: boolean
  created_at: string
  checked_in_at: string | null
  clinic_date: string // YYYY-MM-DD
  group_id: string | null  // set when patients check in together
  ppbs_time: string | null
  tracker_cell_states: Record<string, string>  // 'tick' | 'yellow' per tracker column key
  is_new: boolean
  is_registered: boolean
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

// ─── Cross Consultations ─────────────────────────────
export type CrossConsultationStatus = 'BOOKED' | 'IN_PROGRESS' | 'COMPLETED'

export interface CrossConsultation {
  id: string
  patient_id: string
  department_name: string
  doctor_name: string
  status: CrossConsultationStatus
  notes: string
  created_at: string
}

export interface TrackerHighlightedCell {
  id: string
  patient_id: string
  consultation_index: number
  created_at: string
}
