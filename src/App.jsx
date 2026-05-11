import { useState, useMemo, useEffect } from 'react'
import './App.css'
import { bomData as initialBom } from './data/bomData'
import { buildData as initialBuilds } from './buildData'
import Dashboard from './components/Dashboard'
import Budget from './components/Budget'
import BOMTable from './components/BOMTable'
import SupplierMatrix from './components/SupplierMatrix'
import UploadPanel from './components/UploadPanel'
import BuildMatrix from './components/BuildMatrix'
import BOMExplorer from './components/BOMExplorer'
import Inventory from './components/Inventory'
import DevTrack from './components/DevTrack'
import { calcAlerts } from './utils/alertEngine'

const DEFAULT_PLAN = {
  smt: [
    { site: 'CM1 China',   materialDrive: 4000, mih: '6/22/26', buildStart: '6/29/26' },
    { site: 'CM2 China',   materialDrive: 3992, mih: '6/29/26', buildStart: '7/6/26'  },
    { site: 'CM3 Vietnam', materialDrive: 1800, mih: '7/6/26',  buildStart: '7/12/26' },
  ],
  fatp: [
    { site: 'CM1 China',   materialDrive: 1600, mih: '7/6/26',  buildStart: '7/12/26' },
    { site: 'CM2 China',   materialDrive: 1450, mih: '7/12/26', buildStart: '7/19/26' },
    { site: 'CM3 Vietnam', materialDrive: 1300, mih: '7/19/26', buildStart: '7/26/26' },
  ],
}

export function makeProject(name) {
  return {
    id:      crypto.randomUUID(),
    name,
    budget:  12000,
    plan:    JSON.parse(JSON.stringify(DEFAULT_PLAN)),
    history: [],
  }
}

function App() {
  const [activePage, setActivePage] = useState('dashboard')
  const [bom,    setBom]    = useState(initialBom)
  const [builds, setBuilds] = useState(() => {
    try {
      const saved = localStorage.getItem('dashboard-builds')
      if (saved) return JSON.parse(saved)
    } catch {}
    return initialBuilds
  })

  // ── Projects (with per-project budget) — persisted to localStorage ────────
  const [projects, setProjects] = useState(() => {
    try {
      const saved = localStorage.getItem('dashboard-projects')
      if (saved) return JSON.parse(saved)
    } catch {}
    return [makeProject('Project A'), makeProject('Project B')]
  })

  const [activeProjectId, setActiveProjectId] = useState(
    () => localStorage.getItem('dashboard-activeId') ?? null
  )

  useEffect(() => {
    localStorage.setItem('dashboard-builds', JSON.stringify(builds))
  }, [builds])

  useEffect(() => {
    localStorage.setItem('dashboard-projects', JSON.stringify(projects))
  }, [projects])

  useEffect(() => {
    const id = activeProjectId ?? projects[0]?.id
    if (id) localStorage.setItem('dashboard-activeId', id)
  }, [activeProjectId, projects])

  const resolvedActiveId = activeProjectId ?? projects[0]?.id
  const activeProject    = projects.find(p => p.id === resolvedActiveId) ?? projects[0]
  const budget           = activeProject?.budget ?? 12000

  function setActiveBudget(v) {
    setProjects(prev => prev.map(p => p.id === resolvedActiveId ? { ...p, budget: v } : p))
  }

  const alerts      = useMemo(() => calcAlerts(bom, builds, budget), [bom, builds, budget])
  const alertCount  = alerts.length
  const dangerCount = alerts.filter(a => a.type === 'danger').length

  const navItems = [
    { id: 'dashboard',   label: 'Dashboard' },
    { id: 'budget',      label: 'Budget' },
    { id: 'bomExplorer', label: 'BOM Explorer' },
    { id: 'bom',         label: 'Cost BOM' },
    { id: 'suppliers',   label: 'Suppliers' },
    { id: 'upload',      label: 'Upload' },
    { id: 'buildMatrix', label: 'Build Matrix' },
    { id: 'alerts',      label: 'Alerts', badge: alertCount },
    { id: 'orders',      label: 'Orders' },
    { id: 'inventory',   label: 'Inventory' },
    { id: 'devtrack',    label: 'DevTrack' },
    { id: 'reports',     label: 'Reports' },
    { id: 'settings',    label: 'Settings' },
  ]

  function renderPage() {
    switch (activePage) {
      case 'dashboard':
        return (
          <Dashboard
            projects={projects} setProjects={setProjects}
            activeProjectId={resolvedActiveId} setActiveProjectId={setActiveProjectId}
          />
        )
      case 'budget':
        return (
          <Budget
            bom={bom} builds={builds}
            projects={projects} setProjects={setProjects}
            activeProjectId={resolvedActiveId} setActiveProjectId={setActiveProjectId}
          />
        )
      case 'bomExplorer':
        return <BOMExplorer />
      case 'bom':
        return <BOMTable bom={bom} setBom={setBom} alerts={alerts} />
      case 'suppliers':
        return <SupplierMatrix bom={bom} />
      case 'upload':
        return <UploadPanel />
      case 'buildMatrix':
        return (
          <BuildMatrix
            builds={builds} setBuilds={setBuilds}
            bom={bom}
            alerts={alerts}
            budget={budget} setBudget={setActiveBudget}
            projects={projects}
            activeProjectId={resolvedActiveId} setActiveProjectId={setActiveProjectId}
          />
        )
      case 'inventory':
        return <Inventory />
      case 'devtrack':
        return <DevTrack />
      case 'alerts':
        return <AlertsPage alerts={alerts} onNavigate={setActivePage} />
      default:
        return (
          <>
            <h1>{navItems.find(n => n.id === activePage)?.label}</h1>
            <p>Welcome to the {activePage} page!</p>
          </>
        )
    }
  }

  return (
    <div className="app-container">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h2>SC Dashboard</h2>
          {alertCount > 0 && (
            <div className={`global-alert-badge ${dangerCount > 0 ? 'badge-danger' : 'badge-warning'}`}>
              {alertCount} alert{alertCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>
        <ul className="nav-menu">
          {navItems.map(item => (
            <li
              key={item.id}
              className={activePage === item.id ? 'active' : ''}
              onClick={() => setActivePage(item.id)}
            >
              {item.label}
              {item.badge > 0 && (
                <span className={`nav-badge ${dangerCount > 0 ? 'nav-badge-danger' : 'nav-badge-warning'}`}>
                  {item.badge}
                </span>
              )}
            </li>
          ))}
        </ul>

        <div className="sidebar-export">
          <button
            className="btn-sidebar-export"
            onClick={() => {
              const payload = {
                exportedAt: new Date().toISOString(),
                projects,
                builds,
                bom,
                alerts,
              }
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
              )
              Object.assign(document.createElement('a'), {
                href: url,
                download: `sc-dashboard-${new Date().toISOString().slice(0,10)}.json`,
              }).click()
              URL.revokeObjectURL(url)
            }}
          >
            ⬇ Export Dashboard JSON
          </button>

          <label className="btn-sidebar-import" title="Import a previously exported dashboard JSON">
            ⬆ Import JSON
            <input
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = evt => {
                  try {
                    const data = JSON.parse(evt.target.result)
                    if (data.bom)      setBom(data.bom)
                    if (data.builds)   setBuilds(data.builds)
                    if (data.projects) setProjects(data.projects)
                  } catch {
                    alert('Invalid JSON file — could not import.')
                  }
                }
                reader.readAsText(file)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      </nav>

      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  )
}

// ── Alerts Page ───────────────────────────────────────────────────────────────
function AlertsPage({ alerts, onNavigate }) {
  const icons = { danger: '🔴', warning: '🟡', info: 'ℹ️' }

  if (!alerts.length) {
    return (
      <div>
        <h1>Alerts</h1>
        <div className="no-alerts">All configurations look healthy — no active alerts.</div>
      </div>
    )
  }

  function Section({ title, items }) {
    if (!items.length) return null
    return (
      <div className="alert-section">
        <h3 className="alert-section-title">{title} ({items.length})</h3>
        {items.map(a => (
          <div key={a.id} className={`alert-item alert-${a.type}`}>
            <span className="alert-icon">{icons[a.type]}</span>
            <div>
              <div className="alert-title">{a.title}</div>
              <div className="alert-msg">{a.message}</div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="alerts-page">
      <h1>Alerts ({alerts.length})</h1>
      <p className="upload-subtitle">
        Fix in{' '}
        <span className="link-btn" onClick={() => onNavigate('buildMatrix')}>Build Matrix</span>
        {' '}or{' '}
        <span className="link-btn" onClick={() => onNavigate('bom')}>BOM</span>.
      </p>
      <Section title="Budget Overruns"  items={alerts.filter(a => a.type === 'danger')} />
      <Section title="MOQ Shortfalls"   items={alerts.filter(a => a.type === 'warning')} />
      <Section title="Info"             items={alerts.filter(a => a.type === 'info')} />
    </div>
  )
}

export default App
