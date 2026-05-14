import { useMemo, useState } from 'react'

const STORAGE_KEY = 'preboard_terminal_ghr_gate_type_rows'

function readRows() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default function PreboardConfigPage() {
  const [terminal, setTerminal] = useState('')
  const [ghr, setGhr] = useState('')
  const [gateType, setGateType] = useState('')
  const [rows, setRows] = useState(() => readRows())

  function persist(nextRows) {
    setRows(nextRows)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRows))
  }

  function addRow() {
    const t = terminal.trim().toUpperCase()
    const g = ghr.trim()
    const gt = gateType.trim()
    if (!t || !g || !gt) return
    const next = [{ id: `${Date.now()}-${Math.random()}`, terminal: t, ghr: g, gateType: gt }, ...rows]
    persist(next)
    setTerminal('')
    setGhr('')
    setGateType('')
  }

  function removeRow(id) {
    persist(rows.filter((row) => row.id !== id))
  }

  const hasRows = useMemo(() => rows.length > 0, [rows.length])

  return (
    <section className="panel">
      <h2>Preboard Config</h2>
      <div className="toolbar-row">
        <input placeholder="Terminal (e.g. T1)" value={terminal} onChange={(e) => setTerminal(e.target.value)} />
        <input placeholder="GHR" value={ghr} onChange={(e) => setGhr(e.target.value)} />
        <input placeholder="Gate Type" value={gateType} onChange={(e) => setGateType(e.target.value)} />
        <button type="button" onClick={addRow}>Add</button>
      </div>

      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table>
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
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.terminal}</td>
                <td>{row.ghr}</td>
                <td>{row.gateType}</td>
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

