import { useMemo, useState } from 'react'
import {
  PREBOARD_GATE_TYPES,
  PREBOARD_GATE_TYPE_OPTIONS,
  PREBOARD_GATE_TYPE_STORAGE_KEY,
  getPreboardGateTypeClass,
  normalizePreboardGate,
  normalizePreboardGateType,
  normalizePreboardTerminal,
  readPreboardGateTypeRows,
} from '../data/preboardGateTypes'

export default function PreboardConfigPage() {
  const [terminal, setTerminal] = useState('T1')
  const [viewTerminal, setViewTerminal] = useState('ALL')
  const [ghr, setGhr] = useState('')
  const [gateType, setGateType] = useState('Single')
  const [rows, setRows] = useState(() => readPreboardGateTypeRows())

  function persist(nextRows) {
    setRows(nextRows)
    localStorage.setItem(PREBOARD_GATE_TYPE_STORAGE_KEY, JSON.stringify(nextRows))
    window.dispatchEvent(new CustomEvent('preboard-gate-types-updated'))
  }

  function addRow() {
    const t = normalizePreboardTerminal(terminal)
    const g = normalizePreboardGate(ghr)
    const gt = normalizePreboardGateType(gateType)
    if (!t || !g || !gt) return
    const existing = rows.find((row) => (
      normalizePreboardTerminal(row.terminal) === t
      && normalizePreboardGate(row.ghr) === g
    ))
    const next = existing
      ? rows.map((row) => (row.id === existing.id ? { ...row, terminal: t, ghr: g, gateType: gt } : row))
      : [{ id: `${Date.now()}-${Math.random()}`, terminal: t, ghr: g, gateType: gt }, ...rows]
    persist(next)
    setGhr('')
  }

  function removeRow(id) {
    persist(rows.filter((row) => row.id !== id))
  }

  function updateGateType(id, nextGateType) {
    persist(rows.map((row) => (
      row.id === id ? { ...row, gateType: normalizePreboardGateType(nextGateType) } : row
    )))
  }

  function resetDefaults() {
    persist(PREBOARD_GATE_TYPES)
  }

  const hasRows = useMemo(() => rows.length > 0, [rows.length])
  const sortedRows = useMemo(() => (
    rows
      .filter((row) => viewTerminal === 'ALL' || normalizePreboardTerminal(row.terminal) === viewTerminal)
      .sort((a, b) => (
      normalizePreboardTerminal(a.terminal).localeCompare(normalizePreboardTerminal(b.terminal))
      || normalizePreboardGate(a.ghr).localeCompare(normalizePreboardGate(b.ghr), undefined, { numeric: true })
    ))
  ), [rows, viewTerminal])

  return (
    <section className="panel preboard-flat-config">
      <div className="preboard-flat-header">
        <div>
          <h2>Preboard Config</h2>
          <p className="muted">Gate type colours feed the Preboard Gate column.</p>
        </div>
        <div className="preboard-config-actions">
          <select value={viewTerminal} onChange={(e) => setViewTerminal(e.target.value)}>
            {['ALL', 'T1', 'T2', 'T3', 'T4'].map((item) => <option key={item} value={item}>{item === 'ALL' ? 'All terminals' : item}</option>)}
          </select>
          <button type="button" className="btn-secondary" onClick={resetDefaults}>Reset Defaults</button>
        </div>
      </div>

      <div className="toolbar-row preboard-add-row">
        <select value={terminal} onChange={(e) => setTerminal(e.target.value)}>
          {['T1', 'T2', 'T3', 'T4'].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <input placeholder="GHR" value={ghr} onChange={(e) => setGhr(e.target.value)} />
        <select value={gateType} onChange={(e) => setGateType(e.target.value)}>
          {PREBOARD_GATE_TYPE_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="button" onClick={addRow}>Add</button>
      </div>

      <div className="table-wrap preboard-config-table-wrap" style={{ marginTop: 12 }}>
        <table className="preboard-flat-config-table">
          <thead>
            <tr>
              <th>TERMINAL</th>
              <th>GHR</th>
              <th>GATE TYPE</th>
              <th>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {!hasRows && (
              <tr>
                <td colSpan={4} className="muted">No rows yet.</td>
              </tr>
            )}
            {sortedRows.map((row) => (
              <tr key={row.id}>
                <td>{row.terminal}</td>
                <td>{row.ghr}</td>
                <td>
                  <div className={`preboard-type-picker ${getPreboardGateTypeClass(row.gateType)}`}>
                    <span>{normalizePreboardGateType(row.gateType)}</span>
                    <select aria-label={`Gate type for ${row.terminal} ${row.ghr}`} value={normalizePreboardGateType(row.gateType)} onChange={(e) => updateGateType(row.id, e.target.value)}>
                      {PREBOARD_GATE_TYPE_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                </td>
                <td>
                  <button type="button" className="btn-secondary" onClick={() => removeRow(row.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
