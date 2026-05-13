import { useEffect, useMemo, useState } from 'react'
import { getDoor4DepartureFlights } from '../api'

const DOOR4_PLAN_STORAGE_KEY = 'door4_flight_assignments_by_date'
const DOOR4_PLAN_UPDATED_EVENT = 'door4-plan-updated'
const REFRESH_MS = 60000

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
    const value = row?.[key]
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

function formatCompactTime(value) {
  const m = parseFlightMinutes(value)
  if (m === null) return '—'
  const hh = String(Math.floor(m / 60)).padStart(2, '0')
  const mm = String(m % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

function getFlightRowKey(row, index) {
  const flight = getFlightValue(row, ['flightno', 'flight_no', 'flightNumber', 'flight'])
  const date = getFlightDateIso(row) || getFlightValue(row, ['scheduled_date', 'estimated_date', 'display_date', 'tixdate'])
  const terminal = getFlightValue(row, ['display_terminal', 'terminal'])
  const gate = getFlightValue(row, ['display_gate', 'current_gate', 'display_parkingstand', 'scheduled_gate'])
  const scheduledTime = getFlightValue(row, ['scheduled_time', 'sch', 'std', 'scheduledTime'])
  return `${flight}|${date}|${terminal}|${gate}|${scheduledTime}`
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

function isoDateSerial(isoDate) {
  const m = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / (24 * 60 * 60 * 1000))
}

function getFlightAbsoluteSgMinutes(row, fallbackDateIso = '') {
  const etaRaw = getFlightValue(row, ['ext_display_time', 'display_time', 'estimated_time', 'eta', 'estimatedTime'])
  const minutes = parseFlightMinutes(etaRaw)
  if (minutes === null) return null
  const dateIso = getFlightDateIso(row) || fallbackDateIso
  const serial = isoDateSerial(dateIso)
  if (serial === null) return null
  return (serial * 1440) + minutes
}

function statusTone(statusValue) {
  const s = String(statusValue || '').toLowerCase()
  if (s.includes('cancel')) return 'red'
  if (s.includes('delay')) return 'amber'
  if (s.includes('land')) return 'green'
  if (s.includes('confirm')) return 'blue'
  if (s.includes('depart')) return 'slate'
  return 'gray'
}

function isTerminal4Flight(row) {
  const terminalRaw = getFlightValue(row, [
    'display_terminal',
    'terminal',
    'terminalCode',
    'terminalNo',
    'terminal_no',
    'term',
  ])
  const normalized = String(terminalRaw || '').trim().toUpperCase().replace(/\s+/g, '')
  return normalized === '4' || normalized === 'T4' || normalized === 'TERMINAL4'
}

export default function Door4AlertPage() {
  const [selectedDate, setSelectedDate] = useState(todaySgIso())
  const [status, setStatus] = useState('')
  const [flights, setFlights] = useState([])
  const [flightAssignments, setFlightAssignments] = useState({})
  const [tick, setTick] = useState(0)

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
    const timer = window.setInterval(() => setTick((v) => v + 1), REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    async function refreshFlights() {
      try {
        const payload = await getDoor4DepartureFlights(selectedDate)
        setFlights(getFlightRows(payload))
      } catch {
        // keep last successful snapshot
      }
    }
    refreshFlights()
  }, [tick, selectedDate])

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

  const unassignedCards = useMemo(() => {
    const now = currentSgMinutes()
    const todayIso = todaySgIso()
    const todaySerial = isoDateSerial(todayIso)
    if (now === null || todaySerial === null) return []
    const windowStart = (todaySerial * 1440) + now
    const windowEnd = windowStart + 120

    return flights
      .filter((row) => !isTerminal4Flight(row))
      .map((row, index) => {
        const key = getFlightRowKey(row, index)
        const statusValue = getFlightValue(row, ['flight_status', 'status', 'flightStatus', 'flightstatus', 'remarks'])
        const etaRaw = getFlightValue(row, ['ext_display_time', 'display_time', 'estimated_time', 'eta', 'estimatedTime'])
        const etaMinutes = parseFlightMinutes(etaRaw)
        const absoluteMinutes = getFlightAbsoluteSgMinutes(row, selectedDate)
        const gate = getFlightValue(row, ['display_gate', 'current_gate', 'scheduled_gate', 'gate', 'display_parkingstand'])
        const terminal = getFlightValue(row, ['display_terminal', 'terminal'])
        const flightNo = getFlightValue(row, ['flightno', 'flight_no', 'flightNumber', 'flight'])
        const sch = getFlightValue(row, ['scheduled_time', 'sch', 'std', 'scheduledTime'])
        const assigned = Boolean(flightAssignments[key])
        return { key, statusValue, etaMinutes, absoluteMinutes, gate, terminal, flightNo, sch, assigned }
      })
      .filter((item) => !item.assigned)
      .filter((item) => item.etaMinutes !== null && item.absoluteMinutes !== null)
      .filter((item) => item.absoluteMinutes >= windowStart && item.absoluteMinutes <= windowEnd)
      .filter((item) => {
        const s = String(item.statusValue).toLowerCase()
        return !(s.includes('cancel') || s.includes('depart') || s.includes('land'))
      })
      .sort((a, b) => a.absoluteMinutes - b.absoluteMinutes)
      .map((item) => ({
        ...item,
        eta: formatCompactTime(String(item.etaMinutes).padStart(4, '0')),
        schTime: formatCompactTime(item.sch),
        minsToEta: item.absoluteMinutes - windowStart,
      }))
  }, [flights, flightAssignments, tick, selectedDate])

  return (
    <>
      <section className="panel">
        <h2>Door 4 Alert</h2>
        <div className="toolbar-row">
          <label>
            Deployment Date (SG)
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          </label>
        </div>
        <p className="muted">Unassigned gates in the next 120 minutes.</p>
        {status && <div className="alert alert-warning">{status}</div>}
      </section>

      <section className="panel">
        <h2>Unassigned Gate Alerts ({unassignedCards.length})</h2>
        {unassignedCards.length === 0 ? (
          <div className="door4-empty">No unassigned gates in the next 120 minutes.</div>
        ) : (
          <div className="door4-alert-grid">
            {unassignedCards.map((item) => (
              <article
                key={item.key}
                className={`door4-alert-card${item.minsToEta <= 30 ? ' is-urgent' : item.minsToEta <= 60 ? ' is-soon' : ''}`}
              >
                <div className="door4-alert-card-head">
                  <strong>{item.gate || '—'}</strong>
                  <span className={`badge badge-${statusTone(item.statusValue)}`}>{item.statusValue}</span>
                </div>
                <div className="door4-alert-meta">
                  <span>Flight: {item.flightNo}</span>
                  <span>Terminal: T{item.terminal}</span>
                  <span>ETA: {item.eta}</span>
                  <span>SCH: {item.schTime}</span>
                  <span>{item.minsToEta} min to ETA</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
