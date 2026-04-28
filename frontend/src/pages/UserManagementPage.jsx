import { useEffect, useState } from 'react'
import { createUser, listUsers, updateUserStatus } from '../api'

const initialForm = {
  staff_id: '',
  username: '',
  display_name: '',
  role: 'VIEWER',
}

function alertType(msg) {
  if (!msg) return 'info'
  const m = msg.toLowerCase()
  if (m.includes('unable') || m.includes('fail') || m.includes('error')) return 'error'
  if (m.includes('created') || m.includes('loaded') || m.includes('updated')) return 'success'
  return 'info'
}

function formatSgDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

export default function UserManagementPage() {
  const [users, setUsers] = useState([])
  const [form, setForm] = useState(initialForm)
  const [status, setStatus] = useState('Loading users...')

  async function loadUsers() {
    setStatus('Loading users...')
    try {
      const payload = await listUsers()
      setUsers(Array.isArray(payload) ? payload : [])
      setStatus(`Loaded ${(payload || []).length} user account(s).`)
    } catch (err) {
      setUsers([])
      setStatus(`Unable to load users: ${err.message}`)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  async function onSubmit(event) {
    event.preventDefault()
    if (!form.staff_id || !form.username || !form.display_name || !form.role) {
      setStatus('Please fill all required fields.')
      return
    }

    setStatus('Creating user account...')
    try {
      await createUser({
        staff_id: form.staff_id.trim(),
        username: form.username.trim(),
        display_name: form.display_name.trim(),
        role: form.role,
      })
      setForm(initialForm)
      setStatus('User account created successfully.')
      await loadUsers()
    } catch (err) {
      setStatus(`Create user failed: ${err.message}`)
    }
  }

  async function toggleStatus(user) {
    setStatus(`Updating ${user.username} status...`)
    try {
      await updateUserStatus(user.id, !user.is_active)
      setStatus(`User ${user.username} status updated.`)
      await loadUsers()
    } catch (err) {
      setStatus(`Update status failed: ${err.message}`)
    }
  }

  return (
    <>
      <section className="panel">
        <h2>Create User Account</h2>
        <form className="form-grid" onSubmit={onSubmit}>
          <input
            placeholder="Staff ID *"
            value={form.staff_id}
            onChange={(e) => setForm((prev) => ({ ...prev, staff_id: e.target.value }))}
          />
          <input
            placeholder="Username *"
            value={form.username}
            onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
          />
          <input
            placeholder="Display Name *"
            value={form.display_name}
            onChange={(e) => setForm((prev) => ({ ...prev, display_name: e.target.value }))}
          />
          <select
            value={form.role}
            onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
          >
            <option value="ADMIN">ADMIN</option>
            <option value="PLANNER">PLANNER</option>
            <option value="VIEWER">VIEWER</option>
          </select>
          <button type="submit">Create User</button>
        </form>
        {status && <div className={`alert alert-${alertType(status)}`}>{status}</div>}
      </section>

      <section className="panel">
        <div className="table-title">Total users: {users.length}</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Staff ID</th>
                <th>Username</th>
                <th>Display Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Updated (SG)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-state">
                    No user accounts available.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.staff_id || '—'}</td>
                    <td>{user.username}</td>
                    <td>{user.display_name}</td>
                    <td>{user.role}</td>
                    <td>
                      <span className={`badge ${user.is_active ? 'badge-green' : 'badge-red'}`}>
                        {user.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td>{formatSgDateTime(user.updated_at)}</td>
                    <td>
                      <button
                        type="button"
                        className={user.is_active ? 'btn-danger' : 'btn-secondary'}
                        onClick={() => toggleStatus(user)}
                      >
                        {user.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
