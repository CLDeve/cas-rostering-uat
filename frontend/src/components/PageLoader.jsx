export default function PageLoader({ text = 'Loading...' }) {
  return (
    <div className="page-loader-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="page-loader-card">
        <span className="page-loader-spinner" />
        <span>{text}</span>
      </div>
    </div>
  )
}
