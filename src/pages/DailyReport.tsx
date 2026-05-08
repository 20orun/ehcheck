import { useState } from 'react'
import ExcelJS from 'exceljs'
import { useApp } from '@/store/AppContext'
import { EmptyState } from '@/components/ui'
import { CopyableUHID } from '@/components/CopyableUHID'
import { DOCTORS } from '@/types'
import type { Package, PatientTask, DoctorCode } from '@/types'
import { Search } from 'lucide-react'

type ReportPatient = {
  id: string
  name: string
  uhid: string
  package_name: string
  assigned_doctor: DoctorCode
  doctor_name: string
  package_cost: number | null
  in_time: string
  out_time: string
}

function nameMatchesSearch(name: string, query: string): boolean {
  if (!query) return true
  const q = query.trim().toLowerCase()
  if (!q) return true
  return name.toLowerCase().split(/\s+/).some((word) => word.startsWith(q))
}

/** Strip MALE / FEMALE suffix to get base package name */
function basePackageName(packageName: string): string {
  return packageName.trim().replace(/\s*(MALE|FEMALE)\s*$/i, '').trim() || packageName
}

/** Uppercase the name part, keep salutation as-is. */
function uppercaseName(raw: string): string {
  const m = raw.match(/^(Mr\.|Mrs\.|Ms\.|Dr\.|Baby|Fr|Master|Smt\.?)\s*/i)
  if (m) return m[0] + raw.slice(m[0].length).toUpperCase()
  return raw.toUpperCase()
}

function getDoctorName(code: DoctorCode): string {
  if (!code) return ''
  return DOCTORS.find((d) => d.code === code)?.name ?? code
}

/** Return HH:MM of the CONSULT task completion time, or '' if not yet done */
function getConsultOutTime(patientId: string, patientTasks: PatientTask[]): string {
  const task = patientTasks.find((t) => t.patient_id === patientId && t.task_group === 'CONSULT' && t.status === 'COMPLETED')
  if (!task?.completed_at) return ''
  return new Date(task.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatCost(cost: number | null): string {
  if (cost === null || cost === undefined) return '—'
  return String(cost)
}

// ─── Excel Export ────────────────────────────────────
const THIN: Partial<ExcelJS.Border> = { style: 'thin' }
const ALL_BORDERS: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN }
const FONT: Partial<ExcelJS.Font> = { name: 'Segoe UI', size: 10 }
const FONT_BOLD: Partial<ExcelJS.Font> = { ...FONT, bold: true }

function styleCell(cell: ExcelJS.Cell, font: Partial<ExcelJS.Font>, hAlign: 'center' | 'left' | 'right' = 'center') {
  cell.font = { ...font }
  cell.border = ALL_BORDERS
  cell.alignment = { horizontal: hAlign, vertical: 'middle', wrapText: true }
}

const COL_HEADERS = ['SL. NO', 'PATIENT NAME', 'UHID', 'PACKAGE', 'DOCTOR ASSIGNED', 'PACKAGE COST', '', 'IN TIME', 'OUT TIME']
const TOTAL_COLS = COL_HEADERS.length

async function downloadDailyReportExcel(patients: ReportPatient[], dateLabel: string) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Daily Report', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  })

  /* Row 1: Title */
  ws.mergeCells(1, 1, 1, TOTAL_COLS)
  const titleCell = ws.getCell('A1')
  titleCell.value = `EXECUTIVE HEALTH CHECKUP — DAILY REPORT  (${dateLabel})`
  styleCell(titleCell, { ...FONT, size: 13, bold: true }, 'center')
  ws.getRow(1).height = 26

  /* Row 2: Column headers */
  const hdrRow = ws.getRow(2)
  COL_HEADERS.forEach((h, i) => {
    const cell = hdrRow.getCell(i + 1)
    cell.value = h
    styleCell(cell, FONT_BOLD, 'center')
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
  })
  hdrRow.height = 22

  /* Data rows */
  patients.forEach((p, idx) => {
    const rowNum = idx + 3
    const row = ws.getRow(rowNum)
    const vals: (string | number)[] = [
      idx + 1,
      uppercaseName(p.name),
      p.uhid,
      p.package_name || '—',
      p.doctor_name || '—',
      p.package_cost !== null ? p.package_cost : 0,
      '',
      p.in_time,
      p.out_time || '',
    ]
    vals.forEach((v, i) => {
      const cell = row.getCell(i + 1)
      cell.value = v
      const hAlign = i === 0 ? 'center' : i === 5 ? 'right' : 'left'
      styleCell(cell, FONT, hAlign)
      if (i === 5 && typeof v === 'number') {
        cell.numFmt = '0'
      }
    })
    row.height = 20
  })

  /* Total row */
  const totalRowNum = patients.length + 3
  const totalRow = ws.getRow(totalRowNum)
  ws.mergeCells(totalRowNum, 1, totalRowNum, TOTAL_COLS)
  const totalCell = totalRow.getCell(1)
  totalCell.value = `TOTAL PATIENTS: ${patients.length}`
  styleCell(totalCell, { ...FONT, size: 11, bold: true }, 'center')
  totalRow.height = 24

  /* Column widths */
  const colWidths = [6, 28, 14, 24, 24, 14, 4, 10, 10]
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  /* Download */
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `daily-report-${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Clipboard ───────────────────────────────────────
function copyToClipboard(patients: ReportPatient[]) {
  const rows = patients.map((p) =>
    [
      uppercaseName(p.name),
      p.uhid,
      p.package_name || '—',
      p.doctor_name || '—',
      p.package_cost !== null ? p.package_cost : '',
      '',
      p.in_time,
      p.out_time || '',
    ].join('\t')
  )
  const totalRow = `TOTAL PATIENTS:\t${patients.length}`
  const text = [...rows, totalRow].join('\n')
  navigator.clipboard.writeText(text)
}

// ─── Component ───────────────────────────────────────
export default function DailyReport() {
  const { state } = useApp()

  const today = new Date()
  const dateLabel = today.toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })

  const patients: ReportPatient[] = state.patients
    .filter((p): p is typeof p & { checked_in_at: string } => p.checked_in_at !== null)
    .sort((a, b) => {
      // International patients always come after non-international
      if (a.is_international !== b.is_international) return a.is_international ? 1 : -1
      return new Date(a.checked_in_at!).getTime() - new Date(b.checked_in_at!).getTime()
    })
    .map((p) => {
      const pkg: Package | undefined = state.packages.find((pk) => pk.id === p.package_id)
      return {
        id: p.id,
        name: p.name,
        uhid: p.uhid,
        package_name: pkg?.name ?? '',
        assigned_doctor: p.assigned_doctor,
        doctor_name: getDoctorName(p.assigned_doctor),
        package_cost: pkg?.price ?? null,
        in_time: new Date(p.checked_in_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
        out_time: p.tracker_cell_states?.['out'] || getConsultOutTime(p.id, state.patientTasks),
      }
    })

  const [copied, setCopied] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredPatients = searchQuery.trim()
    ? patients.filter((p) => nameMatchesSearch(p.name, searchQuery))
    : patients

  function handleCopy() {
    copyToClipboard(patients)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (patients.length === 0) {
    return <EmptyState message="No checked-in patients yet" />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Daily Report</h2>
          <p className="text-sm text-gray-500">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Search className="absolute left-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search patient…"
              className="rounded border border-gray-300 bg-white text-sm pl-7 pr-2 py-1.5 w-44 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
          <button
            type="button"
            onClick={() => void downloadDailyReportExcel(patients, dateLabel)}
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
              <th className="text-left px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">Doctor Assigned</th>
              <th className="text-right px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">Package Cost</th>
              <th className="text-left px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">In Time</th>
              <th className="text-left px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">Out Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredPatients.map((p, idx) => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-3 py-3 text-gray-500">{idx + 1}</td>
                <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">{uppercaseName(p.name)}</td>
                <td className="px-3 py-3 text-gray-600 font-mono text-xs"><CopyableUHID uhid={p.uhid} /></td>
                <td className="px-3 py-3 text-gray-700">{p.package_name || '—'}</td>
                <td className="px-3 py-3 text-gray-700">{p.doctor_name || '—'}</td>
                <td className="px-3 py-3 text-gray-700 text-right font-mono">{formatCost(p.package_cost)}</td>
                <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{p.in_time}</td>
                <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{p.out_time || ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t border-gray-200">
              <td colSpan={8} className="px-3 py-3 text-center font-semibold text-gray-900">
                Total Patients: {filteredPatients.length}{searchQuery.trim() ? ` (of ${patients.length})` : ''}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Package-wise count summary */}
      {(() => {
        const pkgCounts = filteredPatients.reduce<Record<string, number>>((acc, p) => {
          const key = p.package_name ? basePackageName(p.package_name) : '—'
          acc[key] = (acc[key] ?? 0) + 1
          return acc
        }, {})
        const entries = Object.entries(pkgCounts).sort((a, b) => b[1] - a[1])
        return (
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2 font-semibold text-gray-700 whitespace-nowrap">Package</th>
                  <th className="text-center px-3 py-2 font-semibold text-gray-700 whitespace-nowrap">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map(([pkg, count]) => (
                  <tr key={pkg} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-800">{pkg}</td>
                    <td className="px-3 py-2 text-center font-semibold text-gray-900">{count}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td className="px-3 py-2 font-semibold text-gray-900">Total</td>
                  <td className="px-3 py-2 text-center font-semibold text-gray-900">{patients.length}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      })()}
    </div>
  )
}
