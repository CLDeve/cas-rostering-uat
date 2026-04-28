import { useEffect, useMemo, useState } from 'react'
import { getDashboardCoverage, getDashboardCoverageCalendar } from '../api'

function todaySgIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function monthFromDate(dateStr) {
  const [year, month] = dateStr.split('-').map((part) => Number(part))
  return { year, month }
}

function statusClass(gap) {
  if (gap <= 0) return 'success'
  if (gap <= 5) return 'warning'
  return 'error'
}

export default function DashboardPage() {
  const [selectedDate, setSelectedDate] = useState(todaySgIso())
  const [daily, setDaily] = useState(null)
  const [calendar, setCalendar] = useState(null)
  const [status, setStatus] = useState('Loading dashboard...')

  async function loadDashboard(dateValue) {
    const { year, month } = monthFromDate(dateValue)
    setStatus('Loading dashboard...')

    try {
      const [dailyPayload, calendarPayload] = await Promise.all([
        getDashboardCoverage(dateValue),
        getDashboardCoverageCalendar(year, month),
      ])
      setDaily(dailyPayload)
      setCalendar(calendarPayload)
      setStatus(`Coverage loaded for ${dateValue} (Singapore).`)
    } catch (err) {
      setDaily(null)
      setCalendar(null)
      setStatus(`Unable to load dashboard: ${err.message}`)
    }
  }

  useEffect(() => {
    loadDashboard(selectedDate)
  }, [selectedDate])

  const coveredDays = useMemo(() => {
    const rows = calendar?.days || []
    return rows.filter((row) => row.is_covered).length
  }, [calendar])

  const totalDays = (calendar?.days || []).length
  const coverageRate = totalDays ? Math.round((coveredDays / totalDays) * 100) : 0

  return (
    <>
      <section className="panel">
        <div className="toolbar-row">
          <label>
            Selected Date (SG)
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          </label>
        </div>
        <div className="status">{status}</div>
      </section>

      <section className="dashboard-cards">
        <article className="panel dashboard-card">
          <div className="dashboard-label">Active Sites</div>
          <div className="dashboard-value">{daily?.active_sites ?? 0}</div>
        </article>
        <article className="panel dashboard-card">
          <div className="dashboard-label">Required Headcount</div>
          <div className="dashboard-value">{daily?.required_headcount ?? 0}</div>
        </article>
        <article className="panel dashboard-card">
          <div className="dashboard-label">Assigned Manpower</div>
          <div className="dashboard-value">{daily?.assigned_headcount ?? 0}</div>
        </article>
        <article className="panel dashboard-card">
          <div className="dashboard-label">Gap (+ shortage)</div>
          <div className="dashboard-value">{daily?.coverage_gap ?? 0}</div>
        </article>
        <article className="panel dashboard-card">
          <div className="dashboard-label">Month Coverage Rate</div>
          <div className="dashboard-value">{coverageRate}%</div>
        </article>
      </section>

      <section className="panel">
        <h2>Day-to-Day Coverage</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Active Sites</th>
                <th>Required</th>
                <th>Assigned</th>
                <th>Gap</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(calendar?.days || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-state">No coverage data.</td>
                </tr>
              ) : (
                (calendar?.days || []).map((row) => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    <td>{row.active_sites}</td>
                    <td>{row.required_headcount}</td>
                    <td>{row.assigned_headcount}</td>
                    <td>{row.coverage_gap}</td>
                    <td>
                      <span className={`badge badge-${statusClass(row.coverage_gap)}`}>
                        {row.is_covered ? 'Covered' : 'Shortage'}
                      </span>
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
