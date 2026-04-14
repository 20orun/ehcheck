import { supabase } from './supabase'
import type { Department, DoctorCode, Package, PackageStep, Patient, PatientTask, TaskGroup, TaskStatus, Priority } from '@/types'

// ─── Fetch helpers ───────────────────────────────────

export async function fetchDepartments(): Promise<Department[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('id, name, task_group')
    .order('name')
  if (error) throw error
  return (data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    task_group: d.task_group as TaskGroup,
  }))
}

export async function fetchPackages(): Promise<Package[]> {
  const { data, error } = await supabase
    .from('packages')
    .select('*')
    .order('name')
  if (error) throw error
  return (data ?? []).map((d) => ({ ...d, price: d.price ?? null })) as Package[]
}

export async function fetchPackageSteps(): Promise<PackageStep[]> {
  const { data, error } = await supabase
    .from('package_steps')
    .select('id, package_id, step_name, department_id, step_order, task_group, is_mandatory')
    .order('package_id')
    .order('step_order')
  if (error) throw error
  return (data ?? []).map((s) => ({
    id: s.id,
    package_id: s.package_id,
    step_name: s.step_name,
    department_id: s.department_id,
    step_order: s.step_order,
    task_group: s.task_group as TaskGroup,
    is_mandatory: s.is_mandatory,
  }))
}

export async function fetchPatients(clinicDate?: string): Promise<Patient[]> {
  let query = supabase
    .from('patients')
    .select('id, name, uhid, package_id, assigned_doctor, priority, created_at, checked_in_at, clinic_date')
    .order('created_at')
  if (clinicDate) {
    query = query.eq('clinic_date', clinicDate)
  }
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    uhid: p.uhid,
    package_id: p.package_id,
    assigned_doctor: (p.assigned_doctor as DoctorCode) ?? null,
    priority: p.priority as Priority,
    created_at: p.created_at,
    checked_in_at: p.checked_in_at ?? null,
    clinic_date: p.clinic_date,
  }))
}

export async function fetchPatientTasks(patientIds?: string[]): Promise<PatientTask[]> {
  let query = supabase
    .from('patient_tasks')
    .select('id, patient_id, step_id, department_id, task_group, status, is_mandatory, skipped, started_at, completed_at, step_order, step_name')
    .order('patient_id')
    .order('step_order')
  if (patientIds && patientIds.length > 0) {
    query = query.in('patient_id', patientIds)
  } else if (patientIds && patientIds.length === 0) {
    // No patients for this date – return empty
    return []
  }
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((t) => ({
    id: t.id,
    patient_id: t.patient_id,
    step_id: t.step_id,
    department_id: t.department_id,
    task_group: t.task_group as TaskGroup,
    status: t.status as TaskStatus,
    is_mandatory: t.is_mandatory,
    skipped: t.skipped,
    started_at: t.started_at,
    completed_at: t.completed_at,
    step_order: t.step_order,
    step_name: t.step_name,
  }))
}

// ─── Load all data at once ───────────────────────────

export interface DbData {
  departments: Department[]
  packages: Package[]
  packageSteps: PackageStep[]
  patients: Patient[]
  patientTasks: PatientTask[]
}

export async function loadAllData(clinicDate?: string): Promise<DbData> {
  const [departments, packages, packageSteps, patients] = await Promise.all([
    fetchDepartments(),
    fetchPackages(),
    fetchPackageSteps(),
    fetchPatients(clinicDate),
  ])
  const patientIds = patients.map((p) => p.id)
  const patientTasks = await fetchPatientTasks(patientIds)
  return { departments, packages, packageSteps, patients, patientTasks }
}

/** Get all distinct clinic dates that have patients */
export async function fetchClinicDates(): Promise<string[]> {
  const { data, error } = await supabase
    .from('patients')
    .select('clinic_date')
    .order('clinic_date', { ascending: false })
  if (error) throw error
  const unique = [...new Set((data ?? []).map((r: { clinic_date: string }) => r.clinic_date))]
  return unique
}

// ─── Write helpers ───────────────────────────────────

export async function insertPatient(patient: Patient): Promise<void> {
  const { error } = await supabase.from('patients').insert({
    id: patient.id,
    name: patient.name,
    uhid: patient.uhid,
    package_id: patient.package_id,
    assigned_doctor: patient.assigned_doctor,
    priority: patient.priority,
    created_at: patient.created_at,
    checked_in_at: patient.checked_in_at,
    clinic_date: patient.clinic_date,
  })
  if (error) throw error
}

export async function insertPatientTasks(tasks: PatientTask[]): Promise<void> {
  const { error } = await supabase.from('patient_tasks').insert(
    tasks.map((t) => ({
      id: t.id,
      patient_id: t.patient_id,
      step_id: t.step_id,
      department_id: t.department_id,
      task_group: t.task_group,
      status: t.status,
      is_mandatory: t.is_mandatory,
      skipped: t.skipped,
      started_at: t.started_at,
      completed_at: t.completed_at,
      step_order: t.step_order,
      step_name: t.step_name,
    }))
  )
  if (error) throw error
}

export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  timestamp: string
): Promise<void> {
  const update: Record<string, unknown> = { status }
  if (status === 'IN_PROGRESS') update.started_at = timestamp
  if (status === 'COMPLETED') update.completed_at = timestamp
  const { error } = await supabase.from('patient_tasks').update(update).eq('id', taskId)
  if (error) throw error
}

export async function skipTaskInDb(taskId: string, timestamp: string): Promise<void> {
  const { error } = await supabase
    .from('patient_tasks')
    .update({ status: 'COMPLETED', skipped: true, completed_at: timestamp, started_at: timestamp })
    .eq('id', taskId)
  if (error) throw error
}

export async function updatePatientPriority(patientId: string, priority: Priority): Promise<void> {
  const { error } = await supabase.from('patients').update({ priority }).eq('id', patientId)
  if (error) throw error
}

export async function checkInPatientDb(patientId: string, timestamp: string): Promise<void> {
  const { error } = await supabase.from('patients').update({ checked_in_at: timestamp }).eq('id', patientId)
  if (error) throw error
}

export async function undoCheckInDb(patientId: string): Promise<void> {
  const { error: patientError } = await supabase
    .from('patients')
    .update({ checked_in_at: null })
    .eq('id', patientId)
  if (patientError) throw patientError

  const { error: tasksError } = await supabase
    .from('patient_tasks')
    .update({ status: 'NOT_STARTED', started_at: null, completed_at: null, skipped: false })
    .eq('patient_id', patientId)
  if (tasksError) throw tasksError
}

export async function deletePatientDb(patientId: string): Promise<void> {
  const { error: tasksError } = await supabase
    .from('patient_tasks')
    .delete()
    .eq('patient_id', patientId)
  if (tasksError) throw tasksError

  const { error: patientError } = await supabase
    .from('patients')
    .delete()
    .eq('id', patientId)
  if (patientError) throw patientError
}

export async function updatePatientPackageDb(
  patientId: string,
  packageId: string,
  newTasks: PatientTask[],
  assignedDoctor?: DoctorCode
): Promise<void> {
  // Update the patient's package and doctor
  const updateData: Record<string, unknown> = { package_id: packageId }
  if (assignedDoctor !== undefined) updateData.assigned_doctor = assignedDoctor
  const { error: pkgError } = await supabase
    .from('patients')
    .update(updateData)
    .eq('id', patientId)
  if (pkgError) throw pkgError

  // Delete old tasks
  const { error: delError } = await supabase
    .from('patient_tasks')
    .delete()
    .eq('patient_id', patientId)
  if (delError) throw delError

  // Insert new tasks
  const { error: insError } = await supabase.from('patient_tasks').insert(
    newTasks.map((t) => ({
      id: t.id,
      patient_id: t.patient_id,
      step_id: t.step_id,
      department_id: t.department_id,
      task_group: t.task_group,
      status: t.status,
      is_mandatory: t.is_mandatory,
      skipped: t.skipped,
      started_at: t.started_at,
      completed_at: t.completed_at,
      step_order: t.step_order,
      step_name: t.step_name,
    }))
  )
  if (insError) throw insError
}

export async function cancelTaskDb(taskId: string): Promise<void> {
  const { error } = await supabase
    .from('patient_tasks')
    .update({ status: 'NOT_STARTED', started_at: null, completed_at: null })
    .eq('id', taskId)
  if (error) throw error
}

export async function updateTaskTimesDb(
  taskId: string,
  startedAt: string | null,
  completedAt: string | null
): Promise<void> {
  const { error } = await supabase
    .from('patient_tasks')
    .update({ started_at: startedAt, completed_at: completedAt })
    .eq('id', taskId)
  if (error) throw error
}

export async function resetAllData(): Promise<DbData> {
  // Reset all patient tasks to NOT_STARTED
  const { error: tasksError } = await supabase
    .from('patient_tasks')
    .update({ status: 'NOT_STARTED', started_at: null, completed_at: null, skipped: false })
    .not('id', 'is', null)
  if (tasksError) throw tasksError

  // Clear all patient check-ins
  const { error: patientsError } = await supabase
    .from('patients')
    .update({ checked_in_at: null })
    .not('id', 'is', null)
  if (patientsError) throw patientsError

  // Re-fetch everything
  return loadAllData()
}

// ─── Package CRUD ────────────────────────────────────

export async function insertPackageDb(pkg: Package): Promise<void> {
  const { error } = await supabase.from('packages').insert({
    id: pkg.id,
    name: pkg.name,
    price: pkg.price,
    tracker_blood_sample: pkg.tracker_blood_sample,
    tracker_usg: pkg.tracker_usg,
    tracker_breakfast: pkg.tracker_breakfast,
    tracker_ppbs: pkg.tracker_ppbs,
    tracker_xray: pkg.tracker_xray,
    tracker_mammography: pkg.tracker_mammography,
    tracker_bmd: pkg.tracker_bmd,
    tracker_ecg: pkg.tracker_ecg,
    tracker_echo: pkg.tracker_echo,
    tracker_tmt: pkg.tracker_tmt,
    tracker_pft: pkg.tracker_pft,
    tracker_lunch: pkg.tracker_lunch,
    tracker_consultation: pkg.tracker_consultation,
    tracker_dental: pkg.tracker_dental,
  })
  if (error) throw error
}

export async function updatePackageDb(pkg: Package): Promise<void> {
  const { error } = await supabase.from('packages').update({
    name: pkg.name,
    price: pkg.price,
    tracker_blood_sample: pkg.tracker_blood_sample,
    tracker_usg: pkg.tracker_usg,
    tracker_breakfast: pkg.tracker_breakfast,
    tracker_ppbs: pkg.tracker_ppbs,
    tracker_xray: pkg.tracker_xray,
    tracker_mammography: pkg.tracker_mammography,
    tracker_bmd: pkg.tracker_bmd,
    tracker_ecg: pkg.tracker_ecg,
    tracker_echo: pkg.tracker_echo,
    tracker_tmt: pkg.tracker_tmt,
    tracker_pft: pkg.tracker_pft,
    tracker_lunch: pkg.tracker_lunch,
    tracker_consultation: pkg.tracker_consultation,
    tracker_dental: pkg.tracker_dental,
  }).eq('id', pkg.id)
  if (error) throw error
}

export async function insertPackageStepsDb(steps: PackageStep[]): Promise<void> {
  if (steps.length === 0) return
  const { error } = await supabase.from('package_steps').insert(
    steps.map((s) => ({
      id: s.id,
      package_id: s.package_id,
      step_name: s.step_name,
      department_id: s.department_id,
      step_order: s.step_order,
      task_group: s.task_group,
      is_mandatory: s.is_mandatory,
    }))
  )
  if (error) throw error
}

export async function deletePackageStepsDb(packageId: string): Promise<void> {
  const { error } = await supabase.from('package_steps').delete().eq('package_id', packageId)
  if (error) throw error
}
