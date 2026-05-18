function buildQuery(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value))
    }
  })
  return search.toString()
}

const isBrowser = typeof window !== 'undefined'
const host = isBrowser ? window.location.hostname : ''
const USE_MOCK = (import.meta.env.VITE_USE_MOCK === 'true') || host.endsWith('github.io')

const MOCK_KEYS = {
  employees: 'roster_mock_employees',
  deployments: 'roster_mock_deployments',
  assignments: 'roster_mock_assignments',
  trainings: 'roster_mock_trainings',
  users: 'roster_mock_users',
  roster: 'roster_mock_roster',
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

function todayIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function readMock(key, fallback) {
  if (!isBrowser) return fallback
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeMock(key, value) {
  if (!isBrowser) return
  localStorage.setItem(key, JSON.stringify(value))
}

function initMock() {
  if (!USE_MOCK) return
  const employees = readMock(MOCK_KEYS.employees, null)
  if (!employees) {
    writeMock(MOCK_KEYS.employees, [])
  }
  const deployments = readMock(MOCK_KEYS.deployments, null)
  if (!deployments) {
    writeMock(MOCK_KEYS.deployments, [])
  }
  const trainings = readMock(MOCK_KEYS.trainings, null)
  if (!trainings) {
    writeMock(MOCK_KEYS.trainings, [])
  }
  const users = readMock(MOCK_KEYS.users, null)
  if (!users) {
    writeMock(MOCK_KEYS.users, [{ id: 1, username: 'admin', full_name: 'Admin User', is_active: true }])
  }
  const assignments = readMock(MOCK_KEYS.assignments, null)
  if (!assignments) {
    writeMock(MOCK_KEYS.assignments, {})
  }
  const roster = readMock(MOCK_KEYS.roster, null)
  if (!roster) {
    writeMock(MOCK_KEYS.roster, {})
  }
}

initMock()

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData
  let token = sessionStorage.getItem('roster_api_token') || localStorage.getItem('roster_api_token')
  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  const isLocalHost = host === '127.0.0.1' || host === 'localhost'
  const allowDevFallback = isLocalHost

  // Local-only fallback to reduce friction during development/testing.
  if (!token && isLocalHost && allowDevFallback) {
    token = 'dev-admin-token'
    sessionStorage.setItem('roster_api_token', token)
  }

  if (!token) {
    throw new Error('Missing API token. Set `roster_api_token` in sessionStorage/localStorage.')
  }
  const response = await fetch(path, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(isFormData ? {} : options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    if (typeof body?.detail === 'string') {
      throw new Error(body.detail)
    }
    if (Array.isArray(body?.detail) && body.detail.length > 0) {
      const first = body.detail[0]
      const loc = Array.isArray(first.loc) ? first.loc.join('.') : 'request'
      throw new Error(`${loc}: ${first.msg || 'invalid value'}`)
    }
    throw new Error(`Request failed: ${response.status}`)
  }
  return body
}

export function listEmployees(params = { page: 1, page_size: 100 }) {
  if (USE_MOCK) {
    const items = readMock(MOCK_KEYS.employees, [])
    const page = Number(params.page || 1)
    const pageSize = Number(params.page_size || 100)
    const start = (page - 1) * pageSize
    const pageItems = items.slice(start, start + pageSize)
    return Promise.resolve({ items: pageItems, total: items.length, page, page_size: pageSize })
  }
  const query = buildQuery(params)
  return request(`/api/v1/employees${query ? `?${query}` : ''}`)
}

export function createEmployee(payload) {
  if (USE_MOCK) {
    const rows = readMock(MOCK_KEYS.employees, [])
    const incomingStaffId = String(payload.staff_id || '').trim()
    const duplicate = rows.find((row) => String(row.staff_id || '').trim() === incomingStaffId)
    if (duplicate) {
      return Promise.reject(new Error('staff_id already exists'))
    }
    const nextId = rows.length ? Math.max(...rows.map((x) => x.id)) + 1 : 1
    const row = {
      id: nextId,
      serial_number: rows.length + 1,
      team: payload.team,
      rank: payload.rank,
      staff_id: payload.staff_id,
      name: payload.name,
      start_date: payload.start_date || null,
      gender: payload.gender || 'UNKNOWN',
      terminal: payload.terminal || null,
      cert: payload.cert || null,
      scheme: payload.scheme,
      shift_pattern: payload.shift_pattern || '5W1O',
      shift_patterns: Array.isArray(payload.shift_patterns) && payload.shift_patterns.length
        ? payload.shift_patterns
        : [payload.shift_pattern || '5W1O'],
      contractual_hours: payload.contractual_hours ?? '264',
    }
    rows.push(row)
    writeMock(MOCK_KEYS.employees, rows)
    return Promise.resolve(row)
  }
  return request('/api/v1/employees', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function uploadEmployees(file) {
  if (USE_MOCK) {
    return Promise.resolve({ created: 0, updated: 0, sheet_name: 'Sheet1', filename: file?.name || 'mock' })
  }
  const form = new FormData()
  form.append('file', file)
  return request('/api/v1/employees/upload', {
    method: 'POST',
    body: form,
  })
}

export function getDownloadTemplateUrl(sheetName) {
  if (USE_MOCK) {
    const csv = [
      'Team,Deployment Area,Terminal,Rank,Staff ID,Name,Start Date,Gender,Cert,Scheme,Shift Pattern,Contractual Hr',
      `A1,Door 4,T2,SGT,100001,JOHN DOE,2026-02-01,MALE,ADP,A,5W1O,264`,
    ].join('\n')
    return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`
  }
  const query = buildQuery({ sheet_name: sheetName })
  return `/api/v1/employees/upload-template${query ? `?${query}` : ''}`
}

export function getLatestUploadMeta() {
  if (USE_MOCK) return Promise.resolve({ filename: 'mock-upload.xlsx', uploaded_at: new Date().toISOString() })
  return request('/api/v1/employees/upload-files/latest')
}

export function getLatestUploadUrl() {
  if (USE_MOCK) return 'data:text/plain;charset=utf-8,Mock%20mode%3A%20no%20server%20file%20available'
  return '/api/v1/employees/upload-files/latest/download'
}

export function getRosterCalendar(year, month) {
  if (USE_MOCK) {
    const employees = readMock(MOCK_KEYS.employees, [])
    const saved = readMock(MOCK_KEYS.roster, {})
    const key = `${year}-${month}`
    const dayCount = daysInMonth(year, month)
    const dayHeaders = Array.from({ length: dayCount }, (_, idx) => {
      const date = new Date(year, month - 1, idx + 1)
      const weekday = new Intl.DateTimeFormat('en-SG', { weekday: 'short' }).format(date)
      return { day: idx + 1, weekday }
    })

    function patternSchedule(pattern, length) {
      if (pattern === '4W2O') {
        const cycle = ['WORK', 'WORK', 'WORK', 'WORK', 'OFF', 'OFF']
        return Array.from({ length }, (_, i) => cycle[i % cycle.length])
      }
      const cycle = ['WORK', 'WORK', 'WORK', 'WORK', 'WORK', 'OFF']
      return Array.from({ length }, (_, i) => cycle[i % cycle.length])
    }

    const rows = employees.map((e) => {
      const startDay = e.start_date ? Number(String(e.start_date).slice(-2)) : 1
      const schedule = patternSchedule(e.shift_pattern || '5W1O', dayCount)
      for (let i = 0; i < Math.max(0, startDay - 1); i += 1) schedule[i] = 'EMPTY'
      return {
        employee_id: e.id,
        serial_number: e.serial_number,
        staff_id: e.staff_id,
        name: e.name,
        team: e.team,
        shift_pattern: e.shift_pattern || '5W1O',
        schedule,
      }
    })

    if (saved[key]) {
      for (const row of rows) {
        const custom = saved[key][String(row.employee_id)]
        if (Array.isArray(custom) && custom.length === dayCount) row.schedule = custom
      }
    }
    return Promise.resolve({ year, month, day_headers: dayHeaders, employees: rows })
  }
  const query = buildQuery({ year, month })
  return request(`/api/v1/roster/calendar?${query}`)
}

export function saveRosterCalendar(payload) {
  if (USE_MOCK) {
    const key = `${payload.year}-${payload.month}`
    const saved = readMock(MOCK_KEYS.roster, {})
    const byEmp = {}
    for (const row of payload.employees || []) {
      byEmp[String(row.employee_id)] = row.schedule || []
    }
    saved[key] = byEmp
    writeMock(MOCK_KEYS.roster, saved)
    return Promise.resolve({ ok: true })
  }
  return request('/api/v1/roster/calendar', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function listDeployments() {
  if (USE_MOCK) return Promise.resolve(readMock(MOCK_KEYS.deployments, []))
  return request('/api/v1/deployments')
}

export function createDeployment(payload) {
  if (USE_MOCK) {
    const rows = readMock(MOCK_KEYS.deployments, [])
    const nextId = rows.length ? Math.max(...rows.map((x) => x.id)) + 1 : 1
    const now = new Date().toISOString()
    const row = { id: nextId, ...payload, updated_at: now }
    rows.push(row)
    writeMock(MOCK_KEYS.deployments, rows)
    return Promise.resolve(row)
  }
  return request('/api/v1/deployments', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getDashboardCoverage(targetDate) {
  if (USE_MOCK) {
    const date = targetDate || todayIso()
    const employees = readMock(MOCK_KEYS.employees, [])
    const deployments = readMock(MOCK_KEYS.deployments, [])
    const required = deployments.reduce((sum, d) => {
      const req = (d.requirements || []).reduce((s, r) => s + Number(r.required_headcount || 0), 0)
      return sum + req
    }, 0)
    return Promise.resolve({
      date,
      available_headcount: employees.length,
      required_headcount: required,
      gap: employees.length - required,
      by_product: [],
    })
  }
  const query = buildQuery({ date: targetDate })
  return request(`/api/v1/dashboard/coverage?${query}`)
}

export function getDashboardCoverageCalendar(year, month) {
  if (USE_MOCK) {
    const deployments = readMock(MOCK_KEYS.deployments, [])
    const employees = readMock(MOCK_KEYS.employees, [])
    const required = deployments.reduce((sum, d) => {
      const req = (d.requirements || []).reduce((s, r) => s + Number(r.required_headcount || 0), 0)
      return sum + req
    }, 0)
    const dayCount = daysInMonth(year, month)
    const days = Array.from({ length: dayCount }, (_, i) => ({
      day: i + 1,
      available_headcount: employees.length,
      required_headcount: required,
      gap: employees.length - required,
    }))
    return Promise.resolve({ year, month, days })
  }
  const query = buildQuery({ year, month })
  return request(`/api/v1/dashboard/coverage-calendar?${query}`)
}

export function getDeploymentAssignments(deploymentDate) {
  if (USE_MOCK) {
    const rows = readMock(MOCK_KEYS.assignments, {})
    return Promise.resolve({ deployment_date: deploymentDate, assignments: rows[deploymentDate] || [] })
  }
  const query = buildQuery({ deployment_date: deploymentDate })
  return request(`/api/v1/deployments/assignments?${query}`)
}

export function getDoor4DepartureFlights(tixdate, flightno = '') {
  const query = buildQuery({ tixdate, date: tixdate, flightno })
  return request(`/api/v1/deployments/door-4/departures?${query}`)
}

export function getDoor4ArrivalFlights(tixdate, flightno = '') {
  const query = buildQuery({ tixdate, date: tixdate, flightno })
  return request(`/api/v1/deployments/door-4/arrivals?${query}`)
}

export function replaceDeploymentAssignments(payload) {
  if (USE_MOCK) {
    const rows = readMock(MOCK_KEYS.assignments, {})
    rows[payload.deployment_date] = payload.assignments || []
    writeMock(MOCK_KEYS.assignments, rows)
    return Promise.resolve({ deployment_date: payload.deployment_date, assignments: rows[payload.deployment_date] })
  }
  return request('/api/v1/deployments/assignments', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function planDeploymentAgent(payload) {
  if (USE_MOCK) {
    return Promise.resolve({
      plan_source: 'mock',
      model: 'mock-model',
      proposal_actions: [],
      execution: {
        deployment_date: payload.deployment_date,
        dry_run: true,
        actions: [],
        assignments: [],
        updated_at: null,
      },
    })
  }
  return request('/api/v1/deployments/agent/plan', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function planDoor4Agent(payload) {
  return request('/api/v1/deployments/door-4/agent/plan', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function listTrainingCourses() {
  if (USE_MOCK) return Promise.resolve(readMock(MOCK_KEYS.trainings, []))
  return request('/api/v1/trainings')
}

export function createTrainingCourse(payload) {
  if (USE_MOCK) {
    const rows = readMock(MOCK_KEYS.trainings, [])
    const nextId = rows.length ? Math.max(...rows.map((x) => x.id)) + 1 : 1
    const row = { id: nextId, ...payload }
    rows.push(row)
    writeMock(MOCK_KEYS.trainings, rows)
    return Promise.resolve(row)
  }
  return request('/api/v1/trainings', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function listUsers() {
  if (USE_MOCK) return Promise.resolve(readMock(MOCK_KEYS.users, []))
  return request('/api/v1/users')
}

export function createUser(payload) {
  if (USE_MOCK) {
    const rows = readMock(MOCK_KEYS.users, [])
    const nextId = rows.length ? Math.max(...rows.map((x) => x.id)) + 1 : 1
    const row = { id: nextId, is_active: true, ...payload }
    rows.push(row)
    writeMock(MOCK_KEYS.users, rows)
    return Promise.resolve(row)
  }
  return request('/api/v1/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateUserStatus(userId, isActive) {
  if (USE_MOCK) {
    const rows = readMock(MOCK_KEYS.users, [])
    const next = rows.map((row) =>
      Number(row.id) === Number(userId) ? { ...row, is_active: Boolean(isActive) } : row
    )
    writeMock(MOCK_KEYS.users, next)
    return Promise.resolve(next.find((x) => Number(x.id) === Number(userId)) || null)
  }
  return request(`/api/v1/users/${userId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ is_active: isActive }),
  })
}
