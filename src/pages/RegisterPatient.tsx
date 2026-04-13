import { useRef, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@/store/AppContext'
import type { Priority } from '@/types'

interface CsvRow {
  name: string
  uhid: string
  package: string
  priority: Priority
}

function parseCsv(
  text: string,
  packageNameMap: Map<string, string>,
  packageIdSet: Set<string>,
): { rows: CsvRow[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { rows: [], errors: ['CSV must have a header row and at least one data row.'] }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const nameIdx = header.indexOf('name')
  const uhidIdx = header.indexOf('uhid')
  const pkgIdx = header.indexOf('package')
  const prioIdx = header.indexOf('priority')

  const missing: string[] = []
  if (nameIdx === -1) missing.push('name')
  if (uhidIdx === -1) missing.push('uhid')
  if (missing.length) return { rows: [], errors: [`Missing required columns: ${missing.join(', ')}`] }

  const rows: CsvRow[] = []
  const errors: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim())
    const rowName = cols[nameIdx] || ''
    const rowUhid = cols[uhidIdx] || ''
    const rawPkg = pkgIdx !== -1 ? (cols[pkgIdx] || '') : ''
    const rawPrio = prioIdx !== -1 ? (cols[prioIdx] || '').toUpperCase() : 'NORMAL'

    if (!rowName || !rowUhid) {
      errors.push(`Row ${i + 1}: name and uhid are required.`)
      continue
    }

    let resolvedPkg = ''
    if (rawPkg) {
      if (packageIdSet.has(rawPkg)) {
        // Matched by ID (e.g. "pkg-silver")
        resolvedPkg = rawPkg
      } else {
        // Try matching by name (e.g. "Silver Health Check")
        resolvedPkg = packageNameMap.get(rawPkg.toLowerCase()) || ''
      }
      if (!resolvedPkg) {
        errors.push(`Row ${i + 1}: unknown package "${rawPkg}".`)
        continue
      }
    }

    const priority: Priority = rawPrio === 'VIP' ? 'VIP' : 'NORMAL'
    rows.push({ name: rowName, uhid: rowUhid, package: resolvedPkg, priority })
  }

  return { rows, errors }
}

export default function RegisterPatient() {
  const { registerPatient, state } = useApp()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [uhid, setUhid] = useState('')
  const [packageId, setPackageId] = useState<string | null>(null)
  const [pkgSearch, setPkgSearch] = useState('')
  const [pkgDropdownOpen, setPkgDropdownOpen] = useState(false)
  const [priority, setPriority] = useState<Priority>('NORMAL')

  // CSV bulk import state
  const [csvRows, setCsvRows] = useState<CsvRow[]>([])
  const [csvErrors, setCsvErrors] = useState<string[]>([])
  const [importResult, setImportResult] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const packageNameMap = new Map(
    state.packages.map((p) => [p.name.toLowerCase(), p.id]),
  )
  const packageIdSet = new Set(state.packages.map((p) => p.id))

  const filteredPackages = useMemo(() => {
    if (!pkgSearch.trim()) return state.packages
    const q = pkgSearch.toLowerCase()
    return state.packages.filter((p) => p.name.toLowerCase().includes(q))
  }, [pkgSearch, state.packages])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !uhid.trim()) return
    registerPatient(name.trim(), uhid.trim(), packageId, priority)
    navigate('/')
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvRows([])
    setCsvErrors([])
    setImportResult(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const { rows, errors } = parseCsv(text, packageNameMap, packageIdSet)
      setCsvRows(rows)
      setCsvErrors(errors)
    }
    reader.readAsText(file)
  }

  function handleBulkImport() {
    let count = 0
    for (const row of csvRows) {
      const pkgId = row.package || null
      registerPatient(row.name, row.uhid, pkgId, row.priority)
      count++
    }
    setImportResult(`Successfully registered ${count} patient${count !== 1 ? 's' : ''}.`)
    setCsvRows([])
    setCsvErrors([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function clearCsv() {
    setCsvRows([])
    setCsvErrors([])
    setImportResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Single registration form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Patient Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="Enter patient name"
            required
          />
        </div>

        <div>
          <label htmlFor="uhid" className="block text-sm font-medium text-gray-700 mb-1">
            UHID
          </label>
          <input
            id="uhid"
            type="text"
            value={uhid}
            onChange={(e) => setUhid(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="Enter UHID"
            required
          />
        </div>

        <div className="relative">
          <label htmlFor="package" className="block text-sm font-medium text-gray-700 mb-1">
            Package <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            id="package"
            type="text"
            value={pkgSearch}
            onChange={(e) => { setPkgSearch(e.target.value); setPkgDropdownOpen(true); if (!e.target.value) setPackageId(null) }}
            onFocus={() => setPkgDropdownOpen(true)}
            onBlur={() => setTimeout(() => setPkgDropdownOpen(false), 150)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="Search or leave empty"
            autoComplete="off"
          />
          {packageId && (
            <button
              type="button"
              onClick={() => { setPackageId(null); setPkgSearch(''); setPkgDropdownOpen(false) }}
              className="absolute right-2 top-[34px] text-gray-400 hover:text-gray-600 text-xs"
              aria-label="Clear package"
            >✕</button>
          )}
          {pkgDropdownOpen && filteredPackages.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg text-sm">
              {filteredPackages.map((pkg) => (
                <li
                  key={pkg.id}
                  className={`cursor-pointer px-3 py-1.5 hover:bg-primary-50 ${pkg.id === packageId ? 'bg-primary-100 font-medium' : ''}`}
                  onMouseDown={() => { setPackageId(pkg.id); setPkgSearch(pkg.name); setPkgDropdownOpen(false) }}
                >
                  {pkg.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="priority"
                value="NORMAL"
                checked={priority === 'NORMAL'}
                onChange={() => setPriority('NORMAL')}
                className="text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm">Normal</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="priority"
                value="VIP"
                checked={priority === 'VIP'}
                onChange={() => setPriority('VIP')}
                className="text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-amber-700">VIP</span>
            </label>
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-primary-600 text-white py-2.5 px-4 rounded-lg text-sm font-medium hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
        >
          Register & Start Workflow
        </button>
      </form>

      {/* CSV Bulk Import */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Bulk Import from CSV</h3>
        <p className="text-xs text-gray-500">
          Upload a <code>.csv</code> file with columns: <strong>name</strong>, <strong>uhid</strong> (required), <strong>package</strong>, <strong>priority</strong> (optional).
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 cursor-pointer"
        />

        {csvErrors.length > 0 && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-1">
            {csvErrors.map((err, i) => (
              <p key={i} className="text-xs text-red-700">{err}</p>
            ))}
          </div>
        )}

        {importResult && (
          <div className="rounded-lg bg-green-50 border border-green-200 p-3">
            <p className="text-xs text-green-700 font-medium">{importResult}</p>
          </div>
        )}

        {csvRows.length > 0 && (
          <>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">#</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Name</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">UHID</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Package</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Priority</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {csvRows.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-1.5">{row.name}</td>
                        <td className="px-3 py-1.5 font-mono">{row.uhid}</td>
                        <td className="px-3 py-1.5">
                          {state.packages.find((p) => p.id === row.package)?.name || '—'}
                        </td>
                        <td className="px-3 py-1.5">
                          {row.priority === 'VIP' ? (
                            <span className="text-amber-700 font-medium">VIP</span>
                          ) : (
                            'Normal'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleBulkImport}
                className="flex-1 bg-primary-600 text-white py-2.5 px-4 rounded-lg text-sm font-medium hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
              >
                Import {csvRows.length} Patient{csvRows.length !== 1 ? 's' : ''}
              </button>
              <button
                type="button"
                onClick={clearCsv}
                className="px-4 py-2.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
