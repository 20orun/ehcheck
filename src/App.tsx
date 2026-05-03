import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/store/AuthContext'
import { AppProvider } from '@/store/AppContext'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import PatientDetail from '@/pages/PatientDetail'
import DepartmentView from '@/pages/DepartmentView'
import DoctorView from '@/pages/DoctorView'
import CoordinatorPanel from '@/pages/CoordinatorPanel'
import Analytics from '@/pages/Analytics'
import RegisterPatient from '@/pages/RegisterPatient'
import Tracker from '@/pages/Tracker'
import Packages from '@/pages/Packages'
import Calendar from '@/pages/Calendar'
import DailyReport from '@/pages/DailyReport'
import CrossConsultations from '@/pages/CrossConsultations'
import DepartmentDashboard from '@/pages/DepartmentDashboard'
import Accounts from '@/pages/Accounts'
import Auth from '@/pages/Auth'

// ─── Role-aware route guard ───────────────────────────
// Renders children if allowed, otherwise redirects to the role's home.
function Guard({ allowed, children }: { allowed: boolean; children: React.ReactNode }) {
  const { isDepartment, isDoctor, departmentId, doctorCode } = useAuth()
  if (allowed) return <>{children}</>
  if (isDepartment && departmentId) return <Navigate to={`/department/${departmentId}`} replace />
  if (isDoctor && doctorCode) return <Navigate to={`/doctor/${doctorCode}`} replace />
  return <Navigate to="/" replace />
}

function AppRoutes() {
  const { user, loading, roleLoading, isAdmin, isCoordinator, isDepartment, isDoctor, departmentId, doctorCode } = useAuth()

  if (loading || (user && roleLoading)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Auth />} />
      </Routes>
    )
  }

  // Determine what this role is allowed to access.
  // admin & coordinator: everything (coordinator minus /analytics).
  // department role: only /department/:id and /patient/:id.
  // doctor role: only /doctor/:code and /patient/:id.
  const fullAccess = isAdmin || isCoordinator

  // Default landing path after login
  const homePath = isDepartment && departmentId
    ? `/department/${departmentId}`
    : isDoctor && doctorCode
      ? `/doctor/${doctorCode}`
      : '/'

  return (
    <AppProvider>
      <Routes>
        <Route element={<Layout />}>
          {/* Dashboard – admin + coordinator only */}
          <Route path="/"
            element={<Guard allowed={fullAccess}><Dashboard /></Guard>}
          />

          {/* Patient detail – all roles */}
          <Route path="/patient/:id" element={<PatientDetail />} />

          {/* Department view – admin/coordinator see any; department role only theirs */}
          <Route path="/department/:id"
            element={
              <DepartmentRouteGuard>
                <DepartmentView />
              </DepartmentRouteGuard>
            }
          />

          {/* Doctor view – admin/coordinator see any; doctor role only theirs */}
          <Route path="/doctor/:code"
            element={
              <DoctorRouteGuard>
                <DoctorView />
              </DoctorRouteGuard>
            }
          />

          {/* Coordinator panel – admin + coordinator only */}
          <Route path="/coordinator"
            element={<Guard allowed={fullAccess}><CoordinatorPanel /></Guard>}
          />

          {/* Analytics – admin only */}
          <Route path="/analytics"
            element={<Guard allowed={isAdmin}><Analytics /></Guard>}
          />

          {/* Register – admin + coordinator only */}
          <Route path="/register"
            element={<Guard allowed={fullAccess}><RegisterPatient /></Guard>}
          />

          {/* Tracker – admin + coordinator only */}
          <Route path="/tracker"
            element={<Guard allowed={fullAccess}><Tracker /></Guard>}
          />

          {/* Packages – admin + coordinator only */}
          <Route path="/packages"
            element={<Guard allowed={fullAccess}><Packages /></Guard>}
          />

          {/* Calendar – admin + coordinator only */}
          <Route path="/calendar"
            element={<Guard allowed={fullAccess}><Calendar /></Guard>}
          />

          {/* Daily Report – admin + coordinator only */}
          <Route path="/daily-report"
            element={<Guard allowed={fullAccess}><DailyReport /></Guard>}
          />

          {/* Cross Consultations – admin + coordinator only */}
          <Route path="/cross-consultations"
            element={<Guard allowed={fullAccess}><CrossConsultations /></Guard>}
          />

          {/* Department Dashboard – admin + coordinator only */}
          <Route path="/departments"
            element={<Guard allowed={fullAccess}><DepartmentDashboard /></Guard>}
          />

          {/* Accounts – admin only */}
          <Route path="/accounts"
            element={<Guard allowed={isAdmin}><Accounts /></Guard>}
          />

          {/* Catch-all: redirect to role's home */}
          <Route path="*" element={<Navigate to={homePath} replace />} />
        </Route>
      </Routes>
    </AppProvider>
  )
}

// Checks that a department role can only visit their own department route.
function DepartmentRouteGuard({ children }: { children: React.ReactNode }) {
  const { isAdmin, isCoordinator, isDepartment, isDoctor, departmentId, doctorCode } = useAuth()
  // useParams is not available here without importing it, so use a wrapper component inside.
  // We delegate the check to a child wrapper.
  if (isAdmin || isCoordinator) return <>{children}</>
  if (isDepartment || isDoctor) return <DepartmentParamGuard departmentId={departmentId} doctorCode={doctorCode} isDepartment={isDepartment}>{children}</DepartmentParamGuard>
  return <Navigate to="/" replace />
}

function DepartmentParamGuard({ children, departmentId, doctorCode, isDepartment }: {
  children: React.ReactNode
  departmentId: string | null
  doctorCode: string | null
  isDepartment: boolean
}) {
  const { id } = useParams<{ id: string }>()
  if (isDepartment && id === departmentId) return <>{children}</>
  if (!isDepartment && doctorCode) return <Navigate to={`/doctor/${doctorCode}`} replace />
  return <Navigate to={`/department/${departmentId}`} replace />
}

function DoctorRouteGuard({ children }: { children: React.ReactNode }) {
  const { isAdmin, isCoordinator, isDepartment, isDoctor, departmentId, doctorCode } = useAuth()
  if (isAdmin || isCoordinator) return <>{children}</>
  if (isDoctor) return <DoctorParamGuard doctorCode={doctorCode}>{children}</DoctorParamGuard>
  if (isDepartment && departmentId) return <Navigate to={`/department/${departmentId}`} replace />
  return <Navigate to="/" replace />
}

function DoctorParamGuard({ children, doctorCode }: { children: React.ReactNode; doctorCode: string | null }) {
  const { code } = useParams<{ code: string }>()
  if (code === doctorCode) return <>{children}</>
  return <Navigate to={`/doctor/${doctorCode}`} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
