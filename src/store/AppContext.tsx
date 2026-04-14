import { createContext, useContext, useReducer, useCallback, type ReactNode, useEffect, useRef, useState } from 'react'
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
  undoCheckInDb,
  deletePatientDb,
  cancelTaskDb,
  updateTaskTimesDb,
  updatePatientPackageDb,
  insertPackageDb,
  updatePackageDb,
  insertPackageStepsDb,
  deletePackageStepsDb,
} from '@/lib/db'

// ─── State ───────────────────────────────────────────
interface AppState {
  patients: Patient[]
  patientTasks: PatientTask[]
  departments: Department[]
  packages: Package[]
  packageSteps: PackageStep[]
  alertConfig: AlertConfig
}

type Action =
  | { type: 'SET_PATIENTS'; payload: Patient[] }
  | { type: 'ADD_PATIENT'; payload: { patient: Patient; tasks: PatientTask[] } }
  | { type: 'UPDATE_TASK_STATUS'; payload: { taskId: string; status: TaskStatus; timestamp: string } }
  | { type: 'SET_PATIENT_TASKS'; payload: PatientTask[] }
  | { type: 'SKIP_TASK'; payload: { taskId: string; timestamp: string } }
  | { type: 'SET_PRIORITY'; payload: { patientId: string; priority: Priority } }
  | { type: 'CHECK_IN'; payload: { patientId: string; timestamp: string } }
  | { type: 'UNDO_CHECK_IN'; payload: { patientId: string } }
  | { type: 'DELETE_PATIENT'; payload: { patientId: string } }
  | { type: 'CANCEL_TASK'; payload: { taskId: string } }
  | { type: 'UPDATE_TASK_TIMES'; payload: { taskId: string; startedAt: string | null; completedAt: string | null } }
  | { type: 'UPDATE_PATIENT_PACKAGE'; payload: { patientId: string; packageId: string; tasks: PatientTask[]; assignedDoctor?: DoctorCode } }
  | { type: 'ADD_PACKAGE'; payload: { pkg: Package; steps: PackageStep[] } }
  | { type: 'UPDATE_PACKAGE'; payload: { pkg: Package; steps: PackageStep[] } }
  | { type: 'UPDATE_ALERT_CONFIG'; payload: Partial<AlertConfig> }
  | { type: 'SET_ALL_DATA'; payload: { patients: Patient[]; patientTasks: PatientTask[]; departments: Department[]; packages: Package[]; packageSteps: PackageStep[] } }

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
            ? { ...p, checked_in_at: action.payload.timestamp }
            : p
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
  getDepartmentStats: (departmentId: string) => { waiting: number; active: number; avgTime: number }
  getNextTask: (patientId: string) => PatientTask | null
  // Actions
  registerPatient: (name: string, uhid: string, packageId: string | null, priority: Priority) => void
  startTask: (taskId: string) => void
  completeTask: (taskId: string) => void
  skipTask: (taskId: string) => void
  cancelTask: (taskId: string) => void
  updatePatientPackage: (patientId: string, packageId: string, assignedDoctor?: DoctorCode) => void
  deletePatient: (patientId: string) => void
  setPriority: (patientId: string, priority: Priority) => void
  checkInPatient: (patientId: string) => void
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
  })

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ─── Date-based isolation ────────────────────────
  const getTodayStr = () => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }
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
    Promise.all([
      loadAllData(selectedDate),
      fetchClinicDates(),
    ])
      .then(([data, dates]) => {
        if (cancelled) return
        dispatch({ type: 'SET_ALL_DATA', payload: data })
        setClinicDates(dates)
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

  /** Guard: block mutations when viewing a past date */
  const getTodayStrNow = () => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  }

  // auto-detect delays every 30s
  const intervalRef = useRef<number>(undefined)
  useEffect(() => {
    intervalRef.current = window.setInterval(() => {
      const toDelay = getTasksToDelay(state.patientTasks, state.alertConfig.delayThresholdMinutes)
      toDelay.forEach((task) => {
        dispatch({
          type: 'UPDATE_TASK_STATUS',
          payload: { taskId: task.id, status: 'DELAYED', timestamp: new Date().toISOString() },
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

      // Waiting time: from checked_in_at; freeze at last completion if all mandatory done
      const allDone = tasks.filter((t) => t.is_mandatory).every((t) => t.status === 'COMPLETED')
      let waitingMinutes = 0
      if (p.checked_in_at) {
        if (allDone) {
          const completedTimes = tasks.filter((t) => t.completed_at).map((t) => new Date(t.completed_at!).getTime())
          const endTime = completedTimes.length > 0 ? Math.max(...completedTimes) : Date.now()
          waitingMinutes = Math.floor((endTime - new Date(p.checked_in_at).getTime()) / 60000)
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

    // Average TAT for completed patients (check-in to last task completion)
    const completedPatients = patients.filter((p) => isPatientComplete(p.tasks))
    const avgTAT =
      completedPatients.length > 0
        ? completedPatients.reduce((sum, p) => {
            const patient = state.patients.find((sp) => sp.id === p.id)
            const checkedIn = patient?.checked_in_at ? new Date(patient.checked_in_at).getTime() : null
            const endTimes = p.tasks.filter((t) => t.completed_at).map((t) => new Date(t.completed_at!).getTime())
            if (checkedIn && endTimes.length) {
              return sum + (Math.max(...endTimes) - checkedIn) / 60000
            }
            return sum
          }, 0) / completedPatients.length
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

      // Count unique patients with active tasks in this department
      const activePatients = new Set(
        deptTasks
          .filter((t) => t.status === 'IN_PROGRESS' || t.status === 'DELAYED')
          .map((t) => t.patient_id)
      )

      // Count unique patients with available (startable) tasks in this department
      const waitingPatients = new Set<string>()
      const patientIds = [...new Set(deptTasks.map((t) => t.patient_id))]
      for (const pid of patientIds) {
        if (activePatients.has(pid)) continue // already counted as active
        const allPatientTasks = state.patientTasks.filter((t) => t.patient_id === pid)
        const patientObj = state.patients.find((p) => p.id === pid)
        const available = getAvailableTasks(allPatientTasks, !!patientObj?.checked_in_at)
        if (available.some((t) => t.department_id === departmentId)) {
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
      return { waiting: waitingPatients.size, active: activePatients.size, avgTime: Math.round(avgTime) }
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
    (name: string, uhid: string, packageId: string | null, priority: Priority) => {
      if (selectedDate < getTodayStrNow()) return // read-only on past dates
      const patientId = `pat-${crypto.randomUUID()}`
      const clinicDateStr = selectedDate
      const patient: Patient = {
        id: patientId,
        name,
        uhid,
        package_id: packageId,
        assigned_doctor: null,
        priority,
        created_at: new Date().toISOString(),
        checked_in_at: null,
        clinic_date: clinicDateStr,
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

  const startTask = useCallback((taskId: string) => {
    if (selectedDate !== getTodayStrNow()) return
    const task = state.patientTasks.find((t) => t.id === taskId)
    if (!task) return

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

    const ts = new Date().toISOString()
    dispatch({
      type: 'UPDATE_TASK_STATUS',
      payload: { taskId, status: 'IN_PROGRESS', timestamp: ts },
    })
    dbUpdateTaskStatus(taskId, 'IN_PROGRESS', ts).catch((err) =>
      console.warn('Failed to persist task start:', err)
    )
  }, [state.patientTasks, state.patients, selectedDate])

  const completeTask = useCallback((taskId: string) => {
    if (selectedDate !== getTodayStrNow()) return
    const ts = new Date().toISOString()
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
    const ts = new Date().toISOString()
    dispatch({ type: 'SKIP_TASK', payload: { taskId, timestamp: ts } })
    skipTaskInDb(taskId, ts).catch((err) =>
      console.warn('Failed to persist task skip:', err)
    )
  }, [selectedDate])

  const checkInPatient = useCallback((patientId: string) => {
    if (selectedDate !== getTodayStrNow()) return
    const ts = new Date().toISOString()
    dispatch({ type: 'CHECK_IN', payload: { patientId, timestamp: ts } })
    checkInPatientDb(patientId, ts).catch((err) =>
      console.warn('Failed to persist check-in:', err)
    )
  }, [selectedDate])

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
      const now = new Date().toISOString()

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
      updatePatientPackageDb(patientId, packageId, newTasks, assignedDoctor).catch((err) =>
        console.warn('Failed to persist package update:', err)
      )
    },
    [state.packageSteps, state.patientTasks, selectedDate]
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
  }, [])

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
          ? { ...t, status: 'COMPLETED' as TaskStatus, completed_at: new Date().toISOString() }
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
        startTask,
        completeTask,
        skipTask,
        cancelTask,
        updatePatientPackage,
        deletePatient,
        setPriority,
        checkInPatient,
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
