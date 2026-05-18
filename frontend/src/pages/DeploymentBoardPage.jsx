import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Sparkles, ThumbsUp, XCircle } from 'lucide-react'
import {
  getDoor4ArrivalFlights,
  getDoor4DepartureFlights,
  getDeploymentAssignments,
  listDeployments,
  listEmployees,
  planDoor4Agent,
  replaceDeploymentAssignments,
} from '../api'
import SearchDropdown from '../components/SearchDropdown'
import {
  PREBOARD_GATE_TYPE_STORAGE_KEY,
  findPreboardGateType,
  getPreboardGateTypeClass,
  readPreboardGateTypeRows,
} from '../data/preboardGateTypes'

const DEFAULT_SLOT_CAPACITY = 25
const PREBOARD_MAX_TEAMS_PER_FLIGHT = 5
const DOOR4_PLAN_STORAGE_KEY = 'door4_flight_assignments_by_date'
const DOOR4_PLAN_UPDATED_EVENT = 'door4-plan-updated'
const SCREENING_TYPE_OPTIONS = ['Enhanced Screening', 'Pat Down', 'Continuous Swab', 'Palm Swab']
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

function normalizeIsoDate(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const slash = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (slash) return `${slash[3]}-${slash[2]}-${slash[1]}`
  const dash = text.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (dash) return `${dash[3]}-${dash[2]}-${dash[1]}`
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed)
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

function normalizeFieldKey(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findNestedValueByKeys(row, keys) {
  const wanted = new Set(keys.map(normalizeFieldKey))
  const queue = [row]
  const seen = new Set()
  while (queue.length) {
    const current = queue.shift()
    if (!current || typeof current !== 'object') continue
    if (seen.has(current)) continue
    seen.add(current)
    if (Array.isArray(current)) {
      current.forEach((item) => queue.push(item))
      continue
    }
    for (const [rawKey, value] of Object.entries(current)) {
      const key = normalizeFieldKey(rawKey)
      if (wanted.has(key) && value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value)
      }
      if (value && typeof value === 'object') queue.push(value)
    }
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
  if (raw === '0' || raw === 'T0' || raw === 'TERMINAL 0') return 'T0'
  const direct = raw.match(/^T?([1-4])$/)
  if (direct) return `T${direct[1]}`
  const prefixed = raw.match(/^TERMINAL\s*([1-4])$/)
  if (prefixed) return `T${prefixed[1]}`
  return raw
}

function deriveTerminalFromGate(gateValue) {
  const text = String(gateValue || '').trim().toUpperCase()
  if (!text || text === '—') return ''
  const prefix = text.match(/^([A-Z])/)
  if (prefix) {
    const byPrefix = {
      A: 'T1',
      B: 'T1',
      C: 'T1',
      D: 'T1',
      E: 'T2',
      F: 'T2',
      G: 'T3',
      H: 'T4',
    }
    if (byPrefix[prefix[1]]) return byPrefix[prefix[1]]
  }
  const match = text.match(/(?:^|[^A-Z0-9])T([1-4])(?:[^0-9]|$)/) || text.match(/^([1-4])[A-Z0-9-]*$/)
  return match ? `T${match[1]}` : ''
}

function isAssignableFlightStatus(status) {
  const text = String(status || '').toLowerCase()
  return !text.includes('cancel')
}

function pseudoRandomPaxPercent(seed) {
  const text = String(seed || '')
  let hash = 0
  for (let i = 0; i < text.length; i += 1) hash = ((hash * 31) + text.charCodeAt(i)) >>> 0
  return hash % 101
}

function paxBadgeClass(percent) {
  if (percent <= 50) return 'badge-red'
  if (percent <= 89) return 'badge-amber'
  return 'badge-green'
}

function paxIconClass(percent) {
  if (percent <= 50) return 'door4-pax-icon-red'
  if (percent <= 89) return 'door4-pax-icon-amber'
  return 'door4-pax-icon-green'
}

function shouldShowPaxBadge(status) {
  const text = String(status || '').toLowerCase()
  if (text.includes('cancel')) return false
  if (text.includes('scheduled')) return false
  if (text.includes('new gate')) return false
  if (text.includes('re-timed') || text.includes('retimed') || text.includes('re timed')) return false
  return true
}

function statusBadgeClass(status) {
  const text = String(status || '').toLowerCase()
  if (text.includes('cancel')) return 'badge-red'
  if (text.includes('gate closing')) return 'badge-red'
  if (text.includes('gate open')) return 'badge-green'
  if (text.includes('new gate')) return 'badge-amber'
  if (text.includes('re-timed') || text.includes('retimed') || text.includes('re timed')) return 'badge-blue'
  if (text.includes('scheduled')) return 'badge-blue'
  if (text.includes('boarding')) return 'badge-amber'
  if (text.includes('last call')) return 'badge-amber'
  if (text.includes('landed')) return 'badge-blue'
  return 'badge-blue'
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
  const gateFromDirectKeys = getFlightValue(row, [
    'display_gate',
    'current_gate',
    'departure_gate',
    'dep_gate',
    'gate_display',
    'gate_display_name',
    'boarding_gate',
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
    'leg.gate',
    'flight.gate',
    'departure.gate',
  ])
  const terminalFromDirectKeys = getFlightValue(row, [
    'display_terminal',
    'terminal',
    'terminal_display',
    'terminal_display_name',
    'terminalCode',
    'terminal_code',
    'terminalName',
    'terminal_name',
    'terminalNo',
    'terminal_no',
    'term',
    'flightTerminal',
    'flight_terminal',
    'departureTerminal',
    'departure_terminal',
    'dep_terminal',
    'departure.terminal',
    'flight.terminal',
    'leg.terminal',
  ])
  const gate = gateFromDirectKeys !== '—'
    ? gateFromDirectKeys
    : findNestedValueByKeys(row, [
      'gate',
      'gateno',
      'gatenumber',
      'boardinggate',
      'departuregate',
      'displaygate',
      'currentgate',
    ])
  const terminal = terminalFromDirectKeys !== '—'
    ? terminalFromDirectKeys
    : findNestedValueByKeys(row, [
      'terminal',
      'terminalno',
      'terminalcode',
      'terminalname',
      'displayterminal',
      'departureterminal',
      'depterminal',
    ])
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
  const closeGate = getFlightValue(row, [
    'close_gate',
    'closing_gate',
    'closeGate',
    'closingGate',
    'gate_close',
    'gateClose',
    'close_gate_time',
    'closing_gate_time',
  ])
  const screeningType = getFlightValue(row, [
    'screening_type',
    'screeningType',
    'screen_type',
    'screenType',
    'security_screening_type',
    'screening',
  ])

  const normalizedTerminal = normalizeTerminalValue(terminal) || deriveTerminalFromGate(gate) || 'T?'

  return {
    gate,
    terminal: normalizedTerminal,
    flight,
    eta: formatFlightTime(eta),
    scheduled: formatFlightTime(scheduled),
    officer: officer === '—' && door === '—' ? 'Unassigned' : `${officer}${door === '—' ? '' : ` • ${door}`}`,
    status: status === '—' ? 'Landed' : status,
    closeGate,
    screeningType,
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
  const [door4PlanLoadedDate, setDoor4PlanLoadedDate] = useState('')
  const [flightBeaconDetected, setFlightBeaconDetected] = useState({})
  const [flightRemarks, setFlightRemarks] = useState({})
  const [flightScreeningSettings, setFlightScreeningSettings] = useState({})
  const [isScreeningEditorOpen, setIsScreeningEditorOpen] = useState(false)
  const [screeningEditorFlightKey, setScreeningEditorFlightKey] = useState('')
  const [screeningEditorFlightInput, setScreeningEditorFlightInput] = useState('')
  const [closeGateAssignments, setCloseGateAssignments] = useState({})
  const [closeGateEditorFlightKey, setCloseGateEditorFlightKey] = useState('')
  const [closeGateDraftType, setCloseGateDraftType] = useState('user')
  const [closeGateDraftValue, setCloseGateDraftValue] = useState('')
  const [flightGateChanges, setFlightGateChanges] = useState({})
  const [preboardManpowerView, setPreboardManpowerView] = useState('teams')
  const [preboardFlightTeams, setPreboardFlightTeams] = useState({})
  const [preboardGateTypeRows, setPreboardGateTypeRows] = useState(() => readPreboardGateTypeRows())
  const [selectedPreboardTerminals, setSelectedPreboardTerminals] = useState(['T1', 'T2', 'T3', 'T4'])
  const [officerTeamOverrides, setOfficerTeamOverrides] = useState({})
  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false)
  const [createTeamName, setCreateTeamName] = useState('')
  const [createTeamOfficerIds, setCreateTeamOfficerIds] = useState([])
  const isDoor4Scope = routeScopeKey === 'door-4' || routeScopeKey === 'preboard'
  const isPreboardScope = routeScopeKey === 'preboard'

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
    const safeDateIso = normalizeIsoDate(dateIso)
    if (!safeDateIso) {
      setStatus(`Invalid date "${dateIso}". Use YYYY-MM-DD.`)
      return
    }
    const empty = buildEmptyAssignmentsBySite(sites)
    try {
      const payload = await getDeploymentAssignments(safeDateIso)
      const merged = applyAssignmentRows(empty, payload.assignments)
      setAssignmentsBySite(merged)
      setOfficerToSite(buildOfficerToSiteIndex(merged))
      setDirty(false)
      setStatus(`Showing deployment board for ${safeDateIso} (Singapore).`)
    } catch (err) {
      setAssignmentsBySite(empty)
      setOfficerToSite({})
      setDirty(false)
      setStatus(`Unable to load deployment assignments: ${err.message}`)
    }
  }

  async function loadDoor4Flights() {
    const safeDateIso = normalizeIsoDate(selectedDate)
    if (!safeDateIso) {
      setDoor4FlightStatus(`Invalid date "${selectedDate}". Use YYYY-MM-DD.`)
      return
    }
    setIsLoadingDoor4Flights(true)
    setDoor4FlightStatus('Loading Door 4 flights...')
    setDoor4HiddenRevealCount(0)
    try {
      const payload = routeScopeKey === 'door-4'
        ? await getDoor4ArrivalFlights(safeDateIso, door4FlightNo)
        : await getDoor4DepartureFlights(safeDateIso, door4FlightNo)
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
      setFlightScreeningSettings({})
      setCloseGateAssignments({})
      setFlightGateChanges(nextGateChanges)
      const changedCount = Object.keys(nextGateChanges).length
      setDoor4FlightStatus(
        `Loaded ${rows.length} Door 4 flight record${rows.length === 1 ? '' : 's'} for ${safeDateIso}.${changedCount > 0 ? ` Gate changes detected: ${changedCount}.` : ''}`
      )
    } catch (err) {
      setDoor4Flights([])
      setFlightRemarks({})
      setFlightScreeningSettings({})
      setCloseGateAssignments({})
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
    if (routeScopeKey !== 'door-4' && routeScopeKey !== 'preboard') return
    loadDoor4Flights()
  }, [routeScopeKey, selectedDate])

  useEffect(() => {
    if (!isPreboardScope) return undefined
    function loadGateTypes() {
      setPreboardGateTypeRows(readPreboardGateTypeRows())
    }
    loadGateTypes()
    function onStorage(event) {
      if (event.key !== PREBOARD_GATE_TYPE_STORAGE_KEY) return
      loadGateTypes()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('preboard-gate-types-updated', loadGateTypes)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('preboard-gate-types-updated', loadGateTypes)
    }
  }, [isPreboardScope])

  useEffect(() => {
    if (!isDoor4Scope || isPreboardScope) return
    try {
      const raw = localStorage.getItem(DOOR4_PLAN_STORAGE_KEY)
      const allPlans = raw ? JSON.parse(raw) : {}
      const dayPlan = allPlans?.[selectedDate]
      setFlightAssignments(dayPlan && typeof dayPlan === 'object' ? dayPlan : {})
    } catch {
      setFlightAssignments({})
    } finally {
      setDoor4PlanLoadedDate(selectedDate)
    }
  }, [isDoor4Scope, isPreboardScope, selectedDate])

  useEffect(() => {
    if (!isDoor4Scope || isPreboardScope || door4PlanLoadedDate !== selectedDate) return
    try {
      const raw = localStorage.getItem(DOOR4_PLAN_STORAGE_KEY)
      const allPlans = raw ? JSON.parse(raw) : {}
      const nextPlans = { ...(allPlans || {}), [selectedDate]: flightAssignments }
      localStorage.setItem(DOOR4_PLAN_STORAGE_KEY, JSON.stringify(nextPlans))
      window.dispatchEvent(new CustomEvent(DOOR4_PLAN_UPDATED_EVENT, { detail: { date: selectedDate } }))
    } catch {
      // ignore storage write failures
    }
  }, [flightAssignments, isDoor4Scope, isPreboardScope, selectedDate, door4PlanLoadedDate])

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
    event.dataTransfer.setData('text/plain', `officer::${String(officerId)}`)
    event.dataTransfer.effectAllowed = 'move'
  }

  function parseDraggedOfficerId(event) {
    const plain = String(event.dataTransfer.getData('text/plain') || '').trim()
    if (!plain) return ''
    if (plain.startsWith('officer::')) return plain.slice('officer::'.length).trim()
    if (plain.startsWith('team::')) return ''
    return plain
  }

  function onTeamDragStart(event, teamName) {
    event.dataTransfer.setData('application/x-team-name', String(teamName))
    event.dataTransfer.setData('text/plain', `team::${String(teamName)}`)
    event.dataTransfer.effectAllowed = 'move'
  }

  function allowDrop(event) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  function onDropToSlot(event, siteId, slotIndex) {
    event.preventDefault()
    const officerId = parseDraggedOfficerId(event)
    if (!officerId) return
    assignOfficer(officerId, siteId, slotIndex)
  }

  function onDropToPool(event) {
    event.preventDefault()
    const officerId = parseDraggedOfficerId(event)
    if (!officerId) return
    unassignOfficer(officerId)
  }

  function onDropToRedCross(event) {
    event.preventDefault()
    const officerId = parseDraggedOfficerId(event)
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
    const customTeam = event.dataTransfer.getData('application/x-team-name')
    const plain = String(event.dataTransfer.getData('text/plain') || '').trim()
    const parsedTeam = plain.startsWith('team::') ? plain.slice('team::'.length) : ''
    const draggedTeamName = customTeam || parsedTeam
    if (isPreboardScope && draggedTeamName) {
      const teamName = String(draggedTeamName).trim()
      if (!teamName) return
      const targetFlight = displayedDoor4Flights.find((flight, index) => getFlightRowKey(flight, index) === flightKey)
      if (targetFlight && !isAssignableFlightStatus(getFlightDisplay(targetFlight).status)) {
        setDoor4FlightStatus('Cancelled flights cannot receive manpower assignments.')
        return
      }
      setPreboardFlightTeams((prev) => {
        const current = Array.isArray(prev[flightKey]) ? prev[flightKey] : []
        if (current.includes(teamName)) return prev
        if (current.length >= PREBOARD_MAX_TEAMS_PER_FLIGHT) {
          setDoor4FlightStatus(`Maximum ${PREBOARD_MAX_TEAMS_PER_FLIGHT} teams allowed per flight.`)
          return prev
        }
        return { ...prev, [flightKey]: [...current, teamName] }
      })
      return
    }
    const parsedOfficerId = plain.startsWith('officer::') ? plain.slice('officer::'.length) : plain
    const officerId = parsedOfficerId
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
    if (isPreboardScope) {
      setPreboardFlightTeams((prev) => {
        if (!prev[flightKey]) return prev
        const next = { ...prev }
        delete next[flightKey]
        return next
      })
    }
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

  function getScreeningSummary(flightKey, fallbackValue = '') {
    const settings = flightScreeningSettings[flightKey]
    if (!settings) return fallbackValue && fallbackValue !== '—' ? fallbackValue : 'Set screening'
    const types = Array.isArray(settings.types) ? settings.types : []
    const percent = String(settings.percentage || '').trim()
    if (!types.length && !percent) return 'Set screening'
    const typeText = types.length ? types.join(', ') : 'Screening'
    return percent ? `${typeText} · ${percent}%` : typeText
  }

  function resolveScreeningFlightInput(value) {
    const normalized = String(value || '').trim().toUpperCase()
    if (!normalized) return null
    return screeningFlightOptions.find((option) => (
      option.key === value
      || option.flight.toUpperCase() === normalized
      || option.label.toUpperCase() === normalized
      || `${option.flight} ${option.gate}`.toUpperCase() === normalized
    )) || null
  }

  function openScreeningEditor(flightKey = '') {
    const option = flightKey ? screeningFlightOptions.find((item) => item.key === flightKey) : null
    setScreeningEditorFlightKey(option?.key || '')
    setScreeningEditorFlightInput(option?.flight || '')
    setIsScreeningEditorOpen(true)
  }

  function updateScreeningEditorFlightInput(value) {
    setScreeningEditorFlightInput(value)
    const match = resolveScreeningFlightInput(value)
    setScreeningEditorFlightKey(match ? match.key : '')
  }

  function updateScreeningType(flightKey, type, checked) {
    setFlightScreeningSettings((prev) => {
      const current = prev[flightKey] || { types: [], percentage: '' }
      const currentTypes = Array.isArray(current.types) ? current.types : []
      const nextTypes = checked
        ? [...new Set([...currentTypes, type])]
        : currentTypes.filter((item) => item !== type)
      return { ...prev, [flightKey]: { ...current, types: nextTypes } }
    })
  }

  function updateScreeningPercentage(flightKey, value) {
    const numeric = String(value || '').replace(/[^\d.]/g, '')
    const bounded = numeric === '' ? '' : String(Math.min(100, Math.max(0, Number(numeric))))
    setFlightScreeningSettings((prev) => {
      const current = prev[flightKey] || { types: [], percentage: '' }
      return { ...prev, [flightKey]: { ...current, percentage: bounded } }
    })
  }

  function clearScreeningSettings(flightKey) {
    setFlightScreeningSettings((prev) => {
      if (!prev[flightKey]) return prev
      const next = { ...prev }
      delete next[flightKey]
      return next
    })
    setScreeningEditorFlightKey('')
    setScreeningEditorFlightInput('')
    setIsScreeningEditorOpen(false)
  }

  function getCloseGateSummary(flightKey, fallbackValue = '') {
    const assignments = closeGateAssignments[flightKey] || []
    if (!assignments.length) return fallbackValue && fallbackValue !== '—' ? fallbackValue : 'Assign'
    if (assignments.length === 1) return assignments[0].label
    return `${assignments.length} assignees`
  }

  function openCloseGateModal(flightKey) {
    setCloseGateEditorFlightKey(flightKey)
    setCloseGateDraftType('user')
    setCloseGateDraftValue('')
  }

  function addCloseGateDraftAssignee() {
    if (!closeGateEditorFlightKey || !closeGateDraftValue) return
    const source = closeGateDraftType === 'team' ? preboardTeamCards : visibleAvailableOfficers
    const match = source.find((item) => {
      const id = closeGateDraftType === 'team' ? item.teamName : String(item.id)
      const label = closeGateDraftType === 'team' ? item.teamName : `${item.name} (${item.staff_id})`
      return String(id) === String(closeGateDraftValue)
        || String(label).toLowerCase() === String(closeGateDraftValue).toLowerCase()
        || String(item.name || '').toLowerCase() === String(closeGateDraftValue).toLowerCase()
    })
    const typedValue = String(closeGateDraftValue).trim()
    const nextAssignee = match
      ? closeGateDraftType === 'team'
        ? { type: 'team', id: match.teamName, label: match.teamName }
        : { type: 'user', id: String(match.id), label: `${match.name} (${match.staff_id})` }
      : { type: closeGateDraftType, id: `typed:${typedValue}`, label: typedValue }
    setCloseGateAssignments((prev) => {
      const current = Array.isArray(prev[closeGateEditorFlightKey]) ? prev[closeGateEditorFlightKey] : []
      if (current.some((item) => item.type === nextAssignee.type && String(item.id) === String(nextAssignee.id))) return prev
      return { ...prev, [closeGateEditorFlightKey]: [...current, nextAssignee] }
    })
    setCloseGateDraftValue('')
  }

  function removeCloseGateAssignee(flightKey, assignee) {
    setCloseGateAssignments((prev) => {
      const current = Array.isArray(prev[flightKey]) ? prev[flightKey] : []
      const next = current.filter((item) => !(item.type === assignee.type && String(item.id) === String(assignee.id)))
      return { ...prev, [flightKey]: next }
    })
  }

  function submitCloseGateAssignments() {
    setCloseGateEditorFlightKey('')
    setCloseGateDraftValue('')
  }

  function openCreateTeamModal() {
    setCreateTeamName('')
    setCreateTeamOfficerIds([])
    setIsCreateTeamOpen(true)
  }

  function onDropToCreateTeam(event) {
    event.preventDefault()
    const officerId = parseDraggedOfficerId(event)
    if (!officerId) return
    if (redCrossOfficerIds.includes(String(officerId))) return
    setCreateTeamOfficerIds((prev) => (prev.includes(String(officerId)) ? prev : [...prev, String(officerId)]))
  }

  function removeOfficerFromCreateTeam(officerId) {
    setCreateTeamOfficerIds((prev) => prev.filter((id) => String(id) !== String(officerId)))
  }

  function submitCreateTeam() {
    const teamName = createTeamName.trim()
    if (!teamName) {
      setDoor4FlightStatus('Team name is required.')
      return
    }
    if (createTeamOfficerIds.length === 0) {
      setDoor4FlightStatus('Drag at least one officer into the team.')
      return
    }
    setOfficerTeamOverrides((prev) => {
      const next = { ...prev }
      createTeamOfficerIds.forEach((officerId) => {
        next[String(officerId)] = teamName
      })
      return next
    })
    setPreboardManpowerView('teams')
    setDoor4FlightStatus(`Created team "${teamName}" with ${createTeamOfficerIds.length} officer${createTeamOfficerIds.length === 1 ? '' : 's'}.`)
    setIsCreateTeamOpen(false)
    setCreateTeamName('')
    setCreateTeamOfficerIds([])
  }

  function togglePreboardTerminal(terminal) {
    setSelectedPreboardTerminals((prev) => {
      if (prev.includes(terminal)) return prev.filter((item) => item !== terminal)
      return [...prev, terminal]
    })
  }

  const getOfficerTeamName = (officer) => officerTeamOverrides[String(officer.id)] || officer.team || 'Unassigned Team'
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
  const preboardTeamCards = useMemo(() => {
    const grouped = new Map()
    visibleAvailableOfficers.forEach((officer) => {
      const teamName = String(getOfficerTeamName(officer)).trim() || 'Unassigned Team'
      const current = grouped.get(teamName) || []
      current.push(officer)
      grouped.set(teamName, current)
    })
    return Array.from(grouped.entries())
      .map(([teamName, officers]) => ({ teamName, officers }))
      .sort((a, b) => a.teamName.localeCompare(b.teamName))
  }, [visibleAvailableOfficers, officerTeamOverrides])
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
    const searched = !q ? displayedDoor4Flights : displayedDoor4Flights.filter((row) => {
      const item = getFlightDisplay(row)
      return String(item.gate || '').toLowerCase().includes(q) || String(item.flight || '').toLowerCase().includes(q)
    })
    if (!isPreboardScope) return searched
    return searched.filter((row) => {
      const terminal = normalizeTerminalValue(getFlightDisplay(row).terminal)
      if (!terminal || terminal === 'T0') return true
      return selectedPreboardTerminals.includes(terminal)
    })
  }, [displayedDoor4Flights, door4TableSearch, isPreboardScope, selectedPreboardTerminals])
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
  const screeningFlightOptions = useMemo(() => (
    door4FlightsWithDateBreaks
      .filter((entry) => entry.type === 'flight')
      .map((entry) => {
        const item = getFlightDisplay(entry.flight)
        return {
          key: entry.key,
          flight: item.flight,
          gate: item.gate,
          terminal: item.terminal,
          label: `${item.flight} · ${item.terminal} ${item.gate}`,
        }
      })
      .filter((item) => item.flight && item.flight !== '—')
  ), [door4FlightsWithDateBreaks])
  const filteredScreeningFlightOptions = useMemo(() => {
    const q = screeningEditorFlightInput.trim().toLowerCase()
    const source = !q
      ? screeningFlightOptions
      : screeningFlightOptions.filter((option) => (
        option.flight.toLowerCase().includes(q)
        || option.gate.toLowerCase().includes(q)
        || option.terminal.toLowerCase().includes(q)
        || option.label.toLowerCase().includes(q)
      ))
    return source
  }, [screeningEditorFlightInput, screeningFlightOptions])

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
      <section className={`panel${isPreboardScope ? ' preboard-sample-toolbar' : ''}`}>
        <div className="toolbar-row">
          <label>
            Deployment Date (SG)
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(normalizeIsoDate(e.target.value) || e.target.value)}
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
          {isDoor4Scope && (
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
        {scope.locked && !isPreboardScope && (
          <div className="status">
            Scope: <strong>{scope.label}</strong>
          </div>
        )}
        {status && !isPreboardScope && <div className={`alert alert-${alertType(status)}`}>{status}</div>}
        {isDoor4Scope && door4FlightStatus && !isPreboardScope && (
          <div className={`alert alert-${alertType(door4FlightStatus)}`}>{door4FlightStatus}</div>
        )}
      </section>

      {isDoor4Scope ? (
        <section className={`door4-workspace-grid${isPreboardScope ? ' preboard-sample-workspace' : ''}`}>
          <article className={`panel door4-pool${isPreboardScope ? ' preboard-sample-pool' : ''}`} onDragOver={allowDrop} onDrop={onDropToPool}>
            <div className="door4-pool-sticky">
              <div className="door4-pool-header">
                <h3>{isPreboardScope ? `${preboardManpowerView === 'teams' ? 'Teams' : 'Officers'} (${preboardManpowerView === 'teams' ? preboardTeamCards.length : visibleAvailableOfficers.length})` : (redCrossExpanded ? `Red Cross Officers (${redCrossOfficers.length})` : `Available Officers (${visibleAvailableOfficers.length})`)}</h3>
                <div className="toolbar-row" style={{ gap: 8 }}>
                  <button type="button" className="btn-secondary">Add Officer</button>
                  {isPreboardScope && preboardManpowerView === 'officers' && (
                    <button type="button" className="btn-secondary" onClick={openCreateTeamModal}>
                      Create Team
                    </button>
                  )}
                </div>
              </div>
              {isPreboardScope && (
                <div className="toolbar-row" style={{ marginBottom: 8 }}>
                  <button type="button" className={preboardManpowerView === 'teams' ? '' : 'btn-secondary'} onClick={() => setPreboardManpowerView('teams')}>Teams</button>
                  <button type="button" className={preboardManpowerView === 'officers' ? '' : 'btn-secondary'} onClick={() => setPreboardManpowerView('officers')}>Officers</button>
                </div>
              )}
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
            </div>
            <div className="door4-pool-scroll">
              {!isPreboardScope && redCrossExpanded ? (
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
                        <span>Team: {getOfficerTeamName(officer)}</span>
                        <span>Rank: {officer.rank}</span>
                        <span>Terminal: {officer.terminal || '—'}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )
              ) : isPreboardScope && preboardManpowerView === 'teams' ? (
              <div className="door4-manpower-cards">
                {preboardTeamCards.map((team) => (
                  <article
                    key={team.teamName}
                    className="door4-manpower-card"
                    draggable
                    onDragStart={(event) => onTeamDragStart(event, team.teamName)}
                  >
                    <div className="door4-manpower-card-head">
                      <strong>{team.teamName}</strong>
                      <span className="door4-manpower-gates">{team.officers.length}</span>
                    </div>
                    <div className="door4-manpower-meta">
                      {team.officers.slice(0, 3).map((officer) => (
                        <span key={officer.id}>{officer.name}</span>
                      ))}
                      {team.officers.length > 3 && <span>+{team.officers.length - 3} more</span>}
                    </div>
                  </article>
                ))}
              </div>
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
                      <span>Team: {getOfficerTeamName(officer)}</span>
                      <span>Rank: {officer.rank}</span>
                      <span>Terminal: {officer.terminal || '—'}</span>
                      <span>Start: {officer.start_date || '—'}</span>
                      <span>End Shift: {officer.end_shift_time || '—'}</span>
                    </div>
                  </article>
                ))}
              </div>
              )}
            </div>
          </article>

          <section className={`panel door4-flight-board${isPreboardScope ? ' preboard-sample-board' : ''}`}>
            <div className="door4-board-header">
              <h2>{isPreboardScope ? 'Preboard Departure Flights' : 'Door 4 Arrival Flights'}</h2>
              <div className="door4-board-header-right">
                <input
                  className="door4-table-search"
                  placeholder="Search gate or flight"
                  value={door4TableSearch}
                  onChange={(e) => setDoor4TableSearch(e.target.value)}
                />
                <span className="door4-board-stats">{selectedDate} · Departed Hidden {hiddenDoor4Flights.length} · Unhidden {Math.min(door4HiddenRevealCount, hiddenDoor4Flights.length)}/{hiddenDoor4Flights.length}</span>
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
                {isPreboardScope && (
                  <button
                    type="button"
                    className="screening-header-trigger"
                    onClick={() => openScreeningEditor()}
                    disabled={screeningFlightOptions.length === 0}
                  >
                    Set screening
                  </button>
                )}
                {isPreboardScope && (
                  <div className="door4-terminal-filter-row">
                    {['T1', 'T2', 'T3', 'T4'].map((terminal) => (
                      <button
                        key={terminal}
                        type="button"
                        className={selectedPreboardTerminals.includes(terminal) ? '' : 'btn-secondary'}
                        onClick={() => togglePreboardTerminal(terminal)}
                      >
                        {terminal}
                      </button>
                    ))}
                  </div>
                )}
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
                    <th>ET</th>
                    <th>STD</th>
                    {!isPreboardScope && <th>SCREENING TYPE</th>}
                    <th>{isPreboardScope ? 'TEAM TO FLIGHT' : 'OFFICER / DOOR'}</th>
                    {isPreboardScope && <th>SCREENING</th>}
                    {isPreboardScope && <th aria-label="Screening and flight controls"></th>}
                    <th>CLOSE GATE</th>
                    <th>REMARKS</th>
                  </tr>
                </thead>
                <tbody>
                  {door4FlightsWithDateBreaks.map((entry) => {
                    if (entry.type === 'date') {
                      return (
                        <tr key={entry.key} className="door4-flight-break-row">
                          <td colSpan={isPreboardScope ? 11 : 10}>{entry.label}</td>
                        </tr>
                      )
                    }
                    const flight = entry.flight
                    const item = getFlightDisplay(flight)
                    const key = entry.key
                    const isCancelledFlight = !isAssignableFlightStatus(item.status)
                    const assignedOfficer = allOfficers.find((o) => String(o.id) === String(flightAssignments[key]))
                    const assignedTeams = Array.isArray(preboardFlightTeams[key]) ? preboardFlightTeams[key] : []
                    const officerText = isCancelledFlight
                      ? 'Cancelled - no manpower'
                      : assignedOfficer ? `${assignedOfficer.name} (${assignedOfficer.staff_id})` : (item.officer === 'Unassigned' ? 'Drop officer here' : item.officer)
                    const preboardGateType = isPreboardScope ? findPreboardGateType(preboardGateTypeRows, item.terminal, item.gate) : ''
                    return (
                      <tr key={key} onDragOver={allowDrop} onDrop={(e) => onDropToFlight(e, key)}>
                        <td>
                          <span className={item.terminal === 'T?' || item.terminal === 'T0' ? 'terminal-alert-badge' : ''}>
                            {item.terminal}
                          </span>
                        </td>
                        <td>
                          <div className={`door4-gate-cell${preboardGateType ? ` preboard-gate-cell ${getPreboardGateTypeClass(preboardGateType)}` : ''}`}>
                            <span>{item.gate}</span>
                            {preboardGateType && <small>{preboardGateType}</small>}
                            {flightGateChanges[key] && (
                              <span className="door4-gate-change">
                                {flightGateChanges[key].previousGate} to {flightGateChanges[key].nextGate}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>{item.flight}</td>
                        <td><span className={`badge ${statusBadgeClass(item.status)}`}>{item.status}</span></td>
                        <td>{item.eta}</td>
                        <td>{item.scheduled}</td>
                        {!isPreboardScope && (
                          <td>
                            <button
                              type="button"
                              className={`screening-type-trigger${flightScreeningSettings[key] ? ' has-value' : ''}`}
                              onClick={() => openScreeningEditor(key)}
                            >
                              {getScreeningSummary(key, item.screeningType)}
                            </button>
                          </td>
                        )}
                        <td>
                          <div className="door4-flight-officer-cell">
                            {isPreboardScope && !isCancelledFlight ? (
                              <div className="preboard-team-slot-row" aria-label="Drop up to five teams here">
                                {Array.from({ length: PREBOARD_MAX_TEAMS_PER_FLIGHT }, (_, slotIndex) => {
                                  const teamName = assignedTeams[slotIndex]
                                  return teamName ? (
                                    <span key={`${key}-${teamName}-${slotIndex}`} className="preboard-team-chip">{teamName}</span>
                                  ) : (
                                    <span key={`${key}-slot-${slotIndex}`} className="preboard-drop-target-label">DROP TEAM</span>
                                  )
                                })}
                              </div>
                            ) : (
                              <span>{officerText}</span>
                            )}
                            {!isCancelledFlight && !isPreboardScope && <div className="door4-flight-officer-actions">
                              <button type="button" className="door4-beacon-toggle" onClick={() => toggleFlightBeaconDetected(key)}>
                                <span className={`door4-flight-beacon-icon ${flightBeaconDetected[key] ? 'is-detected' : 'is-not-detected'}`} style={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>Q</span>
                              </button>
                              <span className="badge badge-blue">AI</span>
                              <span className="door4-pax-slot">
                                {shouldShowPaxBadge(item.status) && (
                                  <>
                                    <span className="door4-pax-gauge">
                                      <ThumbsUp size={16} className={paxIconClass(pseudoRandomPaxPercent(key))} aria-hidden="true" />
                                    </span>
                                    <span className={`badge ${paxBadgeClass(pseudoRandomPaxPercent(key))}`}>{`PAX ${pseudoRandomPaxPercent(key)}%`}</span>
                                  </>
                                )}
                                {!shouldShowPaxBadge(item.status) && (
                                  <>
                                    <span className="door4-pax-gauge door4-pax-gauge-placeholder">
                                      <ThumbsUp size={16} aria-hidden="true" />
                                    </span>
                                    <span className="door4-pax-badge-placeholder" />
                                  </>
                                )}
                              </span>
                              {!isPreboardScope && (
                                <button type="button" className="btn-secondary btn-sm" onClick={() => clearFlightAssignment(key)}>Clear</button>
                              )}
                            </div>}
                          </div>
                        </td>
                        {isPreboardScope && (
                          <td>
                            {getScreeningSummary(key, item.screeningType) !== 'Set screening' ? (
                              <span className="preboard-row-screening-summary">{getScreeningSummary(key, item.screeningType)}</span>
                            ) : (
                              <span className="preboard-screening-empty">—</span>
                            )}
                          </td>
                        )}
                        {isPreboardScope && (
                          <td>
                            {!isCancelledFlight && (
                              <div className="door4-flight-officer-actions preboard-flight-controls">
                                <button type="button" className="door4-beacon-toggle" onClick={() => toggleFlightBeaconDetected(key)}>
                                  <span className={`door4-flight-beacon-icon ${flightBeaconDetected[key] ? 'is-detected' : 'is-not-detected'}`} style={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>Q</span>
                                </button>
                                <span className="badge badge-blue">AI</span>
                                <span className="door4-pax-slot">
                                  {shouldShowPaxBadge(item.status) && (
                                    <>
                                      <span className="door4-pax-gauge">
                                        <ThumbsUp size={16} className={paxIconClass(pseudoRandomPaxPercent(key))} aria-hidden="true" />
                                      </span>
                                      <span className={`badge ${paxBadgeClass(pseudoRandomPaxPercent(key))}`}>{`PAX ${pseudoRandomPaxPercent(key)}%`}</span>
                                    </>
                                  )}
                                  {!shouldShowPaxBadge(item.status) && (
                                    <>
                                      <span className="door4-pax-gauge door4-pax-gauge-placeholder">
                                        <ThumbsUp size={16} aria-hidden="true" />
                                      </span>
                                      <span className="door4-pax-badge-placeholder" />
                                    </>
                                  )}
                                </span>
                              </div>
                            )}
                          </td>
                        )}
                        <td>
                          {isCancelledFlight ? (
                            <span className="close-gate-disabled">—</span>
                          ) : (
                            <button
                              type="button"
                              className={`close-gate-trigger${(closeGateAssignments[key] || []).length ? ' has-value' : ''}`}
                              onClick={() => openCloseGateModal(key)}
                            >
                              {getCloseGateSummary(key, item.closeGate)}
                            </button>
                          )}
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

      {isCreateTeamOpen && (
        <div className="door4-modal-backdrop">
          <div className="door4-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create Team</h3>
            <input
              type="text"
              placeholder="Team name"
              value={createTeamName}
              onChange={(e) => setCreateTeamName(e.target.value)}
            />
            <div className="door4-create-team-dropzone" onDragOver={allowDrop} onDrop={onDropToCreateTeam}>
              Drag officers here
            </div>
            <div className="door4-create-team-selected">
              {createTeamOfficerIds.length === 0 && <span className="muted">No officers selected yet.</span>}
              {createTeamOfficerIds.map((officerId) => {
                const officer = allOfficers.find((row) => String(row.id) === String(officerId))
                if (!officer) return null
                return (
                  <button
                    key={`selected-officer-${officer.id}`}
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => removeOfficerFromCreateTeam(officer.id)}
                  >
                    {officer.name} ×
                  </button>
                )
              })}
            </div>
            <div className="toolbar-row">
              <button type="button" className="btn-secondary" onClick={() => setIsCreateTeamOpen(false)}>Cancel</button>
              <button type="button" onClick={submitCreateTeam} disabled={createTeamOfficerIds.length < 2}>Create</button>
            </div>
          </div>
        </div>
      )}

      {isScreeningEditorOpen && (
        <div className="door4-modal-backdrop screening-modal-backdrop" onClick={() => setIsScreeningEditorOpen(false)}>
          <div className="door4-modal screening-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Screening Type</h3>
            <label className="screening-flight-field">
              Flight Number
              <input
                placeholder="Key in or select flight no."
                value={screeningEditorFlightInput}
                onChange={(e) => updateScreeningEditorFlightInput(e.target.value)}
              />
              <div className="screening-flight-picker">
                {filteredScreeningFlightOptions.length === 0 ? (
                  <div className="screening-flight-empty">No matching flight</div>
                ) : (
                  filteredScreeningFlightOptions.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={screeningEditorFlightKey === option.key ? 'selected' : ''}
                      onClick={() => {
                        setScreeningEditorFlightKey(option.key)
                        setScreeningEditorFlightInput(option.flight)
                      }}
                    >
                      <strong>{option.flight}</strong>
                      <span>{option.terminal} {option.gate}</span>
                    </button>
                  ))
                )}
              </div>
              {screeningEditorFlightKey && (
                <span>
                  {screeningFlightOptions.find((option) => option.key === screeningEditorFlightKey)?.label || 'Selected flight'}
                </span>
              )}
              {!screeningEditorFlightKey && (
                <span className="screening-flight-warning">Select or key in a valid flight number first.</span>
              )}
            </label>
            <div className="screening-option-list">
              {SCREENING_TYPE_OPTIONS.map((type) => {
                const current = flightScreeningSettings[screeningEditorFlightKey] || { types: [], percentage: '' }
                const selected = Array.isArray(current.types) && current.types.includes(type)
                return (
                  <label key={type} className="screening-option-row">
                    <input
                      type="checkbox"
                      disabled={!screeningEditorFlightKey}
                      checked={selected}
                      onChange={(e) => updateScreeningType(screeningEditorFlightKey, type, e.target.checked)}
                    />
                    <span>{type}</span>
                  </label>
                )
              })}
            </div>
            <label className="screening-percentage-field">
              Percentage
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                placeholder="0"
                disabled={!screeningEditorFlightKey}
                value={flightScreeningSettings[screeningEditorFlightKey]?.percentage || ''}
                onChange={(e) => updateScreeningPercentage(screeningEditorFlightKey, e.target.value)}
              />
            </label>
            <div className="toolbar-row">
              <button type="button" className="btn-secondary" onClick={() => clearScreeningSettings(screeningEditorFlightKey)} disabled={!screeningEditorFlightKey}>
                Clear
              </button>
              <button type="button" onClick={() => setIsScreeningEditorOpen(false)} disabled={!screeningEditorFlightKey}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {closeGateEditorFlightKey && (
        <div className="door4-modal-backdrop close-gate-modal-backdrop" onClick={() => setCloseGateEditorFlightKey('')}>
          <div className="door4-modal close-gate-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Assign Officers or Teams for Close Gate</h3>
            <fieldset className="close-gate-type-field">
              <legend>Type</legend>
              <label>
                <input
                  type="radio"
                  name="close-gate-type"
                  checked={closeGateDraftType === 'user'}
                  onChange={() => {
                    setCloseGateDraftType('user')
                    setCloseGateDraftValue('')
                  }}
                />
                User
              </label>
              <label>
                <input
                  type="radio"
                  name="close-gate-type"
                  checked={closeGateDraftType === 'team'}
                  onChange={() => {
                    setCloseGateDraftType('team')
                    setCloseGateDraftValue('')
                  }}
                />
                Team
              </label>
            </fieldset>
            <div className="close-gate-picker-row">
              <input
                type="text"
                list={`close-gate-${closeGateDraftType}-options`}
                placeholder={`Type ${closeGateDraftType === 'team' ? 'team' : 'officer'} name`}
                value={closeGateDraftValue}
                onChange={(e) => setCloseGateDraftValue(e.target.value)}
              />
              <datalist id={`close-gate-${closeGateDraftType}-options`}>
                {(closeGateDraftType === 'team' ? preboardTeamCards : visibleAvailableOfficers).map((item) => {
                  const value = closeGateDraftType === 'team' ? item.teamName : `${item.name} (${item.staff_id})`
                  return <option key={`typed-${closeGateDraftType}-${value}`} value={value} />
                })}
              </datalist>
              <button type="button" onClick={addCloseGateDraftAssignee} disabled={!closeGateDraftValue}>Add</button>
            </div>
            <div className="close-gate-assignee-list">
              <span className="close-gate-list-label">Close Gate Assignee List</span>
              {!(closeGateAssignments[closeGateEditorFlightKey] || []).length && <strong>No assignees</strong>}
              {(closeGateAssignments[closeGateEditorFlightKey] || []).map((assignee) => (
                <button
                  key={`${assignee.type}-${assignee.id}`}
                  type="button"
                  className="close-gate-assignee-chip"
                  onClick={() => removeCloseGateAssignee(closeGateEditorFlightKey, assignee)}
                >
                  <span>{assignee.label}</span>
                  <small>{assignee.type === 'team' ? 'Team' : 'User'} ×</small>
                </button>
              ))}
            </div>
            <div className="close-gate-modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setCloseGateEditorFlightKey('')}>Cancel</button>
              <button type="button" onClick={submitCloseGateAssignments}>Submit</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
