import { useMemo, useState } from 'react'
import { getRosterCalendar, saveRosterCalendar } from '../api'

const STATUS_OPTIONS = ['W', 'O', 'OT1', 'OT2']
const HOURS_MAP = { W: 13, O: 0, OT1: 5, OT2: 13, EMPTY: 0 }
const WORKING_SET = new Set(['W', 'OT1', 'OT2'])
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, idx) => {
  const monthNumber = idx + 1
  const label = new Intl.DateTimeFormat('en-SG', { month: 'long' }).format(new Date(2000, idx, 1))
  return { value: monthNumber, label }
})

function apiToUiStatus(value) {
  if (value === 'WORK')  return 'W'
  if (value === 'OFF')   return 'O'
  if (value === 'OT1')   return 'OT1'
  if (value === 'OT2')   return 'OT2'
  if (value === 'EMPTY') return 'EMPTY'
  return 'O'
}

function uiToApiStatus(value) {
  if (value === 'W') return 'WORK'
  if (value === 'O') return 'OFF'
  if (value === 'OT1') return 'OT1'
  if (value === 'OT2') return 'OT2'
  if (value === 'EMPTY') return 'EMPTY'
  return 'OFF'
}

function calculateForecast(schedule) {
  return schedule.reduce((sum, code) => sum + (HOURS_MAP[code] ?? 0), 0)
}

function exceedsMaxConsecutiveWorkingDays(schedule, maxDays = 12) {
  let streak = 0
  for (const status of schedule) {
    if (WORKING_SET.has(status)) {
      streak += 1
      if (streak > maxDays) return true
    } else {
      streak = 0
    }
  }
  return false
}

function alertType(msg) {
  if (!msg) return 'info'
  const m = msg.toLowerCase()
  if (m.includes('unable') || m.includes('fail') || m.includes('error') || m.includes('blocked')) return 'error'
  if (m.includes('locked') || m.includes('must be') || m.includes('cannot')) return 'warning'
  if (m.includes('generated') || m.includes('updated') || m.includes('success') || m.includes('loaded')) return 'success'
  return 'info'
}

export default function RosteringEnginePage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [status, setStatus] = useState('Click Generate Roster to load data.')
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])

  const yearOptions = useMemo(() => {
    const base = now.getFullYear()
    return [base - 2, base - 1, base, base + 1, base + 2]
  }, [now])

  async function onGenerate() {
    setStatus('Generating roster...')
    try {
      const payload = await getRosterCalendar(year, month)
      const normalizedRows = (payload.employees || []).map((emp) => ({
        key: String(emp.employee_id),
        employee_id: emp.employee_id,
        serial_number: emp.serial_number,
        staff_id: emp.staff_id,
        name: emp.name,
        team: emp.team,
        shift_pattern: emp.shift_pattern,
        schedule: (emp.schedule || []).map(apiToUiStatus),
      }))
      setHeaders(payload.day_headers || [])
      setRows(normalizedRows)
      const monthLabel = MONTH_OPTIONS.find((item) => item.value === payload.month)?.label ?? String(payload.month)
      setStatus(`Roster generated for ${monthLabel} ${payload.year}.`)
    } catch (err) {
      setHeaders([])
      setRows([])
      setStatus(`Unable to generate roster: ${err.message}`)
    }
  }

  async function onSaveRoster() {
    if (rows.length === 0) {
      setStatus('No roster data to save. Generate roster first.')
      return
    }
    setStatus('Saving roster...')
    try {
      const payload = {
        year,
        month,
        employees: rows.map((row) => ({
          employee_id: row.employee_id,
          schedule: row.schedule.map(uiToApiStatus),
        })),
      }
      await saveRosterCalendar(payload)
      setStatus('Roster saved successfully. Future Generate will load your saved edits.')
    } catch (err) {
      setStatus(`Unable to save roster: ${err.message}`)
    }
  }

  function updateCell(rowIndex, dayIndex, nextStatus) {
    setRows((prev) => {
      const current = prev[rowIndex]?.schedule?.[dayIndex]
      if (current === 'EMPTY') {
        setStatus('Days before officer start date are locked and cannot be changed.')
        return prev
      }

      const cloned = prev.map((row) => ({ ...row, schedule: [...row.schedule] }))
      cloned[rowIndex].schedule[dayIndex] = nextStatus

      if (exceedsMaxConsecutiveWorkingDays(cloned[rowIndex].schedule, 12)) {
        setStatus('Blocked: working streak cannot exceed 12 consecutive days (W/OT1/OT2).')
        return prev
      }

      setStatus('Roster updated in view. Remember to apply operational approval workflow before deployment.')
      return cloned
    })
  }

  const summaryByDay = useMemo(() => {
    if (rows.length === 0) return []
    return headers.map((_, dayIndex) => {
      let count = 0
      for (const row of rows) {
        if (WORKING_SET.has(row.schedule[dayIndex])) count += 1
      }
      return count
    })
  }, [rows, headers])

  return (
    <>
      <section className="panel">
        <div className="toolbar-row">
          <label>
            Year
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Month
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTH_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={onGenerate}>Generate Roster</button>
          <button type="button" className="btn-secondary" onClick={onSaveRoster}>Save Roster</button>
        </div>
        {status && <div className={`alert alert-${alertType(status)}`}>{status}</div>}
      </section>

      <section className="panel">
        <div className="table-wrap">
          <table className="roster-table">
            <thead>
              <tr>
                <th>Officer</th>
                <th>Team</th>
                <th>Pattern</th>
                {headers.map((day) => (
                  <th key={day.day}>
                    {day.day}<br />
                    <small style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{day.weekday}</small>
                  </th>
                ))}
                <th>Forecast</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={headers.length + 4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                    No roster data loaded. Click Generate Roster above.
                  </td>
                </tr>
              ) : (
                rows.map((row, rowIdx) => (
                  <tr key={row.key}>
                    <td>{row.serial_number}. {row.name} ({row.staff_id})</td>
                    <td>{row.team}</td>
                    <td>{row.shift_pattern}</td>
                    {row.schedule.map((value, dayIdx) => (
                      <td key={`${row.key}-${dayIdx}`} className={`status-${value.toLowerCase()}`}>
                        {value === 'EMPTY' ? (
                          <span>—</span>
                        ) : (
                          <select
                            value={value}
                            className="cell-select"
                            onChange={(e) => updateCell(rowIdx, dayIdx, e.target.value)}
                          >
                            {STATUS_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        )}
                      </td>
                    ))}
                    <td style={{ fontWeight: 600 }}>{calculateForecast(row.schedule)}</td>
                  </tr>
                ))
              )}
              {rows.length > 0 && (
                <tr className="summary-row">
                  <td colSpan={3}>Planned Manpower (W + OT1 + OT2)</td>
                  {summaryByDay.map((count, idx) => (
                    <td key={`sum-${idx}`}>{count}</td>
                  ))}
                  <td>{summaryByDay.reduce((acc, x) => acc + x, 0)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="legend-row">
          <span>
            <span className="legend-dot" style={{ background: 'var(--work-bg)', borderColor: 'var(--work-text)' }} />
            <strong>W</strong> = 13 hrs
          </span>
          <span>
            <span className="legend-dot" style={{ background: 'var(--off-bg)', borderColor: 'var(--off-text)' }} />
            <strong>O</strong> = Off
          </span>
          <span>
            <span className="legend-dot" style={{ background: 'var(--ot1-bg)', borderColor: 'var(--ot1-text)' }} />
            <strong>OT1</strong> = 5 forecast hrs
          </span>
          <span>
            <span className="legend-dot" style={{ background: 'var(--ot2-bg)', borderColor: 'var(--ot2-text)' }} />
            <strong>OT2</strong> = 13 forecast hrs
          </span>
          <span style={{ color: 'var(--text-muted)' }}>Rule: max 12 consecutive working days</span>
        </div>
      </section>
    </>
  )
}
