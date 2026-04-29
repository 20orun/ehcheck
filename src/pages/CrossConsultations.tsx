import { useState, useMemo } from 'react'
import { useApp } from '@/store/AppContext'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, X, Check, BookOpen, Loader2, CheckCircle2, Clock3 } from 'lucide-react'
import clsx from 'clsx'
import type { CrossConsultation, CrossConsultationStatus } from '@/types'

const COMMON_DEPARTMENTS = [
  'Cardiology',
  'Dermatology',
  'Endocrinology',
  'ENT',
  'Gastroenterology',
  'General Surgery',
  'Gynaecology',
  'Nephrology',
  'Neurology',
  'Oncology',
  'Ophthalmology',
  'Orthopaedics',
  'Psychiatry',
  'Pulmonology',
  'Rheumatology',
  'Urology',
]

const STATUS_CONFIG: Record<CrossConsultationStatus, { label: string; bg: string; text: string; border: string; icon: React.ReactNode }> = {
  BOOKED: {
    label: 'Booked',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    icon: <BookOpen className="w-3.5 h-3.5" />,
  },
  IN_PROGRESS: {
    label: 'In Progress',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
  },
  COMPLETED: {
    label: 'Completed',
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
}

function StatusBadge({ status }: { status: CrossConsultationStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', cfg.bg, cfg.text, cfg.border)}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

interface AddEditModalProps {
  patientId: string
  patientName: string
  existing?: CrossConsultation
  onClose: () => void
}

function AddEditModal({ patientId, patientName, existing, onClose }: AddEditModalProps) {
  const { addCrossConsultation, editCrossConsultation } = useApp()
  const [dept, setDept] = useState(existing?.department_name ?? '')
  const [deptInput, setDeptInput] = useState(existing?.department_name ?? '')
  const [doctor, setDoctor] = useState(existing?.doctor_name ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const suggestions = useMemo(() => {
    if (!deptInput.trim()) return COMMON_DEPARTMENTS
    const q = deptInput.toLowerCase()
    return COMMON_DEPARTMENTS.filter((d) => d.toLowerCase().includes(q))
  }, [deptInput])

  const handleSubmit = () => {
    const finalDept = deptInput.trim() || dept.trim()
    if (!finalDept) return
    if (existing) {
      editCrossConsultation(existing.id, finalDept, doctor.trim(), notes.trim())
    } else {
      addCrossConsultation(patientId, finalDept, doctor.trim(), notes.trim())
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">
            {existing ? 'Edit Cross Consultation' : 'Add Cross Consultation'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-500">Patient: <span className="font-medium text-gray-800">{patientName}</span></p>

          {/* Department */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Department <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={deptInput}
              onChange={(e) => { setDeptInput(e.target.value); setDept(e.target.value); setShowSuggestions(true) }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="e.g. Cardiology"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              autoFocus
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {suggestions.map((s) => (
                  <li
                    key={s}
                    onMouseDown={() => { setDeptInput(s); setDept(s); setShowSuggestions(false) }}
                    className="px-3 py-2 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-700 cursor-pointer"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Doctor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Doctor Name</label>
            <input
              type="text"
              value={doctor}
              onChange={(e) => setDoctor(e.target.value)}
              placeholder="e.g. Dr. Smith"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!deptInput.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Check className="w-4 h-4" />
            {existing ? 'Save Changes' : 'Add Consultation'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CrossConsultations() {
  const { getPatientsWithTasks, state, updateCrossConsultationStatus, deleteCrossConsultation } = useApp()
  const [addingForPatientId, setAddingForPatientId] = useState<string | null>(null)
  const [editingCC, setEditingCC] = useState<CrossConsultation | null>(null)
  const [search, setSearch] = useState('')

  const patients = getPatientsWithTasks()

  const filteredPatients = useMemo(() => {
    if (!search.trim()) return patients
    const q = search.toLowerCase()
    return patients.filter((p) => p.name.toLowerCase().includes(q) || p.uhid.toLowerCase().includes(q))
  }, [patients, search])

  // Patients that have cross consultations (for the overview) + all patients (for adding)
  const allCCs = state.crossConsultations

  const addingPatient = addingForPatientId ? patients.find((p) => p.id === addingForPatientId) : null
  const editingPatient = editingCC ? patients.find((p) => p.id === editingCC.patient_id) : null

  const totalBooked = allCCs.filter((c) => c.status === 'BOOKED').length
  const totalInProgress = allCCs.filter((c) => c.status === 'IN_PROGRESS').length
  const totalCompleted = allCCs.filter((c) => c.status === 'COMPLETED').length

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Cross Consultations</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage referrals to other departments for today's patients</p>
        </div>
      </div>

      {/* Summary pills */}
      <div className="flex flex-wrap gap-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-sm text-blue-700">
          <BookOpen className="w-4 h-4" />
          <span className="font-semibold">{totalBooked}</span> Booked
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-sm text-amber-700">
          <Clock3 className="w-4 h-4" />
          <span className="font-semibold">{totalInProgress}</span> In Progress
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-sm text-green-700">
          <CheckCircle2 className="w-4 h-4" />
          <span className="font-semibold">{totalCompleted}</span> Completed
        </div>
      </div>

      {/* Patient search */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patients by name or UHID..."
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        {filteredPatients.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">No patients found for today.</p>
        )}

        <div className="space-y-3">
          {filteredPatients.map((patient) => {
            const ccs = allCCs.filter((c) => c.patient_id === patient.id)
            return (
              <div key={patient.id} className="rounded-lg border border-gray-200 overflow-hidden">
                {/* Patient header */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/patient/${patient.id}`}
                      className="text-sm font-semibold text-gray-900 hover:text-primary-600 transition-colors"
                    >
                      {patient.name}
                    </Link>
                    <span className="text-xs text-gray-400">UHID: {patient.uhid}</span>
                    {ccs.length > 0 && (
                      <span className="text-xs font-medium bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full">
                        {ccs.length}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setAddingForPatientId(patient.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>

                {/* Cross consultation rows */}
                {ccs.length > 0 && (
                  <div className="divide-y divide-gray-50">
                    {ccs.map((cc) => (
                      <div key={cc.id} className="px-4 py-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-900">{cc.department_name}</span>
                            {cc.doctor_name && (
                              <span className="text-xs text-gray-500">&bull; {cc.doctor_name}</span>
                            )}
                            <StatusBadge status={cc.status} />
                          </div>
                          {cc.notes && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">{cc.notes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Status cycle buttons */}
                          {cc.status === 'BOOKED' && (
                            <button
                              onClick={() => updateCrossConsultationStatus(cc.id, 'IN_PROGRESS')}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                            >
                              <Loader2 className="w-3 h-3" /> Start
                            </button>
                          )}
                          {cc.status === 'IN_PROGRESS' && (
                            <button
                              onClick={() => updateCrossConsultationStatus(cc.id, 'COMPLETED')}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Done
                            </button>
                          )}
                          <button
                            onClick={() => setEditingCC(cc)}
                            className="inline-flex items-center p-1.5 text-gray-400 hover:text-primary-600 rounded-lg hover:bg-gray-100 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Remove this cross consultation?')) deleteCrossConsultation(cc.id)
                            }}
                            className="inline-flex items-center p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {ccs.length === 0 && (
                  <div className="px-4 py-3 text-xs text-gray-400 italic">No cross consultations assigned</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Add modal */}
      {addingPatient && (
        <AddEditModal
          patientId={addingPatient.id}
          patientName={addingPatient.name}
          onClose={() => setAddingForPatientId(null)}
        />
      )}

      {/* Edit modal */}
      {editingCC && editingPatient && (
        <AddEditModal
          patientId={editingPatient.id}
          patientName={editingPatient.name}
          existing={editingCC}
          onClose={() => setEditingCC(null)}
        />
      )}
    </div>
  )
}
