import { useState, useMemo, useCallback } from 'react'
import { useApp } from '@/store/AppContext'
import { Search, ChevronDown, ChevronRight, Package as PackageIcon, Plus, Pencil, X, IndianRupee } from 'lucide-react'
import type { Package, PackageStep, TaskGroup, PackageCategory } from '@/types'
import clsx from 'clsx'

const TRACKER_LABELS: { key: keyof Package; label: string }[] = [
  { key: 'tracker_blood_sample', label: 'Blood Sample' },
  { key: 'tracker_usg', label: 'USG' },
  { key: 'tracker_breakfast', label: 'Breakfast' },
  { key: 'tracker_ppbs', label: 'PPBS' },
  { key: 'tracker_xray', label: 'X-Ray' },
  { key: 'tracker_mammography', label: 'Mammography' },
  { key: 'tracker_bmd', label: 'BMD' },
  { key: 'tracker_ecg', label: 'ECG' },
  { key: 'tracker_echo', label: 'Echo' },
  { key: 'tracker_tmt', label: 'TMT' },
  { key: 'tracker_pft', label: 'PFT' },
  { key: 'tracker_lunch', label: 'Lunch' },
  { key: 'tracker_consultation', label: 'Physician Consultation' },
  { key: 'tracker_dental', label: 'Dental' },
  { key: 'tracker_gynecology', label: 'Gynecology' },
]

const TRACKER_VALUE_OPTIONS = ['', 'X', 'M', 'B', '-']

const CONSULTATION_DEPARTMENTS = [
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

function generateStepsFromTrackers(packageId: string, trackers: Record<string, string>): PackageStep[] {
  const steps: PackageStep[] = []
  let order = 1

  const always = (step_name: string, department_id: string, task_group: TaskGroup) => {
    steps.push({ id: `ps-${crypto.randomUUID()}`, package_id: packageId, step_name, department_id, step_order: order++, task_group, is_mandatory: true })
  }

  const conditional = (key: string, step_name: string, department_id: string, task_group: TaskGroup, is_mandatory_fn?: (v: string) => boolean) => {
    const val = trackers[key]
    if (val && val !== 'X') {
      steps.push({ id: `ps-${crypto.randomUUID()}`, package_id: packageId, step_name, department_id, step_order: order++, task_group, is_mandatory: is_mandatory_fn ? is_mandatory_fn(val) : (val === 'M' || val === '-') })
    }
  }

  // Step order: Billing → Blood → USG → Breakfast → PPBS → X-Ray → Mammo → BMD → ECG → Echo → TMT → PFT → Lunch → Dietician → Physician Consultation → Final Review
  always('Billing', 'dept-reg', 'BILLING')
  conditional('tracker_blood_sample', 'Blood Draw (FBS)', 'dept-lab', 'PHLEB')
  conditional('tracker_usg', 'USG Abdomen', 'dept-usg', 'USG')
  always('Breakfast', 'dept-breakfast', 'BREAKFAST')
  conditional('tracker_blood_sample', 'Blood Draw (PPBS)', 'dept-ppbs', 'PPBS')
  conditional('tracker_xray', 'Chest X-Ray', 'dept-xray', 'XRAY')
  conditional('tracker_mammography', 'Mammogram / USG Breast', 'dept-mammo', 'MAMMO', (v) => v !== 'M')
  conditional('tracker_bmd', 'BMD (Bone Density)', 'dept-bmd', 'BMD')
  conditional('tracker_ecg', 'ECG', 'dept-ecg', 'ECG')
  conditional('tracker_echo', 'Echocardiography', 'dept-echo', 'ECHO')
  conditional('tracker_tmt', 'TMT', 'dept-tmt', 'TMT')
  conditional('tracker_pft', 'PFT', 'dept-pulm', 'PFT')
  conditional('tracker_gynecology', 'Gynecology Consultation', 'dept-gyn', 'GYNECOLOGY')
  always('Lunch', 'dept-lunch', 'LUNCH')
  always('Dietician Consultation', 'dept-diet', 'DIET')
  always('Physician Consultation', 'dept-phys', 'CONSULT')
  always('Final Review & Report', 'dept-rev', 'REVIEW')

  return steps
}

function TrackerBadge({ value }: { value: string }) {
  if (!value || value === 'X') return <span className="text-gray-300">—</span>
  const color =
    value === '-' ? 'bg-green-100 text-green-700' :
    value === 'M' ? 'bg-blue-100 text-blue-700' :
    value === 'B' ? 'bg-amber-100 text-amber-700' :
    'bg-gray-100 text-gray-600'
  return (
    <span className={clsx('inline-flex items-center justify-center w-7 h-7 rounded text-xs font-semibold', color)}>
      {value}
    </span>
  )
}

// ─── Package Form Modal ──────────────────────────────
function PackageFormModal({
  existingPkg,
  onClose,
  onSave,
}: {
  existingPkg?: Package
  onClose: () => void
  onSave: (pkg: Package, steps: PackageStep[]) => void
}) {
  const [name, setName] = useState(existingPkg?.name ?? '')
  const [price, setPrice] = useState(existingPkg?.price != null ? String(existingPkg.price) : '')
  const [trackers, setTrackers] = useState<Record<string, string>>(() => {
    const t: Record<string, string> = {}
    for (const { key } of TRACKER_LABELS) {
      t[key] = existingPkg ? (existingPkg[key] as string) : ''
    }
    return t
  })
  const [consultationDepts, setConsultationDepts] = useState<string[]>(
    existingPkg?.consultation_departments ?? []
  )
  const [showInBilling, setShowInBilling] = useState(existingPkg?.show_in_billing ?? false)
  const [billColor, setBillColor] = useState<string | null>(existingPkg?.bill_color ?? null)
  const [category, setCategory] = useState<PackageCategory>(existingPkg?.package_category ?? 'Corporate')
  const [error, setError] = useState('')

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) { setError('Package name is required'); return }

    const pkgId = existingPkg?.id ?? `pkg-${crypto.randomUUID()}`
    const parsedPrice = price.trim() !== '' ? parseFloat(price) : null
    if (parsedPrice !== null && isNaN(parsedPrice)) { setError('Price must be a valid number'); return }

    const pkg: Package = {
      id: pkgId,
      name: trimmed,
      price: parsedPrice,
      tracker_blood_sample: trackers.tracker_blood_sample,
      tracker_usg: trackers.tracker_usg,
      tracker_breakfast: trackers.tracker_breakfast,
      tracker_ppbs: trackers.tracker_ppbs,
      tracker_xray: trackers.tracker_xray,
      tracker_mammography: trackers.tracker_mammography,
      tracker_bmd: trackers.tracker_bmd,
      tracker_ecg: trackers.tracker_ecg,
      tracker_echo: trackers.tracker_echo,
      tracker_tmt: trackers.tracker_tmt,
      tracker_pft: trackers.tracker_pft,
      tracker_lunch: trackers.tracker_lunch,
      tracker_consultation: trackers.tracker_consultation,
      tracker_dental: trackers.tracker_dental,
      tracker_gynecology: trackers.tracker_gynecology,
      consultation_departments: consultationDepts,
      show_in_billing: showInBilling,
      bill_color: billColor,
      package_category: category,
    }

    const steps = generateStepsFromTrackers(pkgId, trackers)
    onSave(pkg, steps)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {existingPkg ? 'Edit Package' : 'Create Package'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>
          )}

          {/* Name & Price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Package Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setError('') }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="e.g. DIAMOND MALE"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => { setPrice(e.target.value); setError('') }}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {/* Package Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Package Category</label>
            <div className="flex gap-2">
              {(['Domestic', 'Corporate', 'International'] as PackageCategory[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={clsx(
                    'px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all',
                    category === cat
                      ? cat === 'Domestic'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : cat === 'International'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-amber-500 bg-amber-50 text-amber-700'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Billing Popup Options */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-4">
            <h4 className="text-sm font-semibold text-gray-700">Billing Popup Options</h4>

            {/* Show in billing toggle */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => setShowInBilling((v) => !v)}
                className={clsx(
                  'relative w-10 h-5 rounded-full transition-colors',
                  showInBilling ? 'bg-primary-600' : 'bg-gray-300'
                )}
              >
                <span
                  className={clsx(
                    'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                    showInBilling ? 'translate-x-5' : 'translate-x-0'
                  )}
                />
              </div>
              <span className="text-sm text-gray-700">
                Show as quick-select card in billing popup
              </span>
            </label>

            {/* Bill color picker */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">
                Card color <span className="text-gray-400 font-normal">(used for quick-select cards)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {([
                  { key: 'silver',   label: 'Silver',   cls: 'bg-gray-100 border-gray-400 text-gray-700' },
                  { key: 'gold',     label: 'Gold',     cls: 'bg-amber-100 border-amber-400 text-amber-800' },
                  { key: 'platinum', label: 'Platinum', cls: 'bg-violet-100 border-violet-400 text-violet-800' },
                  { key: 'diamond',  label: 'Diamond',  cls: 'bg-cyan-100 border-cyan-400 text-cyan-800' },
                  { key: 'pink',     label: 'Pink',     cls: 'bg-pink-100 border-pink-400 text-pink-800' },
                  { key: 'rose',     label: 'Rose',     cls: 'bg-rose-100 border-rose-400 text-rose-900' },
                  { key: 'emerald',  label: 'Emerald',  cls: 'bg-emerald-100 border-emerald-400 text-emerald-700' },
                ] as { key: string; label: string; cls: string }[]).map(({ key, label, cls }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setBillColor(billColor === key ? null : key)}
                    className={clsx(
                      'px-3 py-1 rounded-full text-xs font-semibold border-2 transition-all',
                      cls,
                      billColor === key ? 'ring-2 ring-offset-1 ring-primary-500 scale-105' : 'opacity-70 hover:opacity-100'
                    )}
                  >
                    {label}
                  </button>
                ))}
                {billColor && (
                  <button
                    type="button"
                    onClick={() => setBillColor(null)}
                    className="px-3 py-1 rounded-full text-xs font-medium border-2 border-gray-200 text-gray-500 hover:border-gray-400"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Tracker columns */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tracker Columns
              <span className="ml-2 text-xs font-normal text-gray-400">
                - = included, M = mandatory, B = both, X = not included, empty = not applicable
              </span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {TRACKER_LABELS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 w-24 truncate" title={label}>{label}</span>
                  <select
                    value={trackers[key]}
                    onChange={(e) => setTrackers((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    {TRACKER_VALUE_OPTIONS.map((v) => (
                      <option key={v} value={v}>{v || '(empty)'}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Consultation Departments */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cross Consultations Included
              <span className="ml-2 text-xs font-normal text-gray-400">
                Patients on this package will automatically receive these consultations
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              {CONSULTATION_DEPARTMENTS.map((dept) => {
                const selected = consultationDepts.includes(dept)
                return (
                  <button
                    key={dept}
                    type="button"
                    onClick={() =>
                      setConsultationDepts((prev) =>
                        selected ? prev.filter((d) => d !== dept) : [...prev, dept]
                      )
                    }
                    className={clsx(
                      'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                      selected
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400 hover:text-primary-600'
                    )}
                  >
                    {dept}
                  </button>
                )
              })}
            </div>
            {consultationDepts.length > 0 && (
              <p className="mt-2 text-xs text-primary-600">
                {consultationDepts.length} department{consultationDepts.length > 1 ? 's' : ''} selected:{' '}
                {consultationDepts.join(', ')}
              </p>
            )}
          </div>

          {/* Preview generated steps */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Generated Steps Preview
            </label>
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-0.5">
              {generateStepsFromTrackers('preview', trackers).map((s, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-gray-400 w-4 text-right">{s.step_order}.</span>
                  <span className="font-medium text-gray-700">{s.step_name}</span>
                  {s.is_mandatory && <span className="text-green-600">(mandatory)</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
          >
            {existingPkg ? 'Save Changes' : 'Create Package'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Package Row ─────────────────────────────────────
function PackageRow({
  pkg,
  steps,
  departments,
  onEdit,
}: {
  pkg: Package
  steps: PackageStep[]
  departments: { id: string; name: string }[]
  onEdit: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const deptMap = useMemo(() => Object.fromEntries(departments.map((d) => [d.id, d.name])), [departments])
  const pkgSteps = useMemo(() => steps.filter((s) => s.package_id === pkg.id).sort((a, b) => a.step_order - b.step_order), [steps, pkg.id])

  const activeTrackers = TRACKER_LABELS.filter((t) => {
    const v = pkg[t.key] as string
    return v && v !== 'X' && v.trim() !== ''
  })

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
          )}
          <PackageIcon className="w-5 h-5 text-primary-500 shrink-0" />
          <span className="font-medium text-gray-900 flex-1">{pkg.name}</span>
          <span className={clsx(
            'text-xs font-semibold px-2 py-0.5 rounded-full',
            pkg.package_category === 'Domestic' && 'bg-green-100 text-green-700',
            pkg.package_category === 'International' && 'bg-blue-100 text-blue-700',
            (!pkg.package_category || pkg.package_category === 'Corporate') && 'bg-amber-100 text-amber-700',
          )}>
            {pkg.package_category || 'Corporate'}
          </span>
          {pkg.price != null && (
            <span className="text-sm text-emerald-600 font-medium mr-2">
              ₹{pkg.price.toLocaleString('en-IN')}
            </span>
          )}
          <span className="text-xs text-gray-500">{pkgSteps.length} steps</span>
          <span className="text-xs text-gray-400 ml-2">{activeTrackers.length} tests</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          className="px-3 py-3 text-gray-400 hover:text-primary-600 hover:bg-gray-50 transition-colors"
          title="Edit package"
        >
          <Pencil className="w-4 h-4" />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4">
          {/* Price */}
          {pkg.price != null && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Price:</span>
              <span className="text-sm font-semibold text-emerald-600">₹{pkg.price.toLocaleString('en-IN')}</span>
            </div>
          )}

          {/* Tracker grid */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Tracker Columns
            </h4>
            <div className="flex flex-wrap gap-3">
              {TRACKER_LABELS.map((t) => {
                const v = pkg[t.key] as string
                return (
                  <div key={t.key} className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">{t.label}:</span>
                    <TrackerBadge value={v} />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Consultation Departments */}
          {(pkg.consultation_departments ?? []).length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Cross Consultations Included
              </h4>
              <div className="flex flex-wrap gap-2">
                {(pkg.consultation_departments ?? []).map((dept) => (
                  <span
                    key={dept}
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary-50 text-primary-700 border border-primary-200"
                  >
                    {dept}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Steps */}
          {pkgSteps.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Workflow Steps
              </h4>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 uppercase">
                      <th className="pb-2 pr-4 font-medium">#</th>
                      <th className="pb-2 pr-4 font-medium">Step</th>
                      <th className="pb-2 pr-4 font-medium">Department</th>
                      <th className="pb-2 pr-4 font-medium">Group</th>
                      <th className="pb-2 font-medium">Mandatory</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pkgSteps.map((s) => (
                      <tr key={s.id} className="text-gray-700">
                        <td className="py-1.5 pr-4 text-gray-400">{s.step_order}</td>
                        <td className="py-1.5 pr-4 font-medium">{s.step_name}</td>
                        <td className="py-1.5 pr-4">{deptMap[s.department_id] ?? '—'}</td>
                        <td className="py-1.5 pr-4">
                          <span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                            {s.task_group}
                          </span>
                        </td>
                        <td className="py-1.5">
                          {s.is_mandatory ? (
                            <span className="text-green-600 font-medium text-xs">Yes</span>
                          ) : (
                            <span className="text-gray-400 text-xs">No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────
export default function Packages() {
  const { state, createPackage, updatePackage } = useApp()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingPkg, setEditingPkg] = useState<Package | undefined>(undefined)

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return state.packages
    return state.packages.filter((p) => p.name.toLowerCase().includes(q))
  }, [state.packages, search])

  const patientCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of state.patients) {
      if (p.package_id) counts[p.package_id] = (counts[p.package_id] || 0) + 1
    }
    return counts
  }, [state.patients])

  const handleSave = useCallback((pkg: Package, steps: PackageStep[]) => {
    if (editingPkg) {
      updatePackage(pkg, steps)
    } else {
      createPackage(pkg, steps)
    }
    setShowForm(false)
    setEditingPkg(undefined)
  }, [editingPkg, createPackage, updatePackage])

  const openCreate = () => { setEditingPkg(undefined); setShowForm(true) }
  const openEdit = (pkg: Package) => { setEditingPkg(pkg); setShowForm(true) }
  const closeForm = () => { setShowForm(false); setEditingPkg(undefined) }

  return (
    <div className="space-y-4">
      {/* Header & search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">
            All Packages ({state.packages.length})
          </h3>
          <p className="text-sm text-gray-500">Browse health-check packages and their workflow steps</p>
        </div>
        <div className="sm:ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search packages…"
              className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-full sm:w-64"
            />
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            New Package
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Total Packages</p>
          <p className="text-xl font-bold text-gray-900">{state.packages.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">With Patients</p>
          <p className="text-xl font-bold text-gray-900">{Object.keys(patientCounts).length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Total Steps Defined</p>
          <p className="text-xl font-bold text-gray-900">{state.packageSteps.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Avg Steps / Package</p>
          <p className="text-xl font-bold text-gray-900">
            {state.packages.length ? Math.round(state.packageSteps.length / state.packages.length) : 0}
          </p>
        </div>
      </div>

      {/* Package list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No packages match your search.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((pkg) => (
            <PackageRow
              key={pkg.id}
              pkg={pkg}
              steps={state.packageSteps}
              departments={state.departments}
              onEdit={() => openEdit(pkg)}
            />
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showForm && (
        <PackageFormModal
          existingPkg={editingPkg}
          onClose={closeForm}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
