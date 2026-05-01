import { useEffect, useState } from 'react'
import { createDeployment, listDeployments } from '../api'

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

function defaultRequirement() {
  return {
    product_type: '',
    required_headcount: '',
    reporting_from: '',
    reporting_to: '',
    next_shift_from: '',
    next_shift_to: '',
  }
}

function toSgDateTime(datetimeLocal) {
  if (!datetimeLocal) return null
  const normalized = datetimeLocal.length === 16 ? `${datetimeLocal}:00` : datetimeLocal
  return `${normalized}+08:00`
}

function formatSg(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
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

function alertType(msg) {
  if (!msg) return 'info'
  const m = msg.toLowerCase()
  if (m.includes('unable') || m.includes('fail') || m.includes('error')) return 'error'
  if (m.includes('please') || m.includes('required') || m.includes('must be') || m.includes('select at least') || m.includes('set start') || m.includes('for adhoc')) return 'warning'
  if (m.includes('created') || m.includes('success') || m.includes('loaded')) return 'success'
  return 'info'
}

function isValidTimeValue(value) {
  return typeof value === 'string' && value.length === 5 && value.includes(':')
}

function hasValidRequirements(requirements) {
  if (!Array.isArray(requirements) || requirements.length === 0) return false
  return requirements.every((row) => {
    const hc = Number(row.required_headcount)
    return (
      (row.product_type === 'APO' || row.product_type === 'AVSO') &&
      Number.isFinite(hc) &&
      hc > 0 &&
      isValidTimeValue(row.reporting_from) &&
      isValidTimeValue(row.reporting_to) &&
      isValidTimeValue(row.next_shift_from) &&
      isValidTimeValue(row.next_shift_to)
    )
  })
}

export default function DeploymentPlanningPage() {
  const [status, setStatus] = useState('Loading deployment sites...')
  const [sites, setSites] = useState([])
  const [siteName, setSiteName] = useState('')
  const [siteLat, setSiteLat] = useState('')
  const [siteLng, setSiteLng] = useState('')
  const [mode, setMode] = useState('RECURRING')
  const [days, setDays] = useState(['MON', 'TUE', 'WED', 'THU', 'FRI'])
  const [savedRecurringDays, setSavedRecurringDays] = useState(['MON', 'TUE', 'WED', 'THU', 'FRI'])
  const [adhocStart, setAdhocStart] = useState('')
  const [adhocEnd, setAdhocEnd] = useState('')
  const [requirements, setRequirements] = useState([defaultRequirement()])

  async function refreshSites() {
    setStatus('Loading deployment sites...')
    try {
      const payload = await listDeployments()
      setSites(payload || [])
      setStatus('Deployment sites loaded.')
    } catch (err) {
      setSites([])
      setStatus(`Unable to load deployment sites: ${err.message}`)
    }
  }

  useEffect(() => {
    refreshSites()
  }, [])

  function toggleDay(day) {
    if (mode !== 'RECURRING') return
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))
  }

  function switchMode(nextMode) {
    if (nextMode === mode) return
    if (nextMode === 'ADHOC') {
      if (days.length > 0) setSavedRecurringDays(days)
      setDays([])
      setMode('ADHOC')
      return
    }
    setMode('RECURRING')
    setDays(savedRecurringDays.length > 0 ? savedRecurringDays : ['MON', 'TUE', 'WED', 'THU', 'FRI'])
  }

  function updateRequirement(index, key, value) {
    setRequirements((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, [key]: value } : row))
    )
  }

  function addRequirement() {
    setRequirements((prev) => [...prev, defaultRequirement()])
  }

  function removeRequirement(index) {
    setRequirements((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== index)))
  }

  async function onCreateSite(event) {
    event.preventDefault()
    if (!siteName.trim()) {
      setStatus('Site name is required.')
      return
    }
    if (mode === 'RECURRING' && days.length === 0) {
      setStatus('Select at least one deployment day for recurring mode.')
      return
    }
    if (mode === 'ADHOC') {
      if (!adhocStart || !adhocEnd) {
        setStatus('For ADHOC mode, set both start and end date/time.')
        return
      }
      if (adhocEnd <= adhocStart) {
        setStatus('ADHOC end date/time must be later than start date/time.')
        return
      }
    }
    if (!hasValidRequirements(requirements)) {
      setStatus('Complete Product Requirements first (product, headcount, and all shift times).')
      return
    }

    const payload = {
      site_name: siteName.trim(),
      site_lat: siteLat.trim() ? Number(siteLat) : null,
      site_lng: siteLng.trim() ? Number(siteLng) : null,
      mode,
      deployment_days: mode === 'RECURRING' ? [...days].sort() : [],
      adhoc_start_at: mode === 'ADHOC' ? toSgDateTime(adhocStart) : null,
      adhoc_end_at: mode === 'ADHOC' ? toSgDateTime(adhocEnd) : null,
      requirements: requirements.map((row) => ({
        ...row,
        required_headcount: Number(row.required_headcount),
      })),
    }

    setStatus('Creating deployment site...')
    try {
      await createDeployment(payload)
      setSiteName('')
      setSiteLat('')
      setSiteLng('')
      setMode('RECURRING')
      setDays(['MON', 'TUE', 'WED', 'THU', 'FRI'])
      setSavedRecurringDays(['MON', 'TUE', 'WED', 'THU', 'FRI'])
      setAdhocStart('')
      setAdhocEnd('')
      setRequirements([defaultRequirement()])
      setStatus('Deployment site created successfully.')
      await refreshSites()
    } catch (err) {
      setStatus(`Create deployment site error: ${err.message}`)
    }
  }

  const canCreateSite =
    siteName.trim().length > 0 &&
    hasValidRequirements(requirements) &&
    (mode === 'RECURRING'
      ? days.length > 0
      : adhocStart.length > 0 && adhocEnd.length > 0 && adhocEnd > adhocStart)

  return (
    <>
      <section className="panel">
        <form className="form-stack" onSubmit={onCreateSite}>
          <div className="toolbar-row">
            <input
              placeholder="Site Name *"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              style={{ minWidth: 240 }}
            />
            <input
              type="number"
              step="any"
              placeholder="Site Latitude (Optional)"
              value={siteLat}
              onChange={(e) => setSiteLat(e.target.value)}
              style={{ minWidth: 220 }}
            />
            <input
              type="number"
              step="any"
              placeholder="Site Longitude (Optional)"
              value={siteLng}
              onChange={(e) => setSiteLng(e.target.value)}
              style={{ minWidth: 220 }}
            />
          </div>

          <div className="toolbar-row">
            <button
              type="button"
              className={`btn-toggle${mode === 'RECURRING' ? ' active' : ''}`}
              onClick={() => switchMode('RECURRING')}
            >
              Recurring
            </button>
            <button
              type="button"
              className={`btn-toggle${mode === 'ADHOC' ? ' active' : ''}`}
              onClick={() => switchMode('ADHOC')}
            >
              Adhoc
            </button>
          </div>

          <div className={`days-row${mode === 'ADHOC' ? ' disabled' : ''}`}>
            {WEEKDAYS.map((day) => (
              <label key={day}>
                <input
                  type="checkbox"
                  checked={days.includes(day)}
                  onChange={() => toggleDay(day)}
                  disabled={mode === 'ADHOC'}
                />
                {day}
              </label>
            ))}
          </div>

          {mode === 'ADHOC' && (
            <div className="form-grid">
              <input
                type="datetime-local"
                title="Adhoc Start"
                value={adhocStart}
                onChange={(e) => setAdhocStart(e.target.value)}
              />
              <input
                type="datetime-local"
                title="Adhoc End"
                value={adhocEnd}
                onChange={(e) => setAdhocEnd(e.target.value)}
              />
            </div>
          )}

          <div className="req-block">
            <div className="req-title">Product Requirements</div>
            {requirements.map((row, index) => (
              <div className="req-row" key={`req-${index}`}>
                <select
                  value={row.product_type}
                  onChange={(e) => updateRequirement(index, 'product_type', e.target.value)}
                >
                  <option value="">Select Product *</option>
                  <option value="APO">APO</option>
                  <option value="AVSO">AVSO</option>
                </select>
                <input
                  type="number"
                  min="1"
                  placeholder="Headcount *"
                  title="Headcount"
                  value={row.required_headcount}
                  onChange={(e) => updateRequirement(index, 'required_headcount', e.target.value)}
                />
                <input
                  type="time"
                  title="Reporting From"
                  value={row.reporting_from}
                  onChange={(e) => updateRequirement(index, 'reporting_from', e.target.value)}
                />
                <input
                  type="time"
                  title="Reporting To"
                  value={row.reporting_to}
                  onChange={(e) => updateRequirement(index, 'reporting_to', e.target.value)}
                />
                <input
                  type="time"
                  title="Next Shift From"
                  value={row.next_shift_from}
                  onChange={(e) => updateRequirement(index, 'next_shift_from', e.target.value)}
                />
                <input
                  type="time"
                  title="Next Shift To"
                  value={row.next_shift_to}
                  onChange={(e) => updateRequirement(index, 'next_shift_to', e.target.value)}
                />
                <button type="button" onClick={() => removeRequirement(index)}>Remove</button>
              </div>
            ))}
            <div>
              <button type="button" className="btn-secondary btn-sm" onClick={addRequirement}>
                + Add Product Row
              </button>
            </div>
          </div>

          <div className="toolbar-row">
            <button type="submit" disabled={!canCreateSite} title={!canCreateSite ? 'Complete Product Requirements first' : ''}>
              Create Site (After Requirements)
            </button>
          </div>
        </form>

        {status && <div className={`alert alert-${alertType(status)}`}>{status}</div>}
      </section>

      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Site Name</th>
                <th>Mode</th>
                <th>Requirements</th>
                <th>Deployment Days</th>
                <th>Adhoc Window</th>
                <th>Site Coords</th>
                <th>Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {sites.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                    No deployment sites configured.
                  </td>
                </tr>
              ) : (
                sites.map((site) => (
                  <tr key={site.id}>
                    <td style={{ fontWeight: 500 }}>{site.site_name}</td>
                    <td>
                      <span className={`badge badge-mode-${site.mode.toLowerCase()}`}>
                        {site.mode}
                      </span>
                    </td>
                    <td>
                      {(site.requirements || []).map((r, idx) => (
                        <div key={`${site.id}-r-${idx}`} style={{ fontSize: 12, lineHeight: 1.6 }}>
                          {r.product_type}: HC {r.required_headcount} ({r.reporting_from}–{r.reporting_to}; next {r.next_shift_from}–{r.next_shift_to})
                        </div>
                      ))}
                    </td>
                    <td>{(site.deployment_days || []).join(', ') || '—'}</td>
                    <td style={{ fontSize: 12 }}>
                      {site.mode === 'ADHOC'
                        ? `${formatSg(site.adhoc_start_at)} → ${formatSg(site.adhoc_end_at)}`
                        : '—'}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {site.site_lat != null && site.site_lng != null
                        ? `${site.site_lat}, ${site.site_lng}`
                        : '—'}
                    </td>
                    <td style={{ fontSize: 12 }}>{formatSg(site.updated_at)}</td>
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
