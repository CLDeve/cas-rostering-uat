import { NavLink, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  Users,
  CalendarDays,
  Building2,
  LayoutGrid,
  GraduationCap,
  FileText,
  Sun,
  Moon,
  Shield,
  LayoutDashboard,
  PanelLeft,
  UserCog,
} from 'lucide-react'

const navItems = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    subtitle: 'Daily manpower coverage across active deployment sites.',
  },
  {
    to: '/employees',
    label: 'Employees',
    icon: Users,
    subtitle: 'Manage officers, uploads, and inline creation.',
  },
  {
    to: '/rostering-engine',
    label: 'Rostering Engine',
    icon: CalendarDays,
    subtitle: 'Calendar roster with shift logic and forecast controls.',
  },
  {
    to: '/deployment-planning',
    label: 'Deployment Planning',
    icon: Building2,
    subtitle: 'Create recurring and adhoc site deployment requirements.',
  },
  {
    to: '/deployment-board',
    label: 'Deployment Board',
    icon: LayoutGrid,
    subtitle: 'Assign available officers to site slots by date.',
  },
  {
    to: '/training',
    label: 'Training',
    icon: GraduationCap,
    subtitle: 'Create and track course schedules.',
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
  return (
    navItems.find((item) => pathname.startsWith(item.to)) ?? {
      label: 'Rostering System',
      subtitle: 'Enterprise workforce planning',
    }
  )
}

export default function Layout({ children, darkMode, onToggleDarkMode }) {
  const location = useLocation()
  const meta = resolveMeta(location.pathname)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [apiTokenInput, setApiTokenInput] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('roster_sidebar_open')
    if (saved === '0') {
      setSidebarOpen(false)
    }
    const existingToken = sessionStorage.getItem('roster_api_token') || localStorage.getItem('roster_api_token') || ''
    setApiTokenInput(existingToken)
  }, [])

  useEffect(() => {
    localStorage.setItem('roster_sidebar_open', sidebarOpen ? '1' : '0')
  }, [sidebarOpen])

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
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <Icon className="nav-icon" />
              <span className="nav-text">{label}</span>
            </NavLink>
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
        <header className="page-header">
          <div>
            <h1>{meta.label}</h1>
            <p>{meta.subtitle}</p>
          </div>
        </header>
        {children}
      </main>
    </div>
  )
}
