import { Navigate, Route, Routes } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Layout from './components/Layout'
import EmployeesPage from './pages/EmployeesPage'
import TrainingPage from './pages/TrainingPage'
import RosteringEnginePage from './pages/RosteringEnginePage'
import DeploymentPlanningPage from './pages/DeploymentPlanningPage'
import DeploymentBoardPage from './pages/DeploymentBoardPage'
import DeploymentMapPage from './pages/DeploymentMapPage'
import RulesPage from './pages/RulesPage'
import DashboardPage from './pages/DashboardPage'
import UserManagementPage from './pages/UserManagementPage'
import OfficerProfilePage from './pages/OfficerProfilePage'
import Door4OfficersPage from './pages/Door4OfficersPage'
import Door4AlertPage from './pages/Door4AlertPage'
import Door4CrossTerminalPage from './pages/Door4CrossTerminalPage'
import Door4RulesPage from './pages/Door4RulesPage'
import ReportingTimePage from './pages/ReportingTimePage'
import PreboardConfigPage from './pages/PreboardConfigPage'

const THEME_KEY = 'roster_theme'

export default function App() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem(THEME_KEY) === 'dark')

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
        <Route path="/rostering-engine/reporting-time" element={<ReportingTimePage />} />
        <Route path="/deployment-planning" element={<Navigate to="/static-deployment-config" replace />} />
        <Route path="/static-deployment-planning" element={<Navigate to="/static-deployment-config" replace />} />
        <Route path="/static-deployment-config" element={<DeploymentPlanningPage />} />
        <Route path="/deployment-door-4" element={<Navigate to="/deployment-board/door-4" replace />} />
        <Route path="/deployment-board/door-4/deployment" element={<DeploymentBoardPage scopeKeyOverride="door-4" />} />
        <Route path="/deployment-board/door-4/officers" element={<Door4OfficersPage />} />
        <Route path="/deployment-board/door-4/alert" element={<Door4AlertPage />} />
        <Route path="/deployment-board/door-4/cross-terminal" element={<Door4CrossTerminalPage />} />
        <Route path="/deployment-board/door-4/rules" element={<Door4RulesPage />} />
        <Route path="/deployment-sq-ramp" element={<Navigate to="/deployment-board/sq-ramp" replace />} />
        <Route path="/deployment-preboard" element={<Navigate to="/deployment-board/preboard" replace />} />
        <Route path="/deployment-board/preboard/config" element={<PreboardConfigPage />} />
        <Route path="/deployment-board" element={<DeploymentBoardPage />} />
        <Route path="/deployment-board/door-4" element={<Navigate to="/deployment-board/door-4/deployment" replace />} />
        <Route path="/deployment-board/:scopeKey" element={<DeploymentBoardPage />} />
        <Route path="/deployment-map" element={<DeploymentMapPage />} />
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
