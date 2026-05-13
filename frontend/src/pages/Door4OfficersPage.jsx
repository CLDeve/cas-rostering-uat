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

function readPath(row, path) {
  return String(path)
    .split('.')
    .reduce((value, key) => (value && typeof value === 'object' ? value[key] : undefined), row)
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

function getFlightRowKey(row, index) {
  const flight = getFlightValue(row, ['flightno', 'flight_no', 'flightNumber', 'flight'])
  const date = getFlightDateIso(row) || getFlightValue(row, ['scheduled_date', 'estimated_date', 'display_date', 'tixdate'])
  const terminal = getFlightValue(row, ['display_terminal', 'terminal'])
  const gate = getFlightValue(row, ['display_gate', 'current_gate', 'display_parkingstand', 'scheduled_gate'])
  const scheduledTime = getFlightValue(row, ['scheduled_time', 'sch', 'std', 'scheduledTime'])
  return `${flight}|${date}|${terminal}|${gate}|${scheduledTime}`
}

function getFlightGate(row) {
  return getFlightValue(row, [
    'display_gate',
    'current_gate',
    'scheduled_gate',
    'gate',
    'gateno',
    'gateNo',
    'boardingGate',
    'assignedGate',
    'stand',
    'bay',
    'display_parkingstand',
  ])
}

function getFlightStatus(row) {
  return getFlightValue(row, ['flight_status', 'status', 'flightStatus', 'flightstatus', 'remarks'])
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
  const terminalKeys = [
    'display_terminal',
    'terminal',
    'terminalCode',
    'terminalNo',
    'terminal_no',
    'term',
  ]
  for (const key of terminalKeys) {
    const value = String(readPath(row, key) ?? row?.[key] ?? '').trim()
    const group = terminalGroupFromTerminalValue(value)
    if (group) return group
  }
  return terminalGroupFromGateCode(getFlightGate(row))
}

function getFlightTerminalDisplay(row) {
  const group = terminalGroupForFlight(row)
  return group ? group.replace('T', '') : '?'
}

function formatCompactTime(value) {
  const raw = String(value || '').trim()
  const hhmm = raw.match(/^(\d{1,2})(\d{2})$/)
  if (hhmm) return `${String(Number(hhmm[1])).padStart(2, '0')}:${hhmm[2]}`
  const col = raw.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/)
  if (col) return `${col[1]}:${col[2]}`
  return '—'
}

function flightStatusTone(statusValue) {
  const s = String(statusValue || '').toLowerCase()
  if (s.includes('cancel')) return 'red'
  if (s.includes('delay')) return 'amber'
  if (s.includes('land')) return 'green'
  if (s.includes('confirm')) return 'blue'
  if (s.includes('depart')) return 'slate'
  if (s.includes('board')) return 'purple'
  if (s.includes('gate') && s.includes('open')) return 'cyan'
  if (s.includes('divert')) return 'red'
  return 'gray'
}

export default function Door4OfficersPage() {
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState([])
  const [selectedDate, setSelectedDate] = useState(todaySgIso())
  const [flights, setFlights] = useState([])
  const [flightAssignments, setFlightAssignments] = useState({})

  useEffect(() => {
    async function load() {
      setStatus('Loading Door 4 officers...')
      try {
        const items = []
        const pageSize = 100
        let page = 1
        let total = null
        while (total === null || items.length < total) {
          const payload = await listEmployees({ page, page_size: pageSize })
          const batch = Array.isArray(payload?.items) ? payload.items : []
          total = Number(payload?.total ?? batch.length)
          items.push(...batch)
          if (batch.length < pageSize) break
          page += 1
        }
        setRows(items)
        setStatus('')
      } catch (err) {
        setRows([])
        setStatus(`Unable to load officers: ${err.message}`)
      }
    }
    load()
  }, [])

  useEffect(() => {
    async function loadFlights() {
      try {
        const payload = await getDoor4DepartureFlights(selectedDate)
        const items = getFlightRows(payload)
        setFlights(items)
      } catch {
        setFlights([])
      }
    }
    loadFlights()
  }, [selectedDate])

  useEffect(() => {
    if (!flights.length) return
    const flightByKey = {}
    flights.forEach((flight, index) => {
      const key = getFlightRowKey(flight, index)
      flightByKey[key] = flight
    })

    const byOfficer = {}
    Object.entries(flightAssignments).forEach(([flightKey, officerId]) => {
      const flight = flightByKey[flightKey]
      if (!flight) return
      const id = String(officerId)
      if (!byOfficer[id]) byOfficer[id] = []
      byOfficer[id].push({
        flightKey,
        terminalGroup: terminalGroupForFlight(flight),
      })
    })

    const invalidKeys = new Set()
    Object.values(byOfficer).forEach((items) => {
      const anchor = items.find((item) => item.terminalGroup)?.terminalGroup || ''
      if (!anchor) {
        items.forEach((item) => invalidKeys.add(item.flightKey))
        return
      }
      items.forEach((item) => {
        if (!item.terminalGroup || item.terminalGroup !== anchor) {
          invalidKeys.add(item.flightKey)
        }
      })
    })

    if (invalidKeys.size === 0) return

    const nextAssignments = { ...flightAssignments }
    let changed = false
    invalidKeys.forEach((key) => {
      if (nextAssignments[key]) {
        delete nextAssignments[key]
        changed = true
      }
    })
    if (!changed) return

    setFlightAssignments(nextAssignments)
    try {
      const raw = localStorage.getItem(DOOR4_PLAN_STORAGE_KEY)
      const allPlans = raw ? JSON.parse(raw) : {}
      const nextPlans = { ...(allPlans || {}), [selectedDate]: nextAssignments }
      localStorage.setItem(DOOR4_PLAN_STORAGE_KEY, JSON.stringify(nextPlans))
      window.dispatchEvent(new CustomEvent(DOOR4_PLAN_UPDATED_EVENT, { detail: { date: selectedDate } }))
    } catch {
      // ignore storage write failures
    }
  }, [flights, flightAssignments, selectedDate])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DOOR4_PLAN_STORAGE_KEY)
      const allPlans = raw ? JSON.parse(raw) : {}
      const dayPlan = allPlans?.[selectedDate]
      setFlightAssignments(dayPlan && typeof dayPlan === 'object' ? dayPlan : {})
    } catch {
      setFlightAssignments({})
    }
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

  const door4Rows = useMemo(
    () => rows.filter((row) => String(row.deployment_area || '').toLowerCase() === 'door 4'),
    [rows],
  )

  const assignmentsByOfficerId = useMemo(() => {
    const flightByKey = {}
    flights.forEach((flight, index) => {
      const key = getFlightRowKey(flight, index)
      flightByKey[key] = flight
    })

    const map = {}
    Object.entries(flightAssignments).forEach(([flightKey, officerId]) => {
      const flight = flightByKey[flightKey]
      if (!flight) return
      const id = String(officerId)
      if (!map[id]) map[id] = []
      map[id].push({
        gate: getFlightGate(flight),
        flight: getFlightValue(flight, ['flightno', 'flight_no', 'flightNumber', 'flight']),
        terminal: getFlightTerminalDisplay(flight),
        status: getFlightStatus(flight),
        eta: formatCompactTime(getFlightValue(flight, [
          'ext_display_time',
          'display_time',
          'estimated_time',
          'eta',
          'estimatedTime',
          'estimatedDepartureTime',
          'estimatedDeparture',
          'etd',
          'operationalTimes.estimatedGateDeparture.dateLocal',
        ])),
        sch: formatCompactTime(getFlightValue(flight, [
          'scheduled_time',
          'sch',
          'std',
          'scheduledTime',
          'scheduledDepartureTime',
          'scheduledDeparture',
          'operationalTimes.scheduledGateDeparture.dateLocal',
        ])),
      })
    })
    Object.values(map).forEach((items) => {
      items.sort((a, b) => a.eta.localeCompare(b.eta))
    })
    return map
  }, [flights, flightAssignments])

  return (
    <section className="panel">
      <h2>Door 4 Officers ({door4Rows.length})</h2>
      <div className="toolbar-row">
        <label>
          Deployment Date (SG)
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
        </label>
      </div>
      {status && <div className="alert alert-info">{status}</div>}
      <div className="door4-officer-board">
        {door4Rows.length === 0 ? (
          <div className="muted">No officers assigned to Door 4.</div>
        ) : (
          door4Rows.map((row) => {
            const assignments = assignmentsByOfficerId[String(row.id)] || []
            return (
              <article key={row.id} className="door4-officer-row">
                <aside className="door4-officer-meta">
                  <h3>{row.staff_id}</h3>
                  <p>{row.name} • {row.staff_id}</p>
                  <p>{row.team} • {row.rank} • {row.shift_pattern}</p>
                  <strong>{assignments.length} assignment{assignments.length === 1 ? '' : 's'}</strong>
                </aside>
                <div className="door4-assignment-track">
                  {assignments.length === 0 ? (
                    <div className="door4-assignment-empty">No assigned gates</div>
                  ) : (
                    assignments.map((item, idx) => (
                      <article key={`${row.id}-${idx}`} className={`door4-assignment-card status-${flightStatusTone(item.status)}`}>
                        <div className="gate">{item.gate}</div>
                        <div className="detail">
                          <strong>{item.flight}</strong>
                          <span>T{item.terminal} • ETA {item.eta}</span>
                          <span>SCH {item.sch}</span>
                        </div>
                        <div className="state">{item.status}</div>
                      </article>
                    ))
                  )}
                </div>
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}
