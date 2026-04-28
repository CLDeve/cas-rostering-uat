import { useEffect, useState } from 'react'
import { createTrainingCourse, listTrainingCourses } from '../api'

function toSgDateTime(datetimeLocal) {
  if (!datetimeLocal) return null
  const normalized = datetimeLocal.length === 16 ? `${datetimeLocal}:00` : datetimeLocal
  return `${normalized}+08:00`
}

function formatSg(value) {
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return value
  return new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(dt)
}

function alertType(msg) {
  if (!msg) return 'info'
  const m = msg.toLowerCase()
  if (m.includes('unable') || m.includes('fail') || m.includes('error')) return 'error'
  if (m.includes('all fields') || m.includes('must be later') || m.includes('required')) return 'warning'
  if (m.includes('created') || m.includes('success') || m.includes('loaded')) return 'success'
  return 'info'
}

export default function TrainingPage() {
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState('Loading training courses...')
  const [form, setForm] = useState({
    course_name: '',
    location: '',
    start_at: '',
    end_at: '',
  })

  async function loadCourses() {
    setStatus('Loading training courses...')
    try {
      const payload = await listTrainingCourses()
      setRows(payload || [])
      setStatus(`Loaded ${payload?.length ?? 0} training courses.`)
    } catch (err) {
      setRows([])
      setStatus(`Unable to load training courses: ${err.message}`)
    }
  }

  useEffect(() => {
    loadCourses()
  }, [])

  async function onCreate(event) {
    event.preventDefault()
    if (!form.course_name || !form.location || !form.start_at || !form.end_at) {
      setStatus('All fields are required.')
      return
    }
    if (form.end_at <= form.start_at) {
      setStatus('End date/time must be later than start date/time.')
      return
    }

    setStatus('Creating training course...')
    try {
      await createTrainingCourse({
        course_name: form.course_name.trim(),
        location: form.location.trim(),
        start_at: toSgDateTime(form.start_at),
        end_at: toSgDateTime(form.end_at),
      })
      setForm({ course_name: '', location: '', start_at: '', end_at: '' })
      setStatus('Training course created successfully.')
      await loadCourses()
    } catch (err) {
      setStatus(`Create training course error: ${err.message}`)
    }
  }

  return (
    <>
      <section className="panel">
        <h2>Schedule Training Course</h2>
        <form className="form-grid" onSubmit={onCreate}>
          <input
            placeholder="Course Name *"
            value={form.course_name}
            onChange={(e) => setForm((v) => ({ ...v, course_name: e.target.value }))}
          />
          <input
            placeholder="Location *"
            value={form.location}
            onChange={(e) => setForm((v) => ({ ...v, location: e.target.value }))}
          />
          <input
            type="datetime-local"
            title="Start Date & Time"
            value={form.start_at}
            onChange={(e) => setForm((v) => ({ ...v, start_at: e.target.value }))}
          />
          <input
            type="datetime-local"
            title="End Date & Time"
            value={form.end_at}
            onChange={(e) => setForm((v) => ({ ...v, end_at: e.target.value }))}
          />
          <button type="submit">Create Course</button>
        </form>
        {status && <div className={`alert alert-${alertType(status)}`}>{status}</div>}
      </section>

      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Course Name</th>
                <th>Location</th>
                <th>Start (SG)</th>
                <th>End (SG)</th>
                <th>Last Updated (SG)</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                    No training courses scheduled.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 500 }}>{row.course_name}</td>
                    <td>{row.location}</td>
                    <td style={{ fontSize: 12 }}>{formatSg(row.start_at)}</td>
                    <td style={{ fontSize: 12 }}>{formatSg(row.end_at)}</td>
                    <td style={{ fontSize: 12 }}>{formatSg(row.updated_at)}</td>
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
