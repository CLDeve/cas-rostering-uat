import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  getDoor4DepartureFlights,
  getDeploymentAssignments,
  listDeployments,
  listEmployees,
  replaceDeploymentAssignments,
} from '../api'
import SearchDropdown from '../components/SearchDropdown'

const DEFAULT_SLOT_CAPACITY = 25
const DEPLOYMENT_SCOPES = {
  all: { label: 'Deployment Board', aliases: [], locked: false },
  'door-4': { label: 'Door 4', aliases: ['door 4', 'door4'], locked: true },
  'sq-ramp': { label: 'SQ Ramp', aliases: ['sq ramp', 'sqramp'], locked: true },
  preboard: { label: 'Preboard', aliases: ['preboard', 'pre-board'], locked: true },
}

function getSiteSlotCapacity(site) {
  const requirements = Array.isArray(site?.requirements) ? site.requirements : []
  const total = requirements.reduce((sum, req) => {
    const n = Number(req?.required_headcount ?? 0)
    return sum + (Number.isFinite(n) && n > 0 ? n : 0)
  }, 0)
  return total > 0 ? total : DEFAULT_SLOT_CAPACITY
}

function todaySgIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function getSgWeekdayCode(isoDate) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Singapore',
    weekday: 'short',
  })
    .format(new Date(`${isoDate}T12:00:00Z`))
    .toUpperCase()
}

function formatSgDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
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

function filterSitesForDate(items, isoDate) {
  const weekdayCode = getSgWeekdayCode(isoDate)
  const dayStart = new Date(`${isoDate}T00:00:00+08:00`)
  const dayEnd = new Date(`${isoDate}T23:59:59+08:00`)

  return (items || []).filter((item) => {
    const mode = String(item.mode || 'RECURRING').toUpperCase()
    if (mode === 'ADHOC') {
      const adhocStart = item.adhoc_start_at ? new Date(item.adhoc_start_at) : null
      const adhocEnd = item.adhoc_end_at ? new Date(item.adhoc_end_at) : null
      if (!adhocStart || !adhocEnd || Number.isNaN(adhocStart.getTime()) || Number.isNaN(adhocEnd.getTime())) return false
      return adhocEnd >= dayStart && adhocStart <= dayEnd
    }
    const days = Array.isArray(item.deployment_days)
      ? item.deployment_days.map((d) => String(d).toUpperCase())
      : []
    return days.includes(weekdayCode)
  })
}

async function fetchAllOfficers() {
  const all = []
  const pageSize = 100
  let page = 1
  let total = null

  while (total === null || all.length < total) {
    const payload = await listEmployees({ page, page_size: pageSize })
    const items = Array.isArray(payload.items) ? payload.items : []
    total = Number(payload.total ?? items.length)
    all.push(...items)
    if (items.length < pageSize) break
    page += 1
  }

  return all
}

function alertType(msg) {
  if (!msg) return 'info'
  const m = msg.toLowerCase()
  if (m.includes('unable') || m.includes('fail') || m.includes('error') || m.includes('full')) return 'error'
  if (m.includes('loaded') || m.includes('saved') || m.includes('showing')) return 'success'
  return 'info'
}

function buildEmptyAssignmentsBySite(sites) {
  const assignments = {}
  for (const site of sites || []) {
    assignments[String(site.id)] = Array.from({ length: getSiteSlotCapacity(site) }, () => null)
  }
  return assignments
}

function applyAssignmentRows(baseAssignmentsBySite, assignmentRows) {
  const next = Object.fromEntries(
    Object.entries(baseAssignmentsBySite).map(([siteId, slots]) => [siteId, [...slots]])
  )

  for (const row of assignmentRows || []) {
    const siteId = String(row.site_id)
    const slotIndex = Number(row.slot_index)
    const employeeId = String(row.employee_id)
    if (!next[siteId]) continue
    if (Number.isNaN(slotIndex) || slotIndex < 0 || slotIndex >= next[siteId].length) continue
    next[siteId][slotIndex] = employeeId
  }

  return next
}

function buildOfficerToSiteIndex(assignmentsBySite) {
  const index = {}
  for (const [siteId, slots] of Object.entries(assignmentsBySite)) {
    for (const officerId of slots) {
      if (officerId !== null) index[String(officerId)] = siteId
    }
  }
  return index
}

function toAssignmentRows(assignmentsBySite) {
  const rows = []
  for (const [siteId, slots] of Object.entries(assignmentsBySite)) {
    slots.forEach((employeeId, slotIndex) => {
      if (employeeId !== null) {
        rows.push({
          site_id: Number(siteId),
          slot_index: slotIndex,
          employee_id: Number(employeeId),
        })
      }
    })
  }
  return rows
}

function normalizeSiteName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
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

function readPath(row, path) {
  return String(path)
    .split('.')
    .reduce((value, key) => (value && typeof value === 'object' ? value[key] : undefined), row)
}

function getFlightValue(row, keys) {
  for (const key of keys) {
    const value = String(key).includes('.') ? readPath(row, key) : row?.[key]
    if (value !== undefined && value !== null && value !== '') return String(value)
  }
  return '—'
}

function formatFlightTime(value) {
  if (!value || value === '—') return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 5)
  return new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function getFlightDisplay(row) {
  const gate = getFlightValue(row, ['gate', 'gateno', 'gateNo', 'boardingGate', 'assignedGate', 'stand', 'bay'])
  const terminal = getFlightValue(row, ['terminal', 'terminalCode', 'terminalNo', 'terminal_no', 'term'])
  const flight = getFlightValue(row, ['flightno', 'flight_no', 'flightNumber', 'flight'])
  const eta = getFlightValue(row, [
    'eta',
    'estimatedTime',
    'estimatedDepartureTime',
    'estimatedDeparture',
    'etd',
    'operationalTimes.estimatedGateDeparture.dateLocal',
  ])
  const scheduled = getFlightValue(row, [
    'sch',
    'std',
    'scheduledTime',
    'scheduledDepartureTime',
    'scheduledDeparture',
    'operationalTimes.scheduledGateDeparture.dateLocal',
  ])
  const officer = getFlightValue(row, ['officer', 'officerName', 'assignedOfficer', 'staffName', 'name'])
  const door = getFlightValue(row, ['door', 'doorNo', 'door_no', 'deploymentDoor', 'assignment'])
  const status = getFlightValue(row, ['status', 'flightStatus', 'flightstatus', 'remarks'])

  return {
    gate,
    terminal: terminal === '—' ? 'T?' : terminal,
    flight,
    eta: formatFlightTime(eta),
    scheduled: formatFlightTime(scheduled),
    officer: officer === '—' && door === '—' ? 'Unassigned' : `${officer}${door === '—' ? '' : ` • ${door}`}`,
    status: status === '—' ? 'Landed' : status,
  }
}

export default function DeploymentBoardPage() {
  const params = useParams()
  const routeScopeKey = String(params.scopeKey || 'all').toLowerCase()
  const scope = DEPLOYMENT_SCOPES[routeScopeKey] || DEPLOYMENT_SCOPES.all
  const [status, setStatus] = useState('Loading deployment board...')
  const [selectedDate, setSelectedDate] = useState(todaySgIso())
  const [allSites, setAllSites] = useState([])
  const [allOfficers, setAllOfficers] = useState([])
  const [assignmentsBySite, setAssignmentsBySite] = useState({})
  const [officerToSite, setOfficerToSite] = useState({})
  const [dirty, setDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [siteSearch, setSiteSearch] = useState('')
  const [gapOnly, setGapOnly] = useState(false)
  const [selectedSiteId, setSelectedSiteId] = useState('')
  const [door4FlightNo, setDoor4FlightNo] = useState('')
  const [door4Flights, setDoor4Flights] = useState([])
  const [door4FlightStatus, setDoor4FlightStatus] = useState('')
  const [isLoadingDoor4Flights, setIsLoadingDoor4Flights] = useState(false)

  const activeSites = useMemo(
    () => filterSitesForDate(allSites, selectedDate),
    [allSites, selectedDate]
  )

  const siteRows = useMemo(() => {
    return activeSites.map((site) => {
      const siteKey = String(site.id)
      const slotCapacity = getSiteSlotCapacity(site)
      const slots = assignmentsBySite[siteKey] || Array.from({ length: slotCapacity }, () => null)
      const assignedCount = slots.filter((x) => x !== null).length
      const gap = Math.max(slotCapacity - assignedCount, 0)
      return {
        site,
        siteKey,
        slotCapacity,
        slots,
        assignedCount,
        gap,
      }
    })
  }, [activeSites, assignmentsBySite])

  const unscopedFilteredSiteRows = useMemo(() => {
    const q = siteSearch.trim().toLowerCase()
    return siteRows
      .filter((row) => {
        if (gapOnly && row.gap <= 0) return false
        if (!q) return true
        return String(row.site.site_name || '').toLowerCase().includes(q)
      })
      .sort((a, b) => b.gap - a.gap || a.site.site_name.localeCompare(b.site.site_name))
  }, [siteRows, siteSearch, gapOnly])

  const scopedSiteId = useMemo(() => {
    if (!scope.locked) return ''
    const aliasSet = new Set(scope.aliases.map(normalizeSiteName))
    const matched = activeSites.find((site) => aliasSet.has(normalizeSiteName(site.site_name)))
    return matched ? String(matched.id) : ''
  }, [scope, activeSites])

  const filteredSiteRows = useMemo(() => {
    if (!scope.locked) return unscopedFilteredSiteRows
    if (!scopedSiteId) return []
    return siteRows.filter((row) => String(row.site.id) === scopedSiteId)
  }, [scope.locked, unscopedFilteredSiteRows, scopedSiteId, siteRows])

  const selectedSiteRow = useMemo(
    () => filteredSiteRows.find((row) => String(row.site.id) === String(selectedSiteId)) || null,
    [filteredSiteRows, selectedSiteId],
  )

  async function loadAssignmentsForDate(dateIso, sites = allSites) {
    const empty = buildEmptyAssignmentsBySite(sites)
    try {
      const payload = await getDeploymentAssignments(dateIso)
      const merged = applyAssignmentRows(empty, payload.assignments)
      setAssignmentsBySite(merged)
      setOfficerToSite(buildOfficerToSiteIndex(merged))
      setDirty(false)
      setStatus(`Showing deployment board for ${dateIso} (Singapore).`)
    } catch (err) {
      setAssignmentsBySite(empty)
      setOfficerToSite({})
      setDirty(false)
      setStatus(`Unable to load deployment assignments: ${err.message}`)
    }
  }

  async function loadDoor4Flights() {
    setIsLoadingDoor4Flights(true)
    setDoor4FlightStatus('Loading Door 4 flights...')
    try {
      const payload = await getDoor4DepartureFlights(selectedDate, door4FlightNo)
      const rows = getFlightRows(payload)
      setDoor4Flights(rows)
      setDoor4FlightStatus(`Loaded ${rows.length} Door 4 flight record${rows.length === 1 ? '' : 's'} for ${selectedDate}.`)
    } catch (err) {
      setDoor4Flights([])
      setDoor4FlightStatus(`Unable to load Door 4 flights: ${err.message}`)
    } finally {
      setIsLoadingDoor4Flights(false)
    }
  }

  useEffect(() => {
    async function load() {
      setStatus('Loading deployment sites and officers...')
      try {
        const [sites, officers] = await Promise.all([listDeployments(), fetchAllOfficers()])
        const safeSites = sites || []
        setAllSites(safeSites)
        setAllOfficers(officers || [])
        await loadAssignmentsForDate(selectedDate, safeSites)
      } catch (err) {
        setAllSites([])
        setAllOfficers([])
        setAssignmentsBySite({})
        setOfficerToSite({})
        setStatus(`Unable to load deployment board: ${err.message}`)
      }
    }

    load()
  }, [])

  useEffect(() => {
    if (!allSites.length) return
    loadAssignmentsForDate(selectedDate)
  }, [selectedDate])

  useEffect(() => {
    if (!scope.locked) return
    if (!scopedSiteId) {
      setSelectedSiteId('')
      setStatus(`Configured site for ${scope.label} is not active on ${selectedDate}.`)
      return
    }
    setSelectedSiteId(scopedSiteId)
    setSiteSearch('')
  }, [scope, scopedSiteId, selectedDate])

  useEffect(() => {
    if (routeScopeKey !== 'door-4') return
    loadDoor4Flights()
  }, [routeScopeKey, selectedDate])

  function removeOfficerAssignment(officerId, assignments, officerIndex) {
    const previousSiteId = officerIndex[officerId]
    if (!previousSiteId) return
    const slots = assignments[previousSiteId]
    if (!slots) return
    const slotIndex = slots.findIndex((value) => value === officerId)
    if (slotIndex >= 0) slots[slotIndex] = null
    delete officerIndex[officerId]
  }

  function assignOfficer(officerId, siteId, slotIndex = null) {
    const siteKey = String(siteId)
    const site = allSites.find((item) => String(item.id) === siteKey)
    const slotCapacity = getSiteSlotCapacity(site)

    setAssignmentsBySite((prevAssignments) => {
      const assignments = Object.fromEntries(
        Object.entries(prevAssignments).map(([k, v]) => [k, [...v]])
      )
      if (!assignments[siteKey]) assignments[siteKey] = Array.from({ length: slotCapacity }, () => null)

      setOfficerToSite((prevOfficerIndex) => {
        const officerIndex = { ...prevOfficerIndex }
        removeOfficerAssignment(officerId, assignments, officerIndex)

        const slots = assignments[siteKey]
        let targetIndex = Number.isInteger(slotIndex) ? slotIndex : -1
        if (targetIndex < 0 || targetIndex >= slots.length || slots[targetIndex] !== null) {
          targetIndex = slots.findIndex((value) => value === null)
        }

        if (targetIndex < 0) {
          setStatus(`This site is full (${slots.length}/${slots.length}). Remove one officer or drop to another site.`)
          return officerIndex
        }

        slots[targetIndex] = officerId
        officerIndex[officerId] = siteKey
        return officerIndex
      })

      return assignments
    })

    setDirty(true)
  }

  function unassignOfficer(officerId) {
    setAssignmentsBySite((prevAssignments) => {
      const assignments = Object.fromEntries(
        Object.entries(prevAssignments).map(([k, v]) => [k, [...v]])
      )
      setOfficerToSite((prevOfficerIndex) => {
        const officerIndex = { ...prevOfficerIndex }
        removeOfficerAssignment(officerId, assignments, officerIndex)
        return officerIndex
      })
      return assignments
    })
    setDirty(true)
  }

  async function saveAssignments() {
    setIsSaving(true)
    setStatus('Saving deployment assignments...')
    try {
      const rows = toAssignmentRows(assignmentsBySite)
      const payload = await replaceDeploymentAssignments({
        deployment_date: selectedDate,
        assignments: rows,
      })
      const merged = applyAssignmentRows(buildEmptyAssignmentsBySite(allSites), payload.assignments)
      setAssignmentsBySite(merged)
      setOfficerToSite(buildOfficerToSiteIndex(merged))
      setDirty(false)
      setStatus(`Deployment assignments saved for ${selectedDate} (Singapore).`)
    } catch (err) {
      setStatus(`Unable to save deployment assignments: ${err.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  function reloadAssignments() {
    loadAssignmentsForDate(selectedDate)
  }

  function onOfficerDragStart(event, officerId) {
    event.dataTransfer.setData('text/plain', String(officerId))
    event.dataTransfer.effectAllowed = 'move'
  }

  function allowDrop(event) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  function onDropToSlot(event, siteId, slotIndex) {
    event.preventDefault()
    const officerId = event.dataTransfer.getData('text/plain')
    if (!officerId) return
    assignOfficer(officerId, siteId, slotIndex)
  }

  function onDropToPool(event) {
    event.preventDefault()
    const officerId = event.dataTransfer.getData('text/plain')
    if (!officerId) return
    unassignOfficer(officerId)
  }

  const availableOfficers = allOfficers.filter((officer) => !officerToSite[String(officer.id)])

  return (
    <>
      <section className="panel">
        <div className="toolbar-row">
          <label>
            Deployment Date (SG)
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </label>
          <button type="button" className="btn-secondary" onClick={reloadAssignments}>
            Reload
          </button>
          <button type="button" onClick={saveAssignments} disabled={!dirty || isSaving}>
            {isSaving ? 'Saving...' : 'Save Assignments'}
          </button>
          {!scope.locked && (
            <input
              placeholder="Search site"
              value={siteSearch}
              onChange={(e) => setSiteSearch(e.target.value)}
              style={{ minWidth: 180 }}
            />
          )}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={gapOnly} onChange={(e) => setGapOnly(e.target.checked)} />
            Gap only
          </label>
          {!scope.locked && (
            <SearchDropdown
              options={activeSites.map((site) => ({ value: String(site.id), label: site.site_name }))}
              value={selectedSiteId}
              onChange={setSelectedSiteId}
              placeholder="Select Site *"
              searchable={false}
              minWidth={260}
            />
          )}
          {routeScopeKey === 'door-4' && (
            <>
              <input
                placeholder="Flight No. (optional)"
                value={door4FlightNo}
                onChange={(e) => setDoor4FlightNo(e.target.value)}
                style={{ minWidth: 180 }}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={loadDoor4Flights}
                disabled={isLoadingDoor4Flights}
              >
                {isLoadingDoor4Flights ? 'Loading Flights...' : 'Load Flights'}
              </button>
            </>
          )}
        </div>
        {scope.locked && (
          <div className="status">
            Scope: <strong>{scope.label}</strong>
          </div>
        )}
        {status && <div className={`alert alert-${alertType(status)}`}>{status}</div>}
        {routeScopeKey === 'door-4' && door4FlightStatus && (
          <div className={`alert alert-${alertType(door4FlightStatus)}`}>{door4FlightStatus}</div>
        )}
      </section>

      {routeScopeKey === 'door-4' && (
        <section className="panel door4-flight-board">
          <div className="door4-board-header">
            <h2>Door 4 Departure Flights</h2>
            <span>{selectedDate}</span>
          </div>
          {door4Flights.length === 0 ? (
            <div className="door4-empty">No flight records loaded.</div>
          ) : (
            <div className="door4-flight-list">
              {door4Flights.map((flight, index) => {
                const item = getFlightDisplay(flight)
                return (
                  <article
                    key={`${item.flight}-${item.gate}-${index}`}
                    className={`door4-flight-row${index === 0 ? ' is-highlighted' : ''}`}
                  >
                    <span className="door4-terminal-pill">{item.terminal}</span>
                    <div className="door4-gate-block">
                      <strong>{item.gate}</strong>
                      <span>{item.flight}</span>
                    </div>
                    <span className="door4-status-pill">{item.status}</span>
                    <div className="door4-time-pair">
                      <div>
                        <span>ETA</span>
                        <strong>{item.eta}</strong>
                      </div>
                      <div>
                        <span>SCH</span>
                        <strong>{item.scheduled}</strong>
                      </div>
                    </div>
                    <strong className="door4-officer">{item.officer}</strong>
                    <span className="door4-chip door4-chip-warning">Late Not Allowed</span>
                    <span className="door4-chip door4-chip-progress">In Progress</span>
                    <span className="door4-chip door4-chip-committed">Committed</span>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}

      {!selectedSiteId ? (
        <section className="panel">
          <div className="empty-state">Please select a site first to view the deployment board.</div>
        </section>
      ) : (
      <section className="board-grid">
        <div className="panel officer-pool" onDragOver={allowDrop} onDrop={onDropToPool}>
          <h2>Available Officers ({availableOfficers.length})</h2>
          <div className="pool-list">
            {availableOfficers.length === 0 ? (
              <div className="muted">No available officers. All assigned or none loaded.</div>
            ) : (
              availableOfficers.map((officer) => (
                <article
                  key={officer.id}
                  className="officer-chip"
                  draggable
                  onDragStart={(event) => onOfficerDragStart(event, officer.id)}
                >
                  <strong>{officer.name} ({officer.staff_id})</strong>
                  <span>Team: {officer.team} · Rank: {officer.rank}</span>
                  <span>Start: {officer.start_date || '—'} · Pattern: {officer.shift_pattern}</span>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="panel">
          <h2>Site Queue ({filteredSiteRows.length}/{activeSites.length})</h2>
          {filteredSiteRows.length === 0 ? (
            <div className="muted">No sites active for the selected date.</div>
          ) : (
            <div className="board-ops-grid">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Site</th>
                      <th>Mode</th>
                      <th>Required</th>
                      <th>Assigned</th>
                      <th>Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSiteRows.map((row) => (
                      <tr
                        key={row.site.id}
                        onClick={() => setSelectedSiteId(row.site.id)}
                        style={{
                          cursor: 'pointer',
                          background:
                            String(selectedSiteRow?.site?.id) === String(row.site.id)
                              ? 'var(--accent-subtle)'
                              : undefined,
                        }}
                      >
                        <td>{row.site.site_name}</td>
                        <td>{row.site.mode}</td>
                        <td>{row.slotCapacity}</td>
                        <td>{row.assignedCount}</td>
                        <td style={{ fontWeight: 700, color: row.gap > 0 ? 'var(--danger-text)' : 'var(--success-text)' }}>
                          {row.gap}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedSiteRow && (
                <article className="site-card">
                  <header>
                    <h3>{selectedSiteRow.site.site_name}</h3>
                    <span className={`badge badge-mode-${selectedSiteRow.site.mode.toLowerCase()}`}>
                      {selectedSiteRow.site.mode}
                    </span>
                  </header>
                  <p>Deployment Days: {(selectedSiteRow.site.deployment_days || []).join(', ') || '—'}</p>
                  <p>
                    Adhoc Window:
                    {' '}
                    {selectedSiteRow.site.mode === 'ADHOC'
                      ? `${formatSgDateTime(selectedSiteRow.site.adhoc_start_at)} → ${formatSgDateTime(selectedSiteRow.site.adhoc_end_at)}`
                      : '—'}
                  </p>
                  <p>Last Updated: {formatSgDateTime(selectedSiteRow.site.updated_at)}</p>
                  <p>
                    <strong style={{ color: selectedSiteRow.gap > 0 ? 'var(--danger-text)' : 'var(--text-secondary)' }}>
                      Assigned: {selectedSiteRow.assignedCount}/{selectedSiteRow.slotCapacity}
                    </strong>
                  </p>
                  <div className="slot-grid">
                    {selectedSiteRow.slots.map((officerId, index) => {
                      const officer = allOfficers.find((item) => String(item.id) === String(officerId))
                      return (
                        <div
                          key={`${selectedSiteRow.site.id}-${index}`}
                          className="slot"
                          onDragOver={allowDrop}
                          onDrop={(event) => onDropToSlot(event, selectedSiteRow.site.id, index)}
                        >
                          {officer && (
                            <div
                              className="assigned-chip"
                              draggable
                              onDragStart={(event) => onOfficerDragStart(event, officer.id)}
                              title={`${officer.name} (${officer.staff_id})`}
                            >
                              {officer.name} ({officer.staff_id})
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </article>
              )}
            </div>
          )}
        </div>
      </section>
      )}
    </>
  )
}
