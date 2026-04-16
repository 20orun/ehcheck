import { Outlet, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Building2,
  Sliders,
  BarChart3,
  UserPlus,
  Bell,
  Menu,
  X,
  RotateCcw,
  ClipboardList,
  Package as PackageIcon,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  CalendarDays,
  FileSpreadsheet,
  Stethoscope,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useApp } from '@/store/AppContext'
import { useAuth } from '@/store/AuthContext'
import { DOCTORS } from '@/types'
import clsx from 'clsx'

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/coordinator', icon: Sliders, label: 'Coordinator' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/tracker', icon: ClipboardList, label: 'Tracker' },
  { to: '/register', icon: UserPlus, label: 'Register' },
  { to: '/packages', icon: PackageIcon, label: 'Packages' },
  { to: '/calendar', icon: CalendarDays, label: 'Calendar' },
  { to: '/daily-report', icon: FileSpreadsheet, label: 'Daily Report' },
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)
  const { state, resetData, loading, selectedDate, isViewingPastDate, setSelectedDate } = useApp()
  const { user, signOut } = useAuth()
  const location = useLocation()

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 bg-white border-r border-gray-200 transform transition-all lg:relative lg:translate-x-0 flex flex-col',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <div className={clsx('flex items-center gap-3 py-5 border-b border-gray-200 shrink-0', collapsed ? 'px-3 justify-center' : 'px-6')}>
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm">EF</span>
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-lg font-bold text-gray-900">ExecuFlow</h1>
              <p className="text-xs text-gray-500">Health Check Tracker</p>
            </div>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className={clsx(
              'hidden lg:flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors p-1',
              collapsed ? '' : 'ml-auto'
            )}
          >
            {collapsed ? <ChevronsRight className="w-5 h-5" /> : <ChevronsLeft className="w-5 h-5" />}
          </button>
          {!collapsed && (
            <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <nav className="px-3 py-4 space-y-1 flex-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setSidebarOpen(false)}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors',
                  collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5',
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )
              }
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!collapsed && item.label}
            </NavLink>
          ))}

          {!collapsed && (
            <div className="pt-4 pb-2 px-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Departments
              </p>
            </div>
          )}
          {collapsed && <div className="pt-4" />}
          {state.departments.map((dept) => (
            <NavLink
              key={dept.id}
              to={`/department/${dept.id}`}
              onClick={() => setSidebarOpen(false)}
              title={collapsed ? dept.name : undefined}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg text-sm transition-colors',
                  collapsed ? 'justify-center px-0 py-2' : 'px-3 py-2',
                  isActive
                    ? 'bg-primary-50 text-primary-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )
              }
            >
              <Building2 className="w-4 h-4 shrink-0" />
              {!collapsed && dept.name}
            </NavLink>
          ))}

          {!collapsed && (
            <div className="pt-4 pb-2 px-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Doctors
              </p>
            </div>
          )}
          {collapsed && <div className="pt-4" />}
          {DOCTORS.map((doc) => (
            <NavLink
              key={doc.code}
              to={`/doctor/${doc.code}`}
              onClick={() => setSidebarOpen(false)}
              title={collapsed ? doc.name : undefined}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg text-sm transition-colors',
                  collapsed ? 'justify-center px-0 py-2' : 'px-3 py-2',
                  isActive
                    ? 'bg-primary-50 text-primary-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )
              }
            >
              <Stethoscope className="w-4 h-4 shrink-0" />
              {!collapsed && doc.name}
            </NavLink>
          ))}
        </nav>


      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 lg:px-6 py-3 flex items-center gap-4">
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-6 h-6 text-gray-600" />
          </button>

          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">
              {getPageTitle(location.pathname)}
            </h2>
          </div>

          <div className="relative">
            <Bell className="w-5 h-5 text-gray-500" />
          </div>

          <div className="relative" ref={accountRef}>
            <button
              onClick={() => setAccountOpen((o) => !o)}
              className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center hover:ring-2 hover:ring-primary-300 transition"
            >
              <Users className="w-4 h-4 text-primary-600" />
            </button>
            {accountOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                {user && (
                  <p className="text-xs text-gray-500 truncate px-4 pb-2 border-b border-gray-100" title={user.email}>
                    {user.email}
                  </p>
                )}
                <button
                  onClick={() => { setAccountOpen(false); signOut() }}
                  className="flex items-center gap-3 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
                <button
                  onClick={() => { if (confirm('Reset all data back to initial state?')) { setAccountOpen(false); resetData() } }}
                  disabled={loading}
                  className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset All
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Alerts bar – disabled for now */}

        {/* Past date banner */}
        {isViewingPastDate && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 lg:px-6 py-2 flex items-center gap-2 text-sm text-amber-800">
            <CalendarDays className="w-4 h-4 shrink-0" />
            <span>
              Viewing data for <strong>{new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</strong>
            </span>
            <button
              onClick={() => {
                const now = new Date()
                setSelectedDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`)
              }}
              className="ml-auto text-xs font-medium bg-amber-200 hover:bg-amber-300 text-amber-900 px-3 py-1 rounded-full transition-colors"
            >
              Back to Today
            </button>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function getPageTitle(path: string): string {
  if (path === '/') return 'Master Dashboard'
  if (path.startsWith('/patient/')) return 'Patient Timeline'
  if (path.startsWith('/department/')) return 'Department View'
  if (path.startsWith('/doctor/')) return 'Doctor Patients'
  if (path === '/coordinator') return 'Coordinator Panel'
  if (path === '/analytics') return 'Analytics & Reports'
  if (path === '/register') return 'Billing'
  if (path === '/tracker') return 'Patient Tracker'
  if (path === '/packages') return 'Packages'
  if (path === '/calendar') return 'Calendar'
  if (path === '/daily-report') return 'Daily Report'
  return 'ExecuFlow'
}
