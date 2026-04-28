import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'
import './styles.css'

const basename = window.location.pathname.startsWith('/app') ? '/app' : '/'
const useHashRouter = (import.meta.env.VITE_USE_MOCK === 'true') || window.location.hostname.endsWith('github.io')
const Router = useHashRouter ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router basename={useHashRouter ? undefined : basename}>
      <App />
    </Router>
  </React.StrictMode>
)
