import { createContext, useContext, useReducer, useCallback, type ReactNode, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  Patient,
  PatientTask,
  PatientWithTasks,
  PatientWithCurrentStep,
  DashboardKPIs,
  Alert,
  AlertConfig,
  TaskStatus,
  TaskGroup,
  Priority,
  Department,
  DoctorCode,
  Package,
  PackageStep,
  CrossConsultation,
  CrossConsultationStatus,
} from '@/types'
import {
  DEFAULT_ALERT_CONFIG,
} from '@/data/mock'
import {
  isPatientComplete,
  getTaskGroupStatuses,
  getTasksToDelay,
  getNextBestTask,
  getAvailableTasks,
  arePrerequisitesMet,
  canStartInDepartment,
} from '@/lib/taskEngine'
import {
  loadAllData,
  resetAllData,
  fetchClinicDates,
  insertPatient as dbInsertPatient,
  insertPatientTasks as dbInsertPatientTasks,
  updateTaskStatus as dbUpdateTaskStatus,
  skipTaskInDb,
  updatePatientPriority as dbUpdatePatientPriority,
  checkInPatientDb,
  updatePatientGroupDb,
  undoCheckInDb,
  deletePatientDb,
  cancelTaskDb,
  updateTaskTimesDb,
  updatePatientPackageDb,
  updateAssignedDoctorDb,
  insertPackageDb,
  updatePackageDb,
  insertPackageStepsDb,
  deletePackageStepsDb,
  fetchCrossConsultations,
  insertCrossConsultationDb,
  updateCrossConsultationStatusDb,
  updateCrossConsultationDb,
  deleteCrossConsultationDb,
  updateDeptOfflineStatus,
  fetchDoctorStatuses,
  updateDoctorOfflineStatus,
  updatePatientInfoDb,
  updatePatientInternationalDb,
  updatePatientPpbsTimeDb,
  updateTrackerCellStateDb,
  updatePatientNewDb,
  updatePatientRegisteredDb,
} from '@/lib/db'
import { initServerTimeOffset, nowISO, todayISTStr } from '@/lib/serverTime'

// ─── State ───────────────────────────────────────────
interface AppState {
  patients: Patient[]
  patientTasks: PatientTask[]
  departments: Department[]
  packages: Package[]
  packageSteps: PackageStep[]
  alertConfig: AlertConfig
  crossConsultations: CrossConsultation[]
  doctorStatuses: Record<string, boolean>
}

type Action =
  | { type: 'SET_PATIENTS'; payload: Patient[] }
  | { type: 'ADD_PATIENT'; payload: { patient: Patient; tasks: PatientTask[] } }
  | { type: 'UPDATE_TASK_STATUS'; payload: { taskId: string; status: TaskStatus; timestamp: string } }
  | { type: 'SET_PATIENT_TASKS'; payload: PatientTask[] }
  | { type: 'SKIP_TASK'; payload: { taskId: string; timestamp: string } }
  | { type: 'SET_PRIORITY'; payload: { patientId: string; priority: Priority } }
  | { type: 'CHECK_IN'; payload: { patientId: string; timestamp: string; groupId?: string } }
  | { type: 'UNDO_CHECK_IN'; payload: { patientId: string } }
  | { type: 'UPDATE_GROUP'; payload: { patientId: string; groupId: string | null } }
  | { type: 'DELETE_PATIENT'; payload: { patientId: string } }
  | { type: 'CANCEL_TASK'; payload: { taskId: string } }
  | { type: 'UPDATE_TASK_TIMES'; payload: { taskId: string; startedAt: string | null; completedAt: string | null } }
  | { type: 'UPDATE_PATIENT_PACKAGE'; payload: { patientId: string; packageId: string; tasks: PatientTask[]; assignedDoctor?: DoctorCode } }
  | { type: 'ADD_PACKAGE'; payload: { pkg: Package; steps: PackageStep[] } }
  | { type: 'UPDATE_PACKAGE'; payload: { pkg: Package; steps: PackageStep[] } }
  | { type: 'UPDATE_ASSIGNED_DOCTOR'; payload: { patientId: string; doctor: DoctorCode } }
  | { type: 'UPDATE_ALERT_CONFIG'; payload: Partial<AlertConfig> }
  | { type: 'SET_ALL_DATA'; payload: { patients: Patient[]; patientTasks: PatientTask[]; departments: Department[]; packages: Package[]; packageSteps: PackageStep[] } }
  | { type: 'SET_CROSS_CONSULTATIONS'; payload: CrossConsultation[] }
  | { type: 'ADD_CROSS_CONSULTATION'; payload: CrossConsultation }
  | { type: 'UPDATE_CROSS_CONSULTATION_STATUS'; payload: { id: string; status: CrossConsultationStatus } }
  | { type: 'UPDATE_CROSS_CONSULTATION'; payload: CrossConsultation }
  | { type: 'DELETE_CROSS_CONSULTATION'; payload: { id: string } }
  | { type: 'UPDATE_DEPT_OFFLINE'; payload: { deptId: string; isOffline: boolean } }
  | { type: 'UPSERT_PATIENT'; payload: Patient }
  | { type: 'UPSERT_TASK'; payload: PatientTask }
  | { type: 'UPDATE_PATIENT_INFO'; payload: { patientId: string; name: string; uhid: string; phone: string | null } }
  | { type: 'UPDATE_PATIENT_INTERNATIONAL'; payload: { patientId: string; isInternational: boolean } }
  | { type: 'UPDATE_PATIENT_PPBS_TIME'; payload: { patientId: string; ppbsTime: string | null } }
  | { type: 'UPDATE_PATIENT_NEW'; payload: { patientId: string; isNew: boolean } }
  | { type: 'UPDATE_PATIENT_REGISTERED'; payload: { patientId: string; isRegistered: boolean } }
  | { type: 'UPDATE_TRACKER_CELL_STATE'; payload: { patientId: string; cellKey: string; value: string | null } }
  | { type: 'SET_DOCTOR_STATUSES'; payload: Record<string, boolean> }
  | { type: 'UPDATE_DOCTOR_OFFLINE'; payload: { code: string; isOffline: boolean } }
  | { type: 'REMOVE_TASK'; payload: { taskId: string } }
  | { type: 'UPSERT_PACKAGE'; payload: Package }
  | { type: 'DELETE_PACKAGE'; payload: { id: string } }
  | { type: 'UPSERT_PACKAGE_STEP'; payload: PackageStep }
  | { type: 'DELETE_PACKAGE_STEP'; payload: { id: string } }

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_PATIENTS':
      return { ...state, patients: action.payload }
    case 'ADD_PATIENT': {
      // Guard against duplicate patient IDs
      if (state.patients.some((p) => p.id === action.payload.patient.id)) {
        return state
      }
      return {
        ...state,
        patients: [...state.patients, action.payload.patient],
        patientTasks: [...state.patientTasks, ...action.payload.tasks],
      }
    }
    case 'UPDATE_TASK_STATUS': {
      const { taskId, status, timestamp } = action.payload
      return {
        ...state,
        patientTasks: state.patientTasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status,
                started_at: status === 'IN_PROGRESS' ? timestamp : t.started_at,
                completed_at: status === 'COMPLETED' ? timestamp : t.completed_at,
              }
            : t
        ),
      }
    }
    case 'SET_PATIENT_TASKS':
      return { ...state, patientTasks: action.payload }
    case 'SKIP_TASK': {
      return {
        ...state,
        patientTasks: state.patientTasks.map((t) =>
          t.id === action.payload.taskId
            ? { ...t, status: 'COMPLETED' as TaskStatus, completed_at: action.payload.timestamp, started_at: t.started_at || action.payload.timestamp, skipped: true }
            : t
        ),
      }
    }
    case 'SET_PRIORITY':
      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === action.payload.patientId ? { ...p, priority: action.payload.priority } : p
        ),
      }
    case 'CHECK_IN':
      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === action.payload.patientId
            ? { ...p, checked_in_at: action.payload.timestamp, ...(action.payload.groupId ? { group_id: action.payload.groupId } : {}) }
            : p
        ),
      }
    case 'UPDATE_GROUP':
      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === action.payload.patientId ? { ...p, group_id: action.payload.groupId ?? null } : p
        ),
      }
    case 'UNDO_CHECK_IN':
      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === action.payload.patientId
            ? { ...p, checked_in_at: null }
            : p
        ),
        patientTasks: state.patientTasks.map((t) =>
          t.patient_id === action.payload.patientId
            ? { ...t, status: 'NOT_STARTED' as TaskStatus, started_at: null, completed_at: null, skipped: false }
            : t
        ),
      }
    case 'DELETE_PATIENT':
      return {
        ...state,
        patients: state.patients.filter((p) => p.id !== action.payload.patientId),
        patientTasks: state.patientTasks.filter((t) => t.patient_id !== action.payload.patientId),
      }
    case 'CANCEL_TASK':
      return {
        ...state,
        patientTasks: state.patientTasks.map((t) =>
          t.id === action.payload.taskId
            ? { ...t, status: 'NOT_STARTED' as TaskStatus, started_at: null, completed_at: null }
            : t
        ),
      }
    case 'UPDATE_TASK_TIMES':
      return {
        ...state,
        patientTasks: state.patientTasks.map((t) =>
          t.id === action.payload.taskId
            ? { ...t, started_at: action.payload.startedAt, completed_at: action.payload.completedAt }
            : t
        ),
      }
    case 'UPDATE_PATIENT_PACKAGE': {
      const { patientId, packageId, tasks: newTasks, assignedDoctor } = action.payload
      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === patientId ? { ...p, package_id: packageId, ...(assignedDoctor !== undefined ? { assigned_doctor: assignedDoctor } : {}) } : p
        ),
        patientTasks: [
          ...state.patientTasks.filter((t) => t.patient_id !== patientId),
          ...newTasks,
        ],
      }
    }
    case 'UPDATE_ASSIGNED_DOCTOR':
      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === action.payload.patientId ? { ...p, assigned_doctor: action.payload.doctor } : p
        ),
      }
    case 'UPDATE_ALERT_CONFIG':
      return { ...state, alertConfig: { ...state.alertConfig, ...action.payload } }
    case 'ADD_PACKAGE':
      return {
        ...state,
        packages: [...state.packages, action.payload.pkg],
        packageSteps: [...state.packageSteps, ...action.payload.steps],
      }
    case 'UPDATE_PACKAGE':
      return {
        ...state,
        packages: state.packages.map((p) =>
          p.id === action.payload.pkg.id ? action.payload.pkg : p
        ),
        packageSteps: [
          ...state.packageSteps.filter((s) => s.package_id !== action.payload.pkg.id),
          ...action.payload.steps,
        ],
      }
    case 'SET_ALL_DATA':
      return {
        ...state,
        patients: action.payload.patients,
        patientTasks: action.payload.patientTasks,
        departments: action.payload.departments,
        packages: action.payload.packages,
        packageSteps: action.payload.packageSteps,
      }
    case 'SET_CROSS_CONSULTATIONS':
      return { ...state, crossConsultations: action.payload }
    case 'ADD_CROSS_CONSULTATION':
      // Guard against duplicates (optimistic local add + realtime echo)
      if (state.crossConsultations.some((cc) => cc.id === action.payload.id)) return state
      return { ...state, crossConsultations: [...state.crossConsultations, action.payload] }
    case 'UPDATE_CROSS_CONSULTATION_STATUS':
      return {
        ...state,
        crossConsultations: state.crossConsultations.map((cc) =>
          cc.id === action.payload.id ? { ...cc, status: action.payload.status } : cc
        ),
      }
    case 'UPDATE_CROSS_CONSULTATION':
      return {
        ...state,
        crossConsultations: state.crossConsultations.map((cc) =>
          cc.id === action.payload.id ? action.payload : cc
        ),
      }
    case 'DELETE_CROSS_CONSULTATION':
      return {
        ...state,
        crossConsultations: state.crossConsultations.filter((cc) => cc.id !== action.payload.id),
      }
    case 'UPDATE_DEPT_OFFLINE':
      return {
        ...state,
        departments: state.departments.map((d) =>
          d.id === action.payload.deptId ? { ...d, is_offline: action.payload.isOffline } : d
        ),
      }
    case 'UPDATE_PATIENT_INFO':
      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === action.payload.patientId
            ? { ...p, name: action.payload.name, uhid: action.payload.uhid, phone: action.payload.phone }
            : p
        ),
      }
    case 'UPDATE_PATIENT_INTERNATIONAL':
      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === action.payload.patientId
            ? { ...p, is_international: action.payload.isInternational }
            : p
        ),
      }
    case 'UPDATE_PATIENT_PPBS_TIME':
      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === action.payload.patientId
            ? { ...p, ppbs_time: action.payload.ppbsTime }
            : p
        ),
      }
    case 'UPDATE_PATIENT_NEW':
      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === action.payload.patientId
            ? { ...p, is_new: action.payload.isNew }
            : p
        ),
      }
    case 'UPDATE_PATIENT_REGISTERED':
      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === action.payload.patientId
            ? { ...p, is_registered: action.payload.isRegistered }
            : p
        ),
      }
    case 'UPDATE_TRACKER_CELL_STATE': {
      const { patientId, cellKey, value } = action.payload
      return {
        ...state,
        patients: state.patients.map((p) => {
          if (p.id !== patientId) return p
          const next = { ...p.tracker_cell_states }
          if (value === null) delete next[cellKey]
          else next[cellKey] = value
          return { ...p, tracker_cell_states: next }
        }),
      }
    }
    case 'UPSERT_PATIENT': {
      const existing = state.patients.find((p) => p.id === action.payload.id)
      if (!existing) {
        console.log('➕ Adding new patient:', action.payload.id)
        return { ...state, patients: [...state.patients, action.payload] }
      }
      // Accept remote state directly - optimistic updates will be confirmed by the echo
      // No need to merge as the remote state is the source of truth
      console.log('🔀 Updating patient with remote state:', {
        patientId: action.payload.id,
        remote: action.payload.tracker_cell_states,
        previousLocal: existing.tracker_cell_states
      })
      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === action.payload.id ? action.payload : p
        ),
      }
    }
    case 'UPSERT_TASK': {
      const exists = state.patientTasks.some((t) => t.id === action.payload.id)
      return {
        ...state,
        patientTasks: exists
          ? state.patientTasks.map((t) => t.id === action.payload.id ? action.payload : t)
          : [...state.patientTasks, action.payload],
      }
    }
    case 'SET_DOCTOR_STATUSES':
      return { ...state, doctorStatuses: action.payload }
    case 'UPDATE_DOCTOR_OFFLINE':
      return {
        ...state,
        doctorStatuses: { ...state.doctorStatuses, [action.payload.code]: action.payload.isOffline },
      }
    case 'REMOVE_TASK':
      return {
        ...state,
        patientTasks: state.patientTasks.filter((t) => t.id !== action.payload.taskId),
      }
    case 'UPSERT_PACKAGE': {
      const exists = state.packages.some((p) => p.id === action.payload.id)
      return {
        ...state,
        packages: exists
          ? state.packages.map((p) => p.id === action.payload.id ? action.payload : p)
          : [...state.packages, action.payload],
      }
    }
    case 'DELETE_PACKAGE':
      return {
        ...state,
        packages: state.packages.filter((p) => p.id !== action.payload.id),
        packageSteps: state.packageSteps.filter((s) => s.package_id !== action.payload.id),
      }
    case 'UPSERT_PACKAGE_STEP': {
      const exists = state.packageSteps.some((s) => s.id === action.payload.id)
      return {
        ...state,
        packageSteps: exists
          ? state.packageSteps.map((s) => s.id === action.payload.id ? action.payload : s)
          : [...state.packageSteps, action.payload],
      }
    }
    case 'DELETE_PACKAGE_STEP':
      return {
        ...state,
        packageSteps: state.packageSteps.filter((s) => s.id !== action.payload.id),
      }
    default:
      return state
  }
}

// ─── Context ─────────────────────────────────────────
interface AppContextType {
  state: AppState
  dispatch: React.Dispatch<Action>
  loading: boolean
  error: string | null
  selectedDate: string  // YYYY-MM-DD
  isViewingPastDate: boolean
  clinicDates: string[]
  setSelectedDate: (date: string) => void
  // Derived data
  getPatientsWithTasks: () => PatientWithTasks[]
  getPatientsWithCurrentStep: () => PatientWithCurrentStep[]
  getPatientById: (id: string) => PatientWithTasks | undefined
  getDashboardKPIs: () => DashboardKPIs
  getAlerts: () => Alert[]
  getDepartmentQueue: (departmentId: string) => PatientWithCurrentStep[]
  getDepartmentStats: (departmentId: string) => { waiting: number; remaining: number; active: number; avgTime: number }
  getNextTask: (patientId: string) => PatientTask | null
  // Actions
  registerPatient: (name: string, uhid: string, phone: string | null, packageId: string | null, priority: Priority) => void
  checkInNewPatient: (name: string) => void
  updatePatientGroup: (patientId: string, groupId: string | null) => void
  updatePatientInfo: (patientId: string, name: string, uhid: string, phone: string | null) => void
  updatePatientInternational: (patientId: string, isInternational: boolean) => void
  updatePatientNew: (patientId: string, isNew: boolean) => void
  updatePatientRegistered: (patientId: string, isRegistered: boolean) => void
  updatePatientPpbsTime: (patientId: string, ppbsTime: string | null) => Promise<void>
  updateTrackerCellState: (patientId: string, cellKey: string, value: string | null, currentStates: Record<string, string>) => Promise<void>
  startTask: (taskId: string) => void
  startConsultTask: (taskId: string, doctorCode: DoctorCode) => void
  completeTask: (taskId: string) => void
  skipTask: (taskId: string) => void
  cancelTask: (taskId: string) => void
  updatePatientPackage: (patientId: string, packageId: string, assignedDoctor?: DoctorCode) => void
  updateAssignedDoctor: (patientId: string, doctor: DoctorCode) => void
  deletePatient: (patientId: string) => void
  setPriority: (patientId: string, priority: Priority) => void
  checkInPatient: (patientId: string, groupId?: string) => void
  checkInGroup: (patientIds: string[]) => void
  assignGroup: (patientIds: string[]) => void
  undoCheckIn: (patientId: string) => void
  updateCheckInTime: (patientId: string, timestamp: string) => void
  updateTaskTimes: (taskId: string, startedAt: string | null, completedAt: string | null) => void
  advancePatient: (patientId: string) => void
  createPackage: (pkg: Package, steps: PackageStep[]) => void
  updatePackage: (pkg: Package, steps: PackageStep[]) => void
  resetData: () => Promise<void>
  holidays: Set<string>
  toggleHoliday: (date: string) => void
  isHoliday: (date: string) => boolean
  // Cross Consultations
  getCrossConsultationsForPatient: (patientId: string) => CrossConsultation[]
  addCrossConsultation: (patientId: string, departmentName: string, doctorName: string, notes?: string) => void
  updateCrossConsultationStatus: (id: string, status: CrossConsultationStatus) => void
  editCrossConsultation: (id: string, departmentName: string, doctorName: string, notes: string) => void
  deleteCrossConsultation: (id: string) => void
  // Department online/offline
  toggleDeptOffline: (deptId: string) => void
  isDeptOffline: (deptId: string) => boolean
  // Doctor online/offline
  toggleDoctorOffline: (code: string) => void
  isDoctorOffline: (code: string) => boolean
  // Legacy aliases
  getPatientsWithSteps: () => PatientWithTasks[]
  startStep: (taskId: string) => void
  completeStep: (taskId: string) => void
  skipStep: (taskId: string) => void
  moveToNextStep: (patientId: string) => void
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    patients: [],
    patientTasks: [],
    departments: [],
    packages: [],
    packageSteps: [],
    alertConfig: DEFAULT_ALERT_CONFIG,
    crossConsultations: [],
    doctorStatuses: {},
  })

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ─── Date-based isolation ────────────────────────
  const getTodayStr = () => todayISTStr()
  const [selectedDate, setSelectedDateRaw] = useState(getTodayStr)
  const [clinicDates, setClinicDates] = useState<string[]>([])
  const [holidays, setHolidays] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('hcheck_holidays')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch { return new Set() }
  })

  const isViewingPastDate = selectedDate !== getTodayStr()

  // Load data from Supabase on mount & when selectedDate changes
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    initServerTimeOffset().catch(() => {})
    Promise.all([
      loadAllData(selectedDate),
      fetchClinicDates(),
    ])
      .then(([data, dates]) => {
        if (cancelled) return
        dispatch({ type: 'SET_ALL_DATA', payload: data })
        setClinicDates(dates)
        const patientIds = data.patients.map((p) => p.id)
        fetchCrossConsultations(patientIds).then((ccs) => {
          if (!cancelled) dispatch({ type: 'SET_CROSS_CONSULTATIONS', payload: ccs })
        }).catch(console.error)
        fetchDoctorStatuses().then((statuses) => {
          if (!cancelled) dispatch({ type: 'SET_DOCTOR_STATUSES', payload: statuses })
        }).catch(console.error)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Failed to load from Supabase:', err)
        setError(err instanceof Error ? err.message : 'Failed to load data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [selectedDate])

  // ─── Supabase Realtime subscriptions ─────────────
  // Keep selectedDate accessible in the handler via a ref to avoid
  // re-subscribing on every date change.
  const selectedDateRef = useRef(selectedDate)
  useEffect(() => { selectedDateRef.current = selectedDate }, [selectedDate])

  useEffect(() => {
    const channel = supabase
      .channel('hcheck-realtime')
      // Department offline toggle
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'departments' },
        (payload) => {
          const d = payload.new as { id: string; name: string; task_group: string; is_offline: boolean }
          dispatch({
            type: 'UPDATE_DEPT_OFFLINE',
            payload: { deptId: d.id, isOffline: d.is_offline },
          })
        }
      )
      // Patient task status changes (started / completed / delayed from any device)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'patient_tasks' },
        (payload) => {
          const t = payload.new as PatientTask
          dispatch({ type: 'UPSERT_TASK', payload: t })
        }
      )
      // New tasks inserted (e.g. package assignment from another device)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'patient_tasks' },
        (payload) => {
          const t = payload.new as PatientTask
          dispatch({ type: 'UPSERT_TASK', payload: t })
        }
      )
      // Tasks deleted (e.g. package change replaces all tasks for a patient)
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'patient_tasks' },
        (payload) => {
          const taskId = (payload.old as { id: string }).id
          if (taskId) dispatch({ type: 'REMOVE_TASK', payload: { taskId } })
        }
      )
      // Patient updates (check-in, priority changes) from another device
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'patients' },
        (payload) => {
          console.log('📡 Received patient UPDATE:', payload)
          const raw = payload.new as Patient & { tracker_cell_states?: Record<string, string> }
          const p: Patient = { ...raw, tracker_cell_states: raw.tracker_cell_states ?? {} }
          console.log('🔄 Dispatching UPSERT_PATIENT:', p.id, p.tracker_cell_states)
          dispatch({ type: 'UPSERT_PATIENT', payload: p })
        }
      )
      // New patient registered from another device — only apply if same clinic date
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'patients' },
        (payload) => {
          const raw = payload.new as Patient & { tracker_cell_states?: Record<string, string> }
          const p: Patient = { ...raw, tracker_cell_states: raw.tracker_cell_states ?? {} }
          if (p.clinic_date === selectedDateRef.current) {
            dispatch({ type: 'UPSERT_PATIENT', payload: p })
          }
        }
      )
      // Doctor online/offline toggle from any device
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'doctor_status' },
        (payload) => {
          const d = payload.new as { code: string; is_offline: boolean }
          dispatch({ type: 'UPDATE_DOCTOR_OFFLINE', payload: { code: d.code, isOffline: d.is_offline } })
        }
      )
      // Cross consultation status changes from any device
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cross_consultations' },
        (payload) => {
          const cc = payload.new as CrossConsultation
          dispatch({ type: 'ADD_CROSS_CONSULTATION', payload: cc })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'cross_consultations' },
        (payload) => {
          const cc = payload.new as CrossConsultation
          dispatch({ type: 'UPDATE_CROSS_CONSULTATION', payload: cc })
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'cross_consultations' },
        (payload) => {
          const id = (payload.old as { id: string }).id
          if (id) dispatch({ type: 'DELETE_CROSS_CONSULTATION', payload: { id } })
        }
      )
      // Package updates from any device (when coordinator creates/edits packages)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'packages' },
        (payload) => {
          const pkg = payload.new as Package
          dispatch({ type: 'UPSERT_PACKAGE', payload: pkg })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'packages' },
        (payload) => {
          const pkg = payload.new as Package
          dispatch({ type: 'UPSERT_PACKAGE', payload: pkg })
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'packages' },
        (payload) => {
          const id = (payload.old as { id: string }).id
          if (id) dispatch({ type: 'DELETE_PACKAGE', payload: { id } })
        }
      )
      // Package step updates from any device
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'package_steps' },
        (payload) => {
          const step = payload.new as PackageStep
          dispatch({ type: 'UPSERT_PACKAGE_STEP', payload: step })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'package_steps' },
        (payload) => {
          const step = payload.new as PackageStep
          dispatch({ type: 'UPSERT_PACKAGE_STEP', payload: step })
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'package_steps' },
        (payload) => {
          const id = (payload.old as { id: string }).id
          if (id) dispatch({ type: 'DELETE_PACKAGE_STEP', payload: { id } })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, []) // subscribe once on mount; selectedDate accessed via ref

  const setSelectedDate = useCallback((date: string) => {
    setSelectedDateRaw(date)
  }, [])

  const toggleHoliday = useCallback((date: string) => {
    setHolidays((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      localStorage.setItem('hcheck_holidays', JSON.stringify([...next]))
      return next
    })
  }, [])

  const isHoliday = useCallback((date: string) => {
    if (holidays.has(date)) return true
    const d = new Date(date + 'T00:00:00')
    return d.getDay() === 0 // Sunday
  }, [holidays])

  const toggleDeptOffline = useCallback((deptId: string) => {
    const dept = state.departments.find((d) => d.id === deptId)
    if (!dept) return
    const next = !dept.is_offline
    dispatch({ type: 'UPDATE_DEPT_OFFLINE', payload: { deptId, isOffline: next } })
    updateDeptOfflineStatus(deptId, next).catch((err) =>
      console.warn('Failed to persist dept offline status:', err)
    )
  }, [state.departments])

  const isDeptOffline = useCallback((deptId: string) => {
    return state.departments.find((d) => d.id === deptId)?.is_offline ?? false
  }, [state.departments])

  const toggleDoctorOffline = useCallback((code: string) => {
    const next = !state.doctorStatuses[code]
    dispatch({ type: 'UPDATE_DOCTOR_OFFLINE', payload: { code, isOffline: next } })
    updateDoctorOfflineStatus(code, next).catch((err) =>
      console.warn('Failed to persist doctor offline status:', err)
    )
  }, [state.doctorStatuses])

  const isDoctorOffline = useCallback((code: string) => {
    return state.doctorStatuses[code] ?? false
  }, [state.doctorStatuses])

  /** Guard: block mutations when viewing a past date */
  const getTodayStrNow = () => todayISTStr()

  // auto-detect delays every 30s
  const intervalRef = useRef<number>(undefined)
  useEffect(() => {
    intervalRef.current = window.setInterval(() => {
      const toDelay = getTasksToDelay(state.patientTasks, state.alertConfig.delayThresholdMinutes)
      toDelay.forEach((task) => {
        dispatch({
          type: 'UPDATE_TASK_STATUS',
          payload: { taskId: task.id, status: 'DELAYED', timestamp: nowISO() },
        })
      })
    }, 30_000)
    return () => clearInterval(intervalRef.current)
  }, [state.patientTasks, state.alertConfig.delayThresholdMinutes])

  // ─── Derived data helpers ──────────────────────────

  const getPatientsWithTasks = useCallback((): PatientWithTasks[] => {
    return state.patients.map((p) => ({
      ...p,
      tasks: state.patientTasks
        .filter((t) => t.patient_id === p.id)
        .sort((a, b) => a.step_order - b.step_order),
      package_name: state.packages.find((pkg) => pkg.id === p.package_id)?.name,
    }))
  }, [state.patients, state.patientTasks, state.packages])

  const getPatientsWithCurrentStep = useCallback((): PatientWithCurrentStep[] => {
    return state.patients.map((p) => {
      const tasks = state.patientTasks
        .filter((t) => t.patient_id === p.id)
        .sort((a, b) => a.step_order - b.step_order)

      // Active tasks: currently IN_PROGRESS or DELAYED
      const activeTasks = tasks.filter(
        (t) => t.status === 'IN_PROGRESS' || t.status === 'DELAYED'
      )

      // "Current step" = first active task, or first NOT_STARTED if none active
      const currentStep =
        activeTasks[0] ||
        tasks.find((t) => t.status === 'NOT_STARTED') ||
        null

      // Group statuses
      const groupStatuses = getTaskGroupStatuses(tasks)

      // Waiting time (TAT): from checked_in_at; freeze at CONSULT out time when available
      let waitingMinutes = 0
      if (p.checked_in_at) {
        const consultTask = tasks.find((t) => t.task_group === 'CONSULT' && t.status === 'COMPLETED' && t.completed_at)
        if (consultTask) {
          waitingMinutes = Math.floor((new Date(consultTask.completed_at!).getTime() - new Date(p.checked_in_at).getTime()) / 60000)
        } else {
          waitingMinutes = Math.floor((Date.now() - new Date(p.checked_in_at).getTime()) / 60000)
        }
      }

      return {
        ...p,
        currentStep,
        activeTasks,
        groupStatuses,
        waitingMinutes,
        package_name: state.packages.find((pkg) => pkg.id === p.package_id)?.name,
      }
    })
  }, [state.patients, state.patientTasks, state.packages])

  const getPatientById = useCallback(
    (id: string): PatientWithTasks | undefined => {
      const p = state.patients.find((pat) => pat.id === id)
      if (!p) return undefined
      return {
        ...p,
        tasks: state.patientTasks
          .filter((t) => t.patient_id === p.id)
          .sort((a, b) => a.step_order - b.step_order),
        package_name: state.packages.find((pkg) => pkg.id === p.package_id)?.name,
      }
    },
    [state.patients, state.patientTasks, state.packages]
  )

  const getDashboardKPIs = useCallback((): DashboardKPIs => {
    const patients = getPatientsWithTasks()
    const totalPatients = patients.length
    const completed = patients.filter((p) => isPatientComplete(p.tasks)).length
    const delayed = patients.filter((p) => p.tasks.some((t) => t.status === 'DELAYED')).length
    const checkedIn = state.patients.filter((p) => p.checked_in_at).length
    const notCheckedIn = totalPatients - checkedIn
    const inProgress = patients.filter(
      (p) => !isPatientComplete(p.tasks) && state.patients.find((sp) => sp.id === p.id)?.checked_in_at
    ).length

    // Average TAT: check-in time → consultation (CONSULT task) out time
    const patientsWithConsultOut = patients.filter((p) => {
      const patient = state.patients.find((sp) => sp.id === p.id)
      const consultTask = p.tasks.find((t) => t.task_group === 'CONSULT' && t.status === 'COMPLETED' && t.completed_at)
      return patient?.checked_in_at && consultTask
    })
    const avgTAT =
      patientsWithConsultOut.length > 0
        ? patientsWithConsultOut.reduce((sum, p) => {
            const patient = state.patients.find((sp) => sp.id === p.id)
            const checkedIn = new Date(patient!.checked_in_at!).getTime()
            const consultTask = p.tasks.find((t) => t.task_group === 'CONSULT' && t.status === 'COMPLETED' && t.completed_at)
            return sum + (new Date(consultTask!.completed_at!).getTime() - checkedIn) / 60000
          }, 0) / patientsWithConsultOut.length
        : 0

    // Bottleneck: department with most delayed/in-progress tasks
    const deptCounts: Record<string, number> = {}
    state.patientTasks
      .filter((t) => t.status === 'DELAYED' || t.status === 'IN_PROGRESS')
      .forEach((t) => {
        deptCounts[t.department_id] = (deptCounts[t.department_id] || 0) + 1
      })
    const bottleneckId = Object.entries(deptCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
    const bottleneckDepartment = state.departments.find((d) => d.id === bottleneckId)?.name || null

    return { totalPatients, completed, inProgress, checkedIn, notCheckedIn, delayed, averageTAT: Math.round(avgTAT), bottleneckDepartment }
  }, [getPatientsWithTasks, state.patientTasks, state.departments])

  const getAlerts = useCallback((): Alert[] => {
    const alerts: Alert[] = []
    const now = Date.now()
    const { delayThresholdMinutes, queueThreshold, taskNotStartedMinutes } = state.alertConfig

    // Delay alerts
    state.patientTasks
      .filter((t) => t.status === 'DELAYED' || (t.status === 'IN_PROGRESS' && t.started_at))
      .forEach((t) => {
        if (t.status === 'DELAYED') {
          const patient = state.patients.find((p) => p.id === t.patient_id)
          alerts.push({
            id: `alert-delay-${t.id}`,
            type: 'DELAY',
            message: `${patient?.name || 'Patient'} delayed at ${t.step_name}`,
            patient_id: t.patient_id,
            department_id: t.department_id,
            timestamp: new Date().toISOString(),
            severity: 'critical',
          })
        } else if (t.started_at) {
          const elapsed = (now - new Date(t.started_at).getTime()) / 60000
          if (elapsed > delayThresholdMinutes * 0.7) {
            const patient = state.patients.find((p) => p.id === t.patient_id)
            alerts.push({
              id: `alert-warn-${t.id}`,
              type: 'DELAY',
              message: `${patient?.name || 'Patient'} approaching delay at ${t.step_name} (${Math.round(elapsed)} min)`,
              patient_id: t.patient_id,
              department_id: t.department_id,
              timestamp: new Date().toISOString(),
              severity: 'warning',
            })
          }
        }
      })

    // Queue overflow per department
    const deptQueues: Record<string, number> = {}
    state.patientTasks
      .filter((t) => t.status === 'IN_PROGRESS' || t.status === 'NOT_STARTED' || t.status === 'DELAYED')
      .forEach((t) => {
        // Count tasks assigned to each department that are active
        if (t.status === 'IN_PROGRESS' || t.status === 'DELAYED') {
          deptQueues[t.department_id] = (deptQueues[t.department_id] || 0) + 1
        }
      })

    // Also count patients whose next best task points to this department
    state.patients.forEach((patient) => {
      const tasks = state.patientTasks.filter((t) => t.patient_id === patient.id)
      const available = getAvailableTasks(tasks, !!patient.checked_in_at)
      available.forEach((t) => {
        deptQueues[t.department_id] = (deptQueues[t.department_id] || 0) + 1
      })
    })

    Object.entries(deptQueues).forEach(([deptId, count]) => {
      if (count > queueThreshold) {
        const dept = state.departments.find((d) => d.id === deptId)
        alerts.push({
          id: `alert-queue-${deptId}`,
          type: 'QUEUE_OVERFLOW',
          message: `${dept?.name || 'Department'} queue overflow: ${count} tasks waiting`,
          department_id: deptId,
          timestamp: new Date().toISOString(),
          severity: 'warning',
        })
      }
    })

    // Tasks not started after being available for too long
    state.patients.forEach((patient) => {
      const tasks = state.patientTasks.filter((t) => t.patient_id === patient.id)
      const available = getAvailableTasks(tasks, !!patient.checked_in_at)
      available.forEach((t) => {
        if (t.status === 'NOT_STARTED') {
          const elapsed = (now - new Date(patient.created_at).getTime()) / 60000
          if (elapsed > taskNotStartedMinutes) {
            alerts.push({
              id: `alert-notstarted-${t.id}`,
              type: 'TASK_NOT_STARTED',
              message: `${patient.name}: ${t.step_name} available but not started for ${Math.round(elapsed)} min`,
              patient_id: patient.id,
              department_id: t.department_id,
              timestamp: new Date().toISOString(),
              severity: 'warning',
            })
          }
        }
      })
    })

    return alerts.sort((a, b) => (a.severity === 'critical' ? -1 : 1) - (b.severity === 'critical' ? -1 : 1))
  }, [state])

  const getDepartmentQueue = useCallback(
    (departmentId: string): PatientWithCurrentStep[] => {
      return getPatientsWithCurrentStep().filter((p) => {
        // Show patient if they have ANY task in this department
        return state.patientTasks.some(
          (t) => t.patient_id === p.id && t.department_id === departmentId
        )
      }).map((p) => {
        // Override currentStep to show the task relevant to this department
        const tasks = state.patientTasks.filter((t) => t.patient_id === p.id && t.department_id === departmentId)
        const deptTask = tasks.find((t) => t.status === 'IN_PROGRESS' || t.status === 'DELAYED') ||
          tasks.find((t) => t.status === 'NOT_STARTED') ||
          tasks.find((t) => t.status === 'COMPLETED') || null
        return { ...p, currentStep: deptTask }
      })
    },
    [getPatientsWithCurrentStep, state.patientTasks]
  )

  const getDepartmentStats = useCallback(
    (departmentId: string) => {
      const deptTasks = state.patientTasks.filter((t) => t.department_id === departmentId)
      const patientIds = [...new Set(deptTasks.map((t) => t.patient_id))]

      // Active: currently being seen (IN_PROGRESS or DELAYED)
      const activePatients = new Set(
        deptTasks
          .filter((t) => t.status === 'IN_PROGRESS' || t.status === 'DELAYED')
          .map((t) => t.patient_id)
      )

      // Remaining: patients who have any non-completed task in this dept
      const remainingPatients = new Set(
        deptTasks
          .filter((t) => t.status !== 'COMPLETED')
          .map((t) => t.patient_id)
      )

      // True waiting: patient has a NOT_STARTED task here AND all tasks
      // with a lower step_order in their package are already COMPLETED
      const waitingPatients = new Set<string>()
      for (const pid of patientIds) {
        if (activePatients.has(pid)) continue
        const allPatientTasks = state.patientTasks.filter((t) => t.patient_id === pid)
        const deptTask = allPatientTasks.find(
          (t) => t.department_id === departmentId && t.status === 'NOT_STARTED'
        )
        if (!deptTask) continue
        const priorIncomplete = allPatientTasks.some(
          (t) => t.step_order < deptTask.step_order && t.status !== 'COMPLETED'
        )
        if (!priorIncomplete) {
          waitingPatients.add(pid)
        }
      }

      const completed = deptTasks.filter((t) => t.status === 'COMPLETED' && t.started_at && t.completed_at)
      const avgTime =
        completed.length > 0
          ? completed.reduce((sum, t) => {
              return sum + (new Date(t.completed_at!).getTime() - new Date(t.started_at!).getTime()) / 60000
            }, 0) / completed.length
          : 0
      return { waiting: waitingPatients.size, remaining: remainingPatients.size, active: activePatients.size, avgTime: Math.round(avgTime) }
    },
    [state.patientTasks]
  )

  const getNextTask = useCallback(
    (patientId: string): PatientTask | null => {
      const patient = state.patients.find((p) => p.id === patientId)
      if (!patient) return null
      const tasks = state.patientTasks.filter((t) => t.patient_id === patientId)
      const result = getNextBestTask(patientId, tasks, state.patientTasks, patient)
      return result?.task || null
    },
    [state.patients, state.patientTasks]
  )

  // ─── Actions ───────────────────────────────────────

  const registerPatient = useCallback(
    (name: string, uhid: string, phone: string | null, packageId: string | null, priority: Priority) => {
      if (selectedDate < getTodayStrNow()) return // read-only on past dates
      const patientId = `pat-${crypto.randomUUID()}`
      const clinicDateStr = selectedDate
      const patient: Patient = {
        id: patientId,
        name,
        uhid,
        phone: phone || null,
        package_id: packageId,
        assigned_doctor: null,
        priority,
        is_international: false,
        created_at: nowISO(),
        checked_in_at: null,
        clinic_date: clinicDateStr,
        group_id: null,
        ppbs_time: null,
        tracker_cell_states: {},
        is_new: false,
        is_registered: false,
      }
      let tasks: PatientTask[]
      if (packageId) {
        const pkgSteps = state.packageSteps
          .filter((s) => s.package_id === packageId)
          .sort((a, b) => a.step_order - b.step_order)
        tasks = pkgSteps.map((ps, idx) => ({
          id: `ptask-${crypto.randomUUID()}-${idx}`,
          patient_id: patientId,
          step_id: ps.id,
          department_id: ps.department_id,
          task_group: ps.task_group,
          status: 'NOT_STARTED' as TaskStatus,
          is_mandatory: ps.is_mandatory,
          skipped: false,
          started_at: null,
          completed_at: null,
          step_order: ps.step_order,
          step_name: ps.step_name,
        }))
      } else {
        // No package yet – create only a Billing task so the billing gateway works
        tasks = [{
          id: `ptask-${crypto.randomUUID()}-billing`,
          patient_id: patientId,
          step_id: null,
          department_id: 'dept-reg',
          task_group: 'BILLING' as TaskGroup,
          status: 'NOT_STARTED' as TaskStatus,
          is_mandatory: true,
          skipped: false,
          started_at: null,
          completed_at: null,
          step_order: 1,
          step_name: 'Billing',
        }]
      }
      dispatch({ type: 'ADD_PATIENT', payload: { patient, tasks } })
      // Persist to Supabase (fire-and-forget)
      dbInsertPatient(patient)
        .then(() => dbInsertPatientTasks(tasks))
        .catch((err) => console.warn('Failed to persist patient to DB:', err))
    },
    [state.packageSteps, selectedDate]
  )

  const checkInNewPatient = useCallback((name: string) => {
    if (selectedDate < getTodayStrNow()) return
    const patientId = `pat-${crypto.randomUUID()}`
    const ts = nowISO()
    const patient: Patient = {
      id: patientId,
      name: name.trim(),
      uhid: '',
      phone: null,
      package_id: null,
      assigned_doctor: null,
      priority: 'NORMAL',
      is_international: false,
      created_at: ts,
      checked_in_at: ts,
      clinic_date: selectedDate,
      group_id: null,
      ppbs_time: null,
      tracker_cell_states: {},
      is_new: false,
      is_registered: false,
    }
    const tasks: PatientTask[] = [{
      id: `ptask-${crypto.randomUUID()}-billing`,
      patient_id: patientId,
      step_id: null,
      department_id: 'dept-reg',
      task_group: 'BILLING' as TaskGroup,
      status: 'NOT_STARTED' as TaskStatus,
      is_mandatory: true,
      skipped: false,
      started_at: null,
      completed_at: null,
      step_order: 1,
      step_name: 'Billing',
    }]
    dispatch({ type: 'ADD_PATIENT', payload: { patient, tasks } })
    dbInsertPatient(patient)
      .then(() => dbInsertPatientTasks(tasks))
      .catch((err) => console.warn('Failed to persist quick check-in:', err))
  }, [selectedDate])

  const updatePatientGroup = useCallback((patientId: string, groupId: string | null) => {
    dispatch({ type: 'UPDATE_GROUP', payload: { patientId, groupId } })
    updatePatientGroupDb(patientId, groupId).catch((err) =>
      console.warn('Failed to persist group update:', err)
    )
  }, [])

  const startTask = useCallback((taskId: string) => {
    if (selectedDate !== getTodayStrNow()) return
    const task = state.patientTasks.find((t) => t.id === taskId)
    if (!task) return

    // Block starting tasks for offline departments
    if (state.departments.find((d) => d.id === task.department_id)?.is_offline) return

    // Block CONSULT/REVIEW tasks if the assigned doctor is offline
    if (task.task_group === 'CONSULT' || task.task_group === 'REVIEW') {
      const patient = state.patients.find((p) => p.id === task.patient_id)
      if (patient?.assigned_doctor && state.doctorStatuses[patient.assigned_doctor]) return
    }

    // Patient must be checked in before any task can start
    const patient = state.patients.find((p) => p.id === task.patient_id)
    if (!patient?.checked_in_at) return

    // Billing must be completed before any other task can start
    const patientTasks = state.patientTasks.filter((t) => t.patient_id === task.patient_id)
    const billingTask = patientTasks.find((t) => t.step_name === 'Billing')
    if (billingTask && billingTask.status !== 'COMPLETED' && task.step_name !== 'Billing') return

    // Enforce: only one task IN_PROGRESS per patient at a time
    const hasActiveTask = patientTasks.some((t) => t.status === 'IN_PROGRESS')
    if (hasActiveTask) return

    if (!canStartInDepartment(task.department_id, task.patient_id, state.patientTasks)) return
    if (!arePrerequisitesMet(task, patientTasks)) return

    const ts = nowISO()
    dispatch({
      type: 'UPDATE_TASK_STATUS',
      payload: { taskId, status: 'IN_PROGRESS', timestamp: ts },
    })
    dbUpdateTaskStatus(taskId, 'IN_PROGRESS', ts).catch((err) =>
      console.warn('Failed to persist task start:', err)
    )
  }, [state.patientTasks, state.patients, state.departments, state.doctorStatuses, selectedDate])

  const startConsultTask = useCallback((taskId: string, doctorCode: DoctorCode) => {
    if (selectedDate !== getTodayStrNow()) return
    const task = state.patientTasks.find((t) => t.id === taskId)
    if (!task) return

    // Block if the calling doctor is offline
    if (doctorCode && state.doctorStatuses[doctorCode]) return

    const patient = state.patients.find((p) => p.id === task.patient_id)
    if (!patient?.checked_in_at) return

    const patientTasks = state.patientTasks.filter((t) => t.patient_id === task.patient_id)
    const billingTask = patientTasks.find((t) => t.step_name === 'Billing')
    if (billingTask && billingTask.status !== 'COMPLETED') return

    const hasActiveTask = patientTasks.some((t) => t.status === 'IN_PROGRESS')
    if (hasActiveTask) return

    if (!canStartInDepartment(task.department_id, task.patient_id, state.patientTasks)) return
    if (!arePrerequisitesMet(task, patientTasks)) return

    const ts = nowISO()

    // Override assigned doctor with the doctor starting the task
    dispatch({ type: 'UPDATE_ASSIGNED_DOCTOR', payload: { patientId: task.patient_id, doctor: doctorCode } })
    updateAssignedDoctorDb(task.patient_id, doctorCode).catch((err) =>
      console.warn('Failed to persist assigned doctor override:', err)
    )

    dispatch({ type: 'UPDATE_TASK_STATUS', payload: { taskId, status: 'IN_PROGRESS', timestamp: ts } })
    dbUpdateTaskStatus(taskId, 'IN_PROGRESS', ts).catch((err) =>
      console.warn('Failed to persist consult task start:', err)
    )
  }, [state.patientTasks, state.patients, state.doctorStatuses, selectedDate])

  const completeTask = useCallback((taskId: string) => {
    if (selectedDate !== getTodayStrNow()) return
    const ts = nowISO()
    dispatch({
      type: 'UPDATE_TASK_STATUS',
      payload: { taskId, status: 'COMPLETED', timestamp: ts },
    })
    dbUpdateTaskStatus(taskId, 'COMPLETED', ts).catch((err) =>
      console.warn('Failed to persist task completion:', err)
    )
  }, [selectedDate])

  const skipTask = useCallback((taskId: string) => {
    if (selectedDate !== getTodayStrNow()) return
    const ts = nowISO()
    skipTaskInDb(taskId, ts).catch((err) =>
      console.warn('Failed to persist task skip:', err)
    )
  }, [selectedDate])

  const checkInPatient = useCallback((patientId: string, groupId?: string) => {
    if (selectedDate !== getTodayStrNow()) return
    const ts = nowISO()
    dispatch({ type: 'CHECK_IN', payload: { patientId, timestamp: ts, groupId } })
    checkInPatientDb(patientId, ts, groupId).catch((err) =>
      console.warn('Failed to persist check-in:', err)
    )
  }, [selectedDate])

  const checkInGroup = useCallback((patientIds: string[]) => {
    if (selectedDate !== getTodayStrNow()) return
    if (patientIds.length === 0) return
    const ts = nowISO()
    const groupId = `grp-${crypto.randomUUID()}`
    patientIds.forEach((patientId) => {
      dispatch({ type: 'CHECK_IN', payload: { patientId, timestamp: ts, groupId } })
      checkInPatientDb(patientId, ts, groupId).catch((err) =>
        console.warn('Failed to persist group check-in:', err)
      )
    })
  }, [selectedDate])

  const assignGroup = useCallback((patientIds: string[]) => {
    if (patientIds.length < 2) return
    const groupId = `grp-${crypto.randomUUID()}`
    patientIds.forEach((patientId) => {
      dispatch({ type: 'UPDATE_GROUP', payload: { patientId, groupId } })
      updatePatientGroupDb(patientId, groupId).catch((err) =>
        console.warn('Failed to persist group assignment:', err)
      )
    })
  }, [])

  const undoCheckIn = useCallback((patientId: string) => {
    if (selectedDate !== getTodayStrNow()) return
    dispatch({ type: 'UNDO_CHECK_IN', payload: { patientId } })
    undoCheckInDb(patientId).catch((err) =>
      console.warn('Failed to persist undo check-in:', err)
    )
  }, [selectedDate])

  const updateCheckInTime = useCallback((patientId: string, timestamp: string) => {
    if (selectedDate !== getTodayStrNow()) return
    dispatch({ type: 'CHECK_IN', payload: { patientId, timestamp } })
    checkInPatientDb(patientId, timestamp).catch((err) =>
      console.warn('Failed to persist check-in time update:', err)
    )
  }, [selectedDate])

  const updateTaskTimes = useCallback((taskId: string, startedAt: string | null, completedAt: string | null) => {
    if (selectedDate !== getTodayStrNow()) return
    dispatch({ type: 'UPDATE_TASK_TIMES', payload: { taskId, startedAt, completedAt } })
    updateTaskTimesDb(taskId, startedAt, completedAt).catch((err) =>
      console.warn('Failed to persist task times update:', err)
    )
  }, [selectedDate])

  const cancelTask = useCallback((taskId: string) => {
    if (selectedDate !== getTodayStrNow()) return
    dispatch({ type: 'CANCEL_TASK', payload: { taskId } })
    cancelTaskDb(taskId).catch((err) =>
      console.warn('Failed to persist task cancel:', err)
    )
  }, [selectedDate])

  const updatePatientPackage = useCallback(
    (patientId: string, packageId: string, assignedDoctor?: DoctorCode) => {
      if (selectedDate !== getTodayStrNow()) return
      const pkgSteps = state.packageSteps
        .filter((s) => s.package_id === packageId)
        .sort((a, b) => a.step_order - b.step_order)

      // Preserve the completed billing task from the old tasks
      const oldTasks = state.patientTasks.filter((t) => t.patient_id === patientId)
      const billingTask = oldTasks.find((t) => t.step_name === 'Billing')
      const now = nowISO()

      const newTasks: PatientTask[] = pkgSteps.map((ps, idx) => {
        // Mark the billing step as completed (it was just confirmed via the modal)
        if (ps.step_name === 'Billing' && billingTask) {
          return {
            ...billingTask,
            step_id: ps.id,
            status: 'COMPLETED' as TaskStatus,
            started_at: billingTask.started_at || now,
            completed_at: now,
          }
        }
        return {
          id: `ptask-${crypto.randomUUID()}-${idx}`,
          patient_id: patientId,
          step_id: ps.id,
          department_id: ps.department_id,
          task_group: ps.task_group,
          status: 'NOT_STARTED' as TaskStatus,
          is_mandatory: ps.is_mandatory,
          skipped: false,
          started_at: null,
          completed_at: null,
          step_order: ps.step_order,
          step_name: ps.step_name,
        }
      })

      dispatch({ type: 'UPDATE_PATIENT_PACKAGE', payload: { patientId, packageId, tasks: newTasks, assignedDoctor } })
      updatePatientPackageDb(patientId, packageId, newTasks, assignedDoctor).catch((err) => {
        console.error('Failed to persist package update:', err)
        // DB write failed – reload authoritative data from server to restore correct state
        loadAllData(selectedDate).then((data) => {
          dispatch({ type: 'SET_ALL_DATA', payload: data })
        }).catch(console.error)
        setError('Failed to save package assignment. The page data has been refreshed from the server.')
      })

      // Auto-add cross consultations from the package's consultation_departments
      const pkg = state.packages.find((p) => p.id === packageId)
      const depts = pkg?.consultation_departments ?? []
      if (depts.length > 0) {
        const existingDepts = new Set(
          state.crossConsultations
            .filter((cc) => cc.patient_id === patientId)
            .map((cc) => cc.department_name)
        )
        for (const dept of depts) {
          if (!existingDepts.has(dept)) {
            const cc: CrossConsultation = {
              id: crypto.randomUUID(),
              patient_id: patientId,
              department_name: dept,
              doctor_name: '',
              status: 'BOOKED',
              notes: '',
              created_at: nowISO(),
            }
            dispatch({ type: 'ADD_CROSS_CONSULTATION', payload: cc })
            insertCrossConsultationDb(cc).catch((err) =>
              console.warn('Failed to persist auto cross consultation:', err)
            )
          }
        }
      }
    },
    [state.packageSteps, state.patientTasks, state.packages, state.crossConsultations, selectedDate]
  )

  const updateAssignedDoctor = useCallback(
    (patientId: string, doctor: DoctorCode) => {
      if (selectedDate !== getTodayStrNow()) return
      dispatch({ type: 'UPDATE_ASSIGNED_DOCTOR', payload: { patientId, doctor } })
      updateAssignedDoctorDb(patientId, doctor).catch((err) =>
        console.warn('Failed to persist assigned doctor update:', err)
      )
    },
    [selectedDate]
  )

  const deletePatient = useCallback((patientId: string) => {
    if (selectedDate !== getTodayStrNow()) return
    dispatch({ type: 'DELETE_PATIENT', payload: { patientId } })
    deletePatientDb(patientId).catch((err) =>
      console.warn('Failed to persist patient deletion:', err)
    )
  }, [selectedDate])

  const setPriority = useCallback((patientId: string, priority: Priority) => {
    dispatch({ type: 'SET_PRIORITY', payload: { patientId, priority } })
    dbUpdatePatientPriority(patientId, priority).catch((err) =>
      console.warn('Failed to persist priority change:', err)
    )
  }, [])

  const createPackage = useCallback((pkg: Package, steps: PackageStep[]) => {
    dispatch({ type: 'ADD_PACKAGE', payload: { pkg, steps } })
    insertPackageDb(pkg)
      .then(() => insertPackageStepsDb(steps))
      .catch((err) => console.warn('Failed to persist new package:', err))
  }, [])

  const updatePackage = useCallback((pkg: Package, steps: PackageStep[]) => {
    dispatch({ type: 'UPDATE_PACKAGE', payload: { pkg, steps } })
    updatePackageDb(pkg)
      .then(() => deletePackageStepsDb(pkg.id))
      .then(() => insertPackageStepsDb(steps))
      .catch((err) => console.warn('Failed to persist package update:', err))

    // Auto-add cross consultations for all patients on this package
    const depts = pkg.consultation_departments ?? []
    if (depts.length > 0) {
      const patientsOnPkg = state.patients.filter((p) => p.package_id === pkg.id)
      for (const patient of patientsOnPkg) {
        const existingDepts = new Set(
          state.crossConsultations
            .filter((cc) => cc.patient_id === patient.id)
            .map((cc) => cc.department_name)
        )
        for (const dept of depts) {
          if (!existingDepts.has(dept)) {
            const cc: CrossConsultation = {
              id: crypto.randomUUID(),
              patient_id: patient.id,
              department_name: dept,
              doctor_name: '',
              status: 'BOOKED',
              notes: '',
              created_at: nowISO(),
            }
            dispatch({ type: 'ADD_CROSS_CONSULTATION', payload: cc })
            insertCrossConsultationDb(cc).catch((err) =>
              console.warn('Failed to persist auto cross consultation:', err)
            )
          }
        }
      }
    }
  }, [state.patients, state.crossConsultations])

  // resetData: reset all tasks and check-ins in DB, then reload
  const resetData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await resetAllData()
      // Reload only selected date's data
      const dateData = await loadAllData(selectedDate)
      dispatch({ type: 'SET_ALL_DATA', payload: dateData })
      const dates = await fetchClinicDates()
      setClinicDates(dates)
    } catch (err) {
      console.error('Failed to reset data:', err)
      setError(err instanceof Error ? err.message : 'Failed to reset data')
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  // advancePatient: complete current active tasks, use routing engine to start next best task
  const advancePatient = useCallback(
    (patientId: string) => {
      if (selectedDate !== getTodayStrNow()) return
      const tasks = state.patientTasks.filter((t) => t.patient_id === patientId)
      // Complete all currently active tasks
      const activeTasks = tasks.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'DELAYED')
      activeTasks.forEach((t) => completeTask(t.id))

      // Use routing engine to find next best task
      const patient = state.patients.find((p) => p.id === patientId)
      if (!patient) return
      // Recalculate after completing
      const updatedTasks = tasks.map((t) =>
        activeTasks.some((a) => a.id === t.id)
          ? { ...t, status: 'COMPLETED' as TaskStatus, completed_at: nowISO() }
          : t
      )
      const result = getNextBestTask(patientId, updatedTasks, state.patientTasks, patient)
      if (result) {
        // Start it after a microtask to let state update
        setTimeout(() => startTask(result.task.id), 0)
      }
    },
    [state.patientTasks, state.patients, completeTask, startTask, selectedDate]
  )

  // ─── Cross Consultation actions ──────────────────
  const getCrossConsultationsForPatient = useCallback(
    (patientId: string) => state.crossConsultations.filter((cc) => cc.patient_id === patientId),
    [state.crossConsultations]
  )

  const addCrossConsultation = useCallback(
    (patientId: string, departmentName: string, doctorName: string, notes = '') => {
      const cc: CrossConsultation = {
        id: crypto.randomUUID(),
        patient_id: patientId,
        department_name: departmentName,
        doctor_name: doctorName,
        status: 'BOOKED',
        notes,
        created_at: nowISO(),
      }
      dispatch({ type: 'ADD_CROSS_CONSULTATION', payload: cc })
      insertCrossConsultationDb(cc).catch((err) => console.warn('Failed to persist cross consultation:', err))
    },
    []
  )

  const updateCrossConsultationStatus = useCallback(
    (id: string, status: CrossConsultationStatus) => {
      dispatch({ type: 'UPDATE_CROSS_CONSULTATION_STATUS', payload: { id, status } })
      updateCrossConsultationStatusDb(id, status).catch((err) => console.warn('Failed to update cross consultation status:', err))
    },
    []
  )

  const editCrossConsultation = useCallback(
    (id: string, departmentName: string, doctorName: string, notes: string) => {
      const existing = state.crossConsultations.find((cc) => cc.id === id)
      if (!existing) return
      const updated: CrossConsultation = { ...existing, department_name: departmentName, doctor_name: doctorName, notes }
      dispatch({ type: 'UPDATE_CROSS_CONSULTATION', payload: updated })
      updateCrossConsultationDb({ id, department_name: departmentName, doctor_name: doctorName, notes })
        .catch((err) => console.warn('Failed to edit cross consultation:', err))
    },
    [state.crossConsultations]
  )

  const deleteCrossConsultation = useCallback(
    (id: string) => {
      dispatch({ type: 'DELETE_CROSS_CONSULTATION', payload: { id } })
      deleteCrossConsultationDb(id).catch((err) => console.warn('Failed to delete cross consultation:', err))
    },
    []
  )

  const updatePatientInfo = useCallback(
    (patientId: string, name: string, uhid: string, phone: string | null) => {
      dispatch({ type: 'UPDATE_PATIENT_INFO', payload: { patientId, name, uhid, phone } })
      updatePatientInfoDb(patientId, { name, uhid, phone }).catch((err) =>
        console.warn('Failed to persist patient info update:', err)
      )
    },
    []
  )

  const updatePatientInternational = useCallback(
    (patientId: string, isInternational: boolean) => {
      dispatch({ type: 'UPDATE_PATIENT_INTERNATIONAL', payload: { patientId, isInternational } })
      updatePatientInternationalDb(patientId, isInternational).catch((err) =>
        console.warn('Failed to persist international flag update:', err)
      )
    },
    []
  )

  const updatePatientNew = useCallback(
    (patientId: string, isNew: boolean) => {
      dispatch({ type: 'UPDATE_PATIENT_NEW', payload: { patientId, isNew } })
      updatePatientNewDb(patientId, isNew).catch((err) =>
        console.warn('Failed to persist new patient flag update:', err)
      )
    },
    []
  )

  const updatePatientRegistered = useCallback(
    (patientId: string, isRegistered: boolean) => {
      dispatch({ type: 'UPDATE_PATIENT_REGISTERED', payload: { patientId, isRegistered } })
      updatePatientRegisteredDb(patientId, isRegistered).catch((err) =>
        console.warn('Failed to persist registered flag update:', err)
      )
    },
    []
  )

  const updatePatientPpbsTime = useCallback(
    async (patientId: string, ppbsTime: string | null): Promise<void> => {
      dispatch({ type: 'UPDATE_PATIENT_PPBS_TIME', payload: { patientId, ppbsTime } })
      await updatePatientPpbsTimeDb(patientId, ppbsTime)
    },
    []
  )

  const updateTrackerCellState = useCallback(
    async (patientId: string, cellKey: string, value: string | null, currentStates: Record<string, string>): Promise<void> => {
      dispatch({ type: 'UPDATE_TRACKER_CELL_STATE', payload: { patientId, cellKey, value } })
      await updateTrackerCellStateDb(patientId, cellKey, value, currentStates)
    },
    []
  )

  return (
    <AppContext.Provider
      value={{
        state,
        dispatch,
        loading,
        error,
        selectedDate,
        isViewingPastDate,
        clinicDates,
        setSelectedDate,
        getPatientsWithTasks,
        getPatientsWithCurrentStep,
        getPatientById,
        getDashboardKPIs,
        getAlerts,
        getDepartmentQueue,
        getDepartmentStats,
        getNextTask,
        registerPatient,
        checkInNewPatient,
        updatePatientGroup,
        startTask,
        startConsultTask,
        completeTask,
        skipTask,
        cancelTask,
        updatePatientPackage,
        updateAssignedDoctor,
        deletePatient,
        setPriority,
        checkInPatient,
        checkInGroup,
        assignGroup,
        undoCheckIn,
        updateCheckInTime,
        updateTaskTimes,
        advancePatient,
        createPackage,
        updatePackage,
        resetData,
        holidays,
        toggleHoliday,
        isHoliday,
        // Cross Consultations
        getCrossConsultationsForPatient,
        addCrossConsultation,
        updateCrossConsultationStatus,
        editCrossConsultation,
        deleteCrossConsultation,
        updatePatientInfo,
        updatePatientInternational,
        updatePatientNew,
        updatePatientRegistered,
        updatePatientPpbsTime,
        updateTrackerCellState,
        // Department online/offline
        toggleDeptOffline,
        isDeptOffline,
        // Doctor online/offline
        toggleDoctorOffline,
        isDoctorOffline,
        // Legacy aliases
        getPatientsWithSteps: getPatientsWithTasks,
        startStep: startTask,
        completeStep: completeTask,
        skipStep: skipTask,
        moveToNextStep: advancePatient,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
