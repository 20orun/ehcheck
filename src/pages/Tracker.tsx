import ExcelJS from 'exceljs'
import { useApp } from '@/store/AppContext'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/ui'
import { CopyableUHID } from '@/components/CopyableUHID'
import type { Package, PatientTask, DoctorCode } from '@/types'
import { useState, useRef, useCallback, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Search } from 'lucide-react'

const TRACKER_COLS = [
  { key: 'bloodSample', label: 'BLOOD' },
  { key: 'usg', label: 'USG' },
  { key: 'breakfast', label: 'BREAK\nFAST' },
  { key: 'ppbs', label: 'PPBS\nTIME' },
  { key: 'xray', label: 'X-RAY' },
  { key: 'mammography', label: 'MAM\nMO' },
  { key: 'bmd', label: 'BMD' },
  { key: 'ecg', label: 'ECG' },
  { key: 'echo', label: 'ECHO' },
  { key: 'tmt', label: 'TMT' },
  { key: 'pft', label: 'PFT' },
  { key: 'lunch', label: 'LUN\nCH' },
  { key: 'consultation', label: 'PHY\nCON' },
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

function getISTTimeString(): string {
  // now.getTime() is always UTC ms; add 5h30m to get IST
  const istMs = Date.now() + 5.5 * 3600 * 1000
  const ist = new Date(istMs)
  return `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`
}

function isPpbsAlertWindow(ppbsTime: string | null, currentIST: string): boolean {
  if (!ppbsTime) return false
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) return -1
    return h * 60 + m
  }
  const ppbsMin = toMinutes(ppbsTime)
  const currMin = toMinutes(currentIST)
  if (ppbsMin < 0 || currMin < 0) return false
  return Math.abs(currMin - ppbsMin) <= 3
}

function getTrackerCellValue(pkg: Package | undefined, key: string): string {
  if (!pkg) return ''
  const field = TRACKER_KEY_MAP[key]
  if (!field) return ''
  return (pkg[field] as string) || ''
}

/** Returns the set of group_ids where at least one member has lunch ('-') in their package */
function getGroupsWithLunch(patients: CheckedInPatient[]): Set<string> {
  const groups = new Set<string>()
  for (const p of patients) {
    if (p.group_id && getTrackerCellValue(p.pkg, 'lunch') === '-') {
      groups.add(p.group_id)
    }
  }
  return groups
}

function nameMatchesSearch(name: string, query: string): boolean {
  if (!query) return true
  const q = query.trim().toLowerCase()
  if (!q) return true
  return name.toLowerCase().split(/\s+/).some((word) => word.startsWith(q))
}

/** Returns '-' if the patient's group has lunch, otherwise returns the patient's package value */
function getEffectiveLunchValue(patient: CheckedInPatient, groupsWithLunch: Set<string>): string {
  const val = getTrackerCellValue(patient.pkg, 'lunch')
  if (val === '-') return '-'
  if (patient.group_id && groupsWithLunch.has(patient.group_id)) return '-'
  return val
}

type CheckedInPatient = { id: string; name: string; uhid: string; package_name?: string; pkg?: Package; checked_in_at: string; package_id: string | null; assigned_doctor: DoctorCode; priority: import('@/types').Priority; created_at: string; outTime?: string; ppbs_time: string | null; group_id: string | null; is_international: boolean; tracker_cell_states: Record<string, string> }

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
const PATIENTS_PER_PAGE = 20
// 22 columns: A=SL.NO, B=NAME, C=UHID, D=PACKAGE, E–R=14 tracker cols, S=OP, T=IN, U=OUT
const COL_HEADERS = [
  'SL.\nNO', 'PATIENT NAME', 'UHID', 'PACKAGE',
  ...TRACKER_COLS.map((c) => c.label.replace(/\n/g, '\n')),
  'OP', 'IN', 'OUT',
]
const TOTAL_COLS = COL_HEADERS.length // 22 (A–V)

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
  const groupsWithLunch = getGroupsWithLunch(checkedIn)
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

    /* ── Row 1 : Title (A1:P1 merged) + Date (Q1:U1 merged) ── */
    ws.mergeCells(1, 1, 1, 16)  // A1:P1
    const titleCell = ws.getCell('A1')
    titleCell.value = 'EXECUTIVE HEALTH CHECKUP  TRACKER'
    styleCell(titleCell, { ...FONT, size: 13, bold: true }, 'center')

    ws.mergeCells(1, 17, 1, 21) // Q1:U1
    const dateCell = ws.getRow(1).getCell(17)
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

      // Build cell values: SL.NO, Name, UHID, Package, 14 tracker cols, OP, IN, OUT
      // The consultation column shows the assigned doctor initial instead of the package default
      const vals: (string | number)[] = [
        startIdx + r + 1,
        patient ? uppercaseName(patient.name) : '',
        patient?.uhid ?? '',
        wrapPackageName(patient?.package_name ?? ''),
        ...TRACKER_COLS.map((col) => {
          if (!patient) return ''
          if (col.key === 'consultation') return patient.assigned_doctor ?? ''
          if (col.key === 'lunch') return getEffectiveLunchValue(patient, groupsWithLunch)
          return getTrackerCellValue(patient.pkg, col.key)
        }),
        '', // OP (blank – filled by hand)
        patient ? new Date(patient.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '',
        patient?.tracker_cell_states?.['out'] ?? patient?.outTime ?? '', // OUT
      ]

      vals.forEach((v, i) => {
        const cell = row.getCell(i + 1)
        cell.value = v
        const hAlign = i === 0 ? 'center' : i <= 3 ? 'left' : 'center'
        styleCell(cell, FONT, hAlign)
      })
      row.height = 24
    }

    /* ── Column widths – snug fit for A4 Landscape ── */
    const colWidths = [
      3.5,  // A  SL.NO
      22,   // B  PATIENT NAME
      14,   // C  UHID
      18,   // D  PACKAGE
      6,    // E  BLOOD SAMPL
      4.5,  // F  USG
      5,    // G  BREAKFAST
      5,    // H  PPBS TIME
      5,    // I  X-RAY
      4.5,  // J  MAM MO
      4.5,  // K  BMD
      4.5,  // L  ECG
      5,    // M  ECHO
      4.5,  // N  TMT
      4,    // O  PFT
      4.5,  // P  LUNCH
      5,    // Q  CONSULT
      2.5,  // R  D
      4,    // S  OP
      5,    // T  IN
      5,    // U  OUT
      1,    // V  padding for date merge
    ]
    colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

    /* ── Print area ── */
    ws.pageSetup.printArea = `A1:U22`
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
  const { state, updatePatientPpbsTime, updateTrackerCellState, updateAssignedDoctor } = useApp()

  // ─── PPBS inline-edit state ──────────────────────
  const [editingPpbsId, setEditingPpbsId] = useState<string | null>(null)
  const [ppbsInputValue, setPpbsInputValue] = useState('')
  const [glowingCells, setGlowingCells] = useState<Record<string, boolean>>({})
  const [nowIST, setNowIST] = useState(getISTTimeString)
  // ─── OUT inline-edit state ────────────────────────
  const [editingOutId, setEditingOutId] = useState<string | null>(null)
  const [outInputValue, setOutInputValue] = useState('')
  const outInputRef = useRef<HTMLInputElement>(null)
  // ─── Search ────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  // ─── Pagination & fullscreen ──────────────────────
  const [currentPage, setCurrentPage] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const touchStartX = useRef<number | null>(null)
  // Per-cell click throttle: key = `${patientId}:${colKey}`, value = last-click timestamp
  const cellClickTs = useRef<Record<string, number>>({})
  const CELL_CLICK_GAP_MS = 400
  const throttledCellClick = useCallback((key: string, fn: () => void) => {
    const now = Date.now()
    if ((cellClickTs.current[key] ?? 0) + CELL_CLICK_GAP_MS > now) return
    cellClickTs.current[key] = now
    fn()
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNowIST(getISTTimeString()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    setCurrentPage(0)
  }, [searchQuery])

  const checkedIn: CheckedInPatient[] = state.patients
    .filter((p): p is typeof p & { checked_in_at: string } => p.checked_in_at !== null)
    .sort((a, b) => {
      // International patients always come after non-international
      if (a.is_international !== b.is_international) return a.is_international ? 1 : -1
      // Within each group, sort by check-in time
      return new Date(a.checked_in_at).getTime() - new Date(b.checked_in_at).getTime()
    })
    .map((p) => {
      const pkg = state.packages.find((pkg) => pkg.id === p.package_id)
      return {
        ...p,
        pkg,
        package_name: pkg?.name,
        outTime: getOutTime(p.id, state.patientTasks),
        tracker_cell_states: p.tracker_cell_states ?? {},
      }
    })

  const groupsWithLunch = getGroupsWithLunch(checkedIn)
  const filteredCheckedIn = searchQuery.trim()
    ? checkedIn.filter((p) => nameMatchesSearch(p.name, searchQuery))
    : checkedIn
  const totalPages = Math.max(1, Math.ceil(filteredCheckedIn.length / PATIENTS_PER_PAGE))

  const goToPrev = useCallback(() => setCurrentPage((p) => Math.max(0, p - 1)), [])
  const goToNext = useCallback(() => setCurrentPage((p) => p + 1), [])

  // ─── PPBS save handler ────────────────────────────
  const savePpbsTime = useCallback(async (patientId: string, value: string) => {
    const trimmed = value.trim()
    setEditingPpbsId(null)
    setPpbsInputValue('')
    try {
      await updatePatientPpbsTime(patientId, trimmed || null)
      setGlowingCells((prev) => ({ ...prev, [patientId]: true }))
      setTimeout(() => {
        setGlowingCells((prev) => { const next = { ...prev }; delete next[patientId]; return next })
      }, 4000)
    } catch (err) {
      console.warn('Failed to save PPBS time:', err)
    }
  }, [updatePatientPpbsTime])

  const openPpbsEdit = useCallback((patientId: string, currentTime: string | null) => {
    setEditingPpbsId(patientId)
    setPpbsInputValue(currentTime ?? '')
    // Focus the input after render
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [])

  const saveOutTime = useCallback(async (patientId: string, value: string, currentStates: Record<string, string>) => {
    const trimmed = value.trim()
    setEditingOutId(null)
    setOutInputValue('')
    try {
      await updateTrackerCellState(patientId, 'out', trimmed || null, currentStates)
    } catch (err) {
      console.warn('Failed to save out time:', err)
    }
  }, [updateTrackerCellState])

  const openOutEdit = useCallback((patientId: string, currentTime: string) => {
    setEditingOutId(patientId)
    setOutInputValue(currentTime)
    setTimeout(() => outInputRef.current?.focus(), 0)
  }, [])

  // ─── Keyboard navigation ──────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't hijack arrow keys when an input is focused
      const tag = (e.target as Element)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') goToPrev()
      else if (e.key === 'ArrowRight') goToNext()
      else if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [goToPrev, goToNext, isFullscreen])

  // ─── Swipe handlers ───────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 50) {
      if (dx < 0) goToNext()
      else goToPrev()
    }
    touchStartX.current = null
  }, [goToNext, goToPrev])

  // ─── Early return (after all hooks) ──────────────
  if (checkedIn.length === 0) {
    return <EmptyState message="No checked-in patients yet" />
  }

  // ─── Derived values for render ────────────────────
  const safePage = Math.min(currentPage, totalPages - 1)
  const pagePatients = filteredCheckedIn.slice(safePage * PATIENTS_PER_PAGE, (safePage + 1) * PATIENTS_PER_PAGE)
  const anyPpbsYellow = pagePatients.some((p) => isPpbsAlertWindow(p.ppbs_time, nowIST))

  // Build a stable group→color-index map (0 or 1) based on encounter order in checkedIn
  const groupColorMap = (() => {
    const map: Record<string, number> = {}
    let count = 0
    for (const pt of checkedIn) {
      if (pt.group_id && !(pt.group_id in map)) {
        map[pt.group_id] = count++
      }
    }
    return map
  })()
  const GROUP_COLORS = ['#3b82f6', '#f97316'] // blue-500 / orange-500

  return (
    <div className={isFullscreen ? 'fixed inset-0 z-50 bg-white flex flex-col px-3 pt-1.5 pb-1.5 gap-1.5' : 'space-y-4'}>
      {/* ── Header bar ── */}
      <div className="flex items-center gap-2 shrink-0">
        {!isFullscreen && (
          <div className="mr-auto">
            <h2 className="text-lg font-semibold text-gray-900">Tracker</h2>
            <p className="text-sm text-gray-500">Download the current tracker snapshot including the export date.</p>
          </div>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          {/* Search input */}
          <div className={`relative flex items-center ${isFullscreen ? '' : ''}`}>
            <Search className={`absolute left-1.5 text-gray-400 pointer-events-none ${isFullscreen ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isFullscreen ? 'Search…' : 'Search patient…'}
              className={`rounded border border-gray-300 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 ${isFullscreen ? 'text-[11px] pl-5 pr-1.5 py-0.5 w-24' : 'text-sm pl-6 pr-2 py-1 w-44'}`}
            />
          </div>
          {/* Live clock – fullscreen only */}
          {isFullscreen && (
            <span className="font-mono text-sm font-bold text-gray-700 tabular-nums px-2 py-0.5 rounded bg-gray-100 select-none">
              {nowIST}
            </span>
          )}
          {/* Page navigation */}
          <div className="inline-flex items-center rounded border border-gray-200 bg-white px-0.5 py-0.5">
            <button
              type="button"
              onClick={goToPrev}
              disabled={safePage === 0}
              className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-600"
              title="Previous page (←)"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-semibold text-gray-700 px-1 tabular-nums select-none">
              {safePage + 1}/{totalPages}
            </span>
            <button
              type="button"
              onClick={goToNext}
              disabled={safePage >= totalPages - 1}
              className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-600"
              title="Next page (→)"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {/* Lunch count */}
          <div className="inline-flex items-center rounded bg-green-50 border border-green-200 px-2 py-0.5 text-xs font-semibold text-green-800">
            Lunch: {checkedIn.filter((p) => getEffectiveLunchValue(p, groupsWithLunch) === '-').length}
          </div>
          {/* Download Excel */}
          <button
            type="button"
            onClick={() => void downloadTrackerExcel(checkedIn)}
            className="inline-flex items-center rounded bg-primary-700 px-2 py-0.5 text-xs font-medium text-white hover:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            Download Excel
          </button>
          {/* Fullscreen toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen((f) => !f)}
            className="inline-flex items-center rounded border border-gray-300 px-1.5 py-0.5 text-gray-600 hover:bg-gray-50"
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div
        className={
          isFullscreen
            ? 'flex-1 overflow-auto rounded-lg border border-gray-200 bg-white min-h-0'
            : 'bg-white rounded-lg border border-gray-200 overflow-x-auto'
        }
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <table className={isFullscreen ? 'w-full table-fixed text-[11px]' : 'w-full text-sm'}>
          {isFullscreen && (
            <colgroup>
              <col style={{ width: '2.5%' }} />{/* # */}
              <col style={{ width: '11%' }} />{/* Name */}
              <col style={{ width: '6.5%' }} />{/* UHID */}
              <col style={{ width: '8.5%' }} />{/* Package */}
              {/* 14 tracker cols */}
              <col style={{ width: '3.7%' }} />{/* BLOOD */}
              <col style={{ width: '3.7%' }} />{/* USG */}
              <col style={{ width: '3.7%' }} />{/* BREAKFAST */}
              <col style={{ width: '4%' }} />{/* PPBS */}
              <col style={{ width: '3.7%' }} />{/* X-RAY */}
              <col style={{ width: '3.7%' }} />{/* MAMMO */}
              <col style={{ width: '3.2%' }} />{/* BMD */}
              <col style={{ width: '3.2%' }} />{/* ECG */}
              <col style={{ width: '3.2%' }} />{/* ECHO */}
              <col style={{ width: '3.2%' }} />{/* TMT */}
              <col style={{ width: '3.2%' }} />{/* PFT */}
              <col style={{ width: '3.7%' }} />{/* LUNCH */}
              <col style={{ width: '4%' }} />{/* CON */}
              <col style={{ width: '2.5%' }} />{/* D */}
              {/* end cols */}
              <col style={{ width: '3%' }} />{/* OP */}
              <col style={{ width: '4%' }} />{/* IN */}
              <col style={{ width: '3.7%' }} />{/* OUT */}
            </colgroup>
          )}
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className={`text-left font-semibold text-gray-700 whitespace-nowrap ${isFullscreen ? 'px-1 py-2' : 'px-3 py-3'}`}>#</th>
              <th className={`text-left font-semibold text-gray-700 ${isFullscreen ? 'px-1 py-2' : 'px-3 py-3 whitespace-nowrap'}`}>Patient Name</th>
              <th className={`text-left font-semibold text-gray-700 whitespace-nowrap ${isFullscreen ? 'px-1 py-2' : 'px-3 py-3'}`}>UHID</th>
              <th className={`text-left font-semibold text-gray-700 ${isFullscreen ? 'px-1 py-2' : 'px-3 py-3 whitespace-nowrap'}`}>Package</th>
              {TRACKER_COLS.map((col) => (
                <th
                  key={col.key}
                  className={[
                    `text-center font-semibold whitespace-pre-line leading-tight ${isFullscreen ? 'px-0.5 py-2 text-[10px]' : 'px-2 py-3 text-[11px]'}`,
                    col.key === 'ppbs' && anyPpbsYellow ? 'bg-yellow-200 text-yellow-900' : 'text-gray-700',
                  ].join(' ')}
                >
                  {col.label}
                </th>
              ))}
              <th className={`text-left font-semibold text-gray-700 ${isFullscreen ? 'px-1 py-2' : 'px-3 py-3 whitespace-nowrap'}`}>OP</th>
              <th className={`text-left font-semibold text-gray-700 ${isFullscreen ? 'px-1 py-2' : 'px-3 py-3 whitespace-nowrap'}`}>IN</th>
              <th className={`text-left font-semibold text-gray-700 ${isFullscreen ? 'px-1 py-2' : 'px-3 py-3 whitespace-nowrap'}`}>OUT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pagePatients.map((p, idx) => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                <td
                  className={`text-gray-500 ${isFullscreen ? 'px-1 py-2' : 'px-3 py-3'}`}
                  style={p.group_id ? { borderLeft: `3px solid ${GROUP_COLORS[(groupColorMap[p.group_id] ?? 0) % 2]}` } : { borderLeft: '3px solid transparent' }}
                  title={p.group_id ? 'Part of a group' : undefined}
                >
                  {safePage * PATIENTS_PER_PAGE + idx + 1}
                </td>
                <td className={isFullscreen ? 'px-1 py-2' : 'px-3 py-3'}>
                  <Link
                    to={`/patient/${p.id}`}
                    className={`font-medium text-primary-700 hover:text-primary-900 hover:underline ${isFullscreen ? 'wrap-break-word' : 'whitespace-nowrap'}`}
                  >
                    {uppercaseName(p.name)}
                  </Link>
                </td>
                <td className={`text-gray-600 font-mono text-xs ${isFullscreen ? 'px-1 py-2' : 'px-3 py-3'}`}><CopyableUHID uhid={p.uhid} /></td>
                <td className={`text-gray-700 whitespace-pre-line leading-tight ${isFullscreen ? 'px-1 py-2' : 'px-3 py-3 max-w-30'}`}>{wrapPackageName(p.package_name || '—')}</td>
                {TRACKER_COLS.map((col) => {
                  if (col.key === 'ppbs') {
                    const pkgVal = getTrackerCellValue(p.pkg, 'ppbs')
                    const isEditing = editingPpbsId === p.id
                    const isGlowing = glowingCells[p.id]
                    const cellState = p.tracker_cell_states['ppbs'] ?? ''
                    const isPersistYellow = cellState === 'yellow'
                    const isAlertYellow = !isGlowing && !isPersistYellow && isPpbsAlertWindow(p.ppbs_time, nowIST)
                    const displayTime = p.ppbs_time ?? ''
                    return (
                      <td
                        key="ppbs"
                        className={[
                          `text-center text-gray-700 transition-all duration-300 ${isFullscreen ? 'px-0.5 py-2' : 'px-2 py-3'}`,
                          'cursor-pointer select-none',
                          isGlowing ? 'ring-2 ring-green-400 shadow-[0_0_8px_2px_rgba(74,222,128,0.7)] rounded' : '',
                          isPersistYellow ? 'bg-[#FEFF33]' : isAlertYellow ? 'bg-yellow-100' : '',
                        ].join(' ')}
                        onClick={() => {
                          if (!isEditing) {
                            // single click: toggle persistent yellow highlight
                            void updateTrackerCellState(p.id, 'ppbs', isPersistYellow ? null : 'yellow', p.tracker_cell_states)
                          }
                        }}
                        onDoubleClick={() => {
                          if (!isEditing) openPpbsEdit(p.id, p.ppbs_time)
                        }}
                        title="Click to highlight · Double-click to enter/edit PPBS time"
                      >
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            type="text"
                            inputMode="numeric"
                            value={ppbsInputValue}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, '').slice(0, 4)
                              const formatted = digits.length > 2
                                ? digits.slice(0, 2) + ':' + digits.slice(2)
                                : digits
                              setPpbsInputValue(formatted)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void savePpbsTime(p.id, ppbsInputValue)
                              if (e.key === 'Escape') { setEditingPpbsId(null); setPpbsInputValue('') }
                            }}
                            onBlur={() => void savePpbsTime(p.id, ppbsInputValue)}
                            className="w-16 text-center text-xs border border-primary-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
                            placeholder="1027"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className={displayTime ? 'font-medium text-primary-700' : 'text-gray-400'}>
                            {displayTime || pkgVal || ''}
                          </span>
                        )}
                      </td>
                    )
                  }
                  // ── TMT: cycle dot·F → dot·M → dot·C → tick·F → tick·M → tick·C → X → clear
                  if (col.key === 'tmt') {
                    const cs = p.tracker_cell_states['tmt'] ?? ''
                    const TMT_CYCLE = ['dot-F', 'dot-M', 'dot-C', 'tick-F', 'tick-M', 'tick-C', 'X'] as const
                    const isDot = cs.startsWith('dot-')
                    const isTick = cs.startsWith('tick-')
                    const isX = cs === 'X'
                    const letter = cs.split('-')[1] ?? ''
                    return (
                      <td
                        key="tmt"
                        className={[
                          `text-center cursor-pointer select-none text-gray-700 ${isFullscreen ? 'px-0.5 py-2' : 'px-2 py-3'}`,
                          isX ? 'bg-yellow-400 font-semibold' : '',
                        ].join(' ')}
                        onClick={() => throttledCellClick(`${p.id}:tmt`, () => {
                          // Read current state dynamically
                          const currentPatient = state.patients.find((pt) => pt.id === p.id)
                          const currentCs = currentPatient?.tracker_cell_states?.['tmt'] ?? ''
                          const curIdx = TMT_CYCLE.indexOf(currentCs as typeof TMT_CYCLE[number])
                          const next: string | null = curIdx === -1 ? 'dot-F' : curIdx < TMT_CYCLE.length - 1 ? TMT_CYCLE[curIdx + 1] : null
                          void updateTrackerCellState(p.id, 'tmt', next, currentPatient?.tracker_cell_states ?? {})
                        })}
                        title="Click to cycle: dot·F → dot·M → dot·C → ✓·F → ✓·M → ✓·C → X (skipped) → clear"
                      >
                        {cs === '' && getTrackerCellValue(p.pkg, 'tmt')}
                        {isX && <span className="text-gray-800 font-bold text-[11px] leading-none">X</span>}
                        {(isDot || isTick) && (
                          <span className="inline-flex items-center gap-0.5">
                            {isDot
                              ? <span className="text-black font-black text-[11px] leading-none">●</span>
                              : <span className="text-green-600 font-black text-[11px] leading-none">✓</span>
                            }
                            <span className="font-bold text-[9px] text-gray-800">{letter}</span>
                          </span>
                        )}
                      </td>
                    )
                  }

                  // ── Consultation: shows assigned_doctor code; click cycles I → A → S → clear ──
                  if (col.key === 'consultation') {
                    const doc = p.assigned_doctor
                    return (
                      <td
                        key="consultation"
                        className={`text-center font-semibold cursor-pointer select-none text-gray-700 ${isFullscreen ? 'px-0.5 py-2' : 'px-2 py-3'}`}
                        onClick={() => throttledCellClick(`${p.id}:consultation`, () => {
                          const currentPatient = state.patients.find((pt) => pt.id === p.id)
                          const currentDoc = currentPatient?.assigned_doctor ?? null
                          const next: import('@/types').DoctorCode = currentDoc === null ? 'I' : currentDoc === 'I' ? 'A' : currentDoc === 'A' ? 'S' : null
                          void updateAssignedDoctor(p.id, next)
                        })}
                        title="Click to cycle: I → A → S → clear (sets primary physician)"
                      >
                        {doc ?? ''}
                      </td>
                    )
                  }

                  // ── ECHO: dot → tick → tick+N → X → clear ────────────
                  if (col.key === 'echo') {
                    const cs = p.tracker_cell_states['echo'] ?? ''
                    // treat blank package value same as '-' so the cell is always clickable
                    const echoBase = getTrackerCellValue(p.pkg, 'echo')
                    const isX = cs === 'X'
                    return (
                      <td
                        key="echo"
                        className={[
                          `text-center cursor-pointer select-none text-gray-700 ${isFullscreen ? 'px-0.5 py-2' : 'px-2 py-3'}`,
                          isX ? 'bg-yellow-400 font-semibold' : '',
                        ].join(' ')}
                        onClick={() => throttledCellClick(`${p.id}:echo`, () => {
                          // Read current state dynamically
                          const currentPatient = state.patients.find((pt) => pt.id === p.id)
                          const currentCs = currentPatient?.tracker_cell_states?.['echo'] ?? ''
                          const next = currentCs === '' ? 'dot' : currentCs === 'dot' ? 'tick' : currentCs === 'tick' ? 'tick-n' : currentCs === 'tick-n' ? 'X' : null
                          void updateTrackerCellState(p.id, 'echo', next, currentPatient?.tracker_cell_states ?? {})
                        })}
                        title="Click to cycle: dot → ✓ → ✓N → X (skipped) → clear"
                      >
                        {cs === '' && (echoBase !== '' && echoBase !== '-' ? echoBase : null)}
                        {isX && <span className="text-gray-800 font-bold text-[11px] leading-none">X</span>}
                        {cs === 'dot' && <span className="text-black font-black text-[11px] leading-none">●</span>}
                        {cs === 'tick' && <span className="text-green-600 font-black text-[11px] leading-none">✓</span>}
                        {cs === 'tick-n' && (
                          <span className="inline-flex items-center gap-0.5">
                            <span className="text-green-600 font-black text-[11px] leading-none">✓</span>
                            <span className="font-bold text-[9px] text-gray-800">N</span>
                          </span>
                        )}
                      </td>
                    )
                  }

                  // ── PFT: cycle → P → X → clear ─
                  if (col.key === 'pft') {
                    const cs = p.tracker_cell_states['pft'] ?? ''
                    const isP = cs === 'P'
                    const isX = cs === 'X'
                    return (
                      <td
                        key="pft"
                        className={[
                          `text-center font-semibold cursor-pointer select-none text-gray-700 ${isFullscreen ? 'px-0.5 py-2' : 'px-2 py-3'}`,
                          isP ? 'bg-[#FEFF33]' : '',
                          isX ? 'bg-yellow-400' : '',
                        ].join(' ')}
                        onClick={() => throttledCellClick(`${p.id}:pft`, () => {
                          // Read current state dynamically
                          const currentPatient = state.patients.find((pt) => pt.id === p.id)
                          const currentCs = currentPatient?.tracker_cell_states?.['pft'] ?? ''
                          const nextValue = currentCs === '' ? 'P' : currentCs === 'P' ? 'X' : null
                          void updateTrackerCellState(p.id, 'pft', nextValue, currentPatient?.tracker_cell_states ?? {})
                        })}
                        title="Click to cycle: P → X (skipped) → clear"
                      >
                        {isX ? 'X' : isP ? 'P' : getTrackerCellValue(p.pkg, 'pft')}
                      </td>
                    )
                  }

                  // ── General tracker cell ──────────────────────────
                  const rawVal = col.key === 'lunch' ? getEffectiveLunchValue(p, groupsWithLunch) : getTrackerCellValue(p.pkg, col.key)
                  const cellState = p.tracker_cell_states[col.key] ?? ''
                  const isBlankOrDash = rawVal === '' || rawVal === '-'
                  const isBM = rawVal === 'B' || rawVal === 'M'
                  const isClickable = isBlankOrDash || isBM
                  const isYellowCell = cellState === 'yellow'
                  const isTickCell = cellState === 'tick'
                  const isXCell = cellState === 'X'

                  return (
                    <td
                      key={col.key}
                      className={[
                        `text-center text-gray-700 ${isFullscreen ? 'px-0.5 py-2' : 'px-2 py-3'}`,
                        isClickable ? 'cursor-pointer select-none' : '',
                        isYellowCell ? 'bg-[#FEFF33]' : '',
                        isXCell ? 'bg-yellow-400 font-semibold' : '',
                      ].join(' ')}
                      onClick={isClickable ? () => throttledCellClick(`${p.id}:${col.key}`, () => {
                        // Read current state dynamically to avoid stale closure
                        const currentPatient = state.patients.find((pt) => pt.id === p.id)
                        const currentCellState = currentPatient?.tracker_cell_states?.[col.key] ?? ''
                        if (isBlankOrDash) {
                          const nextValue = currentCellState === '' ? 'tick' : currentCellState === 'tick' ? 'X' : null
                          void updateTrackerCellState(p.id, col.key, nextValue, currentPatient?.tracker_cell_states ?? {})
                        } else if (isBM) {
                          const nextValue = currentCellState === '' ? 'yellow' : currentCellState === 'yellow' ? 'X' : null
                          void updateTrackerCellState(p.id, col.key, nextValue, currentPatient?.tracker_cell_states ?? {})
                        }
                      }) : undefined}
                      title={isBlankOrDash ? 'Click to cycle: ✓ → X (skipped) → clear' : isBM ? 'Click to cycle: highlight → X (skipped) → clear' : undefined}
                    >
                      {isXCell ? (
                        <span className="text-gray-800 font-bold text-[11px] leading-none">X</span>
                      ) : isTickCell ? (
                        <span className="text-green-600 font-bold text-[11px] leading-none">✓</span>
                      ) : rawVal}
                    </td>
                  )
                })}
                <td className={isFullscreen ? 'px-1 py-2' : 'px-3 py-3'} />
                <td className={`text-gray-600 whitespace-nowrap ${isFullscreen ? 'px-1 py-2' : 'px-3 py-3'}`}>
                  {new Date(p.checked_in_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                </td>
                <td
                  className={`whitespace-nowrap cursor-pointer select-none ${isFullscreen ? 'px-1 py-2' : 'px-3 py-3'}`}
                  onClick={() => {
                    if (editingOutId !== p.id) {
                      void updateTrackerCellState(p.id, 'out', getISTTimeString(), p.tracker_cell_states)
                    }
                  }}
                  onDoubleClick={() => {
                    if (editingOutId !== p.id) {
                      openOutEdit(p.id, p.tracker_cell_states['out'] ?? p.outTime ?? '')
                    }
                  }}
                  title="Click to stamp current time · Double-click to edit"
                >
                  {editingOutId === p.id ? (
                    <input
                      ref={outInputRef}
                      type="text"
                      inputMode="numeric"
                      value={outInputValue}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 4)
                        const formatted = digits.length > 2 ? digits.slice(0, 2) + ':' + digits.slice(2) : digits
                        setOutInputValue(formatted)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void saveOutTime(p.id, outInputValue, p.tracker_cell_states)
                        if (e.key === 'Escape') { setEditingOutId(null); setOutInputValue('') }
                      }}
                      onBlur={() => void saveOutTime(p.id, outInputValue, p.tracker_cell_states)}
                      className="w-14 text-center text-xs border border-primary-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      placeholder="1430"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className={(p.tracker_cell_states['out'] ?? p.outTime) ? 'font-medium text-primary-700' : 'text-gray-400 text-xs'}>
                      {(p.tracker_cell_states['out'] ?? p.outTime) || '—'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
