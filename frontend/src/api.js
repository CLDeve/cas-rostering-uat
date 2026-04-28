function buildQuery(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value))
    }
  })
  return search.toString()
}

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
  const query = buildQuery(params)
  return request(`/api/v1/employees${query ? `?${query}` : ''}`)
}

export function createEmployee(payload) {
  return request('/api/v1/employees', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function uploadEmployees(file, sheetName) {
  const form = new FormData()
  form.append('file', file)
  form.append('sheet_name', sheetName)
  return request('/api/v1/employees/upload', {
    method: 'POST',
    body: form,
  })
}

export function getDownloadTemplateUrl(sheetName) {
  const query = buildQuery({ sheet_name: sheetName })
  return `/api/v1/employees/upload-template${query ? `?${query}` : ''}`
}

export function getLatestUploadMeta() {
  return request('/api/v1/employees/upload-files/latest')
}

export function getLatestUploadUrl() {
  return '/api/v1/employees/upload-files/latest/download'
}

export function getRosterCalendar(year, month) {
  const query = buildQuery({ year, month })
  return request(`/api/v1/roster/calendar?${query}`)
}

export function saveRosterCalendar(payload) {
  return request('/api/v1/roster/calendar', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function listDeployments() {
  return request('/api/v1/deployments')
}

export function createDeployment(payload) {
  return request('/api/v1/deployments', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getDashboardCoverage(targetDate) {
  const query = buildQuery({ date: targetDate })
  return request(`/api/v1/dashboard/coverage?${query}`)
}

export function getDashboardCoverageCalendar(year, month) {
  const query = buildQuery({ year, month })
  return request(`/api/v1/dashboard/coverage-calendar?${query}`)
}

export function getDeploymentAssignments(deploymentDate) {
  const query = buildQuery({ deployment_date: deploymentDate })
  return request(`/api/v1/deployments/assignments?${query}`)
}

export function replaceDeploymentAssignments(payload) {
  return request('/api/v1/deployments/assignments', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function listTrainingCourses() {
  return request('/api/v1/trainings')
}

export function createTrainingCourse(payload) {
  return request('/api/v1/trainings', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function listUsers() {
  return request('/api/v1/users')
}

export function createUser(payload) {
  return request('/api/v1/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateUserStatus(userId, isActive) {
  return request(`/api/v1/users/${userId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ is_active: isActive }),
  })
}
