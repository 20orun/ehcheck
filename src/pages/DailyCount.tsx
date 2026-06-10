import { useApp } from '@/store/AppContext'
import { EmptyState } from '@/components/ui'
import type { Package } from '@/types'
import { Utensils, Activity, Waves, Heart, HeartPulse, Globe, Building2, Home } from 'lucide-react'

// ─── Helpers (mirrored from Tracker / DailyReport) ──

const TRACKER_KEY_MAP: Record<string, keyof Package> = {
  lunch: 'tracker_lunch',
  tmt: 'tracker_tmt',
  pft: 'tracker_pft',
  ecg: 'tracker_ecg',
  echo: 'tracker_echo',
}

function getTrackerCellValue(pkg: Package | undefined, key: string): string {
  if (!pkg) return ''
  const field = TRACKER_KEY_MAP[key]
  if (!field) return ''
  return (pkg[field] as string) || ''
}

function getGroupsWithLunch(patients: CheckedInPatient[]): Set<string> {
  const groups = new Set<string>()
  for (const p of patients) {
    if (p.group_id && getTrackerCellValue(p.pkg, 'lunch') === '-') {
      groups.add(p.group_id)
    }
  }
  return groups
}

function getEffectiveLunchValue(patient: CheckedInPatient, groupsWithLunch: Set<string>): string {
  const val = getTrackerCellValue(patient.pkg, 'lunch')
  if (val === '-') return '-'
  if (patient.group_id && groupsWithLunch.has(patient.group_id)) return '-'
  return val
}

/** Strip MALE / FEMALE / (BELOW 40) / (ABOVE 40) suffix to get base package name */
function basePackageName(packageName: string): string {
  return packageName
    .trim()
    .replace(/\s*(MALE|FEMALE)\s*$/i, '')
    .replace(/\s*\((BELOW|ABOVE)\s*40\)\s*$/i, '')
    .trim() || packageName
}

type CheckedInPatient = {
  id: string
  name: string
  uhid: string
  package_name: string
  pkg?: Package
  checked_in_at: string
  group_id: string | null
}

// ─── Component ───────────────────────────────────────

export default function DailyCount() {
  const { state } = useApp()

  const today = new Date()
  const dateLabel = today.toLocaleDateString('en-IN', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  const checkedIn: CheckedInPatient[] = state.patients
    .filter((p): p is typeof p & { checked_in_at: string } => p.checked_in_at !== null)
    .sort((a, b) => {
      if (a.is_international !== b.is_international) return a.is_international ? 1 : -1
      return new Date(a.checked_in_at!).getTime() - new Date(b.checked_in_at!).getTime()
    })
    .map((p) => {
      const pkg = state.packages.find((pk) => pk.id === p.package_id)
      return {
        id: p.id,
        name: p.name,
        uhid: p.uhid,
        package_name: pkg?.name ?? '',
        pkg,
        checked_in_at: p.checked_in_at!,
        group_id: p.group_id,
      }
    })

  if (checkedIn.length === 0) {
    return <EmptyState message="No checked-in patients yet" />
  }

  // ─── Package-wise counts with category ────────────
  const CATEGORY_ORDER: Record<string, number> = { Domestic: 0, International: 1, Corporate: 2 }
  const CATEGORY_COLORS: Record<string, string> = {
    Domestic: 'bg-green-50 text-green-800',
    International: 'bg-blue-50 text-blue-800',
    Corporate: 'bg-amber-50 text-amber-800',
  }
  const pkgCategoryMap = checkedIn.reduce<Record<string, { count: number; category: string }>>((acc, p) => {
    const key = p.package_name ? basePackageName(p.package_name) : '—'
    if (!acc[key]) {
      acc[key] = { count: 0, category: p.pkg?.package_category || 'Corporate' }
    }
    acc[key].count += 1
    return acc
  }, {})
  const pkgEntries = Object.entries(pkgCategoryMap).sort((a, b) => {
    const orderDiff = (CATEGORY_ORDER[a[1].category] ?? 99) - (CATEGORY_ORDER[b[1].category] ?? 99)
    if (orderDiff !== 0) return orderDiff
    return b[1].count - a[1].count
  })

  // ─── Individual item counts ────────────────────────
  const groupsWithLunch = getGroupsWithLunch(checkedIn)
  const lunchCount = checkedIn.filter((p) => getEffectiveLunchValue(p, groupsWithLunch) === '-').length
  const tmtCount = checkedIn.filter((p) => getTrackerCellValue(p.pkg, 'tmt') === '-').length
  const pftCount = checkedIn.filter((p) => getTrackerCellValue(p.pkg, 'pft') === '-').length
  const ecgCount = checkedIn.filter((p) => getTrackerCellValue(p.pkg, 'ecg') === '-').length
  const echoCount = checkedIn.filter((p) => getTrackerCellValue(p.pkg, 'echo') === '-').length

  // ─── Package category counts ───────────────────────
  const domesticCount = checkedIn.filter((p) => p.pkg?.package_category === 'Domestic').length
  const corporateCount = checkedIn.filter((p) => (!p.pkg?.package_category || p.pkg?.package_category === 'Corporate')).length
  const internationalCount = checkedIn.filter((p) => p.pkg?.package_category === 'International').length

  const countCards = [
    { label: 'Domestic', count: domesticCount, icon: Home, color: 'bg-green-50 border-green-200 text-green-800' },
    { label: 'Corporate', count: corporateCount, icon: Building2, color: 'bg-amber-50 border-amber-200 text-amber-800' },
    { label: 'International', count: internationalCount, icon: Globe, color: 'bg-blue-50 border-blue-200 text-blue-800' },
    { label: 'Lunch', count: lunchCount, icon: Utensils, color: 'bg-green-50 border-green-200 text-green-800' },
    { label: 'TMT', count: tmtCount, icon: Activity, color: 'bg-blue-50 border-blue-200 text-blue-800' },
    { label: 'PFT', count: pftCount, icon: Waves, color: 'bg-purple-50 border-purple-200 text-purple-800' },
    { label: 'ECG', count: ecgCount, icon: Heart, color: 'bg-red-50 border-red-200 text-red-800' },
    { label: 'ECHO', count: echoCount, icon: HeartPulse, color: 'bg-pink-50 border-pink-200 text-pink-800' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Daily Count</h2>
        <p className="text-sm text-gray-500">{dateLabel}</p>
      </div>

      {/* Count cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {countCards.map((card) => (
          <div
            key={card.label}
            className={`rounded-lg border p-4 flex items-center gap-3 ${card.color}`}
          >
            <card.icon className="w-8 h-8 opacity-60" />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide opacity-80">{card.label}</p>
              <p className="text-2xl font-bold">{card.count}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Package-wise count summary */}
      <div>
        <h3 className="text-base font-semibold text-gray-800 mb-3">Package-wise Count</h3>
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden max-w-md">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2.5 font-semibold text-gray-700">Package</th>
                <th className="text-center px-4 py-2.5 font-semibold text-gray-700 w-20">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pkgEntries.reduce<React.ReactNode[]>((rows, [pkg, { count, category }], idx, arr) => {
                const prevCat = idx > 0 ? arr[idx - 1][1].category : null
                if (category !== prevCat) {
                  rows.push(
                    <tr key={`cat-${category}`} className={CATEGORY_COLORS[category] || 'bg-gray-50 text-gray-700'}>
                      <td colSpan={2} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider">
                        {category}
                      </td>
                    </tr>
                  )
                }
                rows.push(
                  <tr key={pkg} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 text-gray-800 pl-6">{pkg}</td>
                    <td className="px-4 py-2.5 text-center font-semibold text-gray-900">{count}</td>
                  </tr>
                )
                return rows
              }, [])}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="px-4 py-2.5 font-semibold text-gray-900">Total</td>
                <td className="px-4 py-2.5 text-center font-semibold text-gray-900">{checkedIn.length}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
