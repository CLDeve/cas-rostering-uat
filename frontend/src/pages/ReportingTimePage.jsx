import { useEffect, useMemo, useState } from 'react'
import { getRosterCalendar, saveRosterCalendar } from '../api'

function todaySgIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function parseIsoDateParts(isoDate) {
  const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  }
}

function escapeCsv(value) {
  const text = String(value ?? '')
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

function parseCsvRows(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const idxStaff = headers.indexOf('staff id')
  const idxTime = headers.indexOf('reporting time')
  if (idxStaff < 0 || idxTime < 0) return []
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, '').replace(/""/g, '"'))
    return {
      staff_id: cols[idxStaff] || '',
      reporting_time: cols[idxTime] || '',
    }
  })
}

function readFileAsText(file) {
  if (!file) return Promise.reject(new Error('No file selected.'))
  if (typeof file.text === 'function') {
    return file.text().catch(() => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('Cannot read file. Re-select the file and try again.'))
        reader.readAsText(file)
      })
    })
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Cannot read file. Re-select the file and try again.'))
    reader.readAsText(file)
  })
}

function normalizeStaffId(value) {
  return String(value ?? '').trim().replace(/^'+/, '')
}

function normalizeReportingTime(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const hhmm = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
  if (hhmm) return `${String(Number(hhmm[1])).padStart(2, '0')}:${hhmm[2]}`
  const compact = raw.match(/^([01]?\d|2[0-3])([0-5]\d)$/)
  if (compact) return `${String(Number(compact[1])).padStart(2, '0')}:${compact[2]}`
  const ampm = raw.match(/^(\d{1,2}):([0-5]\d)\s*([AaPp][Mm])$/)
  if (ampm) {
    let h = Number(ampm[1]) % 12
    if (ampm[3].toUpperCase() === 'PM') h += 12
    return `${String(h).padStart(2, '0')}:${ampm[2]}`
  }
  return ''
}

export default function ReportingTimePage() {
  const [selectedDate, setSelectedDate] = useState(todaySgIso())
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState([])
  const [monthData, setMonthData] = useState(() => {
    const parts = parseIsoDateParts(todaySgIso())
    return { year: parts?.year || 2026, month: parts?.month || 1, days: 31 }
  })
  const [uploadFile, setUploadFile] = useState(null)

  const dayIndex = useMemo(() => {
    const parts = parseIsoDateParts(selectedDate)
    return Math.max(0, (parts?.day || 1) - 1)
  }, [selectedDate])

  async function loadRosterForDate(dateValue) {
    const parts = parseIsoDateParts(dateValue)
    if (!parts) {
      setStatus('Invalid date format. Use YYYY-MM-DD.')
      return
    }
    const year = parts.year
    const month = parts.month
    setStatus('Loading officers...')
    try {
      const payload = await getRosterCalendar(year, month)
      const days = payload.day_headers?.length || 31
      const nextRows = (payload.employees || []).map((emp) => ({
        employee_id: emp.employee_id,
        serial_number: emp.serial_number,
        staff_id: emp.staff_id,
        name: emp.name,
        team: emp.team,
        schedule: emp.schedule || [],
        reporting_times: Array.isArray(emp.reporting_times) ? emp.reporting_times : Array.from({ length: days }, () => null),
      }))
      setRows(nextRows)
      setMonthData({ year, month, days })
      setStatus(`Loaded ${nextRows.length} officers.`)
    } catch (err) {
      setRows([])
      setStatus(`Unable to load officers: ${err.message}`)
    }
  }

  useEffect(() => {
    loadRosterForDate(selectedDate)
  }, [selectedDate])

  function updateTime(employeeId, value) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.employee_id !== employeeId) return row
        const reporting = [...row.reporting_times]
        while (reporting.length < monthData.days) reporting.push(null)
        reporting[dayIndex] = value || null
        return { ...row, reporting_times: reporting }
      }),
    )
  }

  async function onSave() {
    setStatus('Saving reporting times...')
    try {
      await saveRosterCalendar({
        year: monthData.year,
        month: monthData.month,
        employees: rows.map((row) => ({
          employee_id: row.employee_id,
          schedule: row.schedule,
          reporting_times: row.reporting_times,
        })),
      })
      setStatus('Reporting times saved.')
    } catch (err) {
      setStatus(`Unable to save: ${err.message}`)
    }
  }

  function onDownloadReportingTime() {
    const rowsCsv = rows.map((row) => {
      const value = row.reporting_times?.[dayIndex] || ''
      return [
        escapeCsv(selectedDate),
        escapeCsv(row.staff_id),
        escapeCsv(row.name),
        escapeCsv(row.team),
        escapeCsv(value),
      ].join(',')
    })
    const csv = ['Date,Staff ID,Name,Team,Reporting Time', ...rowsCsv].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporting_time_${selectedDate}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }

  async function onApplyUpload() {
    if (!uploadFile) {
      setStatus('Choose a CSV file before upload.')
      return
    }
    try {
      const text = await readFileAsText(uploadFile)
      const imported = parseCsvRows(text)
      if (!imported.length) {
        setStatus('Invalid CSV. Required headers: Staff ID, Reporting Time.')
        return
      }
      let updatedCount = 0
      let invalidTimeCount = 0
      const importedMap = new Map(
        imported.map((r) => [normalizeStaffId(r.staff_id), normalizeReportingTime(r.reporting_time)]),
      )
      const matchedIds = new Set()
      setRows((prev) =>
        prev.map((row) => {
          const key = normalizeStaffId(row.staff_id)
          if (!importedMap.has(key)) return row
          matchedIds.add(key)
          const value = importedMap.get(key) || ''
          if (String(importedMap.get(key) || '').trim() && !value) {
            invalidTimeCount += 1
            return row
          }
          const reporting = [...row.reporting_times]
          while (reporting.length < monthData.days) reporting.push(null)
          reporting[dayIndex] = value || null
          updatedCount += 1
          return { ...row, reporting_times: reporting }
        }),
      )
      const unmatchedCount = [...importedMap.keys()].filter((id) => id && !matchedIds.has(id)).length
      setStatus(
        `Upload applied. Updated ${updatedCount}. Unmatched Staff ID ${unmatchedCount}. Invalid time ${invalidTimeCount}. Click Save Reporting Time.`,
      )
    } catch (err) {
      setStatus(`Unable to read upload file: ${err.message || 'Re-select the file and try again.'}`)
    }
  }

  return (
    <>
      <section className="panel">
        <h2>Reporting Time</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>Officer list only. Set reporting time for selected date.</p>
        <div className="toolbar-row">
          <label>
            Date
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          </label>
          <button type="button" className="btn-secondary" onClick={() => loadRosterForDate(selectedDate)}>Reload</button>
          <button type="button" className="btn-secondary" onClick={onDownloadReportingTime}>Download Reporting Time</button>
          <label>
            Upload CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
            />
          </label>
          <button type="button" className="btn-secondary" onClick={onApplyUpload}>Apply Upload</button>
          <button type="button" onClick={onSave}>Save Reporting Time</button>
        </div>
        {status ? <div className="alert alert-info">{status}</div> : null}
      </section>

      <section className="panel reporting-time-panel" style={{ maxWidth: 560 }}>
        <h3 className="reporting-time-title" style={{ marginTop: 0 }}>Officers ({rows.length})</h3>
        <div className="door4-manpower-cards">
          {rows.map((row) => (
            <article key={row.employee_id} className="door4-manpower-card">
              <div className="door4-manpower-card-head">
                <strong>{row.name}</strong>
                <span>{row.serial_number}</span>
              </div>
              <div className="muted">Staff ID: {row.staff_id}</div>
              <div className="muted">Team: {row.team}</div>
              <label className="reporting-time-label" style={{ marginTop: 8, display: 'block' }}>
                Reporting Time
                <input
                  className="reporting-time-input"
                  type="time"
                  value={row.reporting_times?.[dayIndex] || ''}
                  onChange={(e) => updateTime(row.employee_id, e.target.value)}
                />
              </label>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}
