import ExcelJS from 'exceljs'
import { useApp } from '@/store/AppContext'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/ui'
import type { Package, PatientTask, DoctorCode } from '@/types'

const TRACKER_COLS = [
  { key: 'bloodSample', label: 'BLOOD\nSAMPLE' },
  { key: 'usg', label: 'USG' },
  { key: 'breakfast', label: 'BREAK\nFAST' },
  { key: 'ppbs', label: 'PPBS\nTIME' },
  { key: 'xray', label: 'X-RAY' },
  { key: 'mammography', label: 'MAMMO\nGRAPHY/USG' },
  { key: 'bmd', label: 'BMD' },
  { key: 'ecg', label: 'ECG' },
  { key: 'echo', label: 'ECHO' },
  { key: 'tmt', label: 'TMT' },
  { key: 'pft', label: 'PFT' },
  { key: 'lunch', label: 'LUNCH' },
  { key: 'consultation', label: 'CONSUL\nTATION' },
  { key: 'd', label: 'D' },
]

const TRACKER_KEY_MAP: Record<string, keyof Package> = {
  bloodSample: 'tracker_blood_sample',
  usg: 'tracker_usg',
  breakfast: 'tracker_breakfast',
  ppbs: 'tracker_ppbs',
  xray: 'tracker_xray',
  mammography: 'tracker_mammography',
  bmd: 'tracker_bmd',
  ecg: 'tracker_ecg',
  echo: 'tracker_echo',
  tmt: 'tracker_tmt',
  pft: 'tracker_pft',
  lunch: 'tracker_lunch',
  consultation: 'tracker_consultation',
  d: 'tracker_dental',
}

function getTrackerCellValue(pkg: Package | undefined, key: string): string {
  if (!pkg) return ''
  const field = TRACKER_KEY_MAP[key]
  if (!field) return ''
  return (pkg[field] as string) || ''
}

type CheckedInPatient = { id: string; name: string; uhid: string; package_name?: string; pkg?: Package; checked_in_at: string; package_id: string | null; assigned_doctor: DoctorCode; priority: import('@/types').Priority; created_at: string; outTime?: string }

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

const ROWS_PER_SHEET = 20
// 23 columns: A=SL.NO, B=NAME, C=UHID, D=PACKAGE, E=DR, F–S=14 tracker cols, T=OP, U=IN, V=OUT
const COL_HEADERS = [
  'SL.\nNO', 'PATIENT NAME', 'UHID', 'PACKAGE', 'DR',
  ...TRACKER_COLS.map((c) => c.label.replace(/\n/g, '\n')),
  'OP', 'IN', 'OUT',
]
const TOTAL_COLS = COL_HEADERS.length // 23 (A–W)

const FONT: Partial<ExcelJS.Font> = { name: 'Segoe UI Black', size: 8 }
const FONT_BOLD: Partial<ExcelJS.Font> = { ...FONT, bold: true }
const THIN: Partial<ExcelJS.Border> = { style: 'thin' }
const ALL_BORDERS: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN }

/** Uppercase the name part, keep salutation as-is.  "Mrs. ashly thomas" → "Mrs. ASHLY THOMAS" */
function uppercaseName(raw: string): string {
  const m = raw.match(/^(Mr\.|Mrs\.|Ms\.|Dr\.|Baby|Fr|Master|Smt\.?)\s*/i)
  if (m) return m[0] + raw.slice(m[0].length).toUpperCase()
  return raw.toUpperCase()
}

/** Abbreviate MALE/FEMALE → (M)/(F) and wrap for compact display (prefer ≤2 lines) */
function wrapPackageName(name: string): string {
  if (!name) return ''
  // Abbreviate trailing MALE / FEMALE
  let text = name.replace(/\s+FEMALE$/i, ' (F)').replace(/\s+MALE$/i, ' (M)')

  const MAX_LINE = 15
  if (text.length <= MAX_LINE) return text

  const words = text.split(/\s+/)
  if (words.length <= 1) return text

  // Find the best 2-line split (minimise the longer line)
  let bestSplit = 1
  let bestMax = Infinity
  for (let i = 1; i < words.length; i++) {
    const maxLen = Math.max(
      words.slice(0, i).join(' ').length,
      words.slice(i).join(' ').length,
    )
    if (maxLen < bestMax) { bestMax = maxLen; bestSplit = i }
  }

  if (bestMax <= MAX_LINE + 3) {
    return words.slice(0, bestSplit).join(' ') + '\n' + words.slice(bestSplit).join(' ')
  }

  // Fall back to 3 lines only when 2 lines can't fit
  let best3 = { i: 1, j: 2, max: Infinity }
  for (let i = 1; i < words.length - 1; i++) {
    for (let j = i + 1; j < words.length; j++) {
      const maxLen = Math.max(
        words.slice(0, i).join(' ').length,
        words.slice(i, j).join(' ').length,
        words.slice(j).join(' ').length,
      )
      if (maxLen < best3.max) best3 = { i, j, max: maxLen }
    }
  }
  return [
    words.slice(0, best3.i).join(' '),
    words.slice(best3.i, best3.j).join(' '),
    words.slice(best3.j).join(' '),
  ].join('\n')
}

function styleCell(cell: ExcelJS.Cell, font: Partial<ExcelJS.Font>, hAlign: 'center' | 'left' | 'right' = 'center') {
  cell.font = { ...font }
  cell.border = ALL_BORDERS
  cell.alignment = { horizontal: hAlign, vertical: 'middle', wrapText: true }
}

async function downloadTrackerExcel(checkedIn: CheckedInPatient[]) {
  const wb = new ExcelJS.Workbook()
  const today = new Date()
  const dd = String(today.getDate()).padStart(2, '0')
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const yyyy = today.getFullYear()
  const dateStr = `DATE:-  ${dd}-${mm}-${yyyy}`

  const totalSheets = Math.max(1, Math.ceil(checkedIn.length / ROWS_PER_SHEET))

  for (let si = 0; si < totalSheets; si++) {
    const sheetName = totalSheets === 1 ? 'Tracker' : `Tracker ${si + 1}`
    const ws = wb.addWorksheet(sheetName, {
      pageSetup: {
        paperSize: 9, /* A4 */
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
        margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0.15, footer: 0.15 },
      },
    })

    /* ── Row 1 : Title (A1:Q1 merged) + Date (R1:V1 merged) ── */
    ws.mergeCells(1, 1, 1, 17)  // A1:Q1
    const titleCell = ws.getCell('A1')
    titleCell.value = 'EXECUTIVE HEALTH CHECKUP  TRACKER'
    styleCell(titleCell, { ...FONT, size: 13, bold: true }, 'center')

    ws.mergeCells(1, 18, 1, 22) // R1:V1
    const dateCell = ws.getRow(1).getCell(18)
    dateCell.value = dateStr
    styleCell(dateCell, { ...FONT, size: 10, bold: true }, 'center')

    for (let c = 1; c <= TOTAL_COLS; c++) {
      ws.getRow(1).getCell(c).border = ALL_BORDERS
    }
    ws.getRow(1).height = 22

    /* ── Row 2 : Column headers ── */
    const hdrRow = ws.getRow(2)
    COL_HEADERS.forEach((h, i) => {
      const cell = hdrRow.getCell(i + 1)
      cell.value = h
      styleCell(cell, { ...FONT_BOLD, size: 8 }, 'center')
    })
    hdrRow.height = 30

    /* ── Rows 3–22 : 20 data rows (numbered even if empty) ── */
    const startIdx = si * ROWS_PER_SHEET
    for (let r = 0; r < ROWS_PER_SHEET; r++) {
      const excelRowNum = r + 3
      const row = ws.getRow(excelRowNum)
      const patient = checkedIn[startIdx + r]

      // Build cell values: SL.NO, Name, UHID, Package, DR, 14 tracker cols, OP, IN, OUT
      const vals: (string | number)[] = [
        startIdx + r + 1,
        patient ? uppercaseName(patient.name) : '',
        patient?.uhid ?? '',
        wrapPackageName(patient?.package_name ?? ''),
        patient?.assigned_doctor ?? '',
        ...TRACKER_COLS.map((col) => (patient ? getTrackerCellValue(patient.pkg, col.key) : '')),
        '', // OP (blank – filled by hand)
        patient ? new Date(patient.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '',
        patient?.outTime ?? '', // OUT
      ]

      vals.forEach((v, i) => {
        const cell = row.getCell(i + 1)
        cell.value = v
        const hAlign = i === 0 ? 'center' : i <= 4 ? 'left' : 'center'
        styleCell(cell, FONT, hAlign)
      })
      row.height = 24
    }

    /* ── Column widths – snug fit for A4 Landscape ── */
    const colWidths = [
      3.5,  // A  SL.NO
      20,   // B  PATIENT NAME
      13,   // C  UHID
      15,   // D  PACKAGE
      3,    // E  DR
      5.8,  // F  BLOOD SAMPLE
      4,    // G  USG
      4.5,  // H  BREAKFAST
      4.5,  // I  PPBS TIME
      4.2,  // J  X-RAY
      5,    // K  MAMMOGRAPHY/USG
      4,    // L  BMD
      4,    // M  ECG
      4.2,  // N  ECHO
      4,    // O  TMT
      3.8,  // P  PFT
      4.5,  // Q  LUNCH
      5,    // R  CONSULTATION
      2.5,  // S  D
      3.5,  // T  OP
      4.5,  // U  IN
      4.5,  // V  OUT
      1,    // W  padding for date merge
    ]
    colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

    /* ── Print area ── */
    ws.pageSetup.printArea = `A1:V22`
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `tracker-${today.toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

export default function Tracker() {
  const { state } = useApp()

  const checkedIn: CheckedInPatient[] = state.patients
    .filter((p): p is typeof p & { checked_in_at: string } => p.checked_in_at !== null)
    .sort((a, b) => new Date(a.checked_in_at).getTime() - new Date(b.checked_in_at).getTime())
    .map((p) => {
      const pkg = state.packages.find((pkg) => pkg.id === p.package_id)
      return {
        ...p,
        pkg,
        package_name: pkg?.name,
        outTime: getOutTime(p.id, state.patientTasks),
      }
    })

  if (checkedIn.length === 0) {
    return <EmptyState message="No checked-in patients yet" />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Tracker</h2>
          <p className="text-sm text-gray-500">Download the current tracker snapshot including the export date.</p>
        </div>
        <button
          type="button"
          onClick={() => void downloadTrackerExcel(checkedIn)}
          className="inline-flex items-center rounded-md bg-primary-700 px-3 py-2 text-sm font-medium text-white hover:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          Download Excel
        </button>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">#</th>
              <th className="text-left px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">Patient Name</th>
              <th className="text-left px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">UHID</th>
              <th className="text-left px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">Package</th>
              <th className="text-center px-2 py-3 font-semibold text-gray-700 whitespace-nowrap">DR</th>
              {TRACKER_COLS.map((col) => (
                <th
                  key={col.key}
                  className="text-center px-2 py-3 font-semibold text-gray-700 whitespace-pre-line text-[11px] leading-tight"
                >
                  {col.label}
                </th>
              ))}
              <th className="text-left px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">OP</th>
              <th className="text-left px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">IN</th>
              <th className="text-left px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">OUT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {checkedIn.map((p, idx) => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-3 py-3 text-gray-500">{idx + 1}</td>
                <td className="px-3 py-3">
                  <Link
                    to={`/patient/${p.id}`}
                    className="font-medium text-primary-700 hover:text-primary-900 hover:underline whitespace-nowrap"
                  >
                    {uppercaseName(p.name)}
                  </Link>
                </td>
                <td className="px-3 py-3 text-gray-600 font-mono text-xs">{p.uhid}</td>
                <td className="px-3 py-3 text-gray-700 max-w-[120px] whitespace-pre-line leading-tight">{wrapPackageName(p.package_name || '—')}</td>
                <td className="px-2 py-3 text-center font-bold text-primary-700">{p.assigned_doctor ?? ''}</td>
                {TRACKER_COLS.map((col) => (
                  <td key={col.key} className="px-2 py-3 text-center text-gray-700">
                    {getTrackerCellValue(p.pkg, col.key)}
                  </td>
                ))}
                <td className="px-3 py-3" />
                <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                  {new Date(p.checked_in_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                </td>
                <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                  {p.outTime}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
