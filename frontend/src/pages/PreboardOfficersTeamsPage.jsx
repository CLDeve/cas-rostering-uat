import { useEffect, useMemo, useState } from 'react'
import { listEmployees } from '../api'

const REPORTING_WINDOWS = ['6AM to 6PM', '8AM to 8PM', '10AM to 10PM']
const SKILLS = ['General', 'Frisker', 'X-ray']
const STATUS_SEQUENCE = ['IN', 'IN', 'IN', 'LATE', 'BACK', 'NONE', 'MEAL', 'SHORT', 'MEAL > 1H']
const TEAM_COLOURS = ['pink', 'orange', 'cyan', 'green', 'violet']

const SAMPLE_NAMES = [
  ['S00001', 'Nur Chua', 'M', 'T2'],
  ['S00003', 'Wei Chua', 'M', 'T1'],
  ['S00004', 'Jian Tan', 'M', 'T2'],
  ['S00006', 'Jun Tan', 'M', 'T1'],
  ['S00007', 'Kai Chua', 'M', 'T2'],
  ['S00009', 'Hui Chua', 'M', 'T1'],
  ['S00010', 'Amir Tan', 'F', 'T2'],
  ['S00012', 'Farhan Tan', 'M', 'T1'],
  ['S00013', 'Zhi Chua', 'M', 'T2'],
  ['S00015', 'Xiu Chua', 'F', 'T1'],
  ['S00016', 'Zhen Tan', 'M', 'T2'],
  ['S00018', 'Daniel Tan', 'M', 'T1'],
  ['S00019', 'Chris Chua', 'M', 'T2'],
  ['S00021', 'Ryan Chua', 'M', 'T1'],
  ['S00026', 'Siti Tan', 'F', 'T3'],
  ['S00029', 'Hao Chua', 'M', 'T3'],
  ['S00032', 'Ying Tan', 'M', 'T3'],
  ['S00035', 'Hafiz Chua', 'F', 'T3'],
  ['S00038', 'Ming Tan', 'M', 'T3'],
  ['S00041', 'Rachel Chua', 'M', 'T3'],
  ['S00044', 'Ethan Tan', 'M', 'T3'],
  ['S00047', 'Kevin Chua', 'M', 'T3'],
]

function todaySgIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
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

function normalizeTerminal(value, index = 0) {
  const raw = String(value || '').trim().toUpperCase()
  const direct = raw.match(/^T?([1-4])$/)
  if (direct) return `T${direct[1]}`
  const prefixed = raw.match(/^TERMINAL\s*([1-4])$/)
  if (prefixed) return `T${prefixed[1]}`
  return ['T1', 'T2', 'T3'][index % 3]
}

function normalizeGender(value, index = 0) {
  const raw = String(value || '').trim().toUpperCase()
  if (raw.startsWith('F')) return 'F'
  if (raw.startsWith('M')) return 'M'
  return index % 5 === 0 ? 'F' : 'M'
}

function makeSampleEmployees() {
  return SAMPLE_NAMES.map(([staffId, name, gender, terminal], index) => ({
    id: index + 1,
    staff_id: staffId,
    name,
    gender,
    terminal,
    rank: index % 6 === 0 ? 'SSGT' : 'Officer',
    shift_pattern: index % 3 === 0 ? '5W1O' : '4W2O',
  }))
}

function officerFromEmployee(employee, index) {
  const staffId = String(employee.staff_id || employee.staffId || employee.id || `S${String(index + 1).padStart(5, '0')}`)
  const terminal = normalizeTerminal(employee.terminal || employee.deployment_area || employee.deploymentArea, index)
  const reporting = REPORTING_WINDOWS[index % REPORTING_WINDOWS.length]
  const status = STATUS_SEQUENCE[index % STATUS_SEQUENCE.length]
  const breakState = status === 'BACK' ? 'BACK' : status === 'MEAL' ? 'MEAL' : status === 'MEAL > 1H' ? 'MEAL > 1H' : 'NONE'
  const skills = ['General']
  if (index % 4 === 0) skills.push('Frisker')
  if (index % 7 === 0) skills.push('X-ray')
  const teamNumber = Math.floor(index / 7) + 1
  const teamTerminal = terminal.replace('T', '')
  const teamTime = reporting.startsWith('6AM') ? '01' : reporting.startsWith('8AM') ? '14' : '22'

  return {
    id: String(employee.id || staffId),
    staffId,
    name: String(employee.name || employee.full_name || `Officer ${index + 1}`),
    gender: normalizeGender(employee.gender, index),
    terminal,
    reporting,
    scanIn: status === 'LATE' ? 'LATE' : status === 'SHORT' ? 'SHORT' : 'IN',
    breakState,
    skills,
    team: `T${teamTerminal}-AUTO-${teamTime}`,
    role: index % 6 === 0 ? 'XR' : index % 5 === 0 ? 'FR' : 'G',
    teamColour: TEAM_COLOURS[teamNumber % TEAM_COLOURS.length],
  }
}

function buildTeams(officers) {
  const buckets = new Map()
  officers.forEach((officer) => {
    const key = `${officer.reporting}|${officer.team}`
    if (!buckets.has(key)) {
      buckets.set(key, {
        id: key,
        name: officer.team,
        terminal: officer.terminal,
        reporting: officer.reporting,
        members: [],
      })
    }
    buckets.get(key).members.push(officer)
  })

  return Array.from(buckets.values()).map((team, index) => {
    const late = team.members.filter((member) => member.scanIn === 'LATE').length
    const notIn = team.members.filter((member) => member.scanIn !== 'IN' && member.scanIn !== 'LATE').length
    const scanIn = team.members.filter((member) => member.scanIn === 'IN').length
    const skillCount = (skill) => team.members.filter((member) => member.skills.includes(skill)).length
    return {
      ...team,
      prev: index % 3 === 0 ? '—' : `TR${String(600 + index * 7).padStart(3, '0')} 21:25 • ${team.terminal === 'T1' ? 'C11' : team.terminal === 'T2' ? 'D35' : 'A9'}`,
      now: index % 4 === 0 ? `LD${300 + index} 21:30 • ${team.terminal === 'T2' ? 'D33F' : 'C13'}` : '—',
      next: '—',
      scanIn,
      late,
      notIn,
      general: skillCount('General'),
      xray: skillCount('X-ray'),
      frisker: skillCount('Frisker'),
    }
  })
}

function countBy(officers, predicate) {
  return officers.filter(predicate).length
}

function StatusBadge({ value }) {
  const tone = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'none'
  return <span className={`preboard-ot-badge badge-${tone}`}>{value}</span>
}

export default function PreboardOfficersTeamsPage() {
  const [selectedDate, setSelectedDate] = useState(todaySgIso())
  const [employees, setEmployees] = useState([])
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [skillFilter, setSkillFilter] = useState('ALL')
  const [workFilter, setWorkFilter] = useState('ALL')
  const [selectedTeamId, setSelectedTeamId] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const rows = await fetchAllEmployees()
        if (!cancelled) {
          setEmployees(rows.length ? rows : makeSampleEmployees())
          setStatus('')
        }
      } catch (err) {
        if (!cancelled) {
          setEmployees(makeSampleEmployees())
          setStatus(`Using sample officers: ${err.message}`)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const officers = useMemo(() => employees.map(officerFromEmployee), [employees])
  const teams = useMemo(() => buildTeams(officers), [officers])
  const selectedTeam = useMemo(() => teams.find((team) => team.id === selectedTeamId), [teams, selectedTeamId])

  const filteredOfficers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return officers.filter((officer) => {
      const matchesSearch = !q
        || officer.name.toLowerCase().includes(q)
        || officer.staffId.toLowerCase().includes(q)
        || officer.team.toLowerCase().includes(q)
      const matchesSkill = skillFilter === 'ALL' || officer.skills.includes(skillFilter)
      const matchesWork = workFilter === 'ALL'
        || (workFilter === 'AT_WORK' && officer.scanIn === 'IN')
        || (workFilter === 'LATE' && officer.scanIn === 'LATE')
        || (workFilter === 'NOT_IN' && officer.scanIn !== 'IN' && officer.scanIn !== 'LATE')
        || (workFilter === 'BREAK' && officer.breakState !== 'NONE')
      return matchesSearch && matchesSkill && matchesWork
    })
  }, [officers, search, skillFilter, workFilter])

  const teamsByReporting = useMemo(() => {
    return REPORTING_WINDOWS.map((reporting) => ({
      reporting,
      teams: teams.filter((team) => team.reporting === reporting),
    })).filter((group) => group.teams.length)
  }, [teams])

  const filterChips = [
    { key: 'ALL', label: `All ${officers.length}` },
    { key: 'AT_WORK', label: `At Work ${countBy(officers, (o) => o.scanIn === 'IN')}` },
    { key: 'LATE', label: `Late ${countBy(officers, (o) => o.scanIn === 'LATE')}` },
    { key: 'NOT_IN', label: `Not In ${countBy(officers, (o) => o.scanIn !== 'IN' && o.scanIn !== 'LATE')}` },
    { key: 'BREAK', label: `Break ${countBy(officers, (o) => o.breakState !== 'NONE')}` },
  ]

  return (
    <div className="preboard-ot-page">
      <div className="preboard-ot-header">
        <div>
          <h1>Preboard Officers &amp; Teams</h1>
          <p>Live-style overview of officers, skills, attendance, and preboard team composition.</p>
        </div>
        <label className="preboard-ot-date">
          <span>Deployment Date (SG)</span>
          <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
        </label>
      </div>

      {status && <div className="alert alert-info">{status}</div>}

      <div className="preboard-ot-grid">
        <section className="preboard-ot-panel preboard-ot-officers">
          <div className="preboard-ot-panel-head">
            <h2>All Officers</h2>
            <div className="preboard-ot-tools">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name / staff ID..." />
              <select value={skillFilter} onChange={(event) => setSkillFilter(event.target.value)}>
                <option value="ALL">All skills</option>
                {SKILLS.map((skill) => <option key={skill} value={skill}>{skill}</option>)}
              </select>
            </div>
          </div>

          <div className="preboard-ot-filters">
            <span>Work</span>
            {filterChips.map((chip) => (
              <button key={chip.key} type="button" className={workFilter === chip.key ? 'active' : ''} onClick={() => setWorkFilter(chip.key)}>
                {chip.label}
              </button>
            ))}
          </div>

          <div className="preboard-ot-table-wrap">
            <table className="preboard-ot-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Staff ID</th>
                  <th>Name</th>
                  <th>Gender</th>
                  <th>Terminal</th>
                  <th>Reporting</th>
                  <th>Scan-In</th>
                  <th>Break</th>
                  <th>Skills</th>
                  <th>Teams</th>
                </tr>
              </thead>
              <tbody>
                <tr className="preboard-ot-section-row">
                  <td colSpan="10"><span>6AM to 6PM</span><strong>{filteredOfficers.length} officers</strong></td>
                </tr>
                {filteredOfficers.map((officer) => (
                  <tr key={officer.id}>
                    <td><input type="checkbox" aria-label={`Select ${officer.name}`} /></td>
                    <td>{officer.staffId}</td>
                    <td className={officer.gender === 'F' ? 'officer-female' : 'officer-male'}>{officer.name}</td>
                    <td>{officer.gender}{officer.role === 'XR' ? <span className="preboard-ot-key">●</span> : null}</td>
                    <td>{officer.terminal}</td>
                    <td>{officer.reporting}</td>
                    <td><StatusBadge value={officer.scanIn} /></td>
                    <td><StatusBadge value={officer.breakState} /></td>
                    <td>
                      <div className="preboard-ot-skill-list">
                        {officer.skills.map((skill) => <span key={skill}>{skill}</span>)}
                      </div>
                    </td>
                    <td><span className={`preboard-ot-team-tag tag-${officer.teamColour}`}>{officer.team}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="preboard-ot-panel preboard-ot-teams">
          <div className="preboard-ot-panel-head teams-head">
            <h2>Teams Overview</h2>
            <div className="preboard-ot-team-actions">
              <button type="button">Unavailable</button>
              <span>Click a team to view members</span>
            </div>
          </div>

          <div className="preboard-ot-team-scroll">
            {teamsByReporting.map((group) => (
              <div key={group.reporting} className="preboard-ot-team-group">
                <div className="preboard-ot-team-group-head">
                  <span>{group.reporting}</span>
                  <strong>{group.teams.length} teams</strong>
                </div>
                <div className="preboard-ot-card-grid">
                  {group.teams.map((team) => (
                    <button key={team.id} type="button" className={`preboard-ot-team-card${selectedTeamId === team.id ? ' selected' : ''}`} onClick={() => setSelectedTeamId(team.id)}>
                      <div className="preboard-ot-team-title"><strong>{team.name}</strong><span>{team.terminal}</span></div>
                      <p>Report <b>{team.reporting}</b></p>
                      <p>Prev {team.prev}</p>
                      <p>Now {team.now}</p>
                      <p>Next {team.next}</p>
                      <div className="preboard-ot-team-count"><span>Members</span><strong>{team.members.length}</strong></div>
                      <p>Scan-In <b className="ok">{team.scanIn}</b> · Late <b className="warn">{team.late}</b> · Not In <b className="bad">{team.notIn}</b></p>
                      <p>G {team.general} · XR {team.xray} · FR {team.frisker}</p>
                      <hr />
                      <div className="preboard-ot-members">
                        {team.members.slice(0, 8).map((member) => (
                          <div key={member.id}><span>{member.name} <b>({member.gender})</b></span><small>{member.staffId} · {member.role}</small></div>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {selectedTeam && (
        <div className="preboard-ot-selected-team">
          <div>
            <strong>{selectedTeam.name}</strong>
            <span>{selectedTeam.members.length} members · {selectedTeam.terminal} · {selectedTeam.reporting}</span>
          </div>
          <button type="button" onClick={() => setSelectedTeamId('')}>Close</button>
        </div>
      )}
    </div>
  )
}
