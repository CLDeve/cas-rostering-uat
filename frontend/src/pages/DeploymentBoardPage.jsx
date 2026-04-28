import { useEffect, useMemo, useState } from 'react'
import {
  getDeploymentAssignments,
  listDeployments,
  listEmployees,
  replaceDeploymentAssignments,
} from '../api'

const SLOT_CAPACITY = 25

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
    assignments[String(site.id)] = Array.from({ length: SLOT_CAPACITY }, () => null)
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
    if (Number.isNaN(slotIndex) || slotIndex < 0 || slotIndex >= SLOT_CAPACITY) continue
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

export default function DeploymentBoardPage() {
  const [status, setStatus] = useState('Loading deployment board...')
  const [selectedDate, setSelectedDate] = useState(todaySgIso())
  const [allSites, setAllSites] = useState([])
  const [allOfficers, setAllOfficers] = useState([])
  const [assignmentsBySite, setAssignmentsBySite] = useState({})
  const [officerToSite, setOfficerToSite] = useState({})
  const [dirty, setDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const activeSites = useMemo(
    () => filterSitesForDate(allSites, selectedDate),
    [allSites, selectedDate]
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

    setAssignmentsBySite((prevAssignments) => {
      const assignments = Object.fromEntries(
        Object.entries(prevAssignments).map(([k, v]) => [k, [...v]])
      )
      if (!assignments[siteKey]) assignments[siteKey] = Array.from({ length: SLOT_CAPACITY }, () => null)

      setOfficerToSite((prevOfficerIndex) => {
        const officerIndex = { ...prevOfficerIndex }
        removeOfficerAssignment(officerId, assignments, officerIndex)

        const slots = assignments[siteKey]
        let targetIndex = Number.isInteger(slotIndex) ? slotIndex : -1
        if (targetIndex < 0 || targetIndex >= SLOT_CAPACITY || slots[targetIndex] !== null) {
          targetIndex = slots.findIndex((value) => value === null)
        }

        if (targetIndex < 0) {
          setStatus('This site is full (25/25). Remove one officer or drop to another site.')
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
        </div>
        {status && <div className={`alert alert-${alertType(status)}`}>{status}</div>}
      </section>

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
          <h2>Site Cards ({activeSites.length} active)</h2>
          {activeSites.length === 0 ? (
            <div className="muted">No sites active for the selected date.</div>
          ) : (
            <div className="site-list">
              {activeSites.map((site) => {
                const siteKey = String(site.id)
                const slots = assignmentsBySite[siteKey] || Array.from({ length: SLOT_CAPACITY }, () => null)
                const assignedCount = slots.filter((x) => x !== null).length
                const adhocWindow =
                  site.mode === 'ADHOC'
                    ? `${formatSgDateTime(site.adhoc_start_at)} → ${formatSgDateTime(site.adhoc_end_at)}`
                    : '—'

                return (
                  <article key={site.id} className="site-card">
                    <header>
                      <h3>{site.site_name}</h3>
                      <span className={`badge badge-mode-${site.mode.toLowerCase()}`}>
                        {site.mode}
                      </span>
                    </header>
                    <p>Deployment Days: {(site.deployment_days || []).join(', ') || '—'}</p>
                    <p>Adhoc Window: {adhocWindow}</p>
                    <p>Last Updated: {formatSgDateTime(site.updated_at)}</p>
                    <p>
                      <strong style={{ color: assignedCount >= SLOT_CAPACITY ? 'var(--danger-text)' : 'var(--text-secondary)' }}>
                        Assigned: {assignedCount}/{SLOT_CAPACITY}
                      </strong>
                    </p>
                    <div className="slot-grid">
                      {slots.map((officerId, index) => {
                        const officer = allOfficers.find((item) => String(item.id) === String(officerId))
                        return (
                          <div
                            key={`${site.id}-${index}`}
                            className="slot"
                            onDragOver={allowDrop}
                            onDrop={(event) => onDropToSlot(event, site.id, index)}
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
                )
              })}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
