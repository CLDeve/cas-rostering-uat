import { useEffect, useMemo, useState } from 'react'
import {
  getDeploymentAssignments,
  listDeployments,
  listEmployees,
  replaceDeploymentAssignments,
} from '../api'

const DEFAULT_SLOT_CAPACITY = 25

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

export default function DeploymentBoardPage() {
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

  const filteredSiteRows = useMemo(() => {
    const q = siteSearch.trim().toLowerCase()
    return siteRows
      .filter((row) => {
        if (gapOnly && row.gap <= 0) return false
        if (!q) return true
        return String(row.site.site_name || '').toLowerCase().includes(q)
      })
      .sort((a, b) => b.gap - a.gap || a.site.site_name.localeCompare(b.site.site_name))
  }, [siteRows, siteSearch, gapOnly])

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
          <input
            placeholder="Search site"
            value={siteSearch}
            onChange={(e) => setSiteSearch(e.target.value)}
            style={{ minWidth: 180 }}
          />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={gapOnly} onChange={(e) => setGapOnly(e.target.checked)} />
            Gap only
          </label>
          <select
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            style={{ minWidth: 260 }}
          >
            <option value="">Select Site *</option>
            {activeSites.map((site) => (
              <option key={`site-pick-${site.id}`} value={String(site.id)}>
                {site.site_name}
              </option>
            ))}
          </select>
        </div>
        {status && <div className={`alert alert-${alertType(status)}`}>{status}</div>}
      </section>

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
