import { NavLink, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import PageLoader from './PageLoader'
import {
  Users,
  CalendarDays,
  Building2,
  LayoutGrid,
  Map,
  GraduationCap,
  FileText,
  Sun,
  Moon,
  Shield,
  LayoutDashboard,
  PanelLeft,
  UserCog,
  IdCard,
  Bell,
  Shuffle,
  UserCheck,
  Briefcase,
} from 'lucide-react'

const navItems = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    subtitle: 'Daily manpower coverage across active deployment sites.',
  },
  {
    to: '/employees-group',
    label: 'Employees',
    icon: Users,
    subtitle: 'Employee creation and profile operations.',
    isGroup: true,
    groupKey: 'employees',
  },
  {
    to: '/employees',
    label: 'Create Employee',
    icon: Users,
    subtitle: 'Manage officers, uploads, and inline creation.',
    subnav: true,
    groupKey: 'employees',
  },
  {
    to: '/officer-profile',
    label: 'Officer Profile',
    icon: IdCard,
    subtitle: 'View and manage detailed officer profile information.',
    subnav: true,
    groupKey: 'employees',
  },
  {
    to: '/rostering-engine',
    label: 'Rostering Engine',
    icon: CalendarDays,
    subtitle: 'Calendar roster with shift logic and forecast controls.',
    exact: true,
  },
  {
    to: '/rostering-engine/reporting-time',
    label: 'Reporting Time',
    icon: CalendarDays,
    subtitle: 'Set officer reporting time by date.',
    subnav: true,
    exact: true,
  },
  {
    to: '/deployment-group',
    label: 'Deployment',
    icon: Building2,
    subtitle: 'Deployment planning and board operations.',
    isGroup: true,
    groupKey: 'deployment',
  },
  {
    to: '/static-deployment-config',
    label: 'Static Deployment Config',
    icon: Building2,
    subtitle: 'Create recurring and adhoc site deployment requirements.',
    subnav: true,
    groupKey: 'deployment',
  },
  {
    to: '/deployment-door-4-group',
    label: 'Door 4',
    icon: LayoutGrid,
    subtitle: 'Door 4 deployment operations.',
    isGroup: true,
    groupKey: 'door4',
    subnav: true,
  },
  {
    to: '/deployment-board/door-4/deployment',
    label: 'Door 4 Deployment',
    icon: Briefcase,
    subtitle: 'Door 4 manpower deployment board.',
    subnav: true,
    groupKey: 'door4',
  },
  {
    to: '/deployment-board/door-4/officers',
    label: 'Door 4 Officers',
    icon: UserCheck,
    subtitle: 'Door 4 officers and assignment list.',
    subnav: true,
    groupKey: 'door4',
  },
  {
    to: '/deployment-board/door-4/alert',
    label: 'Door 4 Alert',
    icon: Bell,
    subtitle: 'Door 4 alerts and escalations.',
    subnav: true,
    groupKey: 'door4',
  },
  {
    to: '/deployment-board/door-4/cross-terminal',
    label: 'Cross Terminal',
    icon: Shuffle,
    subtitle: 'Officers blocked by terminal-crossing constraints.',
    subnav: true,
    groupKey: 'door4',
  },
  {
    to: '/deployment-board/door-4/rules',
    label: 'Door 4 Rules',
    icon: FileText,
    subtitle: 'Door 4 assignment and deployment operating rules.',
    subnav: true,
    groupKey: 'door4',
  },
  {
    to: '/deployment-board/sq-ramp',
    label: 'SQ Ramp',
    icon: LayoutGrid,
    subtitle: 'Open deployment board for SQ Ramp.',
    subnav: true,
    groupKey: 'deployment',
  },
  {
    to: '/deployment-board/preboard',
    label: 'Preboard',
    icon: LayoutGrid,
    subtitle: 'Open deployment board for Preboard.',
    subnav: true,
    groupKey: 'deployment',
    exact: true,
  },
  {
    to: '/deployment-board/preboard/officers-teams',
    label: 'Preboard Officers & Teams',
    icon: UserCheck,
    subtitle: 'Preboard officer attendance and team overview.',
    subnav: true,
    groupKey: 'deployment',
  },
  {
    to: '/deployment-board/preboard/config',
    label: 'Preboard Config',
    icon: FileText,
    subtitle: 'Configure Terminal, GHR, and Gate Type for Preboard.',
    subnav: true,
    groupKey: 'deployment',
  },
  {
    to: '/deployment-board',
    label: 'Deployment Board',
    icon: LayoutGrid,
    subtitle: 'Assign available officers to site slots by date.',
    subnav: true,
    groupKey: 'deployment',
    exact: true,
  },
  {
    to: '/deployment-map',
    label: 'Map',
    icon: Map,
    subtitle: 'View deployment sites using saved coordinates.',
    subnav: true,
    groupKey: 'deployment',
  },
  {
    to: '/training-group',
    label: 'Training',
    icon: GraduationCap,
    subtitle: 'Training modules and course operations.',
    isGroup: true,
    groupKey: 'training',
  },
  {
    to: '/course-scheduling',
    label: 'Course Scheduling',
    icon: GraduationCap,
    subtitle: 'Create and track course schedules.',
    subnav: true,
    groupKey: 'training',
  },
  {
    to: '/course-creation',
    label: 'Course Creation',
    icon: GraduationCap,
    subtitle: 'Create training courses.',
    subnav: true,
    groupKey: 'training',
  },
  {
    to: '/rules',
    label: 'Rules',
    icon: FileText,
    subtitle: 'Rostering rules and operational standards.',
  },
  {
    to: '/user-management',
    label: 'User Management',
    icon: UserCog,
    subtitle: 'Manage system users, roles, and account status.',
  },
]

function resolveMeta(pathname) {
  if (pathname.startsWith('/employees-group')) {
    return {
      label: 'Employees',
      subtitle: 'Employee creation and profile operations.',
    }
  }
  if (pathname.startsWith('/deployment-group')) {
    return {
      label: 'Deployment',
      subtitle: 'Deployment planning and board operations.',
    }
  }
  if (pathname.startsWith('/deployment-door-4-group')) {
    return {
      label: 'Door 4',
      subtitle: 'Door 4 deployment operations.',
    }
  }
  if (pathname.startsWith('/training-group')) {
    return {
      label: 'Training',
      subtitle: 'Training modules and course operations.',
    }
  }
  const sorted = [...navItems].filter((item) => !item.isGroup).sort((a, b) => b.to.length - a.to.length)
  return (
    sorted.find((item) => pathname.startsWith(item.to)) ?? {
      label: 'Rostering System',
      subtitle: 'Enterprise workforce planning',
    }
  )
}

export default function Layout({ children, darkMode, onToggleDarkMode }) {
  const location = useLocation()
  const meta = resolveMeta(location.pathname)
  const hidePageHeader = location.pathname.startsWith('/deployment-board/door-4/deployment')
    || location.pathname.startsWith('/deployment-board/preboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [apiTokenInput, setApiTokenInput] = useState('')
  const [trainingExpanded, setTrainingExpanded] = useState(true)
  const [deploymentExpanded, setDeploymentExpanded] = useState(true)
  const [employeesExpanded, setEmployeesExpanded] = useState(true)
  const [routeLoading, setRouteLoading] = useState(false)
  const [door4Expanded, setDoor4Expanded] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('roster_sidebar_open')
    if (saved === '0') {
      setSidebarOpen(false)
    }
    const existingToken = sessionStorage.getItem('roster_api_token') || localStorage.getItem('roster_api_token') || ''
    setApiTokenInput(existingToken)
    const trainingState = localStorage.getItem('roster_training_expanded')
    if (trainingState === '0') setTrainingExpanded(false)
    const deploymentState = localStorage.getItem('roster_deployment_expanded')
    if (deploymentState === '0') setDeploymentExpanded(false)
    const door4State = localStorage.getItem('roster_door4_expanded')
    if (door4State === '0') setDoor4Expanded(false)
    const employeesState = localStorage.getItem('roster_employees_expanded')
    if (employeesState === '0') setEmployeesExpanded(false)
  }, [])

  useEffect(() => {
    localStorage.setItem('roster_sidebar_open', sidebarOpen ? '1' : '0')
  }, [sidebarOpen])

  useEffect(() => {
    localStorage.setItem('roster_training_expanded', trainingExpanded ? '1' : '0')
  }, [trainingExpanded])

  useEffect(() => {
    localStorage.setItem('roster_deployment_expanded', deploymentExpanded ? '1' : '0')
  }, [deploymentExpanded])

  useEffect(() => {
    localStorage.setItem('roster_employees_expanded', employeesExpanded ? '1' : '0')
  }, [employeesExpanded])

  useEffect(() => {
    localStorage.setItem('roster_door4_expanded', door4Expanded ? '1' : '0')
  }, [door4Expanded])

  useEffect(() => {
    setRouteLoading(true)
    const timer = window.setTimeout(() => setRouteLoading(false), 350)
    return () => window.clearTimeout(timer)
  }, [location.pathname])

  return (
    <div className={`app-shell${darkMode ? ' dark' : ''}${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <button
            type="button"
            className="sidebar-brand-icon"
            onClick={() => {
              if (!sidebarOpen) setSidebarOpen(true)
            }}
            aria-label={sidebarOpen ? 'Rostering System' : 'Open sidebar'}
            title={sidebarOpen ? 'Rostering System' : 'Open sidebar'}
          >
            <Shield size={16} color="#fff" strokeWidth={2.5} />
          </button>
          <div className="sidebar-brand-text">
            <div className="sidebar-brand-title">Rostering System</div>
            <div className="sidebar-brand-sub">CAS Operations</div>
          </div>
          <button
            type="button"
            className="sidebar-brand-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <PanelLeft size={16} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Navigation</div>
          {navItems
            .filter((item) => {
              if (!item.subnav) return true
              if (item.groupKey === 'employees') return employeesExpanded
              if (item.groupKey === 'training') return trainingExpanded
              if (item.groupKey === 'deployment') return deploymentExpanded
              if (item.groupKey === 'door4') {
                if (item.isGroup) return deploymentExpanded
                return deploymentExpanded && door4Expanded
              }
              return true
            })
            .map(({ to, label, icon: Icon, subnav, isGroup, groupKey, exact }) => (
              isGroup ? (
                <div
                  key={to}
                  className={`nav-link${
                    (groupKey === 'employees' && employeesExpanded) ||
                    (groupKey === 'training' && trainingExpanded) ||
                    (groupKey === 'deployment' && deploymentExpanded) ||
                    (groupKey === 'door4' && door4Expanded)
                      ? ' expanded'
                      : ''
                  }`}
                  onClick={() => {
                    if (groupKey === 'employees') setEmployeesExpanded((v) => !v)
                    if (groupKey === 'training') setTrainingExpanded((v) => !v)
                    if (groupKey === 'deployment') setDeploymentExpanded((v) => !v)
                    if (groupKey === 'door4') setDoor4Expanded((v) => !v)
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <Icon className="nav-icon" />
                  <span className="nav-text">{label}</span>
                </div>
              ) : (
                <NavLink
                  key={to}
                  to={to}
                  end={Boolean(exact)}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}${subnav ? ' subnav-link' : ''}`}
                >
                  <Icon className="nav-icon" />
                  <span className="nav-text">{label}</span>
                </NavLink>
              )
            ))}
        </nav>

        <div className="sidebar-footer">
          <div className="token-box">
            <input
              className="token-input"
              type="password"
              placeholder="API Token"
              value={apiTokenInput}
              onChange={(e) => setApiTokenInput(e.target.value)}
            />
            <div className="token-actions">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  const value = apiTokenInput.trim()
                  if (!value) return
                  sessionStorage.setItem('roster_api_token', value)
                }}
              >
                <span className="nav-text">Save</span>
              </button>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => {
                  sessionStorage.removeItem('roster_api_token')
                  localStorage.removeItem('roster_api_token')
                  setApiTokenInput('')
                }}
              >
                <span className="nav-text">Clear</span>
              </button>
            </div>
          </div>
          <button className="theme-btn" onClick={onToggleDarkMode} type="button">
            {darkMode ? (
              <>
                <Sun className="nav-icon" />
                <span className="nav-text">Light Mode</span>
              </>
            ) : (
              <>
                <Moon className="nav-icon" />
                <span className="nav-text">Dark Mode</span>
              </>
            )}
          </button>
        </div>
      </aside>

      <main className="page">
        {routeLoading && <PageLoader text="Loading page..." />}
        {!hidePageHeader && (
          <header className="page-header">
            <div>
              <h1>{meta.label}</h1>
              <p>{meta.subtitle}</p>
            </div>
          </header>
        )}
        {children}
      </main>
    </div>
  )
}
