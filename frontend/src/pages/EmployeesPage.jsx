import { useEffect, useMemo, useState } from 'react'
import {
  createEmployee,
  getDownloadTemplateUrl,
  getLatestUploadMeta,
  getLatestUploadUrl,
  listEmployees,
  uploadEmployees,
} from '../api'

const defaultForm = {
  team: '',
  rank: '',
  staff_id: '',
  name: '',
  start_date: '',
  gender: '',
  cert: '',
  scheme: '',
  shift_patterns: [],
  contractual_hours: '',
}

function alertType(msg) {
  if (!msg) return 'info'
  const m = msg.toLowerCase()
  if (m.includes('unable') || m.includes('fail') || m.includes('error') || m.includes('blocked')) return 'error'
  if (m.includes('please') || m.includes('no latest') || m.includes('must be') || m.includes('select at least') || m.includes('locked')) return 'warning'
  if (m.includes('success') || m.includes('created') || m.includes('completed') || m.includes('loaded') || m.includes('generated') || m.includes('updated')) return 'success'
  return 'info'
}

export default function EmployeesPage() {
  const [status, setStatus] = useState('Loading employees...')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [selectedFile, setSelectedFile] = useState(null)
  const [hasLatestUpload, setHasLatestUpload] = useState(false)
  const [form, setForm] = useState(defaultForm)

  function toggleShiftPattern(pattern) {
    setForm((prev) => {
      const selected = prev.shift_patterns.includes(pattern)
      return {
        ...prev,
        shift_patterns: selected
          ? prev.shift_patterns.filter((value) => value !== pattern)
          : [...prev.shift_patterns, pattern],
      }
    })
  }

  async function refreshEmployees() {
    try {
      const payload = await listEmployees({ page: 1, page_size: 100 })
      setRows(payload.items || [])
      setTotal(payload.total || 0)
      setStatus(`Loaded ${payload.total || 0} employee records.`)
    } catch (err) {
      setRows([])
      setTotal(0)
      setStatus(`Unable to load employees: ${err.message}`)
    }
  }

  async function refreshLatestUpload() {
    try {
      await getLatestUploadMeta()
      setHasLatestUpload(true)
    } catch {
      setHasLatestUpload(false)
    }
  }

  useEffect(() => {
    refreshEmployees()
    refreshLatestUpload()
  }, [])

  async function onUpload() {
    if (!selectedFile) {
      setStatus('Please choose an .xlsx file before upload.')
      return
    }
    setStatus('Uploading file...')
    try {
      const result = await uploadEmployees(selectedFile)
      setStatus(`Upload completed from "${result.sheet_name}". Created ${result.created}, updated ${result.updated}.`)
      setSelectedFile(null)
      await refreshEmployees()
      await refreshLatestUpload()
    } catch (err) {
      setStatus(`Upload failed: ${err.message}`)
    }
  }

  function onDownloadTemplate() {
    window.location.href = getDownloadTemplateUrl()
  }

  function onDownloadLatest() {
    if (!hasLatestUpload) {
      setStatus('No latest uploaded file available yet.')
      return
    }
    window.location.href = getLatestUploadUrl()
  }

  async function onCreateOfficer(event) {
    event.preventDefault()
    if (!form.team || !form.rank || !form.staff_id || !form.name || !form.gender || !form.scheme || form.shift_patterns.length === 0 || !form.contractual_hours) {
      setStatus('Please fill all required officer fields.')
      return
    }

    const payload = {
      team: form.team.trim(),
      rank: form.rank.trim(),
      staff_id: form.staff_id.trim(),
      name: form.name.trim(),
      start_date: form.start_date || null,
      gender: form.gender,
      cert: form.cert.trim() || null,
      scheme: form.scheme.trim(),
      shift_pattern: form.shift_patterns[0],
      shift_patterns: form.shift_patterns,
      contractual_hours: String(form.contractual_hours),
      forecast_hours: '0',
    }

    setStatus('Creating officer...')
    try {
      await createEmployee(payload)
      setForm(defaultForm)
      setStatus(
        form.shift_patterns.length > 1
          ? 'Officer created. Primary shift pattern saved as first selected value due to current API model.'
          : 'Officer created successfully.',
      )
      await refreshEmployees()
    } catch (err) {
      setStatus(`Create officer failed: ${err.message}`)
    }
  }

  const tableRows = useMemo(() => {
    if (rows.length === 0) {
      return (
        <tr>
          <td colSpan={11} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
            No employee records available.
          </td>
        </tr>
      )
    }
    return rows.map((row) => (
      <tr key={row.id}>
        <td>{row.serial_number}</td>
        <td>{row.team}</td>
        <td>{row.rank}</td>
        <td>{row.staff_id}</td>
        <td style={{ fontWeight: 500 }}>{row.name}</td>
        <td>{row.start_date || '—'}</td>
        <td>{row.gender}</td>
        <td>{row.cert || '—'}</td>
        <td>{row.scheme}</td>
        <td>{Array.isArray(row.shift_patterns) && row.shift_patterns.length ? row.shift_patterns.join(', ') : row.shift_pattern}</td>
        <td>{row.contractual_hours}</td>
      </tr>
    ))
  }, [rows])

  return (
    <>
      <section className="panel">
        <div className="toolbar-row">
          <div className="file-picker">
            <input
              id="employees-upload-file"
              className="file-picker-input"
              type="file"
              accept=".xlsx"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            />
            <label htmlFor="employees-upload-file" className="btn btn-secondary file-picker-btn">
              Choose Excel File
            </label>
            <span className={`file-picker-name ${selectedFile ? 'has-file' : ''}`}>
              {selectedFile?.name || 'No file selected'}
            </span>
          </div>
          <button type="button" className="btn-secondary" onClick={onDownloadTemplate}>
            Download Template
          </button>
          <button type="button" onClick={onUpload}>
            Upload
          </button>
          <button type="button" className="btn-secondary" onClick={onDownloadLatest}>
            Download Latest Upload
          </button>
          <button type="button" className="btn-ghost" onClick={refreshEmployees}>
            Refresh
          </button>
        </div>
        {status && <div className={`alert alert-${alertType(status)}`}>{status}</div>}
      </section>

      <section className="panel">
        <h2>Create Officer</h2>
        <form className="form-grid officer-grid" onSubmit={onCreateOfficer}>
          <input
            placeholder="TEAM *"
            value={form.team}
            onChange={(e) => setForm((v) => ({ ...v, team: e.target.value }))}
          />
          <input
            placeholder="RANK *"
            value={form.rank}
            onChange={(e) => setForm((v) => ({ ...v, rank: e.target.value }))}
          />
          <input
            placeholder="STAFF ID *"
            value={form.staff_id}
            onChange={(e) => setForm((v) => ({ ...v, staff_id: e.target.value }))}
          />
          <input
            placeholder="NAME *"
            value={form.name}
            onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
          />
          <input
            type="date"
            title="Roster Start Date"
            aria-label="Roster Start Date"
            placeholder="Roster Start Date"
            value={form.start_date}
            onChange={(e) => setForm((v) => ({ ...v, start_date: e.target.value }))}
          />
          <select
            value={form.gender}
            onChange={(e) => setForm((v) => ({ ...v, gender: e.target.value }))}
          >
            <option value="" disabled>Gender</option>
            <option value="MALE">MALE</option>
            <option value="FEMALE">FEMALE</option>
          </select>
          <input
            placeholder="CERT"
            value={form.cert}
            onChange={(e) => setForm((v) => ({ ...v, cert: e.target.value }))}
          />
          <select
            value={form.scheme}
            onChange={(e) => setForm((v) => ({ ...v, scheme: e.target.value }))}
          >
            <option value="" disabled>Scheme *</option>
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
          <details className="multi-select">
            <summary>{form.shift_patterns.length ? form.shift_patterns.join(', ') : 'Shift Pattern *'}</summary>
            <label>
              <input
                type="checkbox"
                checked={form.shift_patterns.includes('4W2O')}
                onChange={() => toggleShiftPattern('4W2O')}
              />
              4W2O
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.shift_patterns.includes('5W1O')}
                onChange={() => toggleShiftPattern('5W1O')}
              />
              5W1O
            </label>
          </details>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Contractual Hours *"
            value={form.contractual_hours}
            onChange={(e) => setForm((v) => ({ ...v, contractual_hours: e.target.value }))}
          />
          <button type="submit">Create Officer</button>
        </form>
      </section>

      <section className="panel">
        <div className="table-title">Total records: {total}</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>S/N</th>
                <th>Team</th>
                <th>Rank</th>
                <th>Staff ID</th>
                <th>Name</th>
                <th>Start Date</th>
                <th>Gender</th>
                <th>Cert</th>
                <th>Scheme</th>
                <th>Shift Pattern</th>
                <th>Contractual Hrs</th>
              </tr>
            </thead>
            <tbody>{tableRows}</tbody>
          </table>
        </div>
      </section>
    </>
  )
}
