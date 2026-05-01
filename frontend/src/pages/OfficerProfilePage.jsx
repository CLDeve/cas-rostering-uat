import { useEffect, useMemo, useState } from 'react'
import { listDeployments, listEmployees } from '../api'

const SITE_LISTS_STORAGE_KEY = 'roster_officer_site_lists'

function alertType(msg) {
  if (!msg) return 'info'
  const m = msg.toLowerCase()
  if (m.includes('unable') || m.includes('fail') || m.includes('error')) return 'error'
  if (m.includes('loaded') || m.includes('updated') || m.includes('success')) return 'success'
  return 'info'
}

async function fetchAllEmployees() {
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

export default function OfficerProfilePage() {
  const [status, setStatus] = useState('Loading officer profiles...')
  const [rows, setRows] = useState([])
  const [sites, setSites] = useState([])
  const [query, setQuery] = useState('')
  const [siteListsByOfficer, setSiteListsByOfficer] = useState({})
  const [whitelistSiteId, setWhitelistSiteId] = useState('')
  const [blacklistSiteId, setBlacklistSiteId] = useState('')

  function loadStoredSiteLists() {
    try {
      const raw = localStorage.getItem(SITE_LISTS_STORAGE_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  }

  function saveStoredSiteLists(next) {
    setSiteListsByOfficer(next)
    localStorage.setItem(SITE_LISTS_STORAGE_KEY, JSON.stringify(next))
  }

  async function refresh() {
    setStatus('Loading officer profiles...')
    try {
      const [employees, deploymentSites] = await Promise.all([fetchAllEmployees(), listDeployments()])
      setRows(employees)
      setSites(Array.isArray(deploymentSites) ? deploymentSites : [])
      setSiteListsByOfficer(loadStoredSiteLists())
      setStatus(`Loaded ${employees.length} officer profiles.`)
    } catch (err) {
      setRows([])
      setStatus(`Unable to load officer profiles: ${err.message}`)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const options = useMemo(
    () => rows.map((row) => `${row.staff_id} - ${row.name}`),
    [rows],
  )

  const selectedRows = useMemo(() => {
    const text = query.trim().toLowerCase()
    if (!text) return []
    return rows.filter((row) => {
      const token = `${row.staff_id} - ${row.name}`.toLowerCase()
      return (
        token === text ||
        String(row.staff_id || '').toLowerCase() === text ||
        String(row.name || '').toLowerCase() === text
      )
    })
  }, [rows, query])
  const selected = selectedRows[0] || null
  const selectedOfficerKey = selected ? String(selected.staff_id) : ''
  const selectedOfficerLists = selectedOfficerKey
    ? (siteListsByOfficer[selectedOfficerKey] || { whitelist: [], blacklist: [] })
    : { whitelist: [], blacklist: [] }

  const siteOptions = useMemo(
    () => (sites || []).map((site) => ({ id: String(site.id), label: String(site.site_name || `Site ${site.id}`) })),
    [sites],
  )

  function addToList(type) {
    if (!selectedOfficerKey) return
    const targetSiteId = type === 'whitelist' ? whitelistSiteId : blacklistSiteId
    if (!targetSiteId) return

    const current = siteListsByOfficer[selectedOfficerKey] || { whitelist: [], blacklist: [] }
    const nextWhitelist = [...current.whitelist]
    const nextBlacklist = [...current.blacklist]

    if (type === 'whitelist') {
      if (!nextWhitelist.includes(targetSiteId)) nextWhitelist.push(targetSiteId)
      const idx = nextBlacklist.indexOf(targetSiteId)
      if (idx >= 0) nextBlacklist.splice(idx, 1)
      setWhitelistSiteId('')
    } else {
      if (!nextBlacklist.includes(targetSiteId)) nextBlacklist.push(targetSiteId)
      const idx = nextWhitelist.indexOf(targetSiteId)
      if (idx >= 0) nextWhitelist.splice(idx, 1)
      setBlacklistSiteId('')
    }

    saveStoredSiteLists({
      ...siteListsByOfficer,
      [selectedOfficerKey]: {
        whitelist: nextWhitelist,
        blacklist: nextBlacklist,
      },
    })
  }

  function removeFromList(type, siteId) {
    if (!selectedOfficerKey) return
    const current = siteListsByOfficer[selectedOfficerKey] || { whitelist: [], blacklist: [] }
    const next = {
      whitelist: type === 'whitelist' ? current.whitelist.filter((id) => id !== siteId) : current.whitelist,
      blacklist: type === 'blacklist' ? current.blacklist.filter((id) => id !== siteId) : current.blacklist,
    }
    saveStoredSiteLists({
      ...siteListsByOfficer,
      [selectedOfficerKey]: next,
    })
  }

  function resolveSiteName(siteId) {
    return siteOptions.find((site) => site.id === String(siteId))?.label || `Site ${siteId}`
  }

  return (
    <>
      <section className="panel">
        <div className="toolbar-row">
          <input
            list="officer-profile-options"
            placeholder="Select or type Staff ID / Name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ minWidth: 320 }}
          />
          <datalist id="officer-profile-options">
            {options.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <button type="button" className="btn-secondary" onClick={refresh}>Refresh</button>
        </div>
        {status && <div className={`alert alert-${alertType(status)}`}>{status}</div>}
      </section>

      <section className="panel">
        {!selected ? (
          <div className="empty-state">Select an officer from dropdown or key in staff ID/name.</div>
        ) : (
          <div className="officer-profile-wireframe">
            <div className="officer-info-card">
              <div><strong>Name:</strong> {selected.name}</div>
              <div><strong>Staff ID:</strong> {selected.staff_id}</div>
              <div><strong>Unit:</strong> {selected.team}</div>
              <div><strong>Shift Pattern:</strong> {Array.isArray(selected.shift_patterns) && selected.shift_patterns.length ? selected.shift_patterns.join(', ') : selected.shift_pattern}</div>
              <div><strong>Rank:</strong> {selected.rank}</div>
              <div><strong>Gender:</strong> {selected.gender}</div>
              <div><strong>Scheme:</strong> {selected.scheme}</div>
              <div><strong>Contractual Hrs:</strong> {selected.contractual_hours}</div>
            </div>

            <div className="officer-side-stack">
              <div className="officer-side-card">
                <h3>Courses</h3>
                <div className="muted">No course records yet.</div>
              </div>
              <div className="officer-side-card">
                <h3>Licenses</h3>
                <div className="muted">No license records yet.</div>
              </div>
              <div className="officer-side-card">
                <h3>Whitelist</h3>
                <div className="list-editor-row">
                  <select value={whitelistSiteId} onChange={(e) => setWhitelistSiteId(e.target.value)}>
                    <option value="">Select Site</option>
                    {siteOptions.map((site) => (
                      <option key={`wl-${site.id}`} value={site.id}>{site.label}</option>
                    ))}
                  </select>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => addToList('whitelist')}>
                    Add
                  </button>
                </div>
                <div className="list-chip-wrap">
                  {selectedOfficerLists.whitelist.length === 0 ? (
                    <div className="muted">No whitelisted sites.</div>
                  ) : (
                    selectedOfficerLists.whitelist.map((siteId) => (
                      <span key={`wl-chip-${siteId}`} className="list-chip list-chip-green">
                        {resolveSiteName(siteId)}
                        <button type="button" onClick={() => removeFromList('whitelist', siteId)}>x</button>
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="officer-side-card">
                <h3>Blacklist</h3>
                <div className="list-editor-row">
                  <select value={blacklistSiteId} onChange={(e) => setBlacklistSiteId(e.target.value)}>
                    <option value="">Select Site</option>
                    {siteOptions.map((site) => (
                      <option key={`bl-${site.id}`} value={site.id}>{site.label}</option>
                    ))}
                  </select>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => addToList('blacklist')}>
                    Add
                  </button>
                </div>
                <div className="list-chip-wrap">
                  {selectedOfficerLists.blacklist.length === 0 ? (
                    <div className="muted">No blacklisted sites.</div>
                  ) : (
                    selectedOfficerLists.blacklist.map((siteId) => (
                      <span key={`bl-chip-${siteId}`} className="list-chip list-chip-red">
                        {resolveSiteName(siteId)}
                        <button type="button" onClick={() => removeFromList('blacklist', siteId)}>x</button>
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  )
}
