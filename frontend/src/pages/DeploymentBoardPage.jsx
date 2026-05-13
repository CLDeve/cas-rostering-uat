import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Radio, Sparkles, XCircle } from 'lucide-react'
import {
  getDoor4DepartureFlights,
  getDeploymentAssignments,
  listDeployments,
  listEmployees,
  planDoor4Agent,
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

function getFlightTimeValue(row, keys) {
  for (const key of keys) {
    const value = String(key).includes('.') ? readPath(row, key) : row?.[key]
    if (value === undefined || value === null || value === '') continue
    const text = String(value).trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) continue
    if (String(key).toLowerCase().includes('date') && /[T\s]00:00(?::00)?/.test(text)) continue
    return text
  }
  return '—'
}

function getFlightDateIso(row) {
  const raw = getFlightValue(row, ['tixdate', 'scheduled_date', 'estimated_date', 'display_date'])
  const text = String(raw || '').trim()
  const isDateTimeLike = /[T\s]\d{2}:\d{2}/.test(text) || /Z$/.test(text) || /[+-]\d{2}:?\d{2}$/.test(text)
  if (!isDateTimeLike) {
    const match = text.match(/^(\d{4}-\d{2}-\d{2})$/)
    if (match) return match[1]
  }
  const date = new Date(text)
  if (!Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Singapore',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  }
  return ''
}

function formatFlightTime(value) {
  if (!value || value === '—') return '—'
  const compact = String(value).trim().match(/^(\d{2})(\d{2})$/)
  if (compact) return `${compact[1]}:${compact[2]}`
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 5)
  return new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function parseClockMinutes(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

function normalizeTerminalValue(value) {
  const raw = String(value || '').trim().toUpperCase()
  if (!raw || raw === '—' || raw === 'T?') return ''
  const direct = raw.match(/^T?([1-4])$/)
  if (direct) return `T${direct[1]}`
  const prefixed = raw.match(/^TERMINAL\s*([1-4])$/)
  if (prefixed) return `T${prefixed[1]}`
  return raw
}

function isAssignableFlightStatus(status) {
  const text = String(status || '').toLowerCase()
  return !text.includes('cancel')
}

function compareDoor4Flights(a, b) {
  const aDisplay = getFlightDisplay(a)
  const bDisplay = getFlightDisplay(b)
  const aDate = getFlightDateIso(a)
  const bDate = getFlightDateIso(b)
  const aEta = parseClockMinutes(aDisplay.eta)
  const bEta = parseClockMinutes(bDisplay.eta)
  const aSch = parseClockMinutes(aDisplay.scheduled)
  const bSch = parseClockMinutes(bDisplay.scheduled)
  return String(aDate).localeCompare(String(bDate))
    || ((aEta ?? Number.MAX_SAFE_INTEGER) - (bEta ?? Number.MAX_SAFE_INTEGER))
    || ((aSch ?? Number.MAX_SAFE_INTEGER) - (bSch ?? Number.MAX_SAFE_INTEGER))
    || String(aDisplay.flight || '').localeCompare(String(bDisplay.flight || ''))
    || String(aDisplay.gate || '').localeCompare(String(bDisplay.gate || ''))
}

function getFlightDisplay(row) {
  const gate = getFlightValue(row, [
    'display_gate',
    'current_gate',
    'display_parkingstand',
    'scheduled_gate',
    'gate',
    'gateno',
    'gate_no',
    'gateNo',
    'gateNumber',
    'gatenumber',
    'boardingGate',
    'assignedGate',
    'stand',
    'bay',
    'arrivalGate',
    'arrival_gate',
  ])
  const terminal = getFlightValue(row, ['display_terminal', 'terminal', 'terminalCode', 'terminalNo', 'terminal_no', 'term'])
  const flight = getFlightValue(row, ['flightno', 'flight_no', 'flightNumber', 'flight'])
  const eta = getFlightTimeValue(row, [
    'ext_display_time',
    'display_time',
    'estimated_time',
    'eta',
    'ata',
    'estimatedTime',
    'estimated_date',
    'estimated_arrival_date',
    'estimatedArrivalDate',
    'operationalTimes.estimatedGateArrival.dateLocal',
    'estimatedArrivalTime',
    'estimated_arrival_time',
    'estimatedDepartureTime',
    'estimatedDeparture',
    'etd',
    'operationalTimes.estimatedGateDeparture.dateLocal',
  ])
  const scheduled = getFlightTimeValue(row, [
    'scheduled_time',
    'sch',
    'sta',
    'std',
    'scheduledTime',
    'scheduled_date',
    'scheduled_arrival_date',
    'scheduledArrivalDate',
    'operationalTimes.scheduledGateArrival.dateLocal',
    'scheduledArrivalTime',
    'scheduled_arrival_time',
    'scheduledDepartureTime',
    'scheduledDeparture',
    'operationalTimes.scheduledGateDeparture.dateLocal',
  ])
  const officer = getFlightValue(row, ['officer', 'officerName', 'assignedOfficer', 'staffName', 'name'])
  const door = getFlightValue(row, ['door', 'doorNo', 'door_no', 'deploymentDoor', 'assignment'])
  const status = getFlightValue(row, ['flight_status', 'status', 'flightStatus', 'flightstatus', 'remarks'])

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

function normalizeKeyToken(value) {
  const text = String(value || '').trim()
  return text && text !== '—' ? text.toUpperCase() : '-'
}

function getFlightRowKey(row, index = 0) {
  const item = getFlightDisplay(row)
  const date = getFlightDateIso(row) || getFlightValue(row, ['tixdate', 'scheduled_date', 'estimated_date', 'display_date'])
  const explicitId = getFlightValue(row, ['id', 'flight_id', 'flightId', 'leg_id', 'legId', 'movement_id', 'movementId'])
  if (explicitId !== '—') {
    return `id:${normalizeKeyToken(explicitId)}`
  }
  const signature = [
    normalizeKeyToken(item.flight),
    normalizeKeyToken(item.terminal),
    normalizeKeyToken(date),
    normalizeKeyToken(item.scheduled),
    normalizeKeyToken(item.eta),
  ].join('|')
  return `sig:${signature}|idx:${index}`
}

export default function DeploymentBoardPage({ scopeKeyOverride = '' }) {
  const params = useParams()
  const routeScopeKey = String(scopeKeyOverride || params.scopeKey || 'all').toLowerCase()
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
  const [officerSearch, setOfficerSearch] = useState('')
  const [redCrossOfficerIds, setRedCrossOfficerIds] = useState([])
  const [redCrossExpanded, setRedCrossExpanded] = useState(false)
  const [door4TableSearch, setDoor4TableSearch] = useState('')
  const [door4HiddenRevealCount, setDoor4HiddenRevealCount] = useState(0)
  const [agenticAiEnabled, setAgenticAiEnabled] = useState(false)
  const [flightAssignments, setFlightAssignments] = useState({})
  const [flightBeaconDetected, setFlightBeaconDetected] = useState({})
  const [flightRemarks, setFlightRemarks] = useState({})
  const [flightTasks, setFlightTasks] = useState({})
  const [flightGateChanges, setFlightGateChanges] = useState({})

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
    setDoor4HiddenRevealCount(0)
    try {
      const payload = await getDoor4DepartureFlights(selectedDate, door4FlightNo)
      const rows = getFlightRows(payload)
      const previousGateByKey = new Map(
        door4Flights.map((row, index) => [getFlightRowKey(row, index), getFlightDisplay(row).gate])
      )
      const nextGateChanges = {}
      rows.forEach((row, index) => {
        const key = getFlightRowKey(row, index)
        const nextGate = getFlightDisplay(row).gate
        const previousGate = previousGateByKey.get(key)
        if (previousGate && previousGate !== '—' && nextGate && nextGate !== '—' && previousGate !== nextGate) {
          nextGateChanges[key] = { previousGate, nextGate }
        }
      })
      setDoor4Flights(rows)
      setFlightRemarks({})
      setFlightTasks({})
      setFlightGateChanges(nextGateChanges)
      const changedCount = Object.keys(nextGateChanges).length
      setDoor4FlightStatus(
        `Loaded ${rows.length} Door 4 flight record${rows.length === 1 ? '' : 's'} for ${selectedDate}.${changedCount > 0 ? ` Gate changes detected: ${changedCount}.` : ''}`
      )
    } catch (err) {
      setDoor4Flights([])
      setFlightRemarks({})
      setFlightTasks({})
      setFlightGateChanges({})
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

  function onDropToRedCross(event) {
    event.preventDefault()
    const officerId = event.dataTransfer.getData('text/plain')
    if (!officerId) return
    setRedCrossOfficerIds((prev) => (prev.includes(String(officerId)) ? prev : [...prev, String(officerId)]))
    setFlightAssignments((prev) => {
      const next = { ...prev }
      Object.entries(next).forEach(([key, assignedId]) => {
        if (String(assignedId) === String(officerId)) delete next[key]
      })
      return next
    })
  }

  function onDropToFlight(event, flightKey) {
    event.preventDefault()
    const officerId = event.dataTransfer.getData('text/plain')
    if (!officerId) return
    if (redCrossOfficerIds.includes(String(officerId))) return
    const targetFlight = displayedDoor4Flights.find((flight, index) => getFlightRowKey(flight, index) === flightKey)
    if (targetFlight && !isAssignableFlightStatus(getFlightDisplay(targetFlight).status)) {
      setDoor4FlightStatus('Cancelled flights cannot receive manpower assignments.')
      return
    }
    setFlightAssignments((prev) => ({ ...prev, [flightKey]: String(officerId) }))
  }

  function clearFlightAssignment(flightKey) {
    setFlightAssignments((prev) => {
      if (!prev[flightKey]) return prev
      const next = { ...prev }
      delete next[flightKey]
      return next
    })
  }

  function toggleFlightBeaconDetected(flightKey) {
    setFlightBeaconDetected((prev) => ({ ...prev, [flightKey]: !prev[flightKey] }))
  }

  function setFlightRemark(flightKey, value) {
    setFlightRemarks((prev) => ({ ...prev, [flightKey]: value }))
  }

  function setFlightTask(flightKey, value) {
    setFlightTasks((prev) => ({ ...prev, [flightKey]: value }))
  }

  const isDoor4Scope = routeScopeKey === 'door-4'
  const availableOfficers = useMemo(
    () => allOfficers.filter((officer) => !officerToSite[String(officer.id)]),
    [allOfficers, officerToSite],
  )
  const redCrossOfficers = useMemo(
    () => availableOfficers.filter((officer) => redCrossOfficerIds.includes(String(officer.id))),
    [availableOfficers, redCrossOfficerIds],
  )
  const visibleAvailableOfficers = useMemo(() => {
    const q = officerSearch.trim().toLowerCase()
    return availableOfficers.filter((officer) => {
      if (redCrossOfficerIds.includes(String(officer.id))) return false
      if (!q) return true
      const name = String(officer.name || '').toLowerCase()
      const staffId = String(officer.staff_id || '').toLowerCase()
      return name.includes(q) || staffId.includes(q)
    })
  }, [availableOfficers, redCrossOfficerIds, officerSearch])
  const selectedDateDoor4Flights = useMemo(
    () => door4Flights.filter((row) => {
      const flightDate = getFlightDateIso(row)
      if (!flightDate) return true
      return flightDate === selectedDate
    }),
    [door4Flights, selectedDate],
  )
  const hiddenDoor4Flights = useMemo(
    () => selectedDateDoor4Flights.filter((row) => String(getFlightDisplay(row).status || '').toLowerCase().includes('departed')),
    [selectedDateDoor4Flights],
  )
  const visibleDoor4Flights = useMemo(
    () => selectedDateDoor4Flights.filter((row) => !String(getFlightDisplay(row).status || '').toLowerCase().includes('departed')),
    [selectedDateDoor4Flights],
  )
  const displayedDoor4Flights = useMemo(
    () => [...visibleDoor4Flights, ...hiddenDoor4Flights.slice(0, door4HiddenRevealCount)].sort(compareDoor4Flights),
    [visibleDoor4Flights, hiddenDoor4Flights, door4HiddenRevealCount],
  )
  const filteredDisplayedDoor4Flights = useMemo(() => {
    const q = door4TableSearch.trim().toLowerCase()
    if (!q) return displayedDoor4Flights
    return displayedDoor4Flights.filter((row) => {
      const item = getFlightDisplay(row)
      return String(item.gate || '').toLowerCase().includes(q) || String(item.flight || '').toLowerCase().includes(q)
    })
  }, [displayedDoor4Flights, door4TableSearch])
  const door4FlightsWithDateBreaks = useMemo(() => {
    const rows = []
    let lastDate = ''
    filteredDisplayedDoor4Flights.forEach((flight, index) => {
      const flightDate = getFlightDateIso(flight) || selectedDate
      if (flightDate !== lastDate) {
        rows.push({ type: 'date', key: `date-${flightDate}`, label: flightDate })
        lastDate = flightDate
      }
      rows.push({
        type: 'flight',
        key: getFlightRowKey(flight, index),
        flight,
      })
    })
    return rows
  }, [filteredDisplayedDoor4Flights, selectedDate])

  const gateAssignedCountByOfficer = useMemo(() => {
    const counts = {}
    Object.values(flightAssignments).forEach((officerId) => {
      if (!officerId) return
      const key = String(officerId)
      counts[key] = (counts[key] || 0) + 1
    })
    return counts
  }, [flightAssignments])

  useEffect(() => {
    if (!displayedDoor4Flights.length) return
    const cancelledKeys = new Set(
      displayedDoor4Flights
        .map((flight, index) => ({ key: getFlightRowKey(flight, index), status: getFlightDisplay(flight).status }))
        .filter((item) => !isAssignableFlightStatus(item.status))
        .map((item) => item.key),
    )
    if (cancelledKeys.size === 0) return
    setFlightAssignments((prev) => {
      let changed = false
      const next = { ...prev }
      cancelledKeys.forEach((key) => {
        if (next[key]) {
          delete next[key]
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [displayedDoor4Flights])

  function applyDeterministicDoor4Plan(source = 'fallback') {
    const candidateOfficers = availableOfficers.filter((officer) => !redCrossOfficerIds.includes(String(officer.id)))
    if (candidateOfficers.length === 0) {
      setDoor4FlightStatus('Agentic AI found no available officers to assign.')
      return 0
    }

    const flightItems = displayedDoor4Flights
      .map((flight, index) => {
        const item = getFlightDisplay(flight)
        return {
          flight,
          item,
          key: getFlightRowKey(flight, index),
          etaMinutes: parseClockMinutes(item.eta),
        }
      })
      .filter(({ item }) => item.officer === 'Unassigned' && isAssignableFlightStatus(item.status))

    if (flightItems.length === 0) {
      setDoor4FlightStatus('Agentic AI found no unplanned Door 4 flights to assign.')
      return 0
    }

    const firstEta = flightItems
      .map((item) => item.etaMinutes)
      .filter((value) => value !== null)
      .sort((a, b) => a - b)[0]
    const windowEnd = firstEta === undefined ? null : firstEta + 120

    let assignedCount = 0
    let blockedByTerminal = 0
    const assignedCounts = { ...gateAssignedCountByOfficer }

    setFlightAssignments((prev) => {
      const next = { ...prev }
      flightItems.forEach(({ item, key, etaMinutes }) => {
        if (next[key]) return
        if (windowEnd !== null && etaMinutes !== null && etaMinutes > windowEnd) return

        const flightTerminal = normalizeTerminalValue(item.terminal)
        const eligible = candidateOfficers.filter((officer) => {
          const officerTerminal = normalizeTerminalValue(officer.terminal)
          return !flightTerminal || !officerTerminal || officerTerminal === flightTerminal
        })

        if (eligible.length === 0) {
          blockedByTerminal += 1
          return
        }

        const selectedOfficer = [...eligible].sort((a, b) => (
          (assignedCounts[String(a.id)] || 0) - (assignedCounts[String(b.id)] || 0)
          || String(a.name || '').localeCompare(String(b.name || ''))
        ))[0]
        next[key] = String(selectedOfficer.id)
        assignedCounts[String(selectedOfficer.id)] = (assignedCounts[String(selectedOfficer.id)] || 0) + 1
        assignedCount += 1
      })
      return assignedCount > 0 ? next : prev
    })

    const reason = blockedByTerminal > 0 ? `, terminal blocked ${blockedByTerminal}` : ''
    const mode = source === 'auto' ? 'Agentic AI auto-planned' : 'Agentic AI fallback planned'
    setDoor4FlightStatus(`${mode} ${assignedCount} Door 4 flight assignment${assignedCount === 1 ? '' : 's'}${reason}.`)
    return assignedCount
  }

  async function runDoor4AgenticPlan(source = 'manual') {
    if (!isDoor4Scope) return

    const flights = displayedDoor4Flights.map((flight, index) => {
      const item = getFlightDisplay(flight)
      return {
        flight_key: getFlightRowKey(flight, index),
        flight_no: item.flight,
        gate: item.gate === '—' ? null : item.gate,
        terminal: item.terminal === 'T?' ? null : item.terminal,
        eta: item.eta === '—' ? null : item.eta,
        sch: item.scheduled === '—' ? null : item.scheduled,
        status: item.status,
        current_officer_text: item.officer === 'Unassigned' ? null : item.officer,
      }
    })
    const officers = availableOfficers.map((officer) => ({
      id: String(officer.id),
      staff_id: String(officer.staff_id || ''),
      name: String(officer.name || ''),
      terminal: officer.terminal || null,
      team: officer.team || null,
      rank: officer.rank || null,
      assigned_count: gateAssignedCountByOfficer[String(officer.id)] || 0,
    }))

    try {
      setDoor4FlightStatus('Agentic AI planning Door 4 flights with OpenAI...')
      const result = await planDoor4Agent({
        deployment_date: selectedDate,
        planning_window_minutes: 120,
        flights,
        officers,
        assignments: flightAssignments,
        red_cross_officer_ids: redCrossOfficerIds.map(String),
        max_assignments: 80,
      })
      const accepted = Array.isArray(result.assignments) ? result.assignments : []
      if (accepted.length > 0) {
        setFlightAssignments((prev) => {
          const next = { ...prev }
          accepted.forEach((row) => {
            if (row?.flight_key && row?.officer_id) next[row.flight_key] = String(row.officer_id)
          })
          return next
        })
      }
      const blockedCount = Array.isArray(result.blocked) ? result.blocked.length : 0
      const rejectedCount = Array.isArray(result.rejected) ? result.rejected.length : 0
      const mode = source === 'auto' ? 'Agentic AI auto-planned' : 'Agentic AI planned'
      setDoor4FlightStatus(`${mode} ${accepted.length} Door 4 flight assignment${accepted.length === 1 ? '' : 's'} with ${result.model || 'OpenAI'}. Blocked ${blockedCount}, rejected ${rejectedCount}.`)
    } catch (err) {
      applyDeterministicDoor4Plan('fallback')
      setDoor4FlightStatus(`OpenAI Door 4 agent unavailable: ${err.message}. Fallback planner applied.`)
    }
  }

  useEffect(() => {
    if (!agenticAiEnabled || !isDoor4Scope || isLoadingDoor4Flights) return
    void runDoor4AgenticPlan('auto')
  }, [agenticAiEnabled, isDoor4Scope, isLoadingDoor4Flights, door4Flights.length, redCrossOfficerIds.length, availableOfficers.length])

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

      {isDoor4Scope ? (
        <section className="door4-workspace-grid">
          <article className="panel door4-pool" onDragOver={allowDrop} onDrop={onDropToPool}>
            <div className="door4-pool-header">
              <h3>{redCrossExpanded ? `Red Cross Officers (${redCrossOfficers.length})` : `Available Officers (${visibleAvailableOfficers.length})`}</h3>
              <button type="button" className="btn-secondary">Add Officer</button>
            </div>
            <input
              className="door4-officer-search"
              placeholder="Search name or staff ID"
              value={officerSearch}
              onChange={(e) => setOfficerSearch(e.target.value)}
            />
            <div className="door4-red-cross-zone" onDragOver={allowDrop} onDrop={onDropToRedCross}>
              <div className="door4-red-cross-header" onClick={() => setRedCrossExpanded((v) => !v)}>
                <XCircle size={14} />
                <strong>Red Cross List ({redCrossOfficers.length})</strong>
                <span className="muted">{redCrossExpanded ? 'Hide' : 'Show'}</span>
              </div>
              <div className="muted">
                {redCrossOfficers.length === 0
                  ? 'Drag officer here to exclude from available pool.'
                  : 'Officers hidden from available pool. Drop more here, or click Reset to restore all.'}
              </div>
            </div>
            {redCrossExpanded ? (
              redCrossOfficers.length === 0 ? (
                <div className="door4-empty">No officers in Red Cross list.</div>
              ) : (
                <div className="door4-manpower-cards">
                  {redCrossOfficers.map((officer) => (
                    <article key={`red-${officer.id}`} className="door4-manpower-card door4-manpower-card-redcross">
                      <div className="door4-manpower-card-head">
                        <strong>{officer.name}</strong>
                      </div>
                      <div className="door4-manpower-meta">
                        <span>Staff ID: {officer.staff_id}</span>
                        <span>Team: {officer.team}</span>
                        <span>Rank: {officer.rank}</span>
                        <span>Terminal: {officer.terminal || '—'}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )
            ) : (
              <div className="door4-manpower-cards">
                {visibleAvailableOfficers.map((officer) => (
                  <article
                    key={officer.id}
                    className="door4-manpower-card"
                    draggable
                    onDragStart={(event) => onOfficerDragStart(event, officer.id)}
                  >
                    <div className="door4-manpower-card-head">
                      <strong>{officer.name}</strong>
                      <span className="door4-manpower-gates">{gateAssignedCountByOfficer[String(officer.id)] || 0}</span>
                    </div>
                    <div className="door4-manpower-meta">
                      <span>Staff ID: {officer.staff_id}</span>
                      <span>Team: {officer.team}</span>
                      <span>Rank: {officer.rank}</span>
                      <span>Terminal: {officer.terminal || '—'}</span>
                      <span>Start: {officer.start_date || '—'}</span>
                      <span>End Shift: {officer.end_shift_time || '—'}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </article>

          <section className="panel door4-flight-board">
            <div className="door4-board-header">
              <h2>Door 4 Arrival Flights</h2>
              <div className="door4-board-header-right">
                <input
                  className="door4-table-search"
                  placeholder="Search gate or flight"
                  value={door4TableSearch}
                  onChange={(e) => setDoor4TableSearch(e.target.value)}
                />
                <span>{selectedDate} · Departed Hidden {hiddenDoor4Flights.length} · Unhidden {Math.min(door4HiddenRevealCount, hiddenDoor4Flights.length)}/{hiddenDoor4Flights.length}</span>
                <div className="door4-agentic-toggle">
                  <Sparkles size={14} strokeWidth={2.25} />
                  <span>Agentic AI</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={agenticAiEnabled}
                    className={`door4-switch${agenticAiEnabled ? ' is-on' : ''}`}
                    onClick={() => {
                      setAgenticAiEnabled((enabled) => {
                        const next = !enabled
                        if (next) {
                          window.setTimeout(() => {
                            void runDoor4AgenticPlan('manual')
                          }, 0)
                        } else {
                          setDoor4FlightStatus('Agentic AI switched off.')
                        }
                        return next
                      })
                    }}
                  >
                    <span className="door4-switch-state">{agenticAiEnabled ? 'ON' : 'OFF'}</span>
                    <span className="door4-switch-knob" />
                  </button>
                </div>
              </div>
            </div>
            <div className="toolbar-row" style={{ marginBottom: 6 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDoor4HiddenRevealCount((n) => Math.min(n + 5, hiddenDoor4Flights.length))}
                disabled={door4HiddenRevealCount >= hiddenDoor4Flights.length}
              >
                Unhide 5 Flights
              </button>
              <span className="muted">Hidden: {hiddenDoor4Flights.length} · Shown: {Math.min(door4HiddenRevealCount, hiddenDoor4Flights.length)}</span>
            </div>
            <div className="table-wrap door4-flight-table-wrap">
              <table className="door4-flight-table">
                <thead>
                  <tr>
                    <th>TERMINAL</th>
                    <th>GATE</th>
                    <th>FLIGHT</th>
                    <th>STATUS</th>
                    <th>ETA</th>
                    <th>SCH</th>
                    <th>OFFICER / DOOR</th>
                    <th>TASK</th>
                    <th>REMARKS</th>
                  </tr>
                </thead>
                <tbody>
                  {door4FlightsWithDateBreaks.map((entry) => {
                    if (entry.type === 'date') {
                      return (
                        <tr key={entry.key} className="door4-flight-break-row">
                          <td colSpan={9}>{entry.label}</td>
                        </tr>
                      )
                    }
                    const flight = entry.flight
                    const item = getFlightDisplay(flight)
                    const key = entry.key
                    const isCancelledFlight = !isAssignableFlightStatus(item.status)
                    const assignedOfficer = allOfficers.find((o) => String(o.id) === String(flightAssignments[key]))
                    const officerText = isCancelledFlight
                      ? 'Cancelled - no manpower'
                      : assignedOfficer ? `${assignedOfficer.name} (${assignedOfficer.staff_id})` : (item.officer === 'Unassigned' ? 'Drop officer here' : item.officer)
                    return (
                      <tr key={key} onDragOver={allowDrop} onDrop={(e) => onDropToFlight(e, key)}>
                        <td>{item.terminal}</td>
                        <td>
                          <div className="door4-gate-cell">
                            <span>{item.gate}</span>
                            {flightGateChanges[key] && (
                              <span className="door4-gate-change">
                                {flightGateChanges[key].previousGate} to {flightGateChanges[key].nextGate}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>{item.flight}</td>
                        <td><span className="badge badge-blue">{item.status}</span></td>
                        <td>{item.eta}</td>
                        <td>{item.scheduled}</td>
                        <td>
                          <div className="door4-flight-officer-cell">
                            <span>{officerText}</span>
                            {!isCancelledFlight && <div className="door4-flight-officer-actions">
                              <button type="button" className="door4-beacon-toggle" onClick={() => toggleFlightBeaconDetected(key)}>
                                <Radio size={14} className={`door4-flight-beacon-icon ${flightBeaconDetected[key] ? 'is-detected' : 'is-not-detected'}`} />
                              </button>
                              <span className="badge badge-blue">AI</span>
                              <button type="button" className="btn-secondary btn-sm" onClick={() => clearFlightAssignment(key)}>Clear</button>
                            </div>}
                          </div>
                        </td>
                        <td>
                          <input
                            type="text"
                            className="door4-task-input"
                            placeholder="Add task"
                            value={flightTasks[key] || ''}
                            onChange={(e) => setFlightTask(key, e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="door4-remarks-input"
                            placeholder="Add remarks"
                            value={flightRemarks[key] || ''}
                            onChange={(e) => setFlightRemark(key, e.target.value)}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      ) : !selectedSiteId ? (
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
