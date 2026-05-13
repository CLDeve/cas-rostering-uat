import { useEffect, useMemo, useState } from 'react'
import { getDoor4DepartureFlights, listEmployees } from '../api'

const DOOR4_PLAN_STORAGE_KEY = 'door4_flight_assignments_by_date'
const DOOR4_PLAN_UPDATED_EVENT = 'door4-plan-updated'

function todaySgIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function currentSgMinutes() {
  const hhmm = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
  const m = hhmm.match(/^(\d{2}):(\d{2})$/)
  if (!m) return null
  return (Number(m[1]) * 60) + Number(m[2])
}

function readPath(row, path) {
  return String(path)
    .split('.')
    .reduce((value, key) => (value && typeof value === 'object' ? value[key] : undefined), row)
}

function getFlightRows(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.flights)) return payload.flights
  if (Array.isArray(payload?.flightStatuses)) return payload.flightStatuses
  if (payload && typeof payload === 'object') return [payload]
  return []
}

function getFlightValue(row, keys) {
  for (const key of keys) {
    const value = String(key).includes('.') ? readPath(row, key) : row?.[key]
    if (value !== undefined && value !== null && value !== '') return String(value)
  }
  return '—'
}

function parseFlightMinutes(value) {
  const raw = String(value || '').trim()
  const compact = raw.match(/^(\d{1,2})(\d{2})$/)
  if (compact) {
    const hh = Number(compact[1])
    const mm = Number(compact[2])
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return (hh * 60) + mm
  }
  const colon = raw.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/)
  if (colon) return (Number(colon[1]) * 60) + Number(colon[2])
  return null
}

function formatMins(minutes) {
  if (minutes === null || Number.isNaN(minutes)) return '—'
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0')
  const mm = String(minutes % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

function getFlightDateIso(row) {
  const raw = getFlightValue(row, ['tixdate', 'scheduled_date', 'estimated_date', 'display_date'])
  const text = String(raw || '').trim()
  const isDateTimeLike = /[T\s]\d{2}:\d{2}/.test(text) || /Z$/.test(text) || /[+-]\d{2}:?\d{2}$/.test(text)
  if (!isDateTimeLike) {
    const m = text.match(/^(\d{4}-\d{2}-\d{2})$/)
    if (m) return m[1]
  }
  const d = new Date(text)
  if (!Number.isNaN(d.getTime())) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Singapore',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
  }
  return ''
}

function getFlightRowKey(row, _index) {
  const flight = getFlightValue(row, ['flightno', 'flight_no', 'flightNumber', 'flight'])
  const date = getFlightDateIso(row) || getFlightValue(row, ['scheduled_date', 'estimated_date', 'display_date', 'tixdate'])
  const terminal = getFlightValue(row, ['display_terminal', 'terminal'])
  const gate = getFlightValue(row, ['display_gate', 'current_gate', 'display_parkingstand', 'scheduled_gate'])
  const scheduledTime = getFlightValue(row, ['scheduled_time', 'sch', 'std', 'scheduledTime'])
  return `${flight}|${date}|${terminal}|${gate}|${scheduledTime}`
}

function isTerminal4Flight(row) {
  const terminalRaw = getFlightValue(row, ['display_terminal', 'terminal', 'terminalCode', 'terminalNo', 'terminal_no', 'term'])
  const normalized = String(terminalRaw || '').trim().toUpperCase().replace(/\s+/g, '')
  return normalized === '4' || normalized === 'T4' || normalized === 'TERMINAL4'
}

function terminalGroupFromGateCode(gateCode) {
  const code = String(gateCode || '').toUpperCase().trim()
  const explicitTerminal = code.match(/^T([1-4])/)
  if (explicitTerminal) return `T${explicitTerminal[1]}`
  const pier = code[0]
  if (pier === 'A' || pier === 'B') return 'T3'
  if (pier === 'E' || pier === 'F') return 'T2'
  if (pier === 'C' || pier === 'D') return 'T1'
  return ''
}

function terminalGroupFromTerminalValue(terminalValue) {
  const raw = String(terminalValue || '').trim().toUpperCase()
  if (!raw || raw === '—' || raw === 'T?') return ''
  const direct = raw.match(/^T?([1-4])$/)
  if (direct) return `T${direct[1]}`
  const prefixed = raw.match(/^TERMINAL\s*([1-4])$/)
  if (prefixed) return `T${prefixed[1]}`
  return ''
}

function terminalGroupForFlight(row) {
  const terminalKeys = ['display_terminal', 'terminal', 'terminalCode', 'terminalNo', 'terminal_no', 'term']
  for (const key of terminalKeys) {
    const value = String(readPath(row, key) ?? row?.[key] ?? '').trim()
    const group = terminalGroupFromTerminalValue(value)
    if (group) return group
  }
  return terminalGroupFromGateCode(getFlightValue(row, ['display_gate', 'current_gate', 'display_parkingstand', 'scheduled_gate']))
}

function getOfficerTerminalAnchor(officerId, assignmentsByOfficer) {
  const items = assignmentsByOfficer[officerId] || []
  return items.find((x) => x.terminalGroup)?.terminalGroup || ''
}

export default function Door4CrossTerminalPage() {
  const [selectedDate, setSelectedDate] = useState(todaySgIso())
  const [windowMinutes, setWindowMinutes] = useState(120)
  const [status, setStatus] = useState('')
  const [officers, setOfficers] = useState([])
  const [flights, setFlights] = useState([])
  const [flightAssignments, setFlightAssignments] = useState({})

  useEffect(() => {
    async function loadOfficers() {
      try {
        const all = []
        let page = 1
        let total = null
        while (total === null || all.length < total) {
          const payload = await listEmployees({ page, page_size: 100 })
          const items = Array.isArray(payload?.items) ? payload.items : []
          total = Number(payload?.total ?? items.length)
          all.push(...items)
          if (items.length < 100) break
          page += 1
        }
        setOfficers(all)
      } catch (err) {
        setOfficers([])
        setStatus(`Unable to load officers: ${err.message}`)
      }
    }
    loadOfficers()
  }, [])

  useEffect(() => {
    async function loadFlights() {
      try {
        const payload = await getDoor4DepartureFlights(selectedDate)
        setFlights(getFlightRows(payload))
        setStatus('')
      } catch (err) {
        setFlights([])
        setStatus(`Unable to load Door 4 flights: ${err.message}`)
      }
    }
    loadFlights()
  }, [selectedDate])

  useEffect(() => {
    function loadPlanFromStorage(date = selectedDate) {
      try {
        const raw = localStorage.getItem(DOOR4_PLAN_STORAGE_KEY)
        const allPlans = raw ? JSON.parse(raw) : {}
        const dayPlan = allPlans?.[date]
        setFlightAssignments(dayPlan && typeof dayPlan === 'object' ? dayPlan : {})
      } catch {
        setFlightAssignments({})
      }
    }

    loadPlanFromStorage(selectedDate)
    function onPlanUpdated(event) {
      const eventDate = event?.detail?.date
      if (eventDate && eventDate !== selectedDate) return
      loadPlanFromStorage(selectedDate)
    }
    function onStorage(event) {
      if (event.key !== DOOR4_PLAN_STORAGE_KEY) return
      loadPlanFromStorage(selectedDate)
    }
    window.addEventListener(DOOR4_PLAN_UPDATED_EVENT, onPlanUpdated)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(DOOR4_PLAN_UPDATED_EVENT, onPlanUpdated)
      window.removeEventListener('storage', onStorage)
    }
  }, [selectedDate])

  const flightFirstRows = useMemo(() => {
    const now = currentSgMinutes()
    if (now === null) return []
    const windowEnd = now + Number(windowMinutes || 120)

    const door4Officers = officers.filter((row) => String(row.deployment_area || '').toLowerCase() === 'door 4')
    const flightByKey = {}
    flights.forEach((flight, index) => {
      flightByKey[getFlightRowKey(flight, index)] = flight
    })

    const assignmentsByOfficer = {}
    Object.entries(flightAssignments).forEach(([flightKey, officerId]) => {
      const flight = flightByKey[flightKey]
      if (!flight) return
      const id = String(officerId)
      if (!assignmentsByOfficer[id]) assignmentsByOfficer[id] = []
      assignmentsByOfficer[id].push({ terminalGroup: terminalGroupForFlight(flight) })
    })

    return flights
      .filter((row) => !isTerminal4Flight(row))
      .map((row, index) => {
        const key = getFlightRowKey(row, index)
        const assigned = Boolean(flightAssignments[key])
        const eta = parseFlightMinutes(getFlightValue(row, ['ext_display_time', 'display_time', 'estimated_time', 'eta', 'estimatedTime']))
        const terminalGroup = terminalGroupForFlight(row)
        const statusValue = getFlightValue(row, ['flight_status', 'status', 'flightStatus', 'flightstatus', 'remarks']).toLowerCase()
        const flightNo = getFlightValue(row, ['flightno', 'flight_no', 'flightNumber', 'flight'])
        const gate = getFlightValue(row, ['display_gate', 'current_gate', 'scheduled_gate', 'gate', 'display_parkingstand'])
        return { key, assigned, eta, terminalGroup, statusValue, flightNo, gate }
      })
      .filter((f) => !f.assigned && f.eta !== null && f.eta >= now && f.eta <= windowEnd)
      .filter((f) => !(f.statusValue.includes('cancel') || f.statusValue.includes('depart') || f.statusValue.includes('land')))
      .map((flight) => {
        const blocked = []
        const coverable = []
        door4Officers.forEach((officer) => {
          const officerId = String(officer.id)
          const anchor = getOfficerTerminalAnchor(officerId, assignmentsByOfficer)
          if (!anchor) {
            coverable.push(officer)
            return
          }
          if (flight.terminalGroup && anchor !== flight.terminalGroup) {
            blocked.push({ officer, anchor })
          } else {
            coverable.push(officer)
          }
        })
        return {
          ...flight,
          blocked,
          coverable,
        }
      })
      .sort((a, b) => a.eta - b.eta)
  }, [officers, flights, flightAssignments, windowMinutes])

  return (
    <>
      <section className="panel">
        <h2>Door 4 Unplanned Future Flights</h2>
        <div className="toolbar-row">
          <label>
            Deployment Date (SG)
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          </label>
          <label>
            Window (mins)
            <input
              type="number"
              min="30"
              max="360"
              step="15"
              value={windowMinutes}
              onChange={(e) => {
                const n = Number(e.target.value)
                setWindowMinutes(Number.isFinite(n) ? Math.min(360, Math.max(30, n)) : 120)
              }}
            />
          </label>
        </div>
        <p className="muted">Flight-first view for unplanned future flights. Shows who can cover now and who is blocked by terminal crossing.</p>
        {status && <div className="alert alert-warning">{status}</div>}
      </section>

      <section className="panel">
        <h2>Unplanned Flights ({flightFirstRows.length})</h2>
        {flightFirstRows.length === 0 ? (
          <div className="door4-empty">No unplanned future flights in the selected window.</div>
        ) : (
          <div className="door4-alert-grid">
            {flightFirstRows.map((flight) => (
              <article key={flight.key} className="door4-alert-card">
                <div className="door4-alert-card-head">
                  <strong>{flight.flightNo} • {flight.gate} • ETA {formatMins(flight.eta)}</strong>
                  <span className="badge badge-amber">Blocked {flight.blocked.length}</span>
                </div>
                <div className="door4-alert-meta">
                  <span>Terminal Group: {flight.terminalGroup || 'Unknown'}</span>
                  <span>Can Cover Now: {flight.coverable.length}</span>
                </div>
                <div className="door4-alert-meta" style={{ marginTop: 8 }}>
                  <span><strong>Blocked by terminal crossing:</strong></span>
                  {flight.blocked.length === 0 ? (
                    <span>None</span>
                  ) : (
                    flight.blocked.slice(0, 6).map((b) => (
                      <span key={`${flight.key}-${b.officer.id}`}>{b.officer.name} ({b.officer.staff_id}) • anchor {b.anchor}</span>
                    ))
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
