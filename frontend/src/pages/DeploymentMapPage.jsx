import { useEffect, useState } from 'react'
import { listDeployments } from '../api'

function hasCoords(site) {
  const lat = Number(site?.site_latitude)
  const lng = Number(site?.site_longitude)
  return Number.isFinite(lat) && Number.isFinite(lng)
}

export default function DeploymentMapPage() {
  const [status, setStatus] = useState('')
  const [sites, setSites] = useState([])

  useEffect(() => {
    async function load() {
      try {
        const items = await listDeployments()
        setSites(Array.isArray(items) ? items : [])
      } catch (err) {
        setStatus(`Unable to load deployment sites: ${err.message}`)
        setSites([])
      }
    }
    load()
  }, [])

  const sitesWithCoords = sites.filter(hasCoords)

  return (
    <>
      <section className="panel">
        <h2>Deployment Map</h2>
        <p className="muted">Map view for deployment sites (using latitude and longitude from Static Deployment Config).</p>
        {status && <div className="alert alert-error">{status}</div>}
      </section>

      <section className="panel">
        <div className="table-title">Sites with coordinates: {sitesWithCoords.length}</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Site Name</th>
                <th>Latitude</th>
                <th>Longitude</th>
              </tr>
            </thead>
            <tbody>
              {sitesWithCoords.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                    No sites with coordinates yet.
                  </td>
                </tr>
              ) : (
                sitesWithCoords.map((site) => (
                  <tr key={site.id}>
                    <td>{site.site_name}</td>
                    <td>{site.site_latitude}</td>
                    <td>{site.site_longitude}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
