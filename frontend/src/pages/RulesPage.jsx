const rules = [
  {
    title: 'Shift Status Definitions',
    content: (
      <ul>
        <li><strong>W</strong> — 13 working hours.</li>
        <li><strong>O</strong> — Off day (0 hours).</li>
        <li><strong>OT1</strong> — Overtime, 5 forecast hours.</li>
        <li><strong>OT2</strong> — Overtime, 13 forecast hours.</li>
      </ul>
    ),
  },
  {
    title: 'Forecasted Hours Formula',
    content: (
      <>
        <p style={{ fontFamily: 'monospace', background: 'var(--bg-subtle)', padding: '8px 12px', borderRadius: 'var(--r-md)', display: 'inline-block', marginBottom: 8 }}>
          Forecast = (W × 13) + (OT1 × 5) + (OT2 × 13)
        </p>
        <p>The value recalculates immediately whenever a day status changes.</p>
      </>
    ),
  },
  {
    title: 'Consecutive Working Day Rule',
    content: (
      <ul>
        <li>Working statuses are <strong>W</strong>, <strong>OT1</strong>, and <strong>OT2</strong>.</li>
        <li>Maximum allowed consecutive working days is <strong>12</strong>.</li>
        <li>If a change violates this rule, the system blocks the change and alerts the user.</li>
      </ul>
    ),
  },
  {
    title: 'Start Date Lock Rule',
    content: (
      <ul>
        <li>An officer's start date controls the roster generation start point.</li>
        <li>Days before the start date are locked as <strong>EMPTY</strong> and cannot be edited.</li>
      </ul>
    ),
  },
  {
    title: 'OT Rules',
    content: (
      <ul>
        <li><strong>OT1</strong> — First 8 hours ×2.0, balance ×1.5 (payroll interpretation). Roster forecast uses 5 hours.</li>
        <li><strong>OT2</strong> — All hours ×1.5 (payroll interpretation). Roster forecast uses 13 hours.</li>
      </ul>
    ),
  },
]

export default function RulesPage() {
  return (
    <>
      {rules.map((rule, idx) => (
        <section key={idx} className="panel" style={{ borderLeft: '3px solid var(--accent)' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              borderRadius: 'var(--r-full)',
              background: 'var(--accent-subtle)',
              color: 'var(--accent-text)',
              fontSize: 11,
              fontWeight: 700,
              flexShrink: 0,
            }}>
              {idx + 1}
            </span>
            {rule.title}
          </h2>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            {rule.content}
          </div>
        </section>
      ))}
    </>
  )
}
