import { Routes, Route, Navigate } from 'react-router-dom'
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
import Auth from '@/pages/Auth'

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
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

  return (
    <AppProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/patient/:id" element={<PatientDetail />} />
          <Route path="/department/:id" element={<DepartmentView />} />
          <Route path="/doctor/:code" element={<DoctorView />} />
          <Route path="/coordinator" element={<CoordinatorPanel />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/register" element={<RegisterPatient />} />
          <Route path="/tracker" element={<Tracker />} />
          <Route path="/packages" element={<Packages />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/daily-report" element={<DailyReport />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AppProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
