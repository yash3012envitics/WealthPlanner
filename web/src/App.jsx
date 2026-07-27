import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import InsurancePage from './pages/InsurancePage'
import InvestmentsPage from './pages/InvestmentsPage'
import PropertiesPage from './pages/PropertiesPage'
import AssetsPage from './pages/AssetsPage'
import LiabilitiesPage from './pages/LiabilitiesPage'
import NotificationsPage from './pages/NotificationsPage'
import RecurringPage from './pages/RecurringPage'
import CashflowPage from './pages/CashflowPage'
import TargetPage from './pages/TargetPage'
import PlanPage from './pages/PlanPage'

function PrivateRoute({ children }) {
  const { token, loading } = useAuth()
  if (loading) return <div className="boot">Loading WealthPlanner…</div>
  if (!token) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="insurance" element={<InsurancePage />} />
        <Route path="investments" element={<InvestmentsPage />} />
        <Route path="recurring" element={<RecurringPage />} />
        <Route path="cashflow" element={<CashflowPage />} />
        <Route path="target" element={<TargetPage />} />
        <Route path="plan" element={<PlanPage />} />
        <Route path="properties" element={<PropertiesPage />} />
        <Route path="assets" element={<AssetsPage />} />
        <Route path="liabilities" element={<LiabilitiesPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
      </Route>
    </Routes>
  )
}
