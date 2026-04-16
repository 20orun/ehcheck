import { useState } from 'react'
import ExcelJS from 'exceljs'
import { useApp } from '@/store/AppContext'
import { EmptyState } from '@/components/ui'
import { DOCTORS } from '@/types'
import type { Package, PatientTask, DoctorCode } from '@/types'

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

/** Return HH:MM of the last completed task for a patient, only if ALL tasks are completed */
function getOutTime(patientId: string, patientTasks: PatientTask[]): string {
  const tasks = patientTasks.filter((t) => t.patient_id === patientId && !t.skipped)
  if (tasks.length === 0) return ''
  if (tasks.some((t) => t.status !== 'COMPLETED')) return ''
  let latest: Date | null = null
  for (const t of tasks) {
    if (t.completed_at) {
      const d = new Date(t.completed_at)
      if (!latest || d > latest) latest = d
    }
  }
  return latest ? latest.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : ''
}

function formatCost(cost: number | null): string {
  if (cost === null || cost === undefined) return '—'
  return cost.toLocaleString('en-IN')
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

const COL_HEADERS = ['SL. NO', 'PATIENT NAME', 'UHID', 'PACKAGE', 'DOCTOR ASSIGNED', 'PACKAGE COST', 'IN TIME', 'OUT TIME']
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
      p.in_time,
      p.out_time || '',
    ]
    vals.forEach((v, i) => {
      const cell = row.getCell(i + 1)
      cell.value = v
      const hAlign = i === 0 ? 'center' : i === 5 ? 'right' : 'left'
      styleCell(cell, FONT, hAlign)
      if (i === 5 && typeof v === 'number') {
        cell.numFmt = '#,##0'
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
  const colWidths = [6, 28, 14, 24, 24, 14, 10, 10]
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
  const header = COL_HEADERS.join('\t')
  const rows = patients.map((p, idx) =>
    [
      idx + 1,
      uppercaseName(p.name),
      p.uhid,
      p.package_name || '—',
      p.doctor_name || '—',
      p.package_cost !== null ? p.package_cost : '',
      p.in_time,
      p.out_time || '',
    ].join('\t')
  )
  const totalRow = `TOTAL PATIENTS:\t${patients.length}`
  const text = [header, ...rows, totalRow].join('\n')
  navigator.clipboard.writeText(text)
}

// ─── Component ───────────────────────────────────────
export default function DailyReport() {
  const { state } = useApp()

  const today = new Date()
  const dateLabel = today.toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })

  const patients: ReportPatient[] = state.patients
    .filter((p): p is typeof p & { checked_in_at: string } => p.checked_in_at !== null)
    .sort((a, b) => new Date(a.checked_in_at!).getTime() - new Date(b.checked_in_at!).getTime())
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
        out_time: getOutTime(p.id, state.patientTasks),
      }
    })

  const [copied, setCopied] = useState(false)

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
            {patients.map((p, idx) => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-3 py-3 text-gray-500">{idx + 1}</td>
                <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">{uppercaseName(p.name)}</td>
                <td className="px-3 py-3 text-gray-600 font-mono text-xs">{p.uhid}</td>
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
                Total Patients: {patients.length}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
