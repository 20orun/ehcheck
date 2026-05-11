import { useState, useMemo } from 'react'
import { useApp } from '@/store/AppContext'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, X, Check, BookOpen, Loader2, CheckCircle2, Clock3, Search } from 'lucide-react'
import clsx from 'clsx'
import ExcelJS from 'exceljs'
import { EmptyState } from '@/components/ui'
import { CopyableUHID } from '@/components/CopyableUHID'
import type { CrossConsultation, CrossConsultationStatus, Package } from '@/types'

type TabType = 'consultations' | 'report' | 'tracker'

type CrossReportRow = {
  id: string
  date: string
  name: string
  uhid: string
  package_name: string
  department: string
  doctor: string
}

type CrossTrackerRow = {
  id: string
  name: string
  uhid: string
  package_name: string
  consultations: Array<{ department: string; doctor: string }>
}

/** Uppercase the name part, keep salutation as-is. */
function uppercaseName(raw: string): string {
  const m = raw.match(/^(Mr\.|Mrs\.|Ms\.|Dr\.|Baby|Fr|Master|Smt\.?)\s*/i)
  if (m) return m[0] + raw.slice(m[0].length).toUpperCase()
  return raw.toUpperCase()
}

function nameMatchesSearch(name: string, query: string): boolean {
  if (!query) return true
  const q = query.trim().toLowerCase()
  if (!q) return true
  return name.toLowerCase().split(/\s+/).some((word) => word.startsWith(q))
}

function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}-${month}-${year}`
}

// ─── Excel Export Helpers ────────────────────────────
const THIN: Partial<ExcelJS.Border> = { style: 'thin' }
const ALL_BORDERS: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN }
const FONT: Partial<ExcelJS.Font> = { name: 'Segoe UI', size: 10 }
const FONT_BOLD: Partial<ExcelJS.Font> = { ...FONT, bold: true }

function styleCell(cell: ExcelJS.Cell, font: Partial<ExcelJS.Font>, hAlign: 'center' | 'left' | 'right' = 'center') {
  cell.font = { ...font }
  cell.border = ALL_BORDERS
  cell.alignment = { horizontal: hAlign, vertical: 'middle', wrapText: true }
}

const COMMON_DEPARTMENTS = [
  'Audiology',
  'Cardiology',
  'Dental',
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

// ─── Cross Report Excel Export ───────────────────────
async function downloadCrossReportExcel(rows: CrossReportRow[], dateLabel: string) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Cross Consultations Report', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  })

  const COL_HEADERS = ['SL. NO', 'DATE', 'PATIENT NAME', 'UHID', 'PACKAGE', 'DEPARTMENT', 'DOCTOR']
  const TOTAL_COLS = COL_HEADERS.length

  ws.mergeCells(1, 1, 1, TOTAL_COLS)
  const titleCell = ws.getCell('A1')
  titleCell.value = `CROSS CONSULTATIONS REPORT  (${dateLabel})`
  styleCell(titleCell, { ...FONT, size: 13, bold: true }, 'center')
  ws.getRow(1).height = 26

  const hdrRow = ws.getRow(2)
  COL_HEADERS.forEach((h, i) => {
    const cell = hdrRow.getCell(i + 1)
    cell.value = h
    styleCell(cell, FONT_BOLD, 'center')
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
  })
  hdrRow.height = 22

  rows.forEach((r, idx) => {
    const rowNum = idx + 3
    const row = ws.getRow(rowNum)
    const vals: (string | number)[] = [
      idx + 1,
      r.date,
      uppercaseName(r.name),
      r.uhid,
      r.package_name || '—',
      r.department || '—',
      r.doctor || '—',
    ]
    vals.forEach((v, i) => {
      const cell = row.getCell(i + 1)
      cell.value = v
      const hAlign = i === 0 ? 'center' : 'left'
      styleCell(cell, FONT, hAlign)
    })
    row.height = 20
  })

  const totalRowNum = rows.length + 3
  const totalRow = ws.getRow(totalRowNum)
  ws.mergeCells(totalRowNum, 1, totalRowNum, TOTAL_COLS)
  const totalCell = totalRow.getCell(1)
  totalCell.value = `TOTAL CONSULTATIONS: ${rows.length}`
  styleCell(totalCell, { ...FONT, size: 11, bold: true }, 'center')
  totalRow.height = 24

  const colWidths = [6, 12, 28, 14, 24, 20, 24]
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cross-consultations-report-${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

function copyReportToClipboard(rows: CrossReportRow[]) {
  const data = rows.map((r) =>
    [
      r.date,
      uppercaseName(r.name),
      r.uhid,
      r.package_name || '—',
      r.department || '—',
      r.doctor || '—',
    ].join('\t')
  )
  const totalRow = `TOTAL CONSULTATIONS:\t${rows.length}`
  const text = [...data, totalRow].join('\n')
  navigator.clipboard.writeText(text)
}

// ─── Cross Tracker Excel Export ──────────────────────
async function downloadCrossTrackerExcel(rows: CrossTrackerRow[], dateLabel: string) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Cross Tracker', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  })

  ws.mergeCells(1, 1, 1, 8)
  const titleCell = ws.getCell('A1')
  titleCell.value = `CROSS CONSULTATION TRACKER  (${dateLabel})`
  styleCell(titleCell, { ...FONT, size: 13, bold: true }, 'center')
  ws.getRow(1).height = 26

  // Header row with merged CONSULTATIONS
  ws.mergeCells(2, 4, 2, 8)
  const headers = ['SL. NO', 'PATIENT NAME', 'UHID', 'CONSULTATIONS (up to 5)']
  headers.forEach((h, i) => {
    const cell = ws.getCell(2, i + 1)
    cell.value = h
    styleCell(cell, FONT_BOLD, 'center')
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
  })
  ws.getRow(2).height = 22

  rows.forEach((r, idx) => {
    const rowNum = idx + 3
    const row = ws.getRow(rowNum)
    
    // Basic info
    const slCell = row.getCell(1)
    slCell.value = idx + 1
    styleCell(slCell, FONT, 'center')
    
    const nameCell = row.getCell(2)
    nameCell.value = uppercaseName(r.name)
    styleCell(nameCell, FONT, 'left')
    
    const uhidCell = row.getCell(3)
    uhidCell.value = r.uhid
    styleCell(uhidCell, FONT, 'left')
    
    // Consultation cells (5 columns)
    for (let i = 0; i < 5; i++) {
      const cell = row.getCell(4 + i)
      if (r.consultations[i]) {
        const dept = r.consultations[i].department
        const doc = r.consultations[i].doctor
        cell.value = doc ? `${dept}\n(${doc})` : dept
      } else {
        cell.value = '—'
      }
      styleCell(cell, FONT, 'left')
    }
    row.height = 30
  })

  const totalRowNum = rows.length + 3
  const totalRow = ws.getRow(totalRowNum)
  ws.mergeCells(totalRowNum, 1, totalRowNum, 8)
  const totalCell = totalRow.getCell(1)
  totalCell.value = `TOTAL PATIENTS: ${rows.length}`
  styleCell(totalCell, { ...FONT, size: 11, bold: true }, 'center')
  totalRow.height = 24

  const colWidths = [6, 28, 14, 18, 18, 18, 18, 18]
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cross-tracker-${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

function copyTrackerToClipboard(rows: CrossTrackerRow[]) {
  const data = rows.map((r) => {
    const consultCols = []
    for (let i = 0; i < 5; i++) {
      if (r.consultations[i]) {
        const dept = r.consultations[i].department
        const doc = r.consultations[i].doctor
        consultCols.push(doc ? `${dept} (${doc})` : dept)
      } else {
        consultCols.push('—')
      }
    }
    return [uppercaseName(r.name), r.uhid, ...consultCols].join('\t')
  })
  const totalRow = `TOTAL PATIENTS:\t${rows.length}`
  const text = [...data, totalRow].join('\n')
  navigator.clipboard.writeText(text)
}

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
  const { getPatientsWithTasks, state, updateCrossConsultationStatus, deleteCrossConsultation, updateTrackerCellState } = useApp()
  const [activeTab, setActiveTab] = useState<TabType>('consultations')
  const [addingForPatientId, setAddingForPatientId] = useState<string | null>(null)
  const [editingCC, setEditingCC] = useState<CrossConsultation | null>(null)
  const [search, setSearch] = useState('')
  const [reportSearch, setReportSearch] = useState('')
  const [trackerSearch, setTrackerSearch] = useState('')
  const [copiedReport, setCopiedReport] = useState(false)
  const [copiedTracker, setCopiedTracker] = useState(false)


  const patients = getPatientsWithTasks()

  const filteredPatients = useMemo(() => {
    if (!search.trim()) return patients
    const q = search.toLowerCase()
    return patients.filter((p) => 
      (p.name && p.name.toLowerCase().includes(q)) || 
      (p.uhid && p.uhid.toLowerCase().includes(q))
    )
  }, [patients, search])

  const allCCs = state.crossConsultations
  const addingPatient = addingForPatientId ? patients.find((p) => p.id === addingForPatientId) : null
  const editingPatient = editingCC ? patients.find((p) => p.id === editingCC.patient_id) : null

  const totalBooked = allCCs.filter((c) => c.status === 'BOOKED').length
  const totalInProgress = allCCs.filter((c) => c.status === 'IN_PROGRESS').length
  const totalCompleted = allCCs.filter((c) => c.status === 'COMPLETED').length

  // Prepare Cross Report data
  const today = new Date()
  const dateLabel = today.toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const todayEnd = new Date(todayStart)
  todayEnd.setDate(todayEnd.getDate() + 1)

  const reportRows: CrossReportRow[] = []
  const todayPatients = state.patients.filter((p) => {
    if (!p.checked_in_at) return false
    const checkinDate = new Date(p.checked_in_at)
    return checkinDate >= todayStart && checkinDate < todayEnd
  })

  todayPatients.forEach((patient) => {
    const consultations = state.crossConsultations.filter((cc) => cc.patient_id === patient.id)
    const pkg: Package | undefined = state.packages.find((pk) => pk.id === patient.package_id)

    if (consultations.length === 0) return

    consultations.forEach((consultation) => {
      reportRows.push({
        id: `${patient.id}-${consultation.id}`,
        date: formatDate(new Date(consultation.created_at)),
        name: patient.name,
        uhid: patient.uhid,
        package_name: pkg?.name ?? '',
        department: consultation.department_name,
        doctor: consultation.doctor_name || '—',
      })
    })
  })

  // Prepare Cross Tracker data
  const trackerRows: CrossTrackerRow[] = todayPatients
    .map((patient) => {
      const consultations = state.crossConsultations.filter((cc) => cc.patient_id === patient.id)
      if (consultations.length === 0) return null

      const pkg: Package | undefined = state.packages.find((pk) => pk.id === patient.package_id)

      return {
        id: patient.id,
        name: patient.name,
        uhid: patient.uhid,
        package_name: pkg?.name ?? '',
        consultations: consultations.slice(0, 5).map((cc) => ({
          department: cc.department_name,
          doctor: cc.doctor_name || '',
        })),
      }
    })
    .filter((row): row is CrossTrackerRow => row !== null)

  const filteredReportRows = reportSearch.trim()
    ? reportRows.filter((r) => nameMatchesSearch(r.name, reportSearch))
    : reportRows

  const filteredTrackerRows = trackerSearch.trim()
    ? trackerRows.filter((r) => nameMatchesSearch(r.name, trackerSearch))
    : trackerRows

  function handleReportCopy() {
    copyReportToClipboard(reportRows)
    setCopiedReport(true)
    setTimeout(() => setCopiedReport(false), 2000)
  }

  function handleTrackerCopy() {
    copyTrackerToClipboard(trackerRows)
    setCopiedTracker(true)
    setTimeout(() => setCopiedTracker(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Cross Consultations</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage referrals and track consultations</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('consultations')}
            className={clsx(
              'whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors',
              activeTab === 'consultations'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            Consultations
          </button>
          <button
            onClick={() => setActiveTab('report')}
            className={clsx(
              'whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors',
              activeTab === 'report'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            Cross Report
          </button>
          <button
            onClick={() => setActiveTab('tracker')}
            className={clsx(
              'whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors',
              activeTab === 'tracker'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            Cross Tracker
          </button>
        </nav>
      </div>

      {/* Tab Content: Consultations */}
      {activeTab === 'consultations' && (
        <>
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
        </>
      )}

      {/* Tab Content: Cross Report */}
      {activeTab === 'report' && (
        <div className="space-y-4">
          {reportRows.length === 0 ? (
            <EmptyState message="No cross consultations for today" />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Cross Consultations Report</h3>
                  <p className="text-sm text-gray-500">{dateLabel}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex items-center">
                    <Search className="absolute left-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={reportSearch}
                      onChange={(e) => setReportSearch(e.target.value)}
                      placeholder="Search patient…"
                      className="rounded border border-gray-300 bg-white text-sm pl-7 pr-2 py-1.5 w-44 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleReportCopy}
                    className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {copiedReport ? 'Copied!' : 'Copy to Clipboard'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadCrossReportExcel(reportRows, dateLabel)}
                    className="inline-flex items-center rounded-md bg-primary-700 px-3 py-2 text-sm font-medium text-white hover:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    Export Excel
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">#</th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">Date</th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">Patient Name</th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">UHID</th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">Package</th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">Department</th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">Doctor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredReportRows.map((r, idx) => (
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-3 text-gray-500">{idx + 1}</td>
                        <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{r.date}</td>
                        <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">{uppercaseName(r.name)}</td>
                        <td className="px-3 py-3 text-gray-600 font-mono text-xs"><CopyableUHID uhid={r.uhid} /></td>
                        <td className="px-3 py-3 text-gray-700">{r.package_name || '—'}</td>
                        <td className="px-3 py-3 text-gray-700">{r.department || '—'}</td>
                        <td className="px-3 py-3 text-gray-700">{r.doctor || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td colSpan={7} className="px-3 py-3 text-center font-semibold text-gray-900">
                        Total Consultations: {filteredReportRows.length}{reportSearch.trim() ? ` (of ${reportRows.length})` : ''}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Department-wise summary */}
              {(() => {
                const deptCounts = filteredReportRows.reduce<Record<string, number>>((acc, r) => {
                  const key = r.department || '—'
                  acc[key] = (acc[key] ?? 0) + 1
                  return acc
                }, {})
                const entries = Object.entries(deptCounts).sort((a, b) => b[1] - a[1])
                return (
                  <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
                    <table className="text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left px-3 py-2 font-semibold text-gray-700 whitespace-nowrap">Department</th>
                          <th className="text-center px-3 py-2 font-semibold text-gray-700 whitespace-nowrap">Count</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {entries.map(([dept, count]) => (
                          <tr key={dept} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-800">{dept}</td>
                            <td className="px-3 py-2 text-center font-semibold text-gray-900">{count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })()}
            </>
          )}
        </div>
      )}

      {/* Tab Content: Cross Tracker */}
      {activeTab === 'tracker' && (
        <div className="space-y-4">
          {trackerRows.length === 0 ? (
            <EmptyState message="No cross consultations for today" />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Cross Consultation Tracker</h3>
                  <p className="text-sm text-gray-500">{dateLabel}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex items-center">
                    <Search className="absolute left-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={trackerSearch}
                      onChange={(e) => setTrackerSearch(e.target.value)}
                      placeholder="Search patient…"
                      className="rounded border border-gray-300 bg-white text-sm pl-7 pr-2 py-1.5 w-44 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleTrackerCopy}
                    className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {copiedTracker ? 'Copied!' : 'Copy to Clipboard'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadCrossTrackerExcel(trackerRows, dateLabel)}
                    className="inline-flex items-center rounded-md bg-primary-700 px-3 py-2 text-sm font-medium text-white hover:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    Export Excel
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">#</th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">Patient Name</th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">UHID</th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">Package</th>
                      <th className="text-center px-3 py-3 font-semibold text-gray-700" colSpan={5}>
                        Consultations
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredTrackerRows.map((r, idx) => (
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-3 text-gray-500">{idx + 1}</td>
                        <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">{uppercaseName(r.name)}</td>
                        <td className="px-3 py-3 text-gray-600 font-mono text-xs"><CopyableUHID uhid={r.uhid} /></td>
                        <td className="px-3 py-3 text-gray-700">{r.package_name || '—'}</td>
                        {[0, 1, 2, 3, 4].map((i) => {
                          const hasConsultation = r.consultations[i]
                          const patient = state.patients.find(p => p.id === r.id)
                          const cellKey = `cc_${i}`
                          const cellState = patient?.tracker_cell_states?.[cellKey] ?? ''
                          const isYellow = cellState === 'yellow'
                          const isYellowX = cellState === 'yellow-x'

                          const handleClick = () => {
                            if (!hasConsultation) return
                            const currentPatient = state.patients.find(p => p.id === r.id)
                            const currentState = currentPatient?.tracker_cell_states?.[cellKey] ?? ''
                            const next = currentState === '' ? 'yellow' : currentState === 'yellow' ? 'yellow-x' : null
                            void updateTrackerCellState(r.id, cellKey, next, currentPatient?.tracker_cell_states ?? {})
                          }

                          return (
                            <td
                              key={i}
                              onClick={handleClick}
                              className={clsx(
                                'px-3 py-3 text-gray-700 text-xs transition-all duration-200',
                                hasConsultation && 'cursor-pointer hover:bg-yellow-100',
                                isYellow && 'bg-[#FFFF00] shadow-[inset_0_0_0_2px_#FFD700]',
                                isYellowX && 'bg-[#FFFF00] shadow-[inset_0_0_0_2px_#FFD700]'
                              )}
                            >
                              {hasConsultation ? (
                                <div className="relative">
                                  {isYellowX && (
                                    <span className="absolute inset-0 flex items-center justify-center text-gray-800 font-bold text-lg pointer-events-none">✕</span>
                                  )}
                                  <div className={clsx('font-medium', isYellowX && 'opacity-40')}>{r.consultations[i].department}</div>
                                  {r.consultations[i].doctor && (
                                    <div className={clsx('text-gray-500 mt-0.5', isYellowX && 'opacity-40')}>({r.consultations[i].doctor})</div>
                                  )}
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td colSpan={9} className="px-3 py-3 text-center font-semibold text-gray-900">
                        Total Patients: {filteredTrackerRows.length}{trackerSearch.trim() ? ` (of ${trackerRows.length})` : ''}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}

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
