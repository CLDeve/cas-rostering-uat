import { useEffect, useMemo, useState } from 'react'
import { getRosterCalendar, saveRosterCalendar } from '../api'
import SearchDropdown from '../components/SearchDropdown'

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
  const [teamFilter, setTeamFilter] = useState('ALL')
  const [schemeFilter, setSchemeFilter] = useState('ALL')
  const [patternFilter, setPatternFilter] = useState('ALL')
  const [selectedOfficerIds, setSelectedOfficerIds] = useState(new Set())
  const [bulkStatus, setBulkStatus] = useState('W')
  const [reportingDay, setReportingDay] = useState(1)

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
        reporting_times: Array.isArray(emp.reporting_times) ? emp.reporting_times : [],
        schedule: (emp.schedule || []).map(apiToUiStatus),
      }))
      setHeaders(payload.day_headers || [])
      setRows(normalizedRows)
      setReportingDay(1)
      setSelectedOfficerIds(new Set())
      const monthLabel = MONTH_OPTIONS.find((item) => item.value === payload.month)?.label ?? String(payload.month)
      setStatus(`Roster generated for ${monthLabel} ${payload.year}.`)
    } catch (err) {
      setHeaders([])
      setRows([])
      setStatus(`Unable to generate roster: ${err.message}`)
    }
  }

  useEffect(() => {
    onGenerate()
  }, [year, month])

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
          reporting_times: row.reporting_times || [],
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

  function updateReportingTime(rowIndex, dayIndex, nextValue) {
    setRows((prev) => {
      const cloned = prev.map((row) => ({ ...row, reporting_times: [...(row.reporting_times || [])] }))
      while (cloned[rowIndex].reporting_times.length < headers.length) cloned[rowIndex].reporting_times.push(null)
      cloned[rowIndex].reporting_times[dayIndex] = nextValue || null
      return cloned
    })
  }

  function toggleOfficerSelection(employeeId) {
    setSelectedOfficerIds((prev) => {
      const next = new Set(prev)
      if (next.has(employeeId)) next.delete(employeeId)
      else next.add(employeeId)
      return next
    })
  }

  function toggleSelectAllVisible(visibleRows) {
    const visibleIds = new Set(visibleRows.map((row) => row.employee_id))
    const allSelected = visibleRows.length > 0 && visibleRows.every((row) => selectedOfficerIds.has(row.employee_id))
    setSelectedOfficerIds((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        for (const id of visibleIds) next.delete(id)
      } else {
        for (const id of visibleIds) next.add(id)
      }
      return next
    })
  }

  function applyBulkStatus(visibleRows) {
    if (selectedOfficerIds.size === 0) {
      setStatus('Select at least one officer for bulk update.')
      return
    }
    const selectedVisibleIds = new Set(
      visibleRows.filter((row) => selectedOfficerIds.has(row.employee_id)).map((row) => row.employee_id),
    )
    if (selectedVisibleIds.size === 0) {
      setStatus('Selected officers are outside current filters.')
      return
    }

    setRows((prev) =>
      prev.map((row) => {
        if (!selectedVisibleIds.has(row.employee_id)) return row
        const schedule = row.schedule.map((cell) => (cell === 'EMPTY' ? 'EMPTY' : bulkStatus))
        return { ...row, schedule }
      }),
    )
    setStatus(`Applied ${bulkStatus} to selected officers (editable days only).`)
  }

  const teams = useMemo(() => ['ALL', ...Array.from(new Set(rows.map((row) => row.team))).sort()], [rows])
  const schemes = useMemo(() => ['ALL', ...Array.from(new Set(rows.map((row) => {
    if (row.shift_pattern === '4W2O') return 'B'
    return 'A'
  }))).sort()], [rows])
  const patterns = useMemo(() => ['ALL', ...Array.from(new Set(rows.map((row) => row.shift_pattern))).sort()], [rows])

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (teamFilter !== 'ALL' && row.team !== teamFilter) return false
      const inferredScheme = row.shift_pattern === '4W2O' ? 'B' : 'A'
      if (schemeFilter !== 'ALL' && inferredScheme !== schemeFilter) return false
      if (patternFilter !== 'ALL' && row.shift_pattern !== patternFilter) return false
      return true
    })
  }, [rows, teamFilter, schemeFilter, patternFilter])

  const selectedVisibleCount = useMemo(
    () => filteredRows.filter((row) => selectedOfficerIds.has(row.employee_id)).length,
    [filteredRows, selectedOfficerIds],
  )

  const summaryByDay = useMemo(() => {
    if (filteredRows.length === 0) return []
    return headers.map((_, dayIndex) => {
      let count = 0
      for (const row of filteredRows) {
        if (WORKING_SET.has(row.schedule[dayIndex])) count += 1
      }
      return count
    })
  }, [filteredRows, headers])

  return (
    <>
      <section className="panel">
        <div className="toolbar-row">
          <label>
            Year
            <SearchDropdown
              options={yearOptions.map((value) => ({ value: String(value), label: String(value) }))}
              value={String(year)}
              onChange={(next) => setYear(Number(next))}
              searchable={false}
            />
          </label>
          <label>
            Month
            <SearchDropdown
              options={MONTH_OPTIONS.map((item) => ({ value: String(item.value), label: item.label }))}
              value={String(month)}
              onChange={(next) => setMonth(Number(next))}
              searchable={false}
            />
          </label>
          <button type="button" onClick={onGenerate}>Generate Roster</button>
          <button type="button" className="btn-secondary" onClick={onSaveRoster}>Save Roster</button>
        </div>
        {status && <div className={`alert alert-${alertType(status)}`}>{status}</div>}
      </section>

      <section className="panel">
        <div className="toolbar-row roster-toolbar">
          <label>
            Team
            <SearchDropdown
              options={teams.map((value) => ({ value, label: value }))}
              value={teamFilter}
              onChange={setTeamFilter}
              searchable={false}
            />
          </label>
          <label>
            Scheme
            <SearchDropdown
              options={schemes.map((value) => ({ value, label: value }))}
              value={schemeFilter}
              onChange={setSchemeFilter}
              searchable={false}
            />
          </label>
          <label>
            Shift Pattern
            <SearchDropdown
              options={patterns.map((value) => ({ value, label: value }))}
              value={patternFilter}
              onChange={setPatternFilter}
              searchable={false}
            />
          </label>
          <button type="button" className="btn-ghost" onClick={() => toggleSelectAllVisible(filteredRows)}>
            {selectedVisibleCount === filteredRows.length && filteredRows.length > 0 ? 'Unselect Visible' : 'Select Visible'}
          </button>
          <label>
            Bulk Status
            <SearchDropdown
              options={STATUS_OPTIONS.map((value) => ({ value, label: value }))}
              value={bulkStatus}
              onChange={setBulkStatus}
              searchable={false}
            />
          </label>
          <label>
            Reporting Day
            <SearchDropdown
              options={headers.map((h) => ({ value: String(h.day), label: `${h.day} ${h.weekday}` }))}
              value={String(reportingDay)}
              onChange={(next) => setReportingDay(Number(next))}
              searchable={false}
            />
          </label>
          <button type="button" className="btn-secondary" onClick={() => applyBulkStatus(filteredRows)}>
            Apply To Selected ({selectedVisibleCount})
          </button>
        </div>

        <div className="table-wrap">
          <table className="roster-table">
            <thead>
              <tr>
                <th className="sticky-col sticky-col-1">Select</th>
                <th className="sticky-col sticky-col-2">Officer</th>
                <th className="sticky-col sticky-col-3">Team</th>
                <th className="sticky-col sticky-col-4">Pattern</th>
                <th>Reporting Time</th>
                {headers.map((day) => (
                  <th key={day.day}>
                    {day.day}<br />
                    <small style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{day.weekday}</small>
                  </th>
                ))}
                <th className="sticky-col sticky-col-5">Forecast</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={headers.length + 7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                    No roster data loaded. Click Generate Roster above.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const rowIdx = rows.findIndex((source) => source.employee_id === row.employee_id)
                  const isSelected = selectedOfficerIds.has(row.employee_id)
                  const forecast = calculateForecast(row.schedule)
                  const reportingIndex = Math.max(0, Math.min(headers.length - 1, reportingDay - 1))
                  const reportingValue = row.reporting_times?.[reportingIndex] || ''
                  return (
                  <tr key={row.key}>
                    <td className="sticky-col sticky-col-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOfficerSelection(row.employee_id)}
                      />
                    </td>
                    <td className="sticky-col sticky-col-2">{row.serial_number}. {row.name} ({row.staff_id})</td>
                    <td className="sticky-col sticky-col-3">{row.team}</td>
                    <td className="sticky-col sticky-col-4">{row.shift_pattern}</td>
                    <td>
                      <input
                        type="time"
                        className="cell-select"
                        value={reportingValue}
                        onChange={(e) => updateReportingTime(rowIdx, reportingIndex, e.target.value)}
                      />
                    </td>
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
                    <td className="sticky-col sticky-col-5">
                      <span className="forecast-badge">{forecast}h</span>
                    </td>
                  </tr>
                  )
                })
              )}
              {filteredRows.length > 0 && (
                <tr className="summary-row">
                  <td colSpan={5} className="sticky-col sticky-col-summary">Planned Manpower (W + OT1 + OT2)</td>
                  {summaryByDay.map((count, idx) => (
                    <td key={`sum-${idx}`}>{count}</td>
                  ))}
                  <td className="sticky-col sticky-col-5">{summaryByDay.reduce((acc, x) => acc + x, 0)}</td>
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
