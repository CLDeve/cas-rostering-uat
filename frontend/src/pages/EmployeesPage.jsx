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
  gender: 'UNKNOWN',
  cert: '',
  scheme: 'A',
  shift_pattern: '5W1O',
  contractual_hours: '264',
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
    if (!form.team || !form.rank || !form.staff_id || !form.name || !form.scheme || !form.contractual_hours) {
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
      shift_pattern: form.shift_pattern,
      contractual_hours: String(form.contractual_hours),
      forecast_hours: '0',
    }

    setStatus('Creating officer...')
    try {
      await createEmployee(payload)
      setForm(defaultForm)
      setStatus('Officer created successfully.')
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
        <td>{row.shift_pattern}</td>
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
        <h2>Create Officer (Inline)</h2>
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
            title="Start Date"
            value={form.start_date}
            onChange={(e) => setForm((v) => ({ ...v, start_date: e.target.value }))}
          />
          <select
            value={form.gender}
            onChange={(e) => setForm((v) => ({ ...v, gender: e.target.value }))}
          >
            <option value="MALE">MALE</option>
            <option value="FEMALE">FEMALE</option>
            <option value="OTHER">OTHER</option>
            <option value="UNKNOWN">UNKNOWN</option>
          </select>
          <input
            placeholder="CERT"
            value={form.cert}
            onChange={(e) => setForm((v) => ({ ...v, cert: e.target.value }))}
          />
          <input
            placeholder="SCHEME *"
            value={form.scheme}
            onChange={(e) => setForm((v) => ({ ...v, scheme: e.target.value }))}
          />
          <select
            value={form.shift_pattern}
            onChange={(e) => setForm((v) => ({ ...v, shift_pattern: e.target.value }))}
          >
            <option value="4W2O">4W2O</option>
            <option value="5W1O">5W1O</option>
          </select>
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
