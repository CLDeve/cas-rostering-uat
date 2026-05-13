const door4Rules = [
  {
    title: 'AI Agent Planning',
    content: (
      <ul>
        <li>The AI planning agent prioritizes and fulfills flights in the next <strong>2-hour window</strong>.</li>
        <li>As time advances, planning continuously rolls forward to cover the upcoming 2 hours.</li>
        <li>Live flight refresh runs periodically; when flight timing/status changes, planning is re-evaluated automatically.</li>
      </ul>
    ),
  },
  {
    title: 'ETA Readiness Rule',
    content: (
      <ul>
        <li>Officers must be at the assigned gate at least <strong>15 minutes before ETA</strong>.</li>
        <li>Planning and deployment must enforce this ETA-15 requirement for every assignment.</li>
      </ul>
    ),
  },
  {
    title: 'Terminal and Gate Rule',
    content: (
      <ul>
        <li>Each officer is constrained to a single terminal group within an active assignment sequence.</li>
        <li>Cross-terminal assignment chains are blocked and invalid cross-terminal links are auto-removed.</li>
        <li><strong>One Gate</strong>: officer can be assigned to only one gate at a time.</li>
        <li><strong>Multiple Gate</strong>: officer can be assigned to multiple gates up to shift end time.</li>
      </ul>
    ),
  },
  {
    title: 'Ad-hoc Officer Scope',
    content: (
      <ul>
        <li>Officers added via <strong>Add Officer</strong> are local to Door 4 deployment board.</li>
        <li>Ad-hoc officer creation requires <strong>Terminal</strong> selection (<strong>T1/T2/T3/T4</strong>).</li>
        <li>They are not added into the Rostering Engine employee master list.</li>
      </ul>
    ),
  },
  {
    title: 'Flight Assignment Constraints',
    content: (
      <ul>
        <li>Departed flights are hidden by default from active planning.</li>
        <li>Terminal 4 flights are excluded from Door 4 departure board.</li>
        <li>Walking-time validation can block impossible gate-to-gate transitions.</li>
        <li>Assignments that fail timing feasibility (walk time + readiness/coverage window) are auto-removed.</li>
        <li>If a flight status changes to <strong>Cancelled</strong>, the assigned officer is auto-unassigned.</li>
        <li>Flight statuses are color-coded (for example: Confirmed, Landed, Delayed, Cancelled) for fast visibility.</li>
      </ul>
    ),
  },
]

export default function Door4RulesPage() {
  return (
    <>
      {door4Rules.map((rule, idx) => (
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
