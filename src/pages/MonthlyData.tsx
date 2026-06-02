import { useState, useEffect, useCallback } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchPatientsByMonth, fetchPackages } from '@/lib/db'
import type { Patient, Package } from '@/types'

/** Strip MALE / FEMALE suffix to get base package name (same as DailyReport) */
function basePackageName(packageName: string): string {
  return packageName.trim().replace(/\s*(MALE|FEMALE)\s*$/i, '').trim() || packageName
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function MonthlyData() {
  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1) // 1-12
  const [packages, setPackages] = useState<Package[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load packages once on mount
  useEffect(() => {
    fetchPackages()
      .then(setPackages)
      .catch(() => setError('Failed to load packages'))
  }, [])

  // Fetch patients for selected month
  const loadData = useCallback(async (year: number, month: number) => {
    setLoading(true)
    setError(null)
    try {
      const mm = String(month).padStart(2, '0')
      const yearMonth = `${year}-${mm}`
      const pts = await fetchPatientsByMonth(yearMonth)
      setPatients(pts)
    } catch (err) {
      setError('Failed to load monthly data')
      setPatients([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Load data when month/year changes
  useEffect(() => {
    loadData(selectedYear, selectedMonth)
  }, [selectedYear, selectedMonth, loadData])

  function goToPrevMonth() {
    if (selectedMonth === 1) {
      setSelectedMonth(12)
      setSelectedYear((y) => y - 1)
    } else {
      setSelectedMonth((m) => m - 1)
    }
  }

  function goToNextMonth() {
    if (selectedMonth === 12) {
      setSelectedMonth(1)
      setSelectedYear((y) => y + 1)
    } else {
      setSelectedMonth((m) => m + 1)
    }
  }

  // Build package count map using basePackageName to club MALE/FEMALE
  const pkgCounts: Record<string, number> = {}
  for (const p of patients) {
    const pkg = packages.find((pk) => pk.id === p.package_id)
    const key = pkg?.name ? basePackageName(pkg.name) : 'No Package'
    pkgCounts[key] = (pkgCounts[key] ?? 0) + 1
  }

  const entries = Object.entries(pkgCounts).sort((a, b) => b[1] - a[1])
  const totalPatients = patients.length

  // Generate year options: ±5 years from current
  const currentYear = now.getFullYear()
  const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Monthly Data</h2>
          <p className="text-sm text-gray-500">Package billing counts by month</p>
        </div>
      </div>

      {/* Month/Year Selector */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={goToPrevMonth}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-600 transition-colors"
            title="Previous month"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Month dropdown */}
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            {MONTH_NAMES.map((name, idx) => (
              <option key={idx} value={idx + 1}>
                {name}
              </option>
            ))}
          </select>

          {/* Year dropdown */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={goToNextMonth}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-600 transition-colors"
            title="Next month"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <span className="inline-flex items-center gap-1.5 text-sm text-gray-500 ml-2">
            <Calendar className="w-4 h-4" />
            {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
          </span>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      )}

      {/* Data table */}
      {!loading && !error && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Package</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700 w-32">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-12 text-center text-gray-400">
                    No patients found for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
                  </td>
                </tr>
              ) : (
                entries.map(([pkg, count]) => (
                  <tr key={pkg} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-800 font-medium">{pkg}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center min-w-8 px-2 py-0.5 rounded-full bg-primary-100 text-primary-800 font-semibold text-sm">
                        {count}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {entries.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td className="px-4 py-3 font-semibold text-gray-900">Total Patients</td>
                  <td className="px-4 py-3 text-center font-bold text-gray-900">{totalPatients}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}
