import { useState, useMemo } from 'react'
import { getBestSupplier } from '../utils/costEngine'
import EditableCell from './EditableCell'

function getBoardPrefix(configName) {
  if (configName.startsWith('E2CMB')) return 'E2CMB'
  if (configName.startsWith('E2CAB')) return 'E2CAB'
  if (configName.startsWith('E2CF'))  return 'E2CF'
  return null
}

export default function Budget({ bom, builds, projects, setProjects, activeProjectId, setActiveProjectId }) {
  const [search, setSearch] = useState('')

  const resolvedId = activeProjectId ?? null
  const active     = resolvedId ? projects.find(p => p.id === resolvedId) ?? null : null
  const budget           = active?.budget ?? 12000
  const filteredProjects = projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

  function setBudget(v) {
    setProjects(prev => prev.map(p => p.id === resolvedId ? { ...p, budget: v } : p))
  }

  const consumption = useMemo(() => {
    return bom.map(part => {
      const boardBuilds   = builds.filter(b => getBoardPrefix(b.Config) === part.appliesTo)
      const totalBuildQty = boardBuilds.reduce((sum, b) => sum + b.Quantity, 0)
      const totalConsumed = totalBuildQty * part.qtyPerUnit
      const best          = getBestSupplier(part)
      const totalSpend    = totalConsumed * best.unitCost
      return {
        id: part.id,
        description: part.description,
        category: part.category,
        board: part.appliesTo,
        qtyPerUnit: part.qtyPerUnit,
        totalBuildQty,
        totalConsumed,
        unitCost: best.unitCost,
        bestSupplier: best.name,
        totalSpend,
      }
    }).sort((a, b) => b.totalSpend - a.totalSpend)
  }, [bom, builds])

  const totalSpend         = consumption.reduce((sum, p) => sum + p.totalSpend, 0)
  const totalBudget        = budget * builds.length
  const utilization        = totalBudget > 0 ? (totalSpend / totalBudget) * 100 : 0
  const totalConsumedUnits = consumption.reduce((sum, p) => sum + p.totalConsumed, 0)
  const overBudget         = totalSpend > totalBudget

  const fillClass = utilization > 100 ? 'fill-danger' : utilization > 80 ? 'fill-warning' : 'fill-ok'
  const cardClass = utilization > 100 ? 'stat-card-danger' : utilization > 80 ? 'stat-card-warn' : 'stat-card-ok'

  const byCategory   = consumption.reduce((acc, p) => { acc[p.category] = (acc[p.category] ?? 0) + p.totalSpend; return acc }, {})
  const categoryRows = Object.entries(byCategory).sort((a, b) => b[1] - a[1])

  return (
    <div className="dashboard-page">
      <h1>Budget</h1>

      {/* ── Project dropdown ─────────────────────────────────────────── */}
      <div className="proj-bar">
        <div className="proj-selector-group">
          <label className="proj-selector-label">Project</label>
          <div className="proj-dropdown-wrap">
            <div className="proj-search-wrap">
              <span className="proj-search-icon">⌕</span>
              <input
                className="proj-search-input"
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && <button className="proj-search-clear" onClick={() => setSearch('')}>×</button>}
            </div>
            <select
              className="proj-select"
              value={resolvedId ?? ''}
              onChange={e => { setActiveProjectId(e.target.value || null); setSearch('') }}
            >
              <option value=''>— Select a project —</option>
              {filteredProjects.length > 0
                ? filteredProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
                : <option disabled>No matches</option>
              }
            </select>
          </div>
        </div>

        {active && (
          <div className="proj-active-badge" style={{ marginLeft: 'auto' }}>
            Budget per run:&nbsp;
            <strong>
              <EditableCell value={budget} onChange={setBudget} min={0} prefix="$" decimals={0} />
            </strong>
          </div>
        )}
      </div>

      {!active && <p style={{ color: '#94a3b8', marginTop: 32, fontSize: 15 }}>Select a project to view its budget.</p>}
      {active && <>

      {/* ── Summary cards ────────────────────────────────────────────── */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">${Math.round(totalSpend).toLocaleString()}</div>
          <div className="stat-label">Total BOM Spend</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">${Math.round(totalBudget).toLocaleString()}</div>
          <div className="stat-label">Total Budget ({builds.length} runs × ${budget.toLocaleString()})</div>
        </div>
        <div className={`stat-card ${cardClass}`}>
          <div className="stat-value">{utilization.toFixed(1)}%</div>
          <div className="stat-label">{overBudget ? 'Over Budget ⚠' : 'Budget Utilization'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalConsumedUnits.toLocaleString()}</div>
          <div className="stat-label">Total Parts Consumed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">${(totalSpend / Math.max(1, totalConsumedUnits)).toFixed(2)}</div>
          <div className="stat-label">Avg Cost / Part</div>
        </div>
      </div>

      {/* ── Budget bar ───────────────────────────────────────────────── */}
      <div className="budget-bar-wrap">
        <div className="budget-bar-label">
          <span>Spend: <strong>${Math.round(totalSpend).toLocaleString()}</strong></span>
          <span>Budget: <strong>${Math.round(totalBudget).toLocaleString()}</strong></span>
        </div>
        <div className="budget-bar-track">
          <div className={`budget-bar-fill ${fillClass}`} style={{ width: `${Math.min(utilization, 100)}%` }} />
        </div>
        <div className="budget-bar-sub">
          {overBudget
            ? `$${Math.round(totalSpend - totalBudget).toLocaleString()} over budget`
            : `$${Math.round(totalBudget - totalSpend).toLocaleString()} remaining`}
        </div>
      </div>

      {/* ── Spend by Category ────────────────────────────────────────── */}
      <h2 className="section-title">Spend by Category</h2>
      <div className="category-grid">
        {categoryRows.map(([cat, spend]) => {
          const pct = totalSpend > 0 ? (spend / totalSpend) * 100 : 0
          return (
            <div key={cat} className="category-card">
              <div className="category-header">
                <span className={`type-badge cat-${cat.toLowerCase()}`}>{cat}</span>
                <span className="category-spend">${Math.round(spend).toLocaleString()}</span>
              </div>
              <div className="spend-bar-track" style={{ marginTop: 8 }}>
                <div className="spend-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="category-pct">{pct.toFixed(1)}% of total spend</div>
            </div>
          )
        })}
      </div>

      {/* ── Per-material table ────────────────────────────────────────── */}
      <h2 className="section-title">Budget &amp; Consumption per Material</h2>
      <div className="bom-table-wrap">
        <table className="build-table">
          <thead>
            <tr>
              <th>Part #</th>
              <th>Description</th>
              <th>Category</th>
              <th>Board</th>
              <th style={{ textAlign: 'center' }}>Qty / Unit</th>
              <th style={{ textAlign: 'center' }}>Total Build Qty</th>
              <th style={{ textAlign: 'center' }}>Units Consumed</th>
              <th>Best Supplier</th>
              <th>Unit Cost</th>
              <th>Total Spend</th>
              <th style={{ minWidth: 160 }}>% of Spend</th>
            </tr>
          </thead>
          <tbody>
            {consumption.map(p => {
              const pct = totalSpend > 0 ? (p.totalSpend / totalSpend) * 100 : 0
              return (
                <tr key={p.id}>
                  <td className="config-name">{p.id}</td>
                  <td>{p.description}</td>
                  <td><span className={`type-badge cat-${p.category.toLowerCase()}`}>{p.category}</span></td>
                  <td><span className="board-badge">{p.board}</span></td>
                  <td style={{ textAlign: 'center' }}>{p.qtyPerUnit}</td>
                  <td style={{ textAlign: 'center' }}>{p.totalBuildQty.toLocaleString()}</td>
                  <td style={{ textAlign: 'center' }}>{p.totalConsumed.toLocaleString()}</td>
                  <td>{p.bestSupplier}</td>
                  <td className="cost-cell">${p.unitCost.toFixed(2)}</td>
                  <td className="cost-cell cost-total">${Math.round(p.totalSpend).toLocaleString()}</td>
                  <td>
                    <div className="spend-bar-wrap">
                      <div className="spend-bar-track">
                        <div className="spend-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="spend-pct">{pct.toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bom-total-row">
              <td colSpan={6}><strong>TOTAL</strong></td>
              <td style={{ textAlign: 'center' }}><strong>{totalConsumedUnits.toLocaleString()}</strong></td>
              <td colSpan={2}></td>
              <td className="cost-cell cost-total"><strong>${Math.round(totalSpend).toLocaleString()}</strong></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      </>}
    </div>
  )
}
