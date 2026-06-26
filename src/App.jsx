import { useState, useMemo, useEffect, Component } from 'react'
import './App.css'
import { bomData as initialBom } from './data/bomData'
import { bomPartsOnly } from './data/bomSkuData'
import { buildData as initialBuilds } from './buildData'
import Dashboard from './components/Dashboard'
import Budget from './components/Budget'
import BOMTable from './components/BOMTable'
import SupplierMatrix from './components/SupplierMatrix'
import UploadPanel from './components/UploadPanel'
import BuildMatrix from './components/BuildMatrix'
import BOMExplorer from './components/BOMExplorer'
import Inventory from './components/Inventory'
import MaterialRequest from './components/MaterialRequest'
import DevTrack from './components/DevTrack'
import Materials from './components/Materials'
import Allocation from './components/Allocation'
import Quotation from './components/Quotation'
import { calcAlerts, calcMaterialShortages } from './utils/alertEngine'

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
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem('sidebar-open') !== 'false' } catch { return true }
  })

  function toggleSidebar() {
    setSidebarOpen(v => {
      localStorage.setItem('sidebar-open', String(!v))
      return !v
    })
  }

  const [activePage, setActivePage] = useState(() => {
    const p = new URLSearchParams(window.location.search)
    return p.get('page') === 'msdevtrack' ? 'msdevtrack' : 'dashboard'
  })
  const [pendingAction] = useState(() => {
    const p = new URLSearchParams(window.location.search)
    return { action: p.get('action'), id: p.get('id') }
  })
  const explorerParts = bomPartsOnly.map(r => ({
    id:          r.id || crypto.randomUUID(),
    kpn:         r.pn || '',
    description: r.description || '',
    rev:         r.rev || '',
    supplier:    (r.mfr && typeof r.mfr === 'object') ? (r.mfr.n || '') : (r.mfr || ''),
    mpn:         r.mpn || '',
    qtyPerUnit:  Number(r.usage) || 1,
    category:    r.level === 0 ? 'SKU' : r.level === 1 ? 'Assembly' : r.level === 2 ? 'Sub-Assembly' : 'Component',
  }))

  const [bom, setBom] = useState(() => {
    try {
      const s = localStorage.getItem('dashboard-bom')
      const saved = s ? JSON.parse(s) : initialBom
      // Migrate: fix any parts where supplier was saved as an object {n,a} instead of a string
      const sanitized = saved.map(p =>
        p.supplier && typeof p.supplier === 'object'
          ? { ...p, supplier: p.supplier.n || '' }
          : p
      )
      // Merge BOM Explorer parts — add any not already present by kpn
      const existingKpns = new Set(sanitized.map(p => p.kpn).filter(Boolean))
      const newParts = explorerParts.filter(p => p.kpn && !existingKpns.has(p.kpn))
      return newParts.length > 0 ? [...sanitized, ...newParts] : sanitized
    } catch { return [...initialBom, ...explorerParts] }
  })
  const [builds, setBuilds] = useState(() => {
    try {
      const saved = localStorage.getItem('dashboard-builds')
      if (saved) return JSON.parse(saved)
    } catch {}
    return initialBuilds
  })

  const [inventoryItems, setInventoryItems] = useState(() => {
    try { const s = localStorage.getItem('inventory-items'); return s ? JSON.parse(s) : [] } catch { return [] }
  })
  useEffect(() => { localStorage.setItem('inventory-items', JSON.stringify(inventoryItems)) }, [inventoryItems])

  // ── Projects (with per-project budget) — persisted to localStorage ────────
  const [projects, setProjects] = useState(() => {
    try {
      const saved = localStorage.getItem('dashboard-projects')
      if (saved) return JSON.parse(saved)
    } catch {}
    return [makeProject('Project A'), makeProject('Project B')]
  })

  const [activeProjectId, setActiveProjectId] = useState(null)

  const [materials, setMaterials] = useState(() => {
    try { const s = localStorage.getItem('bm-materials'); return s ? JSON.parse(s) : [] } catch { return [] }
  })
  const [allocations, setAllocations] = useState(() => {
    try { const s = localStorage.getItem('bm-allocations'); return s ? JSON.parse(s) : [] } catch { return [] }
  })

  useEffect(() => {
    localStorage.setItem('dashboard-builds', JSON.stringify(builds))
  }, [builds])

  useEffect(() => {
    localStorage.setItem('dashboard-bom', JSON.stringify(bom))
  }, [bom])

  useEffect(() => {
    localStorage.setItem('bm-materials', JSON.stringify(materials))
  }, [materials])

  useEffect(() => {
    localStorage.setItem('bm-allocations', JSON.stringify(allocations))
  }, [allocations])

  useEffect(() => {
    localStorage.setItem('dashboard-projects', JSON.stringify(projects))
  }, [projects])

  useEffect(() => {
    if (activeProjectId) localStorage.setItem('dashboard-activeId', activeProjectId)
    else localStorage.removeItem('dashboard-activeId')
  }, [activeProjectId])

  const resolvedActiveId = activeProjectId ?? projects[0]?.id
  const activeProject    = projects.find(p => p.id === resolvedActiveId) ?? projects[0]
  const budget           = activeProject?.budget ?? 12000

  function setActiveBudget(v) {
    setProjects(prev => prev.map(p => p.id === resolvedActiveId ? { ...p, budget: v } : p))
  }

  const alerts      = useMemo(() => [
    ...calcAlerts(bom, builds, budget),
    ...calcMaterialShortages(materials, builds, allocations),
  ], [bom, builds, budget, materials, allocations])
  const alertCount  = alerts.length
  const dangerCount = alerts.filter(a => a.type === 'danger').length

  const [collapsedCats, setCollapsedCats] = useState(new Set())
  const toggleCat = label => setCollapsedCats(prev => {
    const next = new Set(prev)
    next.has(label) ? next.delete(label) : next.add(label)
    return next
  })

  const navItems = [
    { id: 'dashboard',   label: 'Dashboard' },
    { type: 'category',  label: 'Program Management', collapsible: true },
    { id: 'budget',      label: 'Budget' },
    { id: 'buildMatrix', label: 'Build Matrix' },
    { id: 'alerts',      label: 'Alerts', badge: alertCount },
    { id: 'msdevtrack',  label: 'MSDevTrack' },
    { id: 'reports',     label: 'Reports' },
    { type: 'category',  label: 'Supply Chain' },
    { id: 'bomExplorer', label: 'BOM Explorer' },
    { id: 'suppliers',   label: 'Suppliers' },
    { id: 'inventory',   label: 'Inventory' },
    { id: 'materials',   label: 'Materials' },
    { id: 'requests',    label: 'Requests' },
    { id: 'allocation',  label: 'Allocation' },
    { id: 'quotations',  label: 'Quotations' },
    { id: 'orders',      label: 'Orders' },
    { id: 'settings',    label: 'Settings' },
  ]

  function renderPage() {
    switch (activePage) {
      case 'dashboard':
        return (
          <Dashboard
            projects={projects} setProjects={setProjects}
            activeProjectId={activeProjectId} setActiveProjectId={setActiveProjectId}
          />
        )
      case 'budget':
        return (
          <Budget
            bom={bom} builds={builds}
            projects={projects} setProjects={setProjects}
            activeProjectId={activeProjectId} setActiveProjectId={setActiveProjectId}
          />
        )
      case 'bomExplorer':
        return <BOMExplorer />
      case 'bom':
        return <div className="dashboard-page"><BOMTable bom={bom} setBom={setBom} alerts={alerts} /></div>
      case 'suppliers':
        return <div className="dashboard-page"><SupplierMatrix bom={bom} /></div>
      case 'upload':
        return <div className="dashboard-page"><UploadPanel /></div>
      case 'buildMatrix':
        return (
          <BuildMatrix
            builds={builds} setBuilds={setBuilds}
            bom={bom} setBom={setBom}
            alerts={alerts}
            budget={budget} setBudget={setActiveBudget}
            projects={projects} setProjects={setProjects}
            activeProjectId={resolvedActiveId} setActiveProjectId={setActiveProjectId}
            allocations={allocations} setAllocations={setAllocations}
          />
        )
      case 'inventory':
        return <Inventory bom={bom} setBom={setBom} builds={builds} projects={projects} activeProjectId={resolvedActiveId} items={inventoryItems} setItems={setInventoryItems} />
      case 'requests':
        return <MaterialRequest bom={bom} inventoryItems={inventoryItems} setInventoryItems={setInventoryItems} />
      case 'msdevtrack':
        return <DevTrack pendingAction={pendingAction} />
      case 'materials':
        return (
          <Materials
            materials={materials} setMaterials={setMaterials}
            builds={builds}
            allocations={allocations}
          />
        )
      case 'allocation':
        return (
          <Allocation
            allocations={allocations} setAllocations={setAllocations}
            builds={builds}
          />
        )
      case 'quotations':
        return <Quotation />
      case 'alerts':
        return <AlertsPage alerts={alerts} onNavigate={setActivePage} />
      default:
        return (
          <div className="dashboard-page">
            <h1>{navItems.find(n => n.id === activePage)?.label}</h1>
            <p>Welcome to the {activePage} page!</p>
          </div>
        )
    }
  }

  return (
    <div className="app-container">
      {/* Overlay backdrop */}
      {sidebarOpen && <div className="sidebar-backdrop" onClick={toggleSidebar} />}

      {/* Hamburger button — always visible top-left */}
      <button className="sidebar-hamburger" onClick={toggleSidebar} title="Menu">
        <span /><span /><span />
        {alertCount > 0 && (
          <div className={`hamburger-alert-dot ${dangerCount > 0 ? 'badge-danger' : 'badge-warning'}`} />
        )}
      </button>

      {/* Slide-out drawer */}
      <nav className={`sidebar sidebar-drawer${sidebarOpen ? ' sidebar-drawer-open' : ''}`}>
        <div className="sidebar-header">
          <h2>Build Manager</h2>
          <button className="sidebar-close-btn" onClick={toggleSidebar}>✕</button>
          {alertCount > 0 && (
            <div className={`global-alert-badge ${dangerCount > 0 ? 'badge-danger' : 'badge-warning'}`}>
              {alertCount} alert{alertCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>
        <ul className="nav-menu">
          {(() => {
            let currentCat = null
            return navItems.map((item, idx) => {
              if (item.type === 'category') {
                currentCat = item.label
                return (
                  <li
                    key={`cat-${idx}`}
                    className={`nav-category${item.collapsible ? ' collapsible' : ''}`}
                    onClick={item.collapsible ? () => toggleCat(item.label) : undefined}
                  >
                    {item.label}
                    {item.collapsible && (
                      <span className="nav-cat-chevron">
                        {collapsedCats.has(item.label) ? '▶' : '▾'}
                      </span>
                    )}
                  </li>
                )
              }
              if (currentCat && collapsedCats.has(currentCat)) return null
              return (
                <li
                  key={item.id}
                  className={activePage === item.id ? 'active' : ''}
                  onClick={() => { setActivePage(item.id); setSidebarOpen(false) }}
                >
                  {item.label}
                  {item.badge > 0 && (
                    <span className={`nav-badge ${dangerCount > 0 ? 'nav-badge-danger' : 'nav-badge-warning'}`}>
                      {item.badge}
                    </span>
                  )}
                </li>
              )
            })
          })()}
        </ul>

        <div className="sidebar-export">
          <button
            className="btn-sidebar-export"
            onClick={() => {
              const devtrackItems   = (() => { try { return JSON.parse(localStorage.getItem('devtrack-items'))   || [] } catch { return [] } })()
              const devtrackCols    = (() => { try { return JSON.parse(localStorage.getItem('devtrack-cols'))    || [] } catch { return [] } })()
              const devtrackHistory = (() => { try { return JSON.parse(localStorage.getItem('devtrack-history')) || [] } catch { return [] } })()
              const payload = {
                exportedAt: new Date().toISOString(),
                projects,
                builds,
                bom,
                alerts,
                devtrackItems,
                devtrackCols,
                devtrackHistory,
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
                    if (data.bom)             setBom(data.bom)
                    if (data.builds)          setBuilds(data.builds)
                    if (data.projects)        setProjects(data.projects)
                    if (data.devtrackItems)   localStorage.setItem('devtrack-items',   JSON.stringify(data.devtrackItems))
                    if (data.devtrackCols)    localStorage.setItem('devtrack-cols',    JSON.stringify(data.devtrackCols))
                    if (data.devtrackHistory) localStorage.setItem('devtrack-history', JSON.stringify(data.devtrackHistory))
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

const DASHBOARD_PASSWORD = 'hodded-guxNuf-7dibtu'

function PasswordGate({ onUnlock }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    if (input === DASHBOARD_PASSWORD) {
      try { localStorage.setItem('sc-auth', '1') } catch {}
      onUnlock()
    } else {
      setError(true)
      setInput('')
    }
  }

  return (
    <div className="pw-gate">
      <div className="pw-box">
        <h2 className="pw-title">SC Dashboard</h2>
        <p className="pw-sub">Enter password to continue</p>
        <form onSubmit={handleSubmit}>
          <input
            className="pw-input"
            type="password"
            placeholder="Password"
            value={input}
            onChange={e => { setInput(e.target.value); setError(false) }}
            autoFocus
          />
          {error && <div className="pw-error">Incorrect password. Try again.</div>}
          <button className="pw-btn" type="submit">Unlock</button>
        </form>
      </div>
    </div>
  )
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, fontFamily: 'sans-serif', maxWidth: 600, margin: '0 auto' }}>
          <h2 style={{ color: '#dc2626' }}>Something went wrong</h2>
          <p style={{ color: '#374151' }}>Your data is safe. Try refreshing the page.</p>
          <p style={{ color: '#6b7280', fontSize: 13 }}>{String(this.state.error)}</p>
          <button
            style={{ marginTop: 16, padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
            onClick={() => window.location.reload()}
          >Reload</button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function AppWithAuth() {
  const [unlocked, setUnlocked] = useState(() => {
    try { return localStorage.getItem('sc-auth') === '1' } catch { return false }
  })
  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />
  return (
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  )
}
