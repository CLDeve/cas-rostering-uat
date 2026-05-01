import { Navigate, Route, Routes } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Layout from './components/Layout'
import EmployeesPage from './pages/EmployeesPage'
import TrainingPage from './pages/TrainingPage'
import RosteringEnginePage from './pages/RosteringEnginePage'
import DeploymentPlanningPage from './pages/DeploymentPlanningPage'
import DeploymentBoardPage from './pages/DeploymentBoardPage'
import RulesPage from './pages/RulesPage'
import DashboardPage from './pages/DashboardPage'
import UserManagementPage from './pages/UserManagementPage'
import OfficerProfilePage from './pages/OfficerProfilePage'

const THEME_KEY = 'roster_theme'

export default function App() {
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    setDarkMode(localStorage.getItem(THEME_KEY) === 'dark')
  }, [])

  useEffect(() => {
    localStorage.setItem(THEME_KEY, darkMode ? 'dark' : 'light')
  }, [darkMode])

  return (
    <Layout darkMode={darkMode} onToggleDarkMode={() => setDarkMode((v) => !v)}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/employees" element={<EmployeesPage />} />
        <Route path="/officer-profile" element={<OfficerProfilePage />} />
        <Route path="/rostering-engine" element={<RosteringEnginePage />} />
        <Route path="/deployment-planning" element={<Navigate to="/static-deployment-planning" replace />} />
        <Route path="/static-deployment-planning" element={<DeploymentPlanningPage />} />
        <Route path="/deployment-board" element={<DeploymentBoardPage />} />
        <Route path="/training-hub" element={<Navigate to="/course-scheduling" replace />} />
        <Route path="/training" element={<Navigate to="/course-scheduling" replace />} />
        <Route path="/training/course-creation" element={<Navigate to="/course-creation" replace />} />
        <Route path="/course-scheduling" element={<TrainingPage />} />
        <Route path="/course-creation" element={<TrainingPage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/user-management" element={<UserManagementPage />} />
      </Routes>
    </Layout>
  )
}
