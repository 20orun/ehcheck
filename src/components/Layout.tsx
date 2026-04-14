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
} from 'lucide-react'
import { useState } from 'react'
import { useApp } from '@/store/AppContext'
import { useAuth } from '@/store/AuthContext'
import clsx from 'clsx'

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/coordinator', icon: Sliders, label: 'Coordinator' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/tracker', icon: ClipboardList, label: 'Tracker' },
  { to: '/register', icon: UserPlus, label: 'Register' },
  { to: '/packages', icon: PackageIcon, label: 'Packages' },
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const { state, resetData, loading } = useApp()
  const { user, signOut } = useAuth()
  const location = useLocation()

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
          {!collapsed && (
            <button className="ml-auto lg:hidden" onClick={() => setSidebarOpen(false)}>
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
        </nav>

        <div className="px-3 py-4 border-t border-gray-200 shrink-0 space-y-1">
          {!collapsed && user && (
            <p className="text-xs text-gray-500 truncate px-3 pb-1" title={user.email}>
              {user.email}
            </p>
          )}
          <button
            onClick={() => signOut()}
            title={collapsed ? 'Sign Out' : undefined}
            className={clsx(
              'flex items-center gap-3 w-full rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors',
              collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
            )}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!collapsed && 'Sign Out'}
          </button>
          <button
            onClick={() => { if (confirm('Reset all data back to initial state?')) resetData() }}
            disabled={loading}
            title={collapsed ? 'Reset All' : undefined}
            className={clsx(
              'flex items-center gap-3 w-full rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50',
              collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
            )}
          >
            <RotateCcw className="w-5 h-5 shrink-0" />
            {!collapsed && 'Reset All'}
          </button>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className={clsx(
              'hidden lg:flex items-center gap-3 w-full rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors',
              collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
            )}
          >
            {collapsed ? <ChevronsRight className="w-5 h-5" /> : <ChevronsLeft className="w-5 h-5" />}
            {!collapsed && 'Collapse'}
          </button>
        </div>
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

          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
            <Users className="w-4 h-4 text-primary-600" />
          </div>
        </header>

        {/* Alerts bar – disabled for now */}

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
  if (path === '/coordinator') return 'Coordinator Panel'
  if (path === '/analytics') return 'Analytics & Reports'
  if (path === '/register') return 'Billing'
  if (path === '/tracker') return 'Patient Tracker'
  if (path === '/packages') return 'Packages'
  return 'ExecuFlow'
}
